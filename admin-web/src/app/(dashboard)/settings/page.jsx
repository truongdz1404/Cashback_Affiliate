"use client";

import { useEffect, useState, useCallback } from "react";
import { clientApi } from "@/lib/clientApi";
import Badge from "@/components/Badge";

const CONFIG_LABELS = {
  zaloBotToken: "Zalo Bot Token",
  zaloWebhookSecret: "Zalo Webhook Secret",
  jwtSecret: "JWT Secret (admin session)",
};

function SectionCard({ title, description, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function CommissionSection() {
  const [pct, setPct] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await clientApi.get("/api/settings");
      setPct(String(data.commissionPct ?? ""));
    } catch (err) {
      setMsg(err.message || "Không tải được");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      await clientApi.put("/api/settings", { commissionPct: Number(pct) });
      setMsg("Đã lưu.");
    } catch (err) {
      setMsg(err.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="% Hoa hồng mặc định cho khách" description="Áp dụng cho khách chưa có mức riêng (tùy chỉnh theo từng khách ở trang Khách hàng).">
      <div className="flex items-center gap-2">
        <input
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="70"
        />
        <span className="text-sm text-slate-500">%</span>
        <button
          onClick={save}
          disabled={saving || pct === ""}
          className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
        >
          Lưu
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-slate-500">{msg}</p>}
    </SectionCard>
  );
}

function SecretsSection() {
  const [config, setConfig] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busyKey, setBusyKey] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setConfig(await clientApi.get("/api/config"));
    } catch (err) {
      setMsg(err.message || "Không tải được");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function rotate(key) {
    const value = (drafts[key] || "").trim();
    if (!value) return;
    setBusyKey(key);
    setMsg("");
    try {
      await clientApi.put(`/api/config/${key}`, { value });
      setDrafts((d) => ({ ...d, [key]: "" }));
      setMsg(`Đã cập nhật ${CONFIG_LABELS[key] || key}.`);
      await load();
    } catch (err) {
      setMsg(err.message || "Cập nhật thất bại");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <SectionCard
      title="Khoá cấu hình (env) có thể chỉnh sửa"
      description="Chỉ hiển thị 4 ký tự cuối. Nhập giá trị mới rồi bấm Cập nhật để đổi. Riêng SERVICE_API_KEY không quản lý ở đây vì đổi trực tiếp có thể khiến dashboard tự khoá quyền truy cập của chính nó (chỉ sửa được qua SSH)."
    >
      <div className="space-y-3">
        {config &&
          Object.keys(CONFIG_LABELS).map((key) => (
            <div key={key} className="flex flex-wrap items-center gap-2">
              <div className="w-56 shrink-0">
                <p className="text-sm font-medium text-slate-700">{CONFIG_LABELS[key]}</p>
                <p className="text-xs text-slate-400">Hiện tại: {config[key] || "chưa đặt"}</p>
              </div>
              <input
                value={drafts[key] || ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                type="password"
                placeholder="Giá trị mới"
                className="flex-1 min-w-[180px] rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
              <button
                onClick={() => rotate(key)}
                disabled={busyKey === key || !(drafts[key] || "").trim()}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Cập nhật
              </button>
            </div>
          ))}
      </div>
      {msg && <p className="mt-3 text-xs text-slate-500">{msg}</p>}
    </SectionCard>
  );
}

function PasswordSection() {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setMsg("");
    if (newPassword.length < 8) return setMsg("Mật khẩu phải từ 8 ký tự trở lên.");
    if (newPassword !== confirm) return setMsg("Mật khẩu nhập lại không khớp.");
    setSaving(true);
    try {
      await clientApi.put("/api/password", { newPassword });
      setNewPassword("");
      setConfirm("");
      setMsg("Đã đổi mật khẩu quản trị.");
    } catch (err) {
      setMsg(err.message || "Đổi mật khẩu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Mật khẩu đăng nhập quản trị">
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Mật khẩu mới (tối thiểu 8 ký tự)"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Nhập lại mật khẩu mới"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={save}
          disabled={saving || !newPassword}
          className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
        >
          Đổi mật khẩu
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-slate-500">{msg}</p>}
    </SectionCard>
  );
}

function SessionSection() {
  const [status, setStatus] = useState(null);
  const [cookieText, setCookieText] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const check = useCallback(async () => {
    setChecking(true);
    setMsg("");
    try {
      setStatus(await clientApi.get("/api/session"));
    } catch (err) {
      setMsg(err.message || "Không kiểm tra được phiên");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  async function submitCookie() {
    if (!cookieText.trim()) return;
    setSubmitting(true);
    setMsg("");
    try {
      await clientApi.post("/api/session", { cookies: cookieText.trim() });
      setCookieText("");
      setMsg("Đã cập nhật cookie phiên Shopee.");
      await check();
    } catch (err) {
      setMsg(err.message || "Cập nhật cookie thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      title="Phiên đăng nhập Shopee Affiliate (cookie)"
      description="Dán cookie đã đăng nhập affiliate.shopee.vn (chuỗi 'name=value; name2=value2' hoặc JSON mảng cookie) để cập nhật phiên khi cookie hết hạn."
    >
      <div className="mb-3 flex items-center gap-2">
        <Badge tone={status?.loggedIn ? "green" : "red"}>
          {status ? (status.loggedIn ? "Đang hoạt động" : "Chưa đăng nhập / đã hết hạn") : "Đang kiểm tra..."}
        </Badge>
        <button onClick={check} disabled={checking} className="text-xs font-medium text-orange-600 hover:underline">
          Kiểm tra lại
        </button>
      </div>
      <textarea
        value={cookieText}
        onChange={(e) => setCookieText(e.target.value)}
        rows={4}
        placeholder="SPC_EC=...; SPC_ST=...; ..."
        className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
      />
      <button
        onClick={submitCookie}
        disabled={submitting || !cookieText.trim()}
        className="mt-2 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
      >
        {submitting ? "Đang cập nhật..." : "Cập nhật cookie"}
      </button>
      {msg && <p className="mt-2 text-xs text-slate-500">{msg}</p>}
    </SectionCard>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Cài đặt</h1>
      <CommissionSection />
      <SecretsSection />
      <SessionSection />
      <PasswordSection />
    </div>
  );
}
