"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { AlertDialog, Button, Card, Checkbox, Chip, Input, Label, ListBox, Select, Tabs, TextArea, TextField } from "@heroui/react";
import HeroSlider from "@/components/public/HeroSlider";
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
    hint: "Slide đầu trang chủ website, hiện với cả khách và thành viên. Ngoài ảnh nền, mỗi slide còn có chữ và nút bấm riêng bên dưới. Không bật banner nào thì web tự dùng 6 slide mặc định.",
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

  // Only the web list uses these: each one is a piece drawn as HTML on top of
  // the artwork. A row that leaves them all empty is just a picture.
  bgColor?: string | null;
  eyebrow?: string | null;
  title?: string | null;
  body?: string | null;
  imageAlt?: string | null;
  textAlign?: string | null;
  primaryLabel?: string | null;
  primaryUrl?: string | null;
  secondaryLabel?: string | null;
  secondaryUrl?: string | null;
  memberPrimaryLabel?: string | null;
  memberPrimaryUrl?: string | null;
  memberSecondaryLabel?: string | null;
  memberSecondaryUrl?: string | null;
};

// Every content field is edited as a string and sent as a string; the API
// turns an empty one back into NULL. Listing them once keeps the form state,
// the reset value and the save payload from drifting apart.
const CONTENT_FIELDS = [
  "bgColor",
  "eyebrow",
  "title",
  "body",
  "imageAlt",
  "textAlign",
  "primaryLabel",
  "primaryUrl",
  "secondaryLabel",
  "secondaryUrl",
  "memberPrimaryLabel",
  "memberPrimaryUrl",
  "memberSecondaryLabel",
  "memberSecondaryUrl",
] as const;

type ContentField = (typeof CONTENT_FIELDS)[number];

type BannerFormState = {
  imageUrl: string;
  linkUrl: string;
  sortOrder: string;
  isActive: boolean;
} & Record<ContentField, string>;

const EMPTY_CONTENT = Object.fromEntries(CONTENT_FIELDS.map((f) => [f, ""])) as Record<ContentField, string>;

const EMPTY_FORM: BannerFormState = {
  imageUrl: "",
  linkUrl: "",
  sortOrder: "0",
  isActive: true,
  ...EMPTY_CONTENT,
  textAlign: "center",
};

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
          ...(Object.fromEntries(CONTENT_FIELDS.map((f) => [f, initial[f] || ""])) as Record<ContentField, string>),
          textAlign: initial.textAlign || "center",
        }
      : EMPTY_FORM
  );
  // Which audience the preview below is drawn for. The member buttons replace
  // the guest ones for anyone already signed in, so both have to be checkable.
  const [previewMember, setPreviewMember] = useState(false);
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
      const payload: Record<string, unknown> = {
        imageUrl: form.imageUrl.trim(),
        linkUrl: form.linkUrl.trim() || null,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
        platform,
      };
      // The app tab never shows the content fields, so it never sends them
      // either: an omitted field keeps its stored value instead of being
      // blanked by a form that could not edit it.
      if (platform === "web") {
        for (const field of CONTENT_FIELDS) payload[field] = form[field].trim();
      }
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

  const contentField = (name: ContentField, label: string, placeholder: string, className?: string) => (
    <TextField
      name={name}
      value={form[name]}
      onChange={(v) => setForm((f) => ({ ...f, [name]: v }))}
      className={className}
    >
      <Label>{label}</Label>
      <Input placeholder={placeholder} />
    </TextField>
  );

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
      {platform === "web" && (
        <div className="space-y-4 rounded-xl border border-[var(--border)] p-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Nội dung hiển thị trên banner</h3>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Ảnh chỉ là phần nền. Chữ và nút bên dưới được vẽ đè lên khoảng trống bên trái của ảnh, nên đổi chữ
              không cần vẽ lại ảnh. Bỏ trống hết thì slide chỉ còn là một tấm ảnh, bấm vào đi theo link ở trên.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {contentField("eyebrow", "Chữ nhỏ phía trên", "Miễn phí tham gia")}
            <div className="flex items-end gap-2">
              {contentField("bgColor", "Màu nền", "#F7FEFB", "flex-1")}
              {/* The artwork's own background is not a flat colour; this one
                  fills the strip around it, so it has to be sampled from the
                  image's left edge or the seam shows on phones. */}
              <span
                aria-hidden
                className="mb-1 h-9 w-9 flex-none rounded-lg border border-[var(--border)]"
                style={{ backgroundColor: form.bgColor.trim() || "#F7FEFB" }}
              />
            </div>
            {contentField("title", "Tiêu đề chính", "Cứ mua sắm là được hoàn tiền", "sm:col-span-2")}
            <TextField
              name="body"
              value={form.body}
              onChange={(v) => setForm((f) => ({ ...f, body: v }))}
              className="sm:col-span-2"
            >
              <Label>Mô tả</Label>
              <TextArea rows={2} placeholder="Một hoặc hai câu giải thích ngắn gọn." />
            </TextField>
            {contentField(
              "imageAlt",
              "Mô tả ảnh",
              "Dùng cho trình đọc màn hình và khi ảnh không tải được",
              "sm:col-span-2"
            )}
            <Select
              aria-label="Vị trí khối chữ"
              selectedKey={form.textAlign || "center"}
              onSelectionChange={(key) => setForm((f) => ({ ...f, textAlign: String(key ?? "center") }))}
            >
              <Label>Vị trí khối chữ trên màn hình rộng</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="center">Giữa</ListBox.Item>
                  <ListBox.Item id="top">Trên (khi góc dưới ảnh đã có hình)</ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Nút bấm — khách chưa đăng nhập
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {contentField("primaryLabel", "Nút chính", "Tham gia nhận hoàn tiền")}
              {contentField("primaryUrl", "Link nút chính", "/register hoặc https://...")}
              {contentField("secondaryLabel", "Nút phụ", "Xem sản phẩm")}
              {contentField("secondaryUrl", "Link nút phụ", "/products")}
            </div>
            <p className="text-xs text-[var(--muted)]">Thiếu chữ hoặc thiếu link thì nút đó không hiện.</p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Nút bấm — thành viên đã đăng nhập
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {contentField("memberPrimaryLabel", "Nút chính", "Săn deal hoàn tiền")}
              {contentField("memberPrimaryUrl", "Link nút chính", "/products")}
              {contentField("memberSecondaryLabel", "Nút phụ", "Ví hoàn tiền của tôi")}
              {contentField("memberSecondaryUrl", "Link nút phụ", "/account/wallet")}
            </div>
            <p className="text-xs text-[var(--muted)]">
              Bỏ trống thì thành viên thấy đúng nút như khách. Chỉ cần điền khi lời mời dành cho khách không còn
              hợp lý với người đã có tài khoản, ví dụ “Tạo tài khoản”.
            </p>
          </div>
        </div>
      )}

      {form.imageUrl.trim() &&
        (platform === "web" ? (
          // Drawn by the real hero component rather than a copy of it, so what
          // is approved here is exactly what the home page renders - including
          // the member buttons, which the toggle swaps in.
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[var(--muted)]">Xem trước với:</span>
              <Button size="sm" variant={previewMember ? "outline" : "primary"} onPress={() => setPreviewMember(false)}>
                Khách
              </Button>
              <Button size="sm" variant={previewMember ? "primary" : "outline"} onPress={() => setPreviewMember(true)}>
                Thành viên
              </Button>
            </div>
            <HeroSlider
              isAuthenticated={previewMember}
              banners={[
                {
                  id: 0,
                  sortOrder: 0,
                  imageUrl: form.imageUrl.trim(),
                  linkUrl: form.linkUrl.trim() || null,
                  ...(Object.fromEntries(
                    CONTENT_FIELDS.map((f) => [f, form[f].trim() || null])
                  ) as Record<ContentField, string | null>),
                },
              ]}
            />
          </div>
        ) : (
          // Previewed at the surface's own ratio so a wrongly-shaped image is
          // obvious here instead of on the live carousel.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={form.imageUrl.trim()}
            alt="preview"
            className={`w-full max-w-md rounded-lg border border-[var(--border)] object-cover ${ratio}`}
          />
        ))}
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
                    {b.title && (
                      <p className="mt-0.5 truncate text-sm font-semibold text-[var(--foreground)]">{b.title}</p>
                    )}
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
