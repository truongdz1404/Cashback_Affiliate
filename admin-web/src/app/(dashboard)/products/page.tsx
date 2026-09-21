"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { AlertDialog, Button, Card, InputGroup, Label, Table, TextField, toast } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount, formatDate } from "@/lib/format";
import { SearchIcon, TrashIcon, UploadIcon } from "@/components/icons";

const PAGE_SIZE = 20;

type Product = {
  id: number | string;
  name: string;
  shopName?: string | null;
  priceValue?: number | null;
  priceText?: string | null;
  commissionRateText?: string | null;
  commissionText?: string | null;
  scrapedAt?: string | null;
};

type ImportResult = { rows: number; parsed: number; saved: number };

function SectionCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>{title}</Card.Title>
        {description && <Card.Description>{description}</Card.Description>}
      </Card.Header>
      <Card.Content>{children}</Card.Content>
    </Card>
  );
}

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
          {importing ? "Đang import..." : "Chọn file để import"}
        </Button>
        {result && (
          <p className="text-sm text-[var(--success-soft-foreground)]">
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
              <p className="mt-1 text-sm text-[var(--muted)]">Sản phẩm sẽ không còn hiển thị trong tab &quot;Mua sắm&quot; của app.</p>
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
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (search) params.set("search", search);
      const data = await clientApi.get<{ items: Product[]; total: number }>(`/api/shopping-products?${params.toString()}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách sản phẩm");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
      setSearch(searchInput.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Sản phẩm ({total})</h1>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Danh sách sản phẩm hoàn tiền hiển thị ở tab &quot;Mua sắm&quot; trong app. Được cào tự động hằng ngày, hoặc import thủ công bên dưới.
        </p>
      </div>

      <ImportSection onImported={load} />

      <SectionCard title="Danh sách sản phẩm">
        <div className="mb-4 max-w-xs">
          <TextField name="search" value={searchInput} onChange={setSearchInput} aria-label="Tìm sản phẩm">
            <Label className="sr-only">Tìm sản phẩm</Label>
            <InputGroup>
              <InputGroup.Prefix>
                <SearchIcon className="h-4 w-4 text-[var(--muted)]" />
              </InputGroup.Prefix>
              <InputGroup.Input placeholder="Tìm theo tên sản phẩm..." />
            </InputGroup>
          </TextField>
        </div>

        {error && <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>}

        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Danh sách sản phẩm" className="min-w-[720px]">
              <Table.Header>
                <Table.Column isRowHeader>Sản phẩm</Table.Column>
                <Table.Column>Shop</Table.Column>
                <Table.Column className="text-right">Giá</Table.Column>
                <Table.Column className="text-right">Hoa hồng</Table.Column>
                <Table.Column>Cập nhật</Table.Column>
                <Table.Column className="text-right">Thao tác</Table.Column>
              </Table.Header>
              <Table.Body
                renderEmptyState={() => (
                  <span className="text-sm text-[var(--muted)]">
                    {loading ? "Đang tải..." : "Chưa có sản phẩm nào"}
                  </span>
                )}
              >
                {items.map((p) => (
                  <Table.Row key={p.id}>
                    <Table.Cell>
                      <span className="block max-w-[260px] truncate" title={p.name}>
                        {p.name}
                      </span>
                    </Table.Cell>
                    <Table.Cell>{p.shopName || "-"}</Table.Cell>
                    <Table.Cell className="text-right">
                      {p.priceValue != null ? formatAmount(p.priceValue) : p.priceText || "-"}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {p.commissionRateText || "-"}
                      {p.commissionText ? ` · ${p.commissionText}` : ""}
                    </Table.Cell>
                    <Table.Cell>{formatDate(p.scrapedAt)}</Table.Cell>
                    <Table.Cell className="text-right">
                      <DeleteProductButton product={p} onDeleted={load} />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>

        <div className="mt-4 flex items-center justify-between text-sm text-[var(--muted)]">
          <span>
            Trang {page + 1} / {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => setPage((p) => Math.max(0, p - 1))}
              isDisabled={page === 0 || loading}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              isDisabled={page >= totalPages - 1 || loading}
            >
              Sau
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
