"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AlertDialog, Button, Card, Chip, Table, toast } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount, formatDateTime } from "@/lib/format";
import { useDebounced } from "@/lib/useDebounced";
import { datedFilename, downloadCsv } from "@/lib/exportCsv";
import { DownloadIcon, RefreshIcon, TrashIcon, UploadIcon } from "@/components/icons";
import {
  EmptyState,
  ErrorBanner,
  FilterChips,
  PageHeader,
  Pagination,
  SearchInput,
  SectionCard,
  SelectFilter,
  StatCard,
  StatGrid,
  TableShell,
  Toolbar,
  type FilterOption,
} from "@/components/admin/ui";

type Product = {
  id: number | string;
  name: string;
  shopName?: string | null;
  shopId?: string | null;
  category?: string | null;
  priceValue?: number | null;
  priceText?: string | null;
  commissionRateText?: string | null;
  commissionText?: string | null;
  isBestSeller?: boolean | null;
  isXtraCommission?: boolean | null;
  scrapedAt?: string | null;
};

type ProductsResponse = {
  items: Product[];
  total: number;
  categories?: { category: string; count: number }[];
};

type ImportResult = { rows: number; parsed: number; saved: number };

const SORT_OPTIONS: FilterOption[] = [
  { value: "newest", label: "Mới cào nhất" },
  { value: "price_desc", label: "Giá cao → thấp" },
  { value: "price_asc", label: "Giá thấp → cao" },
  { value: "commission_desc", label: "Hoa hồng cao nhất" },
  { value: "commission_asc", label: "Hoa hồng thấp nhất" },
];

const TAG_OPTIONS: FilterOption[] = [
  { value: "", label: "Mọi sản phẩm" },
  { value: "isBestSeller", label: "Bán chạy" },
  { value: "isXtraCommission", label: "Hoa hồng Xtra" },
];

const EMPTY_FILTERS = { q: "", category: "", tag: "", sort: "newest" };

function ImportSection({ onImported }: { onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/shopping-products/import", { method: "POST", body: formData });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error((data && data.error) || `Import thất bại: ${res.status}`);
      setResult(data);
      toast.success(`Đã lưu ${data.saved} sản phẩm từ ${data.rows} dòng`);
      onImported();
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Import thất bại");
    } finally {
      setImporting(false);
    }
  }

  return (
    <SectionCard
      title="Import sản phẩm từ file Shopee"
      description='Chọn đúng file Shopee xuất ra ở trang "Sản phẩm nổi bật / Lấy link hàng loạt" (định dạng .csv hoặc .xlsx). Sản phẩm trùng "Mã sản phẩm" với sản phẩm đã có sẽ được cập nhật lại, không tạo trùng.'
    >
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileChange}
          disabled={importing}
          className="hidden"
        />
        <Button onPress={() => fileInputRef.current?.click()} isDisabled={importing} isPending={importing}>
          <UploadIcon className="h-4 w-4" />
          {importing ? "Đang import…" : "Chọn file để import"}
        </Button>
        {result && (
          <p className="text-sm text-[var(--success)]">
            Đã đọc {result.rows} dòng, {result.parsed} sản phẩm hợp lệ, lưu {result.saved} sản phẩm.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

function DeleteProductButton({ product, onDeleted }: { product: Product; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await clientApi.delete(`/api/shopping-products/${product.id}`);
      toast.success("Đã xoá sản phẩm");
      onDeleted();
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Xoá thất bại");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog>
      <Button isIconOnly variant="ghost" size="sm" aria-label="Xoá sản phẩm">
        <TrashIcon className="h-4 w-4 text-[var(--danger)]" />
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Xoá sản phẩm này?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="truncate">{product.name}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Sản phẩm sẽ không còn hiển thị trong tab &quot;Mua sắm&quot; của app.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary" isDisabled={deleting}>
                Huỷ
              </Button>
              <Button slot="close" variant="danger" isPending={deleting} onPress={handleDelete}>
                Xoá
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

export default function ShoppingProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const q = useDebounced(filters.q).trim();

  const params = useMemo(() => {
    const p = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
      sort: filters.sort,
    });
    if (q) p.set("search", q);
    if (filters.category) p.set("category", filters.category);
    if (filters.tag) p.set(filters.tag, "true");
    return p.toString();
  }, [pageSize, page, filters.sort, filters.category, filters.tag, q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await clientApi.get<ProductsResponse>(`/api/shopping-products?${params}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      if (data.categories) setCategories(data.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách sản phẩm");
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  // A filter change that kept the old offset would land on page 12 of a
  // three-page result and show an empty table.
  useEffect(() => {
    setPage(0);
  }, [q, filters.category, filters.tag, filters.sort, pageSize]);

  const categoryOptions = useMemo<FilterOption[]>(
    () => [
      { value: "", label: "Mọi ngành hàng" },
      ...categories.map((c) => ({ value: c.category, label: `${c.category} (${c.count})` })),
    ],
    [categories],
  );

  const pageStats = useMemo(() => {
    const withPrice = items.filter((p) => p.priceValue != null);
    return {
      shops: new Set(items.map((p) => p.shopName).filter(Boolean)).size,
      avgPrice: withPrice.length
        ? withPrice.reduce((sum, p) => sum + (p.priceValue || 0), 0) / withPrice.length
        : 0,
      noPrice: items.length - withPrice.length,
    };
  }, [items]);

  function setFilter<K extends keyof typeof EMPTY_FILTERS>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function exportPage() {
    downloadCsv(
      datedFilename("san-pham"),
      items,
      [
        { header: "ID", value: (p) => p.id },
        { header: "Tên sản phẩm", value: (p) => p.name },
        { header: "Shop", value: (p) => p.shopName || "" },
        { header: "Ngành hàng", value: (p) => p.category || "" },
        { header: "Giá", value: (p) => p.priceValue ?? p.priceText ?? "" },
        { header: "Tỷ lệ hoa hồng", value: (p) => p.commissionRateText || "" },
        { header: "Hoa hồng", value: (p) => p.commissionText || "" },
        { header: "Cào lúc", value: (p) => formatDateTime(p.scrapedAt) },
      ],
    );
  }

  const chips = [
    filters.q && { label: `Tìm: ${filters.q}`, onClear: () => setFilter("q", "") },
    filters.category && { label: filters.category, onClear: () => setFilter("category", "") },
    filters.tag && {
      label: TAG_OPTIONS.find((o) => o.value === filters.tag)!.label,
      onClear: () => setFilter("tag", ""),
    },
  ].filter(Boolean) as { label: string; onClear: () => void }[];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sản phẩm"
        count={total}
        description='Danh sách sản phẩm hoàn tiền hiển thị ở tab "Mua sắm" trong app. Được cào tự động hằng ngày, hoặc import thủ công bên dưới.'
        actions={
          <>
            <Button variant="outline" onPress={exportPage} isDisabled={!items.length}>
              <DownloadIcon className="h-4 w-4" />
              Xuất trang này
            </Button>
            <Button variant="outline" onPress={load} isDisabled={loading}>
              <RefreshIcon className="h-4 w-4" />
              Làm mới
            </Button>
          </>
        }
      />

      <ImportSection onImported={load} />

      <ErrorBanner message={error} onRetry={load} />

      <StatGrid>
        <StatCard label="Sản phẩm khớp bộ lọc" value={total.toLocaleString("vi-VN")} />
        <StatCard label="Ngành hàng" value={categories.length.toLocaleString("vi-VN")} />
        <StatCard label="Shop trong trang này" value={pageStats.shops.toLocaleString("vi-VN")} />
        <StatCard
          label="Thiếu giá trong trang này"
          value={pageStats.noPrice.toLocaleString("vi-VN")}
          tone={pageStats.noPrice ? "warning" : "muted"}
          hint={pageStats.avgPrice ? `TB ${formatAmount(pageStats.avgPrice)}` : undefined}
        />
      </StatGrid>

      <Toolbar>
        <SearchInput
          value={filters.q}
          onChange={(v) => setFilter("q", v)}
          placeholder="Tìm theo tên sản phẩm…"
        />
        <SelectFilter
          label="Ngành hàng"
          value={filters.category}
          options={categoryOptions}
          onChange={(v) => setFilter("category", v)}
          className="min-w-[200px]"
        />
        <SelectFilter label="Nhãn" value={filters.tag} options={TAG_OPTIONS} onChange={(v) => setFilter("tag", v)} />
        <SelectFilter
          label="Sắp xếp"
          value={filters.sort}
          options={SORT_OPTIONS}
          onChange={(v) => setFilter("sort", v)}
          className="min-w-[190px]"
        />
        <Button
          variant="ghost"
          size="sm"
          onPress={() => setFilters(EMPTY_FILTERS)}
          isDisabled={!chips.length && filters.sort === "newest"}
        >
          Xoá lọc
        </Button>
      </Toolbar>

      <FilterChips items={chips} />

      <Card>
        <Card.Content className="space-y-4">
          <TableShell isLoading={loading}>
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Danh sách sản phẩm" className="min-w-[900px]">
                  <Table.Header>
                    <Table.Column isRowHeader>Sản phẩm</Table.Column>
                    <Table.Column>Shop</Table.Column>
                    <Table.Column>Ngành hàng</Table.Column>
                    <Table.Column className="text-right">Giá</Table.Column>
                    <Table.Column className="text-right">Hoa hồng</Table.Column>
                    <Table.Column>Cập nhật</Table.Column>
                    <Table.Column className="text-right">Thao tác</Table.Column>
                  </Table.Header>
                  <Table.Body
                    renderEmptyState={() => (
                      <EmptyState
                        title={loading ? "Đang tải…" : "Không có sản phẩm nào"}
                        description={loading ? undefined : "Thử đổi từ khoá, ngành hàng hoặc import thêm file."}
                      />
                    )}
                  >
                    {items.map((p) => (
                      <Table.Row key={p.id}>
                        <Table.Cell>
                          <span className="flex items-center gap-1.5">
                            <span className="block max-w-[280px] truncate font-medium text-[var(--foreground)]" title={p.name}>
                              {p.name}
                            </span>
                            {p.isBestSeller && (
                              <Chip size="sm" color="warning">
                                Bán chạy
                              </Chip>
                            )}
                            {p.isXtraCommission && (
                              <Chip size="sm" color="accent">
                                Xtra
                              </Chip>
                            )}
                          </span>
                        </Table.Cell>
                        <Table.Cell className="text-[var(--muted)]">{p.shopName || "-"}</Table.Cell>
                        <Table.Cell className="text-[var(--muted)]">{p.category || "-"}</Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {p.priceValue != null ? formatAmount(p.priceValue) : p.priceText || "-"}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {p.commissionRateText || "-"}
                          {p.commissionText ? ` · ${p.commissionText}` : ""}
                        </Table.Cell>
                        <Table.Cell className="text-[var(--muted)]">{formatDateTime(p.scrapedAt)}</Table.Cell>
                        <Table.Cell className="text-right">
                          <DeleteProductButton product={p} onDeleted={load} />
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </TableShell>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        </Card.Content>
      </Card>
    </div>
  );
}
