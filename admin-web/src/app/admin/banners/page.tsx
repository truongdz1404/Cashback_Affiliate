"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { AlertDialog, Button, Card, Checkbox, Chip, Input, Label, Tabs, TextField } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { PlusIcon, TrashIcon, UploadIcon } from "@/components/icons";

// The app and the website keep separate banner lists: the app's carousel is a
// phone-width card, the website's is a wide 2.4:1 strip, so an image that fits
// one is cropped badly on the other. Each tab below edits one list; nothing a
// tab does can touch the other one.
type Platform = "app" | "web";

const SURFACES: { id: Platform; label: string; hint: string; ratio: string }[] = [
  {
    id: "app",
    label: "Banner app",
    hint: "Ảnh slide đầu màn hình chính của app. Không bật banner nào thì app tự dùng ảnh mặc định đóng gói sẵn trong bản cài.",
    ratio: "aspect-[2/1]",
  },
  {
    id: "web",
    label: "Banner web",
    hint: "Ảnh slide đầu trang chủ website, chỉ hiện với thành viên đã đăng nhập. Không bật banner nào thì phần này ẩn hẳn.",
    ratio: "aspect-[2.4/1]",
  },
];

// Kept in step with lib/bannerUploads.js on the API service, and with the
// reverse proxy body limit in front of both.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

// An upload can be rejected by something between the browser and this app -
// a reverse proxy answering 413 with its own HTML page, or a gateway timeout -
// and that body is not JSON. Parsing it blindly surfaced the parser complaint
// ("Unexpected token <") to the operator instead of what went wrong.
async function readJson(res: Response) {
  const text = await res.text();
  let data: { error?: string; url?: string } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    if (res.status === 413) throw new Error(`Ảnh vượt quá dung lượng máy chủ cho phép (${res.status}).`);
    throw new Error(`Máy chủ trả về phản hồi không hợp lệ (${res.status}).`);
  }
  if (!res.ok) throw new Error(data?.error || `Tải ảnh thất bại: ${res.status}`);
  if (!data?.url) throw new Error("Máy chủ không trả về đường dẫn ảnh.");
  return data as { url: string };
}

type Banner = {
  id: number | string;
  imageUrl: string;
  linkUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
  platform?: Platform;
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
  platform,
  ratio,
  initial,
  onSaved,
  onCancel,
}: {
  platform: Platform;
  ratio: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Uploading only produces a URL - it fills the field below, it does not save
  // the banner. That keeps one save path for both ways of supplying an image,
  // so a picked file and a pasted link end up on exactly the same row shape.
  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setMsg("");
    // Checked here as well as on the server: the reverse proxy in front of this
    // app rejects an oversized body itself, with an HTML error page that never
    // reaches our code, so the friendly message has to be produced before the
    // request leaves the browser.
    if (file.size > MAX_UPLOAD_BYTES) {
      setMsg(`Ảnh nặng ${formatMb(file.size)}, vượt quá giới hạn ${formatMb(MAX_UPLOAD_BYTES)}.`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/banners/upload", { method: "POST", body: formData });
      const { url } = await readJson(res);
      setForm((f) => ({ ...f, imageUrl: url }));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Tải ảnh thất bại");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setMsg("");
    if (!form.imageUrl.trim()) {
      setMsg("Cần tải ảnh lên hoặc dán link ảnh.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        imageUrl: form.imageUrl.trim(),
        linkUrl: form.linkUrl.trim() || null,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
        platform,
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
        <div className="space-y-2 sm:col-span-2">
          <TextField name="imageUrl" value={form.imageUrl} onChange={(v) => setForm((f) => ({ ...f, imageUrl: v }))}>
            <Label>Ảnh banner</Label>
            <Input placeholder="Dán link ảnh, hoặc tải ảnh từ máy bằng nút bên dưới" />
          </TextField>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onPress={() => fileInputRef.current?.click()}
              isDisabled={uploading || saving}
              isPending={uploading}
            >
              <UploadIcon className="h-4 w-4" />
              {uploading ? "Đang tải ảnh..." : "Tải ảnh từ máy"}
            </Button>
            <span className="text-xs text-[var(--muted)]">PNG, JPG, WEBP hoặc GIF, tối đa 8MB.</span>
          </div>
        </div>
        <TextField
          name="linkUrl"
          value={form.linkUrl}
          onChange={(v) => setForm((f) => ({ ...f, linkUrl: v }))}
          className="sm:col-span-2"
        >
          <Label>Link khi bấm vào (không bắt buộc)</Label>
          <Input placeholder={platform === "web" ? "/products hoặc https://..." : "https://... hoặc rewally://campaigns"} />
        </TextField>
        <TextField name="sortOrder" value={form.sortOrder} onChange={(v) => setForm((f) => ({ ...f, sortOrder: v }))}>
          <Label>Thứ tự hiển thị</Label>
          <Input inputMode="numeric" />
        </TextField>
      </div>
      {form.imageUrl.trim() && (
        // Previewed at the surface's own ratio so a wrongly-shaped image is
        // obvious here instead of on the live carousel.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={form.imageUrl.trim()}
          alt="preview"
          className={`w-full max-w-md rounded-lg border border-[var(--border)] object-cover ${ratio}`}
        />
      )}
      <Checkbox isSelected={form.isActive} onChange={(isActive) => setForm((f) => ({ ...f, isActive }))}>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Content>Đang hiển thị</Checkbox.Content>
      </Checkbox>
      <div className="flex items-center gap-2">
        <Button onPress={save} isPending={saving} isDisabled={uploading}>
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

// One surface's list. Mounted per tab panel, so switching tabs refetches that
// surface rather than filtering a list already in memory - the two lists are
// short and the dashboard is edited by one person at a time.
function BannerList({ platform, ratio, hint }: { platform: Platform; ratio: string; hint: string }) {
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<Banner["id"] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setBanners(await clientApi.get<Banner[]>(`/api/banners?platform=${platform}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách banner");
    }
  }, [platform]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSaved() {
    setCreating(false);
    setEditingId(null);
    load();
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-[var(--muted)]">{hint}</p>
        {!creating && (
          <Button className="flex-none" onPress={() => setCreating(true)}>
            <PlusIcon className="h-4 w-4" />
            Thêm banner
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {creating && (
        <SectionCard title="Banner mới">
          <BannerForm platform={platform} ratio={ratio} onSaved={handleSaved} onCancel={() => setCreating(false)} />
        </SectionCard>
      )}

      {banners && banners.length === 0 && !creating && (
        <p className="text-sm text-[var(--muted)]">Chưa có banner nào cho phần này.</p>
      )}

      <div className="space-y-4">
        {banners &&
          banners.map((b) =>
            editingId === b.id ? (
              <SectionCard key={b.id} title={`Sửa banner #${b.id}`}>
                <BannerForm
                  platform={platform}
                  ratio={ratio}
                  initial={b}
                  onSaved={handleSaved}
                  onCancel={() => setEditingId(null)}
                />
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

export default function BannersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Banner trang chủ</h1>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          App và website dùng hai danh sách riêng. Sửa ở tab nào chỉ ảnh hưởng đúng nơi đó.
        </p>
      </div>

      <Tabs defaultSelectedKey="app">
        <Tabs.List aria-label="Nền tảng hiển thị banner">
          {SURFACES.map((s) => (
            <Tabs.Tab key={s.id} id={s.id}>
              {s.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {SURFACES.map((s) => (
          <Tabs.Panel key={s.id} id={s.id}>
            <BannerList platform={s.id} ratio={s.ratio} hint={s.hint} />
          </Tabs.Panel>
        ))}
      </Tabs>
    </div>
  );
}
