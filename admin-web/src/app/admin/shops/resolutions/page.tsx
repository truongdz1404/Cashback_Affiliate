"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, InputGroup, Label, ListBox, Modal, Select, Table, TextField, toast } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/format";
import { ArrowRightIcon, SearchIcon } from "@/components/icons";

const PAGE_SIZE = 50;

type Candidate = {
  shop_id: string | null;
  shop_name: string | null;
  shop_image: string | null;
  commission_rate: string | null;
};

type Resolution = {
  id: number;
  shopName: string;
  status: string;
  shopId?: string | null;
  candidatesJson?: string | null;
  productCount: number;
  attempts: number;
  lastError?: string | null;
  lastAttemptAt?: string | null;
  nextAttemptAt?: string | null;
  resolvedAt?: string | null;
};

const STATUS_FILTERS = [
  { value: "ambiguous", label: "Cần chọn tay" },
  { value: "pending", label: "Đang chờ tra" },
  { value: "not_found", label: "Không tìm thấy" },
  { value: "error", label: "Lỗi" },
  { value: "resolved", label: "Đã khớp" },
  { value: "all", label: "Tất cả" },
];

const STATUS_META: Record<string, { label: string; color: "success" | "warning" | "danger" | "default" }> = {
  pending: { label: "Đang chờ", color: "default" },
  resolved: { label: "Đã khớp", color: "success" },
  ambiguous: { label: "Cần chọn tay", color: "warning" },
  not_found: { label: "Không tìm thấy", color: "default" },
  error: { label: "Lỗi", color: "danger" },
};

function parseCandidates(json?: string | null): Candidate[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Candidate[]) : [];
  } catch {
    return [];
  }
}

/**
 * The candidate picker. It only offers shops whose name is EXACTLY the product's
 * shop name, because those are precisely the rows the job refused to choose
 * between - everything else in the list merely contained the keyword and was
 * saved as a discovery, not as a match. Attaching products to the wrong merchant
 * is worse than leaving them unattached, so the choice stays a human one.
 */
function CandidateModal({ row, onResolved }: { row: Resolution; onResolved: () => void }) {
  const [busy, setBusy] = useState("");
  const candidates = parseCandidates(row.candidatesJson);
  const target = row.shopName.trim();
  const exact = candidates.filter((c) => (c.shop_name || "").trim() === target);
  const others = candidates.filter((c) => (c.shop_name || "").trim() !== target);

  async function pick(shopId: string | null) {
    if (!shopId) return;
    setBusy(shopId);
    try {
      const res = await clientApi.put<{ productsLinked?: number }>(`/api/shop-name-resolutions/${row.id}`, { shopId });
      toast.success(`Đã gán shop ${shopId}, link ${res.productsLinked ?? 0} sản phẩm`);
      onResolved();
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Gán thất bại");
    } finally {
      setBusy("");
    }
  }

  return (
    <Modal>
      <Button size="sm" variant="outline">
        Ứng viên ({candidates.length})
      </Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[560px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Chọn shop cho tên này</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="mb-3 break-words rounded-lg bg-[var(--surface-secondary)] p-2 text-sm font-medium">
                {row.shopName}
              </p>

              {!candidates.length && (
                <p className="text-sm text-[var(--muted)]">
                  Chưa có ứng viên nào được lưu. Đóng hộp thoại rồi bấm &quot;Tra lại&quot; để hỏi Shopee.
                </p>
              )}

              {exact.length > 0 && (
                <>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Trùng khít tên ({exact.length})
                  </p>
                  <div className="space-y-2">
                    {exact.map((c) => (
                      <div
                        key={c.shop_id}
                        className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] p-2"
                      >
                        {c.shop_image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.shop_image} alt="" className="h-8 w-8 flex-none rounded-lg object-cover" />
                        ) : (
                          <div className="h-8 w-8 flex-none rounded-lg bg-[var(--surface-secondary)]" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{c.shop_name}</p>
                          <p className="text-xs text-[var(--muted)]">
                            {c.shop_id}
                            {c.commission_rate ? ` · hoa hồng ${c.commission_rate}` : ""}
                          </p>
                        </div>
                        <Button size="sm" isPending={busy === c.shop_id} isDisabled={!!busy} onPress={() => pick(c.shop_id)}>
                          Chọn
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {others.length > 0 && (
                <details className="mt-3 text-xs text-[var(--muted)]">
                  <summary className="cursor-pointer select-none">
                    {others.length} ứng viên khác — tên chỉ <em>chứa</em> từ khoá, không trùng khít
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {others.map((c) => (
                      <div
                        key={c.shop_id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-2"
                      >
                        <span className="min-w-0 flex-1 truncate" title={c.shop_name || ""}>
                          {c.shop_name} <span className="text-[var(--muted)]">· {c.shop_id}</span>
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          isPending={busy === c.shop_id}
                          isDisabled={!!busy}
                          onPress={() => pick(c.shop_id)}
                        >
                          Vẫn gán
                        </Button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="tertiary">
                Đóng
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function ResolutionRow({ row, onChanged }: { row: Resolution; onChanged: () => void }) {
  const [retrying, setRetrying] = useState(false);
  const meta = STATUS_META[row.status];

  async function retry() {
    setRetrying(true);
    try {
      const res = await clientApi.post<{
        outcome?: string;
        status?: string;
        shopId?: string | null;
        productsLinked?: number;
      }>("/api/shops/resolve", { shopName: row.shopName });
      const outcome = res.outcome || res.status;
      toast.success(
        outcome === "resolved" ? `Khớp shop ${res.shopId}, link ${res.productsLinked ?? 0} sản phẩm` : `Kết quả: ${outcome}`,
      );
      onChanged();
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Tra lại thất bại");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Table.Row>
      <Table.Cell>
        <p className="max-w-[320px] truncate text-sm font-medium text-[var(--foreground)]" title={row.shopName}>
          {row.shopName}
        </p>
        {row.lastError && (
          <p className="max-w-[320px] truncate text-xs text-[var(--danger)]" title={row.lastError}>
            {row.lastError}
          </p>
        )}
      </Table.Cell>
      <Table.Cell>
        <Chip color={meta?.color || "default"}>{meta?.label || row.status}</Chip>
      </Table.Cell>
      <Table.Cell className="text-right">{row.productCount.toLocaleString("vi-VN")}</Table.Cell>
      <Table.Cell>
        <span className="text-xs text-[var(--muted)]">{row.shopId || "-"}</span>
      </Table.Cell>
      <Table.Cell>
        <span className="text-xs text-[var(--muted)]">
          {row.lastAttemptAt ? formatDateTime(row.lastAttemptAt) : "Chưa tra"}
          {row.attempts ? ` · ${row.attempts} lần` : ""}
        </span>
      </Table.Cell>
      <Table.Cell>
        <span className="text-xs text-[var(--muted)]">
          {row.status === "resolved" ? "-" : row.nextAttemptAt ? formatDateTime(row.nextAttemptAt) : "Ngay lượt sau"}
        </span>
      </Table.Cell>
      <Table.Cell className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          {row.status !== "resolved" && (
            <Button size="sm" variant="ghost" isPending={retrying} onPress={retry}>
              Tra lại
            </Button>
          )}
          <CandidateModal row={row} onResolved={onChanged} />
        </div>
      </Table.Cell>
    </Table.Row>
  );
}

export default function ShopNameResolutionsPage() {
  const [items, setItems] = useState<Resolution[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("ambiguous");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (status !== "all") params.set("status", status);
      if (search) params.set("search", search);
      const data = await clientApi.get<{
        items: Resolution[];
        total: number;
        counts?: Record<string, number>;
      }>(`/api/shop-name-resolutions?${params.toString()}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setCounts(data.counts || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được hàng đợi");
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[var(--foreground)]">Hàng đợi tra tên shop</h1>
          <p className="mt-0.5 max-w-3xl text-xs text-[var(--muted)]">
            Mỗi dòng là một tên shop lấy từ bảng sản phẩm. Job nền so khớp <strong>chính xác từng ký tự</strong> với tên shop
            Shopee trả về — không bỏ dấu, không cắt hậu tố. Khi có đúng một kết quả trùng khít thì tự gán; trùng từ hai trở
            lên thì dừng lại chờ người chọn, vì gán nhầm shop còn tệ hơn để trống.
          </p>
        </div>
        <Link
          href="/admin/shops"
          className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)]"
        >
          Danh sách shop
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.filter((f) => f.value !== "all").map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setPage(0);
              setStatus(f.value);
            }}
            className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
              status === f.value
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-secondary)]"
            }`}
          >
            {f.label} ({(counts[f.value] || 0).toLocaleString("vi-VN")})
          </button>
        ))}
      </div>

      <Card>
        <Card.Content>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="max-w-xs flex-1">
              <TextField
                name="search"
                value={search}
                onChange={(v) => {
                  setPage(0);
                  setSearch(v);
                }}
                aria-label="Tìm tên shop"
              >
                <Label className="sr-only">Tìm tên shop</Label>
                <InputGroup>
                  <InputGroup.Prefix>
                    <SearchIcon className="h-4 w-4 text-[var(--muted)]" />
                  </InputGroup.Prefix>
                  <InputGroup.Input placeholder="Tìm tên shop..." />
                </InputGroup>
              </TextField>
            </div>
            <Select
              aria-label="Lọc theo trạng thái"
              selectedKey={status}
              onSelectionChange={(key) => {
                setPage(0);
                setStatus(String(key ?? "ambiguous"));
              }}
            >
              <Select.Trigger className="min-w-[180px]">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {STATUS_FILTERS.map((opt) => (
                    <ListBox.Item key={opt.value} id={opt.value}>
                      {opt.label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <span className="text-xs text-[var(--muted)]">{total.toLocaleString("vi-VN")} dòng</span>
          </div>

          {error && <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>}

          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Hàng đợi tra tên shop" className="min-w-[1020px]">
                <Table.Header>
                  <Table.Column isRowHeader>Tên shop trong bảng sản phẩm</Table.Column>
                  <Table.Column>Trạng thái</Table.Column>
                  <Table.Column className="text-right">Sản phẩm</Table.Column>
                  <Table.Column>shop_id</Table.Column>
                  <Table.Column>Tra lần cuối</Table.Column>
                  <Table.Column>Tra lại lúc</Table.Column>
                  <Table.Column className="text-right">Thao tác</Table.Column>
                </Table.Header>
                <Table.Body
                  renderEmptyState={() => (
                    <span className="text-sm text-[var(--muted)]">
                      {loading ? "Đang tải..." : "Không có dòng nào ở trạng thái này"}
                    </span>
                  )}
                >
                  {items.map((r) => (
                    <ResolutionRow key={r.id} row={r} onChanged={refresh} />
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
        </Card.Content>
      </Card>
    </div>
  );
}
