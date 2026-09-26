"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  Button,
  Checkbox,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  Table,
  Tabs,
  TextField,
  toast,
} from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/format";
import { datedFilename, downloadCsv } from "@/lib/exportCsv";
import { useDebounced } from "@/lib/useDebounced";
import { ArrowRightIcon, DownloadIcon, RefreshIcon, TrashIcon } from "@/components/icons";
import {
  EmptyState,
  ErrorBanner,
  FilterChips,
  PageHeader,
  Pagination,
  SearchInput,
  SectionCard,
  SelectFilter,
  StatCard,
  StatGrid,
  TableShell,
  Toolbar,
  type FilterOption,
} from "@/components/admin/ui";

type Shop = {
  id: number;
  shopId: string;
  name: string;
  status: string;
  imageUrl?: string | null;
  portraitUrl?: string | null;
  commissionRateText?: string | null;
  rating?: number | null;
  soldTotal?: number | null;
  followerCount?: number | null;
  followersText?: string | null;
  productCount: number;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  source: string;
  detailFetchedAt?: string | null;
  lastCrawledAt?: string | null;
  lastCrawlError?: string | null;
};

type ContinuousGaps = {
  sourceSec: number;
  shopeeSec: number;
  crawlSec: number;
  idleSec: number;
};

type ShopSettings = {
  shopResolveEnabled: boolean;
  shopResolveBatchSize: number;
  shopCrawlEnabled: boolean;
  shopCrawlMaxShops: number;
  shopCrawlMaxPages: number;
  shopDetailEnabled: boolean;
  shopDetailBatchSize: number;
  jobMode: "continuous" | "cron";
  continuousGaps: ContinuousGaps;
};

type JobLoop = {
  key: string;
  label: string;
  jobs?: string[];
  phase: "stopped" | "standby" | "off" | "working" | "idle" | "cooling";
  cycles: number;
  lastJob?: string | null;
  lastResult?: Record<string, unknown> | null;
  lastFinishedAt?: string | null;
  lastError?: string | null;
  nextWakeAt?: string | null;
};

type JobLoopStatus = {
  mode?: "continuous" | "cron";
  gaps?: ContinuousGaps;
  loops: JobLoop[];
  error?: string;
};

const JOB_MODES = [
  { value: "continuous", label: "Chạy liên tục (đang hoàn thiện dữ liệu)" },
  { value: "cron", label: "Chạy theo lịch (khi đã có user)" },
];

const LOOP_PHASES: Record<JobLoop["phase"], { label: string; color: "success" | "warning" | "danger" | "default" }> = {
  working: { label: "Đang chạy", color: "success" },
  idle: { label: "Hết việc, chờ", color: "default" },
  off: { label: "Đã tắt công tắc", color: "warning" },
  cooling: { label: "Đang nghỉ sau lỗi", color: "danger" },
  standby: { label: "Nhường cho cron", color: "default" },
  stopped: { label: "Dừng", color: "default" },
};

type ResolveResult = {
  scanned?: number;
  resolved?: number;
  ambiguous?: number;
  notFound?: number;
  failed?: number;
  retryable?: number;
  productsLinked?: number;
  shopsCreated?: number;
  namesDiscovered?: number;
  detailsFetched?: number;
  error?: string;
};

type CrawlResult = {
  shopsVisited?: number;
  scraped?: number;
  saved?: number;
  empty?: number;
  failed?: number;
  stoppedEarly?: string | null;
  error?: string;
};

type JobStatus<R> = {
  status: "idle" | "running" | "done" | "error";
  startedAt?: string | null;
  finishedAt?: string | null;
  result?: R | null;
  error?: string | null;
};

type JobRun = {
  id: number;
  job: string;
  status: string;
  trigger: string;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  resultJson?: string | null;
  error?: string | null;
};

type ShopCounts = { linked: number; discovered: number; hidden: number; featured: number };

const STATUS_OPTIONS: FilterOption[] = [
  { value: "linked", label: "Đã link (hiện cho user)" },
  { value: "discovered", label: "Mới phát hiện (ẩn)" },
  { value: "all", label: "Tất cả trạng thái" },
];

const VISIBILITY_OPTIONS: FilterOption[] = [
  { value: "", label: "Hiện & ẩn" },
  { value: "active", label: "Đang hiện" },
  { value: "hidden", label: "Đang ẩn" },
];

// Cùng bộ khoá với SORTS trong api/lib/repositories/shops.js — đổi tên khoá ở
// đây mà không đổi bên đó thì backend lặng lẽ rơi về "featured".
const SORT_OPTIONS: FilterOption[] = [
  { value: "featured", label: "Nổi bật trước" },
  { value: "newest", label: "Mới thêm nhất" },
  { value: "products_desc", label: "Nhiều sản phẩm nhất" },
  { value: "commission_desc", label: "Hoa hồng cao nhất" },
  { value: "sold_desc", label: "Bán chạy nhất" },
];

const EMPTY_FILTERS = { status: "linked", visibility: "", featured: false, sort: "featured" };

function labelOf(options: FilterOption[], value: string) {
  return options.find((o) => o.value === value)?.label ?? value;
}

const STATUS_LABELS: Record<string, { label: string; color: "success" | "warning" | "danger" }> = {
  linked: { label: "Đã link", color: "success" },
  discovered: { label: "Mới phát hiện", color: "warning" },
};

function ShopAvatar({ shop }: { shop: Shop }) {
  const src = shop.portraitUrl || shop.imageUrl;
  if (!src) {
    return (
      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[var(--surface-secondary)] text-xs font-bold text-[var(--muted)]">
        {shop.name.trim().charAt(0).toUpperCase() || "?"}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-9 w-9 flex-none rounded-lg border border-[var(--border)] object-cover" />;
}

/**
 * Every knob the background jobs run with. These are settings rows rather than
 * env vars precisely so they can be flipped from here without a redeploy - the
 * resolve job talks to Shopee's own API and the blast radius of leaving it
 * running while blocked is the affiliate account itself.
 */
function OperationsSection({ onChanged }: { onChanged: () => void }) {
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [batchSize, setBatchSize] = useState("");
  const [detailBatchSize, setDetailBatchSize] = useState("");
  const [maxShops, setMaxShops] = useState("");
  const [maxPages, setMaxPages] = useState("");
  const [sourceGap, setSourceGap] = useState("");
  const [shopeeGap, setShopeeGap] = useState("");
  const [crawlGap, setCrawlGap] = useState("");
  const [idleGap, setIdleGap] = useState("");
  const [saving, setSaving] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await clientApi.get<ShopSettings>("/api/settings");
      setSettings(data);
      setBatchSize(String(data.shopResolveBatchSize ?? ""));
      setDetailBatchSize(String(data.shopDetailBatchSize ?? ""));
      setMaxShops(String(data.shopCrawlMaxShops ?? ""));
      setMaxPages(String(data.shopCrawlMaxPages ?? ""));
      const gaps = data.continuousGaps;
      setSourceGap(String(gaps?.sourceSec ?? ""));
      setShopeeGap(String(gaps?.shopeeSec ?? ""));
      setCrawlGap(String(gaps?.crawlSec ?? ""));
      setIdleGap(String(gaps?.idleSec ?? ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được cài đặt");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Toggles save immediately: a kill switch nobody remembered to press "Lưu"
  // after is not a kill switch.
  async function toggle(
    key: "shopResolveEnabled" | "shopDetailEnabled" | "shopCrawlEnabled",
    value: boolean,
  ) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    try {
      await clientApi.put("/api/settings", { [key]: value });
      toast.success(value ? "Đã bật" : "Đã tắt");
      onChanged();
    } catch (err) {
      setSettings((s) => (s ? { ...s, [key]: !value } : s));
      toast.danger(err instanceof Error ? err.message : "Lưu thất bại");
    }
  }

  // Same reasoning as the toggles: switching the whole service between "chạy
  // liên tục" and "chạy theo lịch" is the biggest lever on this page, so it
  // takes effect on the spot instead of waiting for a Lưu nobody presses.
  async function changeMode(mode: ShopSettings["jobMode"]) {
    if (!settings || mode === settings.jobMode) return;
    const previous = settings.jobMode;
    setSettings((s) => (s ? { ...s, jobMode: mode } : s));
    setModeSaving(true);
    try {
      await clientApi.put("/api/settings", { jobMode: mode });
      toast.success(mode === "continuous" ? "Đã chuyển sang chạy liên tục" : "Đã chuyển sang chạy theo lịch");
      onChanged();
    } catch (err) {
      setSettings((s) => (s ? { ...s, jobMode: previous } : s));
      toast.danger(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setModeSaving(false);
    }
  }

  async function saveNumbers() {
    setSaving(true);
    setError("");
    try {
      await clientApi.put("/api/settings", {
        shopResolveBatchSize: Number(batchSize),
        shopDetailBatchSize: Number(detailBatchSize),
        shopCrawlMaxShops: Number(maxShops),
        shopCrawlMaxPages: Number(maxPages),
        continuousGaps: {
          sourceSec: Number(sourceGap),
          shopeeSec: Number(shopeeGap),
          crawlSec: Number(crawlGap),
          idleSec: Number(idleGap),
        },
      });
      toast.success("Đã lưu");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  const continuous = settings?.jobMode === "continuous";

  return (
    <SectionCard
      title="Vận hành"
      description="Cùng một bộ job chạy được theo hai kiểu: liên tục (chạy xong lại chạy tiếp, dùng khi đang gom dữ liệu) hoặc theo lịch (mỗi job một khung giờ cố định, dùng khi đã có người dùng). Mọi thay đổi ở đây có hiệu lực ngay từ lượt chạy kế tiếp, không cần deploy lại."
    >
      {!settings ? (
        <p className="text-sm text-[var(--muted)]">Đang tải...</p>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-[var(--border)] p-3">
            <Select
              selectedKey={settings.jobMode}
              isDisabled={modeSaving}
              onSelectionChange={(key) => changeMode(String(key ?? "continuous") as ShopSettings["jobMode"])}
            >
              <Label>Kiểu chạy</Label>
              <Select.Trigger className="mt-1 min-w-[320px]">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {JOB_MODES.map((opt) => (
                    <ListBox.Item key={opt.value} id={opt.value}>
                      {opt.label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {continuous
                ? "Ba vòng lặp chạy song song và tự nghỉ theo khoảng cách bên dưới. Các mốc cron của những job này bị bỏ qua để không chạy đè."
                : "Mỗi job chạy đúng mốc giờ của nó: tra tên shop 10 phút/lần, lấy chi tiết shop 20 phút/lần, crawl sản phẩm 02:30 hằng đêm."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--border)] p-3">
              <Checkbox isSelected={settings.shopResolveEnabled} onChange={(v) => toggle("shopResolveEnabled", v)}>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Content>Tra tên shop</Checkbox.Content>
              </Checkbox>
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                Gọi API Shopee để đổi tên shop trong bảng sản phẩm thành shop_id, rồi link sản phẩm về shop.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-3">
              <Checkbox isSelected={settings.shopDetailEnabled} onChange={(v) => toggle("shopDetailEnabled", v)}>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Content>Lấy chi tiết shop</Checkbox.Content>
              </Checkbox>
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                Lấy avatar, đánh giá, lượt theo dõi. Shop thiếu ảnh thì không bao giờ hiện cho người dùng.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-3">
              <Checkbox isSelected={settings.shopCrawlEnabled} onChange={(v) => toggle("shopCrawlEnabled", v)}>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Content>Crawl sản phẩm theo shop</Checkbox.Content>
              </Checkbox>
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                Mở trang shop bằng trình duyệt và lấy sản phẩm. Đây là job nặng nhất, chiếm trọn trình duyệt khi chạy.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <TextField name="batchSize" value={batchSize} onChange={setBatchSize}>
              <Label>Số tên tra mỗi lượt (1-50)</Label>
              <Input inputMode="numeric" />
            </TextField>
            <TextField name="detailBatchSize" value={detailBatchSize} onChange={setDetailBatchSize}>
              <Label>Số shop lấy chi tiết mỗi lượt (1-60)</Label>
              <Input inputMode="numeric" />
            </TextField>
            <TextField name="maxShops" value={maxShops} onChange={setMaxShops}>
              <Label>Số shop crawl mỗi lượt (1-50)</Label>
              <Input inputMode="numeric" />
            </TextField>
            <TextField name="maxPages" value={maxPages} onChange={setMaxPages}>
              <Label>Số trang mỗi shop (1-20)</Label>
              <Input inputMode="numeric" />
            </TextField>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Khoảng nghỉ khi chạy liên tục (giây)</p>
            <p className="mb-3 text-xs text-[var(--muted)]">
              Nghỉ bao lâu giữa hai lượt. Ba nhóm tách riêng vì mức rủi ro khác nhau: nhóm nguồn gọi API của chính
              chúng ta nên gần như không cần nghỉ, còn hai nhóm kia gọi thẳng Shopee.
              {continuous ? "" : " Đang ở chế độ theo lịch nên các số này chưa có tác dụng."}
            </p>
            <div className="grid gap-3 sm:grid-cols-4">
              <TextField name="sourceGap" value={sourceGap} onChange={setSourceGap}>
                <Label>Nhóm nguồn (0-3600)</Label>
                <Input inputMode="numeric" />
              </TextField>
              <TextField name="shopeeGap" value={shopeeGap} onChange={setShopeeGap}>
                <Label>Nhóm gọi Shopee (1-3600)</Label>
                <Input inputMode="numeric" />
              </TextField>
              <TextField name="crawlGap" value={crawlGap} onChange={setCrawlGap}>
                <Label>Nhóm crawl (1-3600)</Label>
                <Input inputMode="numeric" />
              </TextField>
              <TextField name="idleGap" value={idleGap} onChange={setIdleGap}>
                <Label>Khi hết việc (30-86400)</Label>
                <Input inputMode="numeric" />
              </TextField>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onPress={saveNumbers} isPending={saving}>
              Lưu
            </Button>
            {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/**
 * Live view of the three continuous loops. Deliberately read-only and polled
 * rather than pushed: the loops live in the backend process, so after a deploy
 * restarts it this is the only way to tell "working" from "quietly dead".
 */
function JobLoopsSection({ reloadKey }: { reloadKey: number }) {
  const [status, setStatus] = useState<JobLoopStatus | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setStatus(await clientApi.get<JobLoopStatus>("/api/job-loops"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đọc được trạng thái vòng lặp");
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load, reloadKey]);

  return (
    <SectionCard
      title="Vòng lặp đang chạy"
      description="Tự làm mới 15 giây/lần. Chỉ có ý nghĩa khi đang ở chế độ chạy liên tục."
    >
      {error && <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>}
      {status?.error && <p className="mb-3 text-sm text-[var(--danger)]">{status.error}</p>}
      {!status ? (
        <p className="text-sm text-[var(--muted)]">Đang tải...</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {status.loops.map((loop) => {
            const phase = LOOP_PHASES[loop.phase] ?? { label: loop.phase, color: "default" as const };
            return (
              <div key={loop.key} className="rounded-xl border border-[var(--border)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{loop.label}</span>
                  <Chip color={phase.color} size="sm">
                    {phase.label}
                  </Chip>
                </div>
                <dl className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                  <div className="flex justify-between gap-2">
                    <dt>Số lượt đã chạy</dt>
                    <dd className="font-medium text-[var(--foreground)]">{loop.cycles}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Job gần nhất</dt>
                    <dd className="truncate font-medium text-[var(--foreground)]">{loop.lastJob || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Xong lúc</dt>
                    <dd className="font-medium text-[var(--foreground)]">
                      {loop.lastFinishedAt ? formatDateTime(loop.lastFinishedAt) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Chạy tiếp lúc</dt>
                    <dd className="font-medium text-[var(--foreground)]">
                      {loop.nextWakeAt ? formatDateTime(loop.nextWakeAt) : "—"}
                    </dd>
                  </div>
                </dl>
                {loop.lastResult && (
                  <p className="mt-2 break-words rounded-lg bg-[var(--surface-secondary)] p-2 font-mono text-[11px] text-[var(--muted)]">
                    {JSON.stringify(loop.lastResult)}
                  </p>
                )}
                {loop.lastError && <p className="mt-2 text-xs text-[var(--danger)]">{loop.lastError}</p>}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

/**
 * Both manual runners. Each is a 202 + poll, same contract as the product-offer
 * sync: the backend starts the job and answers immediately, because a held-open
 * request dies at Cloudflare's ~100s upstream timeout long before a batch that
 * paces itself against Shopee finishes.
 */
function ManualRunSection({ onFinished }: { onFinished: () => void }) {
  const [resolveBusy, setResolveBusy] = useState(false);
  const [resolveMsg, setResolveMsg] = useState("");
  const [oneName, setOneName] = useState("");
  const [oneNameBusy, setOneNameBusy] = useState(false);
  const [crawlBusy, setCrawlBusy] = useState(false);
  const [crawlMsg, setCrawlMsg] = useState("");
  const [crawlShopId, setCrawlShopId] = useState("");

  // Every interval this component starts, so a poll can never outlive the page
  // and keep firing requests at a dashboard nobody is looking at.
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  useEffect(() => {
    const started = timers.current;
    return () => started.forEach(clearInterval);
  }, []);

  const describeResolve = useCallback((s: JobStatus<ResolveResult>) => {
    if (s.status === "error") return s.error || "Chạy thất bại";
    if (s.status === "done" && s.result) {
      const r = s.result;
      if (r.error) return `Dừng sớm: ${r.error}`;
      return `Xong: quét ${r.scanned ?? 0} tên, khớp ${r.resolved ?? 0}, mơ hồ ${r.ambiguous ?? 0}, không thấy ${r.notFound ?? 0} · link ${r.productsLinked ?? 0} sản phẩm · thêm ${r.shopsCreated ?? 0} shop.`;
    }
    return "Đang tra tên shop, có thể mất vài phút...";
  }, []);

  const describeCrawl = useCallback((s: JobStatus<CrawlResult>) => {
    if (s.status === "error") return s.error || "Chạy thất bại";
    if (s.status === "done" && s.result) {
      const r = s.result;
      if (r.error) return `Dừng sớm: ${r.error}`;
      const base = `Xong: ${r.shopsVisited ?? 0} shop, cào ${r.scraped ?? 0} sản phẩm, lưu ${r.saved ?? 0}.`;
      const notes = [
        r.empty ? `${r.empty} shop không có sản phẩm` : "",
        r.failed ? `${r.failed} shop lỗi` : "",
        r.stoppedEarly ? `dừng sớm: ${r.stoppedEarly}` : "",
      ].filter(Boolean);
      return notes.length ? `${base} (${notes.join(", ")})` : base;
    }
    return "Đang crawl sản phẩm, có thể mất khá lâu...";
  }, []);

  function poll<R>(
    path: string,
    describe: (s: JobStatus<R>) => string,
    setBusy: (v: boolean) => void,
    setMsg: (v: string) => void,
  ) {
    const interval = setInterval(async () => {
      try {
        const status = await clientApi.get<JobStatus<R>>(path);
        if (status.status === "running") return;
        clearInterval(interval);
        setBusy(false);
        setMsg(describe(status));
        onFinished();
      } catch (err) {
        clearInterval(interval);
        setBusy(false);
        setMsg(err instanceof Error ? err.message : "Không kiểm tra được trạng thái");
      }
    }, 3000);
    timers.current.push(interval);
  }

  async function runResolve() {
    setResolveBusy(true);
    setResolveMsg("Đang tra tên shop, có thể mất vài phút...");
    try {
      const status = await clientApi.post<JobStatus<ResolveResult>>("/api/shops/resolve", {});
      if (status.status !== "running") {
        setResolveBusy(false);
        setResolveMsg(describeResolve(status));
        onFinished();
        return;
      }
      poll("/api/shops/resolve", describeResolve, setResolveBusy, setResolveMsg);
    } catch (err) {
      setResolveBusy(false);
      setResolveMsg(err instanceof Error ? err.message : "Chạy thất bại");
    }
  }

  // One name is a single API call, so the backend answers it synchronously with
  // the outcome - an admin fixing one shop wants the answer, not a job to poll.
  async function resolveOneName() {
    const shopName = oneName.trim();
    if (!shopName) return;
    setOneNameBusy(true);
    try {
      const r = await clientApi.post<{
        status: string;
        shopId?: string | null;
        productsLinked?: number;
      }>("/api/shops/resolve", { shopName });
      toast.success(
        r.status === "resolved" ? `Khớp shop ${r.shopId}, link ${r.productsLinked ?? 0} sản phẩm` : `Kết quả: ${r.status}`,
      );
      setOneName("");
      onFinished();
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Tra thất bại");
    } finally {
      setOneNameBusy(false);
    }
  }

  async function runCrawl(shopId?: string) {
    setCrawlBusy(true);
    setCrawlMsg("Đang crawl sản phẩm, có thể mất khá lâu...");
    try {
      const status = await clientApi.post<JobStatus<CrawlResult>>("/api/shop-product-sync", shopId ? { shopId } : {});
      if (status.status !== "running") {
        setCrawlBusy(false);
        setCrawlMsg(describeCrawl(status));
        onFinished();
        return;
      }
      poll("/api/shop-product-sync", describeCrawl, setCrawlBusy, setCrawlMsg);
    } catch (err) {
      setCrawlBusy(false);
      setCrawlMsg(err instanceof Error ? err.message : "Chạy thất bại");
    }
  }

  return (
    <SectionCard title="Chạy thủ công">
      <div className="space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onPress={runResolve} isPending={resolveBusy} isDisabled={resolveBusy}>
              Tra tên shop ngay
            </Button>
            {resolveMsg && <p className="text-sm text-[var(--muted)]">{resolveMsg}</p>}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <TextField name="oneName" value={oneName} onChange={setOneName} className="min-w-[280px]">
              <Label className="text-xs">Hoặc tra đúng một tên shop</Label>
              <Input placeholder="Dán nguyên văn tên shop trong bảng sản phẩm" />
            </TextField>
            <Button variant="outline" onPress={resolveOneName} isPending={oneNameBusy} isDisabled={!oneName.trim()}>
              Tra tên này
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            Tên phải trùng khít với cột &quot;Shop&quot; ở trang Sản phẩm — hệ thống so khớp chính xác, không bỏ dấu, không
            cắt hậu tố.
          </p>
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <div className="flex flex-wrap items-end gap-2">
            <Button onPress={() => runCrawl()} isPending={crawlBusy} isDisabled={crawlBusy}>
              Crawl theo hàng đợi
            </Button>
            <TextField name="crawlShopId" value={crawlShopId} onChange={setCrawlShopId} className="min-w-[200px]">
              <Label className="text-xs">Hoặc crawl đúng một shop</Label>
              <Input placeholder="shop_id, ví dụ 1024405393" inputMode="numeric" />
            </TextField>
            <Button
              variant="outline"
              onPress={() => runCrawl(crawlShopId.trim())}
              isDisabled={crawlBusy || !crawlShopId.trim()}
            >
              Crawl shop này
            </Button>
          </div>
          {crawlMsg && <p className="mt-2 text-sm text-[var(--muted)]">{crawlMsg}</p>}
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            Chạy đúng một shop là cách duy nhất crawl shop đang ở trạng thái &quot;Mới phát hiện&quot; — hàng đợi tự động chỉ
            lấy shop đã link.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

function JobRunsSection({ reloadKey }: { reloadKey: number }) {
  const [runs, setRuns] = useState<JobRun[]>([]);

  useEffect(() => {
    clientApi
      .get<{ items: JobRun[] }>("/api/job-runs?limit=10")
      .then((data) => setRuns(data.items || []))
      .catch(() => {});
  }, [reloadKey]);

  if (!runs.length) return null;

  return (
    <SectionCard
      title="Lượt chạy gần đây"
      description="Một lượt cron quét xong mà không có việc gì để làm thì cố ý không được ghi lại — nếu không, 144 dòng rỗng mỗi ngày sẽ chôn mất những lượt thật sự chạy."
    >
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="Lượt chạy job" className="min-w-[720px]">
            <Table.Header>
              <Table.Column isRowHeader>Job</Table.Column>
              <Table.Column>Bắt đầu</Table.Column>
              <Table.Column>Nguồn</Table.Column>
              <Table.Column>Trạng thái</Table.Column>
              <Table.Column>Kết quả</Table.Column>
            </Table.Header>
            <Table.Body>
              {runs.map((r) => (
                <Table.Row key={r.id}>
                  <Table.Cell>{r.job}</Table.Cell>
                  <Table.Cell>{formatDateTime(r.startedAt)}</Table.Cell>
                  <Table.Cell>{r.trigger}</Table.Cell>
                  <Table.Cell>
                    <Chip color={r.status === "done" ? "success" : r.status === "error" ? "danger" : "warning"}>
                      {r.status}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell>
                    <span
                      className="block max-w-[420px] truncate text-xs text-[var(--muted)]"
                      title={r.error || r.resultJson || ""}
                    >
                      {r.error || r.resultJson || "-"}
                    </span>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </SectionCard>
  );
}

function DeleteShopButton({ shop, onDeleted }: { shop: Shop; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await clientApi.delete(`/api/shops/${shop.id}`);
      toast.success("Đã xoá shop");
      onDeleted();
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Xoá thất bại");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog>
      <Button isIconOnly variant="ghost" size="sm" aria-label="Xoá shop">
        <TrashIcon className="h-4 w-4 text-[var(--danger)]" />
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[420px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Xoá shop này?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="truncate font-medium">{shop.name}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {shop.productCount} sản phẩm của shop vẫn còn trong app, chỉ bị bỏ liên kết với shop. Lần tra tên sau có thể
                tạo lại shop này. Muốn ẩn tạm thì bỏ tick &quot;Hiện&quot; thay vì xoá.
              </p>
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

function ShopRow({ shop, onChanged }: { shop: Shop; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [sortOrder, setSortOrder] = useState(String(shop.sortOrder ?? 0));

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await clientApi.put(`/api/shops/${shop.id}`, body);
      onChanged();
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function refreshDetail() {
    setBusy(true);
    try {
      await clientApi.post(`/api/shops/${shop.id}/refresh`);
      toast.success("Đã cập nhật đánh giá / lượt theo dõi");
      onChanged();
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Cập nhật thất bại");
    } finally {
      setBusy(false);
    }
  }

  const badge = STATUS_LABELS[shop.status];
  const meta = [
    shop.rating != null ? `${shop.rating.toFixed(1)}★` : "",
    shop.followersText || (shop.followerCount != null ? `${shop.followerCount.toLocaleString("vi-VN")} theo dõi` : ""),
  ].filter(Boolean);

  return (
    <Table.Row>
      <Table.Cell>
        <div className="flex items-center gap-2.5">
          <ShopAvatar shop={shop} />
          <div className="min-w-0">
            <p className="max-w-[240px] truncate text-sm font-medium text-[var(--foreground)]" title={shop.name}>
              {shop.name}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {shop.shopId}
              {meta.length ? ` · ${meta.join(" · ")}` : ""}
            </p>
          </div>
        </div>
      </Table.Cell>
      <Table.Cell>{badge ? <Chip color={badge.color}>{badge.label}</Chip> : shop.status}</Table.Cell>
      <Table.Cell className="text-right">{shop.productCount.toLocaleString("vi-VN")}</Table.Cell>
      <Table.Cell className="text-right">{shop.commissionRateText || "-"}</Table.Cell>
      <Table.Cell>
        <div className="flex items-center gap-3">
          <Checkbox isSelected={shop.isActive} isDisabled={busy} onChange={(v) => patch({ isActive: v })}>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content className="text-xs">Hiện</Checkbox.Content>
          </Checkbox>
          <Checkbox isSelected={shop.isFeatured} isDisabled={busy} onChange={(v) => patch({ isFeatured: v })}>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content className="text-xs">Nổi bật</Checkbox.Content>
          </Checkbox>
          <TextField
            name={`sortOrder-${shop.id}`}
            value={sortOrder}
            onChange={setSortOrder}
            aria-label="Thứ tự"
            className="w-16"
          >
            <Input
              inputMode="numeric"
              className="text-xs"
              onBlur={() => {
                const next = Number(sortOrder);
                if (Number.isInteger(next) && next !== shop.sortOrder) patch({ sortOrder: next });
              }}
            />
          </TextField>
        </div>
      </Table.Cell>
      <Table.Cell>
        <span className="text-xs text-[var(--muted)]" title={shop.lastCrawlError || ""}>
          {shop.lastCrawledAt ? formatDateTime(shop.lastCrawledAt) : "Chưa crawl"}
          {shop.lastCrawlError ? " ⚠" : ""}
        </span>
      </Table.Cell>
      <Table.Cell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label="Cập nhật thông tin shop từ Shopee"
            isDisabled={busy}
            onPress={refreshDetail}
          >
            <RefreshIcon className="h-4 w-4" />
          </Button>
          <DeleteShopButton shop={shop} onDeleted={onChanged} />
        </div>
      </Table.Cell>
    </Table.Row>
  );
}

export default function ShopsPage() {
  const [items, setItems] = useState<Shop[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<ShopCounts>({ linked: 0, discovered: 0, hidden: 0, featured: 0 });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const q = useDebounced(searchInput.trim());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [ambiguous, setAmbiguous] = useState(0);

  const query = useMemo(() => {
    const p = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
      status: filters.status,
      sort: filters.sort,
    });
    if (q) p.set("search", q);
    if (filters.visibility) p.set("visibility", filters.visibility);
    if (filters.featured) p.set("featured", "1");
    return p.toString();
  }, [filters, page, pageSize, q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await clientApi.get<{ items: Shop[]; total: number; counts?: ShopCounts }>(
        `/api/shops?${query}`,
      );
      setItems(data.items || []);
      setTotal(data.total || 0);
      if (data.counts) setCounts(data.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách shop");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  // Any filter change restarts at page one: keeping the old offset after
  // narrowing from 800 shops to 3 lands on page 12 of a one-page result and
  // shows an empty table.
  useEffect(() => {
    setPage(0);
  }, [q, filters.status, filters.visibility, filters.featured, filters.sort, pageSize]);

  // The ambiguous count drives the badge on the queue link - it is the only
  // state in this whole pipeline that cannot resolve itself and needs a person.
  useEffect(() => {
    clientApi
      .get<{ counts?: Record<string, number> }>("/api/shop-name-resolutions?status=ambiguous&limit=1")
      .then((data) => setAmbiguous(data.counts?.ambiguous || 0))
      .catch(() => {});
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const chips = [
    q ? { label: `Tìm: ${q}`, onClear: () => setSearchInput("") } : null,
    filters.status !== "linked"
      ? {
          label: labelOf(STATUS_OPTIONS, filters.status),
          onClear: () => setFilters((f) => ({ ...f, status: "linked" })),
        }
      : null,
    filters.visibility
      ? {
          label: labelOf(VISIBILITY_OPTIONS, filters.visibility),
          onClear: () => setFilters((f) => ({ ...f, visibility: "" })),
        }
      : null,
    filters.featured ? { label: "Chỉ shop nổi bật", onClear: () => setFilters((f) => ({ ...f, featured: false })) } : null,
    filters.sort !== "featured"
      ? { label: labelOf(SORT_OPTIONS, filters.sort), onClear: () => setFilters((f) => ({ ...f, sort: "featured" })) }
      : null,
  ].filter(Boolean) as { label: string; onClear: () => void }[];

  function exportPage() {
    downloadCsv(datedFilename("shop"), items, [
      { header: "Shop ID", value: (s) => s.shopId },
      { header: "Tên shop", value: (s) => s.name },
      { header: "Trạng thái", value: (s) => STATUS_LABELS[s.status]?.label || s.status },
      { header: "Sản phẩm", value: (s) => s.productCount },
      { header: "Hoa hồng", value: (s) => s.commissionRateText || "" },
      { header: "Đánh giá", value: (s) => (s.rating != null ? s.rating.toFixed(1) : "") },
      { header: "Theo dõi", value: (s) => s.followerCount ?? "" },
      { header: "Hiện", value: (s) => (s.isActive ? "Có" : "Không") },
      { header: "Nổi bật", value: (s) => (s.isFeatured ? "Có" : "Không") },
      { header: "Crawl lần cuối", value: (s) => (s.lastCrawledAt ? formatDateTime(s.lastCrawledAt) : "") },
    ]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shop"
        count={total}
        description={
          'Shop trong chương trình affiliate Shopee. Shop chỉ hiện cho user khi đang bật, ở trạng thái "Đã link" và có ít nhất một sản phẩm — shop "Mới phát hiện" là shop tình cờ tìm thấy khi tra tên, chưa có sản phẩm nào.'
        }
        actions={
          <>
            <Link
              href="/admin/shops/resolutions"
              className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)]"
            >
              Hàng đợi tra tên
              {ambiguous > 0 && <Chip color="warning">{ambiguous} cần chọn</Chip>}
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <Button variant="outline" size="sm" onPress={refresh} isPending={loading}>
              <RefreshIcon className="h-4 w-4" />
              Làm mới
            </Button>
          </>
        }
      />

      <StatGrid>
        <StatCard label="Đã link" value={counts.linked.toLocaleString("vi-VN")} hint="Đủ điều kiện hiện cho user" />
        <StatCard
          label="Mới phát hiện"
          value={counts.discovered.toLocaleString("vi-VN")}
          hint="Chưa có sản phẩm nào"
          tone={counts.discovered > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Đang ẩn"
          value={counts.hidden.toLocaleString("vi-VN")}
          hint="Bị tắt thủ công"
          tone={counts.hidden > 0 ? "danger" : "default"}
        />
        <StatCard label="Nổi bật" value={counts.featured.toLocaleString("vi-VN")} hint="Ưu tiên lên đầu trong app" />
      </StatGrid>

      <Tabs defaultSelectedKey="danh-sach">
        <Tabs.List aria-label="Khu vực quản lý shop">
          <Tabs.Tab id="danh-sach">Danh sách shop</Tabs.Tab>
          <Tabs.Tab id="cao">Cào &amp; đồng bộ</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel id="danh-sach">
          <SectionCard bodyClassName="space-y-4">
            <Toolbar
              trailing={
                <>
                  <Button variant="ghost" size="sm" onPress={exportPage} isDisabled={!items.length}>
                    <DownloadIcon className="h-4 w-4" />
                    Xuất CSV
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => {
                      setFilters(EMPTY_FILTERS);
                      setSearchInput("");
                    }}
                    isDisabled={!chips.length}
                  >
                    Xoá lọc
                  </Button>
                </>
              }
            >
              <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Tìm theo tên shop…" />
              <SelectFilter
                label="Trạng thái"
                value={filters.status}
                options={STATUS_OPTIONS}
                onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
                className="min-w-[210px]"
              />
              <SelectFilter
                label="Hiển thị"
                value={filters.visibility}
                options={VISIBILITY_OPTIONS}
                onChange={(v) => setFilters((f) => ({ ...f, visibility: v }))}
                className="min-w-[160px]"
              />
              <SelectFilter
                label="Sắp xếp"
                value={filters.sort}
                options={SORT_OPTIONS}
                onChange={(v) => setFilters((f) => ({ ...f, sort: v }))}
                className="min-w-[190px]"
              />
              <Checkbox isSelected={filters.featured} onChange={(v) => setFilters((f) => ({ ...f, featured: v }))}>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Content className="text-sm">Chỉ nổi bật</Checkbox.Content>
              </Checkbox>
            </Toolbar>

            <FilterChips items={chips} />

            <ErrorBanner message={error} onRetry={refresh} />

            <TableShell isLoading={loading}>
              <Table>
                <Table.ScrollContainer>
                  <Table.Content aria-label="Danh sách shop" className="min-w-[980px]">
                    <Table.Header>
                      <Table.Column isRowHeader>Shop</Table.Column>
                      <Table.Column>Trạng thái</Table.Column>
                      <Table.Column className="text-right">Sản phẩm</Table.Column>
                      <Table.Column className="text-right">Hoa hồng</Table.Column>
                      <Table.Column>Hiển thị</Table.Column>
                      <Table.Column>Crawl lần cuối</Table.Column>
                      <Table.Column className="text-right">Thao tác</Table.Column>
                    </Table.Header>
                    <Table.Body
                      renderEmptyState={() => (
                        <EmptyState
                          title={loading ? "Đang tải…" : "Không có shop nào khớp"}
                          description={loading ? undefined : "Thử bỏ bớt bộ lọc, hoặc chạy tra tên để tìm thêm shop."}
                        />
                      )}
                    >
                      {items.map((s) => (
                        <ShopRow key={s.id} shop={s} onChanged={refresh} />
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            </TableShell>

            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
          </SectionCard>
        </Tabs.Panel>

        <Tabs.Panel id="cao" className="space-y-6">
          <OperationsSection onChanged={refresh} />
          <JobLoopsSection reloadKey={reloadKey} />
          <ManualRunSection onFinished={refresh} />
          <JobRunsSection reloadKey={reloadKey} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
