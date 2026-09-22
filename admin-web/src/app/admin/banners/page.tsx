"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertDialog, Button, Card, Checkbox, Chip, Input, Label, TextField } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { PlusIcon, TrashIcon } from "@/components/icons";

type Banner = {
  id: number | string;
  imageUrl: string;
  linkUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
};

type BannerFormState = {
  imageUrl: string;
  linkUrl: string;
  sortOrder: string;
  isActive: boolean;
};

const EMPTY_FORM: BannerFormState = { imageUrl: "", linkUrl: "", sortOrder: "0", isActive: true };

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>{title}</Card.Title>
      </Card.Header>
      <Card.Content>{children}</Card.Content>
    </Card>
  );
}

function BannerForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Banner;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<BannerFormState>(
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
    if (!form.imageUrl.trim()) {
      setMsg("Link ảnh là bắt buộc.");
      return;
    }

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
      setMsg(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          name="imageUrl"
          value={form.imageUrl}
          onChange={(v) => setForm((f) => ({ ...f, imageUrl: v }))}
          className="sm:col-span-2"
        >
          <Label>Link ảnh banner</Label>
          <Input placeholder="https://.../banner.png" />
        </TextField>
        <TextField
          name="linkUrl"
          value={form.linkUrl}
          onChange={(v) => setForm((f) => ({ ...f, linkUrl: v }))}
          className="sm:col-span-2"
        >
          <Label>Link khi bấm vào (không bắt buộc)</Label>
          <Input placeholder="https://... hoặc rewally://campaigns" />
        </TextField>
        <TextField name="sortOrder" value={form.sortOrder} onChange={(v) => setForm((f) => ({ ...f, sortOrder: v }))}>
          <Label>Thứ tự hiển thị</Label>
          <Input inputMode="numeric" />
        </TextField>
      </div>
      {form.imageUrl.trim() && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={form.imageUrl.trim()} alt="preview" className="h-28 w-full rounded-lg border border-[var(--border)] object-cover" />
      )}
      <Checkbox isSelected={form.isActive} onChange={(isActive) => setForm((f) => ({ ...f, isActive }))}>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Content>Đang hiển thị</Checkbox.Content>
      </Checkbox>
      <div className="flex items-center gap-2">
        <Button onPress={save} isPending={saving}>
          Lưu
        </Button>
        {onCancel && (
          <Button variant="tertiary" onPress={onCancel} isDisabled={saving}>
            Huỷ
          </Button>
        )}
      </div>
      {msg && <p className="text-xs text-[var(--danger)]">{msg}</p>}
    </div>
  );
}

function DeleteBannerButton({ banner, onDeleted }: { banner: Banner; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await clientApi.delete(`/api/banners/${banner.id}`);
      onDeleted();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog>
      <Button isIconOnly variant="ghost" size="sm" aria-label="Xoá banner">
        <TrashIcon className="h-4 w-4 text-[var(--danger)]" />
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Xoá banner này?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="truncate">{banner.imageUrl}</p>
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

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<Banner["id"] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setBanners(await clientApi.get<Banner[]>("/api/banners"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách banner");
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
        <div>
          <h1 className="text-lg font-semibold text-[var(--foreground)]">Banner trang chủ</h1>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Ảnh slide hiển thị đầu màn hình chính của app. Không có banner nào đang bật thì app tự dùng 4 ảnh mặc định đóng gói sẵn.
          </p>
        </div>
        {!creating && (
          <Button onPress={() => setCreating(true)}>
            <PlusIcon className="h-4 w-4" />
            Thêm banner
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {creating && (
        <SectionCard title="Banner mới">
          <BannerForm onSaved={handleSaved} onCancel={() => setCreating(false)} />
        </SectionCard>
      )}

      {banners && banners.length === 0 && !creating && (
        <p className="text-sm text-[var(--muted)]">Chưa có banner nào, app đang dùng 4 ảnh mặc định.</p>
      )}

      <div className="space-y-4">
        {banners &&
          banners.map((b) =>
            editingId === b.id ? (
              <SectionCard key={b.id} title={`Sửa banner #${b.id}`}>
                <BannerForm initial={b} onSaved={handleSaved} onCancel={() => setEditingId(null)} />
              </SectionCard>
            ) : (
              <Card key={b.id}>
                <Card.Content className="flex items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.imageUrl} alt="" className="h-16 w-28 flex-none rounded-lg border border-[var(--border)] object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">Thứ tự {b.sortOrder}</span>
                      <Chip color={b.isActive ? "success" : "danger"}>{b.isActive ? "Đang hiển thị" : "Tắt"}</Chip>
                    </div>
                    <p className="mt-1 truncate text-xs text-[var(--muted)]">{b.imageUrl}</p>
                    {b.linkUrl && <p className="mt-0.5 truncate text-xs text-[var(--muted)]">→ {b.linkUrl}</p>}
                  </div>
                  <div className="flex flex-none items-center gap-2">
                    <Button size="sm" variant="outline" onPress={() => setEditingId(b.id)}>
                      Sửa
                    </Button>
                    <DeleteBannerButton banner={b} onDeleted={load} />
                  </div>
                </Card.Content>
              </Card>
            )
          )}
      </div>
    </div>
  );
}
