"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clientApi } from "@/lib/clientApi";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await clientApi.post("/api/login", { password });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err.message === "unauthorized" ? "Sai mật khẩu" : err.message || "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Admin Dashboard</h1>
        <p className="mb-6 text-sm text-slate-500">Shopee Affiliate Automation</p>

        <label className="mb-1 block text-sm font-medium text-slate-700">Mật khẩu quản trị</label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          placeholder="Nhập mật khẩu"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || !password}
          className="w-full rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-50"
        >
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}
