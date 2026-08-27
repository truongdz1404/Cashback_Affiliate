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

const EMPTY_FORM = { title: "", description: "", startsAt: "", endsAt: "", tiersJson: "[]", isActive: true };

function toDateTimeLocal(value) {
  if (!value) return "";
  // datetime-local inputs want "YYYY-MM-DDTHH:mm", the API stores full
  // "YYYY-MM-DD HH:mm:ss" - just enough slicing/replacing to round-trip.
  return value.replace(" ", "T").slice(0, 16);
}

function fromDateTimeLocal(value) {
  if (!value) return null;
  return value.replace("T", " ") + ":00";
}

function CampaignForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState(
    initial
      ? {
          title: initial.title || "",
          description: initial.description || "",
          startsAt: toDateTimeLocal(initial.startsAt),
          endsAt: toDateTimeLocal(initial.endsAt),
          tiersJson: JSON.stringify(initial.tiers || [], null, 2),
          isActive: !!initial.isActive,
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setMsg("");
    let tiers;
    try {
      tiers = JSON.parse(form.tiersJson || "[]");
      if (!Array.isArray(tiers)) throw new Error("tiers phải là mảng JSON, ví dụ [{\"orders\":3,\"reward\":6000}]");
    } catch (err) {
      return setMsg(err.message || "tiers JSON không hợp lệ");
    }
    if (!form.title.trim()) return setMsg("Tiêu đề là bắt buộc.");

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        startsAt: fromDateTimeLocal(form.startsAt),
        endsAt: fromDateTimeLocal(form.endsAt),
        tiers,
        isActive: form.isActive,
      };
      if (initial) {
        await clientApi.put(`/api/campaigns/${initial.id}`, payload);
      } else {
        await clientApi.post("/api/campaigns", payload);
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
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Tiêu đề</span>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            placeholder="Sự kiện tháng 9"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Mô tả</span>
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Bắt đầu</span>
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Kết thúc</span>
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">
          Mốc thưởng (JSON: mảng {"{orders, reward}"})
        </span>
        <textarea
          value={form.tiersJson}
          onChange={(e) => setForm((f) => ({ ...f, tiersJson: e.target.value }))}
          rows={5}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
          placeholder={'[\n  { "orders": 3, "reward": 6000 },\n  { "orders": 10, "reward": 25000 }\n]'}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
        />
        Đang hoạt động
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

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setCampaigns(await clientApi.get("/api/campaigns"));
    } catch (err) {
      setError(err.message || "Không tải được danh sách sự kiện");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Sự kiện</h1>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
          >
            + Tạo sự kiện
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {creating && (
        <SectionCard title="Sự kiện mới">
          <CampaignForm onSaved={handleSaved} onCancel={() => setCreating(false)} />
        </SectionCard>
      )}

      {campaigns && campaigns.length === 0 && !creating && (
        <p className="text-sm text-slate-500">Chưa có sự kiện nào.</p>
      )}

      <div className="space-y-4">
        {campaigns &&
          campaigns.map((c) =>
            editingId === c.id ? (
              <SectionCard key={c.id} title={`Sửa: ${c.title}`}>
                <CampaignForm initial={c} onSaved={handleSaved} onCancel={() => setEditingId(null)} />
              </SectionCard>
            ) : (
              <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{c.title}</h3>
                      <Badge tone={c.isActive ? "green" : "red"}>{c.isActive ? "Đang chạy" : "Tắt"}</Badge>
                    </div>
                    {c.description && <p className="mt-1 text-xs text-slate-500">{c.description}</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      {c.startsAt || "không giới hạn"} → {c.endsAt || "không giới hạn"}
                    </p>
                    <p className="mt-2 text-xs text-slate-600">
                      Mốc: {(c.tiers || []).map((t) => `${t.orders} đơn → ${t.reward}đ`).join(", ") || "chưa có"}
                    </p>
                  </div>
                  <button
                    onClick={() => setEditingId(c.id)}
                    className="text-xs font-medium text-orange-600 hover:underline"
                  >
                    Sửa
                  </button>
                </div>
              </div>
            )
          )}
      </div>
    </div>
  );
}
