"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Checkbox, Chip, Input, Label, Tabs, TextArea, TextField, toast } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { PlusIcon, RefreshIcon, TrashIcon } from "@/components/icons";
import { ErrorBanner, PageHeader, SectionCard } from "@/components/admin/ui";

// Mirrors api/lib/repositories/appConfig.js. The server
// re-validates everything on save, so this type is for editor ergonomics
// rather than a security boundary.
type HomePlatform = { name: string; reward: string; iconUrl: string };
type LinkPlatform = { key: string; label: string; logoUri: string; enabled: boolean; brandColor: string; soft: string };
type Step = { icon: string; title: string; description: string };
type Faq = { question: string; answer: string };
type PricePreset = { label: string; min: string; max: string };

type AppConfig = {
  support: { email: string; hotline: string; zaloUrl: string; facebookUrl: string; websiteUrl: string };
  legal: { privacyUrl: string; dataDeletionUrl: string; termsUrl: string };
  store: { androidUrl: string; iosUrl: string; inviteBaseUrl: string };
  appUpdate: { latestVersion: string; minSupportedVersion: string; forceUpdate: boolean; title: string; message: string };
  maintenance: { enabled: boolean; title: string; message: string };
  features: {
    shoppingTab: boolean;
    campaignsTab: boolean;
    ordersTab: boolean;
    walletTab: boolean;
    createLink: boolean;
    referral: boolean;
    withdraw: boolean;
    socialLogin: boolean;
    shops: boolean;
  };
  home: { bannerAutoplayMs: number; recommendationsLimit: number; taskFallbackSubtitle: string; platforms: HomePlatform[] };
  coins: {
    enabled: boolean;
    title: string;
    subtitle: string;
    cycleRewards: number[];
    resetOnMiss: boolean;
    withdrawEnabled: boolean;
    note: string;
  };
  link: { platforms: LinkPlatform[]; comingSoon: string[] };
  shopping: {
    pricePresets: PricePreset[];
    commissionPctPresets: string[];
    emptyMessage: string;
    guideVersion: number;
    guideTitle: string;
    guideSteps: Step[];
  };
  guide: { steps: Step[]; faqs: Faq[] };
  referral: { shareMessage: string; shareBonusSuffix: string };
  validation: { passwordMinLength: number; otpLength: number; otpTtlMinutes: number };
  network: {
    requestTimeoutMs: number;
    configSyncMinIntervalMs: number;
    pageSize: { orders: number; links: number; campaigns: number; referral: number; withdrawals: number; shoppingProducts: number };
  };
};

type AppConfigResponse = { version: string; config: AppConfig; defaults: AppConfig };

const FEATURE_LABELS: { key: keyof AppConfig["features"]; label: string; hint: string }[] = [
  { key: "shoppingTab", label: "Tab Mua sắm", hint: "Danh sách sản phẩm hoàn tiền" },
  { key: "campaignsTab", label: "Tab Sự kiện", hint: "Chiến dịch thưởng theo mốc" },
  { key: "ordersTab", label: "Tab Đơn hàng", hint: "Hiện đang ẩn khỏi thanh tab" },
  { key: "walletTab", label: "Tab Thanh toán", hint: "Hiện đang ẩn khỏi thanh tab" },
  { key: "createLink", label: "Tạo link hoàn tiền", hint: "Màn hình dán link sản phẩm" },
  { key: "referral", label: "Giới thiệu bạn bè", hint: "Mã mời và hoa hồng giới thiệu" },
  { key: "withdraw", label: "Rút tiền", hint: "Nút tạo yêu cầu thanh toán" },
  { key: "socialLogin", label: "Đăng nhập Google/Facebook", hint: "Ẩn nút nếu tắt" },
  { key: "shops", label: "Shop", hint: "Rail shop nổi bật, thẻ shop khi tìm kiếm và trang chi tiết shop" },
];

// Mười một khối cấu hình, gom thành ba tab theo việc chúng ảnh hưởng tới cái
// gì: cách app chạy, nội dung app hiển thị, và các đường dẫn ra ngoài. Cả
// trang vẫn là MỘT form sau MỘT nút Lưu — đổi tab không mất thay đổi đang gõ.
const TABS: { id: string; label: string }[] = [
  { id: "van-hanh", label: "Vận hành" },
  { id: "noi-dung", label: "Nội dung app" },
  { id: "lien-ket", label: "Liên kết & giới thiệu" },
];

// The shared card with this screen's own body rhythm: every section here is a
// stack of fields rather than a table.
function ConfigSection({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <SectionCard id={id} title={title} description={description} bodyClassName="space-y-4">
      {children}
    </SectionCard>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <TextField name={label} value={value} onChange={onChange} className={className ?? "w-full"}>
      <Label>{label}</Label>
      <Input placeholder={placeholder} />
      {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
    </TextField>
  );
}

function NumberField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <TextField
      name={label}
      value={String(value ?? "")}
      onChange={(next) => onChange(Number(next.replace(/[^\d]/g, "")) || 0)}
      className="w-full"
    >
      <Label>{label}</Label>
      <Input inputMode="numeric" />
      {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
    </TextField>
  );
}

function AreaField({
  label,
  value,
  onChange,
  rows = 3,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  hint?: string;
}) {
  return (
    <TextField name={label} value={value} onChange={onChange} className="w-full">
      <Label>{label}</Label>
      <TextArea rows={rows} />
      {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
    </TextField>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Checkbox isSelected={value} onChange={onChange}>
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Content>
        <span className="text-sm">{label}</span>
        {hint && <span className="block text-xs text-[var(--muted)]">{hint}</span>}
      </Checkbox.Content>
    </Checkbox>
  );
}

// Add/remove/reorder-free list editor: enough for content lists that are
// short and hand-curated, without dragging a table component into it.
function ListEditor<T>({
  title,
  items,
  onChange,
  emptyItem,
  renderItem,
}: {
  title: string;
  items: T[];
  onChange: (items: T[]) => void;
  emptyItem: () => T;
  renderItem: (item: T, update: (patch: Partial<T>) => void) => ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <Button size="sm" variant="tertiary" onPress={() => onChange([...items, emptyItem()])}>
          <PlusIcon />
          Thêm
        </Button>
      </div>
      {items.length === 0 && <p className="text-xs text-[var(--muted)]">Chưa có mục nào — app sẽ dùng danh sách mặc định.</p>}
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">#{index + 1}</span>
              <Button
                size="sm"
                variant="tertiary"
                aria-label={`Xoá mục ${index + 1}`}
                onPress={() => onChange(items.filter((_, i) => i !== index))}
              >
                <TrashIcon />
              </Button>
            </div>
            {renderItem(item, (patch) => onChange(items.map((current, i) => (i === index ? { ...current, ...patch } : current))))}
          </div>
        ))}
      </div>
    </div>
  );
}

function csvToList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function AppConfigPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [defaults, setDefaults] = useState<AppConfig | null>(null);
  const [version, setVersion] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  // The config as the server last confirmed it. Everything on this screen is
  // one big form behind one Save button, so without this there is nothing to
  // compare against and no way to tell the admin they have unsaved edits.
  const savedRef = useRef("");

  const load = useCallback(async () => {
    try {
      const data = await clientApi.get<AppConfigResponse>("/api/app-config");
      setConfig(data.config);
      setDefaults(data.defaults);
      setVersion(data.version);
      savedRef.current = JSON.stringify(data.config);
      setLoadError("");
      setMsg("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Không tải được cấu hình");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(
    () => !!config && !!savedRef.current && JSON.stringify(config) !== savedRef.current,
    [config],
  );

  // The browser's own "are you sure" is the only thing that survives a click
  // on the sidebar, a closed tab or a back gesture - this form has no route
  // guard of its own and an accidental navigation loses every edit at once.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function patch<K extends keyof AppConfig>(section: K, value: Partial<AppConfig[K]>) {
    setConfig((current) => (current ? { ...current, [section]: { ...current[section], ...value } } : current));
    setMsg("");
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setMsg("");
    try {
      const data = await clientApi.put<AppConfigResponse>("/api/app-config", { config });
      setConfig(data.config);
      setVersion(data.version);
      savedRef.current = JSON.stringify(data.config);
      setMsg("Đã lưu. App sẽ nhận cấu hình mới ở lần mở tiếp theo.");
      toast.success("Đã lưu cấu hình app");
    } catch (err) {
      const text = err instanceof Error ? err.message : "Lưu thất bại";
      setMsg(text);
      toast.danger(text);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Cấu hình app" />
        <ErrorBanner message={loadError} onRetry={load} />
      </div>
    );
  }

  if (!config || !defaults) {
    return (
      <div className="space-y-4">
        <PageHeader title="Cấu hình app" />
        <p className="text-sm text-[var(--muted)]">Đang tải cấu hình…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        title="Cấu hình app"
        description="App tải tài liệu cấu hình này về và lưu cache trên máy. Mỗi lần mở app nó chỉ hỏi phiên bản; trùng phiên bản thì bỏ qua, khác thì tải lại. Mọi thay đổi ở đây có hiệu lực mà không cần build app mới."
        actions={
          <>
            <Chip color={dirty ? "warning" : "default"}>{dirty ? "Có thay đổi chưa lưu" : `Phiên bản ${version}`}</Chip>
            <Button variant="outline" onPress={load} isDisabled={saving}>
              <RefreshIcon className="h-4 w-4" />
              Tải lại
            </Button>
            <Button
              variant="outline"
              onPress={() => {
                setConfig(defaults);
                setMsg("Đã nạp giá trị mặc định vào biểu mẫu — bấm Lưu để áp dụng.");
              }}
              isDisabled={saving}
            >
              Nạp giá trị mặc định
            </Button>
          </>
        }
      />

      <Tabs defaultSelectedKey="van-hanh">
        <Tabs.List aria-label="Nhóm cấu hình">
          {TABS.map((t) => (
            <Tabs.Tab key={t.id} id={t.id}>
              {t.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel id="van-hanh" className="space-y-6">
          <ConfigSection id="bao-tri" title="Bảo trì" description="Bật để chặn toàn bộ app bằng một màn hình thông báo, dùng khi backend đang nâng cấp.">
            <Toggle
              label="Đang bảo trì"
              hint="App sẽ hiện màn hình bảo trì thay cho nội dung chính."
              value={config.maintenance.enabled}
              onChange={(enabled) => patch("maintenance", { enabled })}
            />
            <Field label="Tiêu đề" value={config.maintenance.title} onChange={(title) => patch("maintenance", { title })} />
            <AreaField label="Nội dung" value={config.maintenance.message} onChange={(message) => patch("maintenance", { message })} />
          </ConfigSection>

          <ConfigSection
            id="cap-nhat"
            title="Cập nhật ứng dụng"
            description="Bỏ trống phiên bản để tắt kiểm tra. App so sánh phiên bản đang chạy với các mốc dưới đây."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Phiên bản mới nhất"
                placeholder="1.1.0"
                value={config.appUpdate.latestVersion}
                onChange={(latestVersion) => patch("appUpdate", { latestVersion })}
                hint="Dùng để gợi ý cập nhật (không chặn)."
              />
              <Field
                label="Phiên bản tối thiểu"
                placeholder="1.0.0"
                value={config.appUpdate.minSupportedVersion}
                onChange={(minSupportedVersion) => patch("appUpdate", { minSupportedVersion })}
                hint="Thấp hơn mốc này sẽ bị chặn, bắt buộc cập nhật."
              />
            </div>
            <Toggle
              label="Bắt buộc cập nhật lên phiên bản mới nhất"
              hint="Chặn cả những bản nằm giữa mốc tối thiểu và mốc mới nhất."
              value={config.appUpdate.forceUpdate}
              onChange={(forceUpdate) => patch("appUpdate", { forceUpdate })}
            />
            <Field label="Tiêu đề" value={config.appUpdate.title} onChange={(title) => patch("appUpdate", { title })} />
            <AreaField label="Nội dung" value={config.appUpdate.message} onChange={(message) => patch("appUpdate", { message })} />
          </ConfigSection>

          <ConfigSection id="tinh-nang" title="Bật/tắt tính năng" description="Tắt nhanh một màn hình khi có sự cố, không cần phát hành bản mới.">
            <div className="grid gap-3 sm:grid-cols-2">
              {FEATURE_LABELS.map((feature) => (
                <Toggle
                  key={feature.key}
                  label={feature.label}
                  hint={feature.hint}
                  value={config.features[feature.key]}
                  onChange={(next) => patch("features", { [feature.key]: next } as Partial<AppConfig["features"]>)}
                />
              ))}
            </div>
          </ConfigSection>

          <ConfigSection id="gioi-han" title="Giới hạn & mạng" description="Các ngưỡng kỹ thuật app đọc khi khởi động.">
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                label="Độ dài mật khẩu tối thiểu"
                value={config.validation.passwordMinLength}
                onChange={(passwordMinLength) => patch("validation", { passwordMinLength })}
              />
              <NumberField label="Số ký tự mã OTP" value={config.validation.otpLength} onChange={(otpLength) => patch("validation", { otpLength })} />
              <NumberField
                label="Hiệu lực OTP (phút)"
                value={config.validation.otpTtlMinutes}
                onChange={(otpTtlMinutes) => patch("validation", { otpTtlMinutes })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Timeout mỗi request (ms)"
                value={config.network.requestTimeoutMs}
                onChange={(requestTimeoutMs) => patch("network", { requestTimeoutMs })}
              />
              <NumberField
                label="Khoảng cách tối thiểu giữa 2 lần đồng bộ config (ms)"
                value={config.network.configSyncMinIntervalMs}
                onChange={(configSyncMinIntervalMs) => patch("network", { configSyncMinIntervalMs })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  ["orders", "Đơn hàng"],
                  ["links", "Link đã tạo"],
                  ["campaigns", "Sự kiện"],
                  ["referral", "Giới thiệu"],
                  ["withdrawals", "Lịch sử rút"],
                  ["shoppingProducts", "Sản phẩm"],
                ] as const
              ).map(([key, label]) => (
                <NumberField
                  key={key}
                  label={`Số bản ghi mỗi trang — ${label}`}
                  value={config.network.pageSize[key]}
                  onChange={(next) => patch("network", { pageSize: { ...config.network.pageSize, [key]: next } })}
                />
              ))}
            </div>
          </ConfigSection>
        </Tabs.Panel>

        <Tabs.Panel id="noi-dung" className="space-y-6">
          <ConfigSection id="trang-chu" title="Trang chủ" description="Dải nền tảng và các con số hiển thị ngay màn hình đầu tiên.">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Thời gian chuyển banner (ms)"
                value={config.home.bannerAutoplayMs}
                onChange={(bannerAutoplayMs) => patch("home", { bannerAutoplayMs })}
              />
              <NumberField
                label="Số sản phẩm gợi ý mỗi lần tải (app)"
                value={config.home.recommendationsLimit}
                onChange={(recommendationsLimit) => patch("home", { recommendationsLimit })}
              />
            </div>
            <Field
              label="Phụ đề thẻ nhiệm vụ (khi không có chiến dịch)"
              value={config.home.taskFallbackSubtitle}
              onChange={(taskFallbackSubtitle) => patch("home", { taskFallbackSubtitle })}
            />
            <ListEditor
              title="Dải nền tảng & mức hoàn"
              items={config.home.platforms}
              onChange={(platforms) => patch("home", { platforms })}
              emptyItem={() => ({ name: "", reward: "", iconUrl: "" })}
              renderItem={(item, update) => (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Tên" value={item.name} onChange={(name) => update({ name })} />
                  <Field label="Nhãn hoàn tiền" value={item.reward} onChange={(reward) => update({ reward })} placeholder="Hoàn 10%" />
                  <Field label="Link icon" value={item.iconUrl} onChange={(iconUrl) => update({ iconUrl })} />
                </div>
              )}
            />
          </ConfigSection>

          <ConfigSection id="mua-sam" title="Mua sắm" description="Bộ lọc nhanh và hướng dẫn hiện lần đầu vào tab Mua sắm.">
            <Field
              label="Các mốc % hoàn tiền"
              value={config.shopping.commissionPctPresets.join(", ")}
              onChange={(value) => patch("shopping", { commissionPctPresets: csvToList(value) })}
              hint="Cách nhau bằng dấu phẩy, ví dụ 3, 5, 10, 15."
            />
            <ListEditor
              title="Khoảng giá lọc nhanh"
              items={config.shopping.pricePresets}
              onChange={(pricePresets) => patch("shopping", { pricePresets })}
              emptyItem={() => ({ label: "", min: "", max: "" })}
              renderItem={(item, update) => (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Nhãn" value={item.label} onChange={(label) => update({ label })} placeholder="0-100k" />
                  <Field label="Từ (nghìn đồng)" value={item.min} onChange={(min) => update({ min })} />
                  <Field label="Đến (nghìn đồng)" value={item.max} onChange={(max) => update({ max })} hint="Bỏ trống nếu không giới hạn." />
                </div>
              )}
            />
            <AreaField
              label="Thông báo khi không có sản phẩm"
              value={config.shopping.emptyMessage}
              onChange={(emptyMessage) => patch("shopping", { emptyMessage })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tiêu đề hướng dẫn" value={config.shopping.guideTitle} onChange={(guideTitle) => patch("shopping", { guideTitle })} />
              <NumberField
                label="Phiên bản hướng dẫn"
                value={config.shopping.guideVersion}
                onChange={(guideVersion) => patch("shopping", { guideVersion })}
                hint="Tăng số này để hiện lại hướng dẫn cho người đã xem."
              />
            </div>
            <ListEditor
              title="Các bước trong hướng dẫn"
              items={config.shopping.guideSteps}
              onChange={(guideSteps) => patch("shopping", { guideSteps })}
              emptyItem={() => ({ icon: "time-outline", title: "", description: "" })}
              renderItem={(item, update) => (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Icon" value={item.icon} onChange={(icon) => update({ icon })} hint="Tên icon Ionicons, ví dụ time-outline." />
                    <Field label="Tiêu đề" value={item.title} onChange={(title) => update({ title })} />
                  </div>
                  <AreaField label="Mô tả" value={item.description} onChange={(description) => update({ description })} rows={2} />
                </div>
              )}
            />
          </ConfigSection>

          <ConfigSection
            id="diem-danh"
            title="Điểm danh nhận xu"
            description="Mỗi ngày người dùng điểm danh một lần để nhận xu. 1 xu = 1đ, nhưng xu là đơn vị riêng, không cộng vào ví hoàn tiền — chỉ quy đổi khi rút."
          >
            <Toggle
              label="Bật điểm danh"
              hint="Tắt thì app ẩn thẻ điểm danh và chặn mọi lượt nhận xu mới."
              value={config.coins.enabled}
              onChange={(enabled) => patch("coins", { enabled })}
            />
            <Toggle
              label="Cho rút xu cùng yêu cầu rút tiền"
              hint="Người dùng tích ô 'rút cả xu' trong màn Ví; số xu được cộng vào cùng một lần chuyển khoản."
              value={config.coins.withdrawEnabled}
              onChange={(withdrawEnabled) => patch("coins", { withdrawEnabled })}
            />
            <Toggle
              label="Bỏ lỡ một ngày là mất chuỗi"
              hint="Bật: quên điểm danh thì quay lại ngày 1. Tắt: giữ nguyên vị trí, chỉ mất xu của ngày hôm đó."
              value={config.coins.resetOnMiss}
              onChange={(resetOnMiss) => patch("coins", { resetOnMiss })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tiêu đề" value={config.coins.title} onChange={(title) => patch("coins", { title })} />
              <Field label="Phụ đề" value={config.coins.subtitle} onChange={(subtitle) => patch("coins", { subtitle })} />
            </div>
            <Field
              label="Mốc thưởng theo ngày"
              value={config.coins.cycleRewards.join(", ")}
              onChange={(value) =>
                patch("coins", {
                  cycleRewards: csvToList(value)
                    .map((part) => Number(part.replace(/[^\d]/g, "")))
                    .filter((part) => Number.isFinite(part)),
                })
              }
              placeholder="100, 100, 100, 100, 100, 100, 200"
              hint="Số xu cho ngày 1, ngày 2… ngăn cách bằng dấu phẩy. Hết chuỗi thì quay lại mốc đầu, nên 7 số là một tuần."
            />
            <AreaField
              label="Ghi chú hiển thị cho người dùng"
              rows={2}
              value={config.coins.note}
              onChange={(note) => patch("coins", { note })}
            />
          </ConfigSection>

          <ConfigSection id="huong-dan" title="Màn hình Hướng dẫn" description="Nội dung của màn hình Hướng dẫn và phần câu hỏi thường gặp.">
            <ListEditor
              title="Các bước"
              items={config.guide.steps}
              onChange={(steps) => patch("guide", { steps })}
              emptyItem={() => ({ icon: "cart-outline", title: "", description: "" })}
              renderItem={(item, update) => (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Icon" value={item.icon} onChange={(icon) => update({ icon })} />
                    <Field label="Tiêu đề" value={item.title} onChange={(title) => update({ title })} />
                  </div>
                  <AreaField label="Mô tả" value={item.description} onChange={(description) => update({ description })} rows={2} />
                </div>
              )}
            />
            <ListEditor
              title="Câu hỏi thường gặp"
              items={config.guide.faqs}
              onChange={(faqs) => patch("guide", { faqs })}
              emptyItem={() => ({ question: "", answer: "" })}
              renderItem={(item, update) => (
                <div className="space-y-3">
                  <Field label="Câu hỏi" value={item.question} onChange={(question) => update({ question })} />
                  <AreaField label="Trả lời" value={item.answer} onChange={(answer) => update({ answer })} rows={2} />
                </div>
              )}
            />
          </ConfigSection>
        </Tabs.Panel>

        <Tabs.Panel id="lien-ket" className="space-y-6">
          <ConfigSection id="ho-tro" title="Hỗ trợ & liên kết" description="Hiện trong mục Tôi / Cài đặt của app. Bỏ trống thì app ẩn mục đó đi.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email hỗ trợ" value={config.support.email} onChange={(email) => patch("support", { email })} />
              <Field label="Hotline" value={config.support.hotline} onChange={(hotline) => patch("support", { hotline })} />
              <Field label="Link Zalo" value={config.support.zaloUrl} onChange={(zaloUrl) => patch("support", { zaloUrl })} />
              <Field label="Link Facebook" value={config.support.facebookUrl} onChange={(facebookUrl) => patch("support", { facebookUrl })} />
              <Field label="Website" value={config.support.websiteUrl} onChange={(websiteUrl) => patch("support", { websiteUrl })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Chính sách bảo mật"
                value={config.legal.privacyUrl}
                onChange={(privacyUrl) => patch("legal", { privacyUrl })}
                hint="Đường dẫn tương đối tính theo API, hoặc URL đầy đủ."
              />
              <Field label="Xoá dữ liệu" value={config.legal.dataDeletionUrl} onChange={(dataDeletionUrl) => patch("legal", { dataDeletionUrl })} />
              <Field label="Điều khoản sử dụng" value={config.legal.termsUrl} onChange={(termsUrl) => patch("legal", { termsUrl })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Link Google Play" value={config.store.androidUrl} onChange={(androidUrl) => patch("store", { androidUrl })} />
              <Field label="Link App Store" value={config.store.iosUrl} onChange={(iosUrl) => patch("store", { iosUrl })} />
              <Field
                label="Trang đích link mời"
                value={config.store.inviteBaseUrl}
                onChange={(inviteBaseUrl) => patch("store", { inviteBaseUrl })}
                hint="Dùng làm link https khi chia sẻ mã giới thiệu cho người chưa cài app."
              />
            </div>
          </ConfigSection>

          <ConfigSection id="tao-link" title="Màn hình tạo link" description="Sàn nào đang chạy, sàn nào ghi 'Sắp có'.">
            <ListEditor
              title="Nền tảng"
              items={config.link.platforms}
              onChange={(platforms) => patch("link", { platforms })}
              emptyItem={() => ({ key: "", label: "", logoUri: "", enabled: false, brandColor: "#000000", soft: "#F2F2F3" })}
              renderItem={(item, update) => (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Mã" value={item.key} onChange={(key) => update({ key })} placeholder="shopee" />
                    <Field label="Tên hiển thị" value={item.label} onChange={(label) => update({ label })} />
                    <Field label="Link logo" value={item.logoUri} onChange={(logoUri) => update({ logoUri })} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Màu thương hiệu" value={item.brandColor} onChange={(brandColor) => update({ brandColor })} placeholder="#EE4D2D" />
                    <Field label="Màu nền nhạt" value={item.soft} onChange={(soft) => update({ soft })} placeholder="#FFF0EC" />
                    <div className="flex items-end pb-2">
                      <Toggle label="Đang hỗ trợ" value={item.enabled} onChange={(enabled) => update({ enabled })} />
                    </div>
                  </div>
                </div>
              )}
            />
            <Field
              label="Danh sách 'Sắp có'"
              value={config.link.comingSoon.join(", ")}
              onChange={(value) => patch("link", { comingSoon: csvToList(value) })}
              hint="Cách nhau bằng dấu phẩy."
            />
          </ConfigSection>

          <ConfigSection
            id="gioi-thieu"
            title="Giới thiệu bạn bè"
            description="% hoa hồng giới thiệu được cấu hình ở trang Cài đặt; phần dưới đây là nội dung chia sẻ."
          >
            <AreaField
              label="Nội dung chia sẻ"
              value={config.referral.shareMessage}
              onChange={(shareMessage) => patch("referral", { shareMessage })}
              rows={4}
              hint="{code} là mã giới thiệu, {link} là link mời, {bonus} là câu thêm khi có thưởng đơn đầu."
            />
            <Field
              label="Câu thêm khi có thưởng đơn đầu"
              value={config.referral.shareBonusSuffix}
              onChange={(shareBonusSuffix) => patch("referral", { shareBonusSuffix })}
            />
          </ConfigSection>
        </Tabs.Panel>
      </Tabs>

      <div className="sticky bottom-0 -mx-4 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button onPress={save} isPending={saving} isDisabled={!dirty}>
            Lưu cấu hình
          </Button>
          <Button variant="tertiary" onPress={load} isDisabled={!dirty || saving}>
            Huỷ thay đổi
          </Button>
          {dirty && !msg && (
            <p className="text-xs font-medium text-[var(--warning)]">Còn thay đổi chưa lưu.</p>
          )}
          {msg && <p className="text-xs text-[var(--muted)]">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
