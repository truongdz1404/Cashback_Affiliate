"use client";

import { useEffect, useState, useCallback } from "react";
import { clientApi } from "@/lib/clientApi";
import Badge from "@/components/Badge";

function SectionCard({ title, description, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

const EMPTY_FORM = { imageUrl: "", linkUrl: "", sortOrder: "0", isActive: true };

function BannerForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState(
    initial
      ? {
          imageUrl: initial.imageUrl || "",
          linkUrl: initial.linkUrl || "",
          sortOrder: String(initial.sortOrder ?? 0),
          isActive: !!initial.isActive,
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setMsg("");
    if (!form.imageUrl.trim()) return setMsg("Link ảnh là bắt buộc.");

    setSaving(true);
    try {
      const payload = {
        imageUrl: form.imageUrl.trim(),
        linkUrl: form.linkUrl.trim() || null,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      };
      if (initial) {
        await clientApi.put(`/api/banners/${initial.id}`, payload);
      } else {
        await clientApi.post("/api/banners", payload);
      }
      onSaved();
    } catch (err) {
      setMsg(err.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Link ảnh banner</span>
          <input
            value={form.imageUrl}
            onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            placeholder="https://.../banner.png"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Link khi bấm vào (không bắt buộc)</span>
          <input
            value={form.linkUrl}
            onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            placeholder="https://... hoặc rewally://campaigns"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Thứ tự hiển thị</span>
          <input
            value={form.sortOrder}
            onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            inputMode="numeric"
          />
        </label>
      </div>
      {form.imageUrl.trim() && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={form.imageUrl.trim()} alt="preview" className="h-28 w-full rounded-lg border border-slate-200 object-cover" />
      )}
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
        />
        Đang hiển thị
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {saving ? "Đang lưu..." : "Lưu"}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="text-sm font-medium text-slate-500 hover:underline">
            Huỷ
          </button>
        )}
      </div>
      {msg && <p className="text-xs text-red-600">{msg}</p>}
    </div>
  );
}

export default function BannersPage() {
  const [banners, setBanners] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setBanners(await clientApi.get("/api/banners"));
    } catch (err) {
      setError(err.message || "Không tải được danh sách banner");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleSaved() {
    setCreating(false);
    setEditingId(null);
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm("Xoá banner này?")) return;
    try {
      await clientApi.delete(`/api/banners/${id}`);
      load();
    } catch (err) {
      setError(err.message || "Xoá thất bại");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Banner trang chủ</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Ảnh slide hiển thị đầu màn hình chính của app. Không có banner nào đang bật thì app tự dùng 4 ảnh mặc định đóng gói sẵn.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
          >
            + Thêm banner
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {creating && (
        <SectionCard title="Banner mới">
          <BannerForm onSaved={handleSaved} onCancel={() => setCreating(false)} />
        </SectionCard>
      )}

      {banners && banners.length === 0 && !creating && (
        <p className="text-sm text-slate-500">Chưa có banner nào, app đang dùng 4 ảnh mặc định.</p>
      )}

      <div className="space-y-4">
        {banners &&
          banners.map((b) =>
            editingId === b.id ? (
              <SectionCard key={b.id} title={`Sửa banner #${b.id}`}>
                <BannerForm initial={b} onSaved={handleSaved} onCancel={() => setEditingId(null)} />
              </SectionCard>
            ) : (
              <div key={b.id} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.imageUrl} alt="" className="h-16 w-28 flex-none rounded-lg border border-slate-200 object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">Thứ tự {b.sortOrder}</span>
                    <Badge tone={b.isActive ? "green" : "red"}>{b.isActive ? "Đang hiển thị" : "Tắt"}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{b.imageUrl}</p>
                  {b.linkUrl && <p className="mt-0.5 truncate text-xs text-slate-400">→ {b.linkUrl}</p>}
                </div>
                <div className="flex flex-none items-center gap-3">
                  <button onClick={() => setEditingId(b.id)} className="text-xs font-medium text-orange-600 hover:underline">
                    Sửa
                  </button>
                  <button onClick={() => handleDelete(b.id)} className="text-xs font-medium text-red-600 hover:underline">
                    Xoá
                  </button>
                </div>
              </div>
            )
          )}
      </div>
    </div>
  );
}
