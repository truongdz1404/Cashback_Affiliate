"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, TextField } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await clientApi.post("/api/login", { password });
      router.replace("/");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message === "unauthorized" ? "Sai mật khẩu" : message || "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm">
        <Card className="p-2">
          <Card.Header className="items-center pb-2 pt-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-lg font-bold text-[var(--accent-foreground)]">
              SA
            </div>
            <Card.Title>Admin Dashboard</Card.Title>
            <Card.Description>Shopee Affiliate Automation</Card.Description>
          </Card.Header>
          <Card.Content className="space-y-4 pb-6">
            <TextField name="password" value={password} onChange={setPassword} isDisabled={loading}>
              <Label>Mật khẩu quản trị</Label>
              <Input type="password" autoFocus placeholder="Nhập mật khẩu" />
            </TextField>

            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

            <Button type="submit" isDisabled={loading || !password} isPending={loading} fullWidth>
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </Button>
          </Card.Content>
        </Card>
      </form>
    </div>
  );
}
