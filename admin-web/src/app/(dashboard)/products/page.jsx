"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount, formatDate } from "@/lib/format";

const PAGE_SIZE = 20;

function SectionCard({ title, description, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ImportSection({ onImported }) {
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    setError("");
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/shopping-products/import", { method: "POST", body: formData });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error((data && data.error) || `Import thất bại: ${res.status}`);
      setResult(data);
      onImported();
    } catch (err) {
      setError(err.message || "Import thất bại");
    } finally {
      setImporting(false);
    }
  }

  return (
    <SectionCard
      title="Import sản phẩm từ file Shopee"
      description='Chọn đúng file Shopee xuất ra ở trang "Sản phẩm nổi bật / Lấy link hàng loạt" (định dạng .csv hoặc .xlsx). Sản phẩm trùng "Mã sản phẩm" với sản phẩm đã có sẽ được cập nhật lại, không tạo trùng.'
    >
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileChange}
          disabled={importing}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {importing ? "Đang import..." : "Chọn file để import"}
        </button>
        {result && (
          <p className="text-sm text-emerald-700">
            Đã đọc {result.rows} dòng, {result.parsed} sản phẩm hợp lệ, lưu {result.saved} sản phẩm.
          </p>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </SectionCard>
  );
}

export default function ShoppingProductsPage() {
  const [items, setItems] = useState([]);
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
      const data = await clientApi.get(`/api/shopping-products?${params.toString()}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || "Không tải được danh sách sản phẩm");
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

  async function handleDelete(id) {
    if (!window.confirm("Xoá sản phẩm này khỏi danh sách?")) return;
    try {
      await clientApi.delete(`/api/shopping-products/${id}`);
      load();
    } catch (err) {
      setError(err.message || "Xoá thất bại");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Sản phẩm ({total})</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Danh sách sản phẩm hoàn tiền hiển thị ở tab "Mua sắm" trong app. Được cào tự động hằng ngày, hoặc import thủ công bên dưới.
        </p>
      </div>

      <ImportSection onImported={load} />

      <SectionCard title="Danh sách sản phẩm">
        <div className="mb-3 flex items-center gap-2">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm theo tên sản phẩm..."
            className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Sản phẩm</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Shop</th>
                <th className="px-3 py-2 text-right font-medium text-slate-500">Giá</th>
                <th className="px-3 py-2 text-right font-medium text-slate-500">Hoa hồng</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Cập nhật</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="max-w-xs truncate px-3 py-2 text-slate-700" title={p.name}>
                    {p.name}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{p.shopName || "-"}</td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {p.priceValue != null ? formatAmount(p.priceValue) : p.priceText || "-"}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {p.commissionRateText || "-"}
                    {p.commissionText ? ` · ${p.commissionText}` : ""}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{formatDate(p.scrapedAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                    Chưa có sản phẩm nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            Trang {page + 1} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="rounded-lg border border-slate-300 px-2 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Trước
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
              className="rounded-lg border border-slate-300 px-2 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Sau
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
