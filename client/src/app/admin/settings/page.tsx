"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Chip, Input, Label, ListBox, Select, Tabs, TextArea, TextField } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { PageHeader, SectionCard } from "@/components/admin/ui";

// Ba nhóm cài đặt, mỗi nhóm một tab. Trang này gom bảy khối rất khác nhau, và
// ba nhóm hỏng theo ba kiểu khác nhau — sai tiền, hết dữ liệu, chết đăng nhập
// — nên tách ra vẫn dễ nhìn hơn là một cột dài bảy khối.
const TABS: { id: string; label: string }[] = [
  { id: "tien", label: "Tiền & hoa hồng" },
  { id: "cao", label: "Cào dữ liệu & link" },
  { id: "he-thong", label: "Hệ thống" },
];

type Settings = {
  commissionPct?: number | null;
  referralRewardAmount?: number | null;
  referralCommissionPct?: number | null;
  referralCommissionMonths?: number | null;
  productOfferMaxPages?: number | null;
  minWithdrawAmount?: number | null;
  anRedirPercent?: number | null;
};

type SyncResult = { pagesVisited: number; scraped: number; saved: number; stoppedEarly: string | null };

const SORT_LABELS = ["Liên quan", "Hoa hồng (%)", "Bán chạy", "Giá: Thấp đến Cao"];

// The tab bar's actual labels (confirmed against a live DOM dump of
// affiliate.shopee.vn/offer/product_offer) - fixed list rather than fetched
// live, since it would need a logged-in browser round trip just to populate
// a settings dropdown. Re-check against the live page if Shopee adds/renames
// a category and this list drifts out of sync.
const TAB_LABELS = [
  "Tất cả",
  "Hoa hồng Xtra",
  "Bán chạy nhất",
  "Thể Thao & Du Lịch",
  "Thiết Bị Điện Gia Dụng",
  "Máy Tính & Laptop",
  "Bách Hóa Online",
  "Sắc Đẹp",
];

type SyncStatus = {
  status: "idle" | "running" | "done" | "error";
  startedAt: string | null;
  finishedAt: string | null;
  result: SyncResult | null;
  error: string | null;
};

type ConfigKey = "zaloBotToken" | "zaloWebhookSecret" | "jwtSecret" | "googleClientId" | "facebookAppId" | "facebookAppSecret";

type ConfigMap = Partial<Record<ConfigKey, string>>;

type SessionStatus = { loggedIn: boolean };

const CONFIG_LABELS: Record<ConfigKey, string> = {
  zaloBotToken: "Zalo Bot Token",
  zaloWebhookSecret: "Zalo Webhook Secret",
  jwtSecret: "JWT Secret (admin session)",
  googleClientId: "Google OAuth Client ID",
  facebookAppId: "Facebook App ID",
  facebookAppSecret: "Facebook App Secret",
};

function CommissionSection() {
  const [pct, setPct] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await clientApi.get<Settings>("/api/settings");
      setPct(String(data.commissionPct ?? ""));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Không tải được");
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
      setMsg(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      id="hoa-hong"
      title="% Hoa hồng mặc định cho khách"
      description="Áp dụng cho khách chưa có mức riêng (tùy chỉnh theo từng khách ở trang Khách hàng)."
    >
      <div className="flex items-center gap-2">
        <TextField name="commissionPct" value={pct} onChange={setPct} className="w-24" aria-label="% Hoa hồng mặc định">
          <Input placeholder="70" />
        </TextField>
        <span className="text-sm text-[var(--muted)]">%</span>
        <Button onPress={save} isPending={saving} isDisabled={pct === ""}>
          Lưu
        </Button>
      </div>
      {msg && <p className="mt-2 text-xs text-[var(--muted)]">{msg}</p>}
    </SectionCard>
  );
}

// Referral programme: the referrer earns `referralCommissionPct` % of the
// cashback on every completed order their invitee places, for
// `referralCommissionMonths` months after the invitee registers (0 = no
// limit). Paid from the operator's share - the invitee's cashback is never
// reduced. `referralRewardAmount` is the legacy fixed first-order bonus,
// kept as an optional extra (0 = off).
function ReferralProgramSection() {
  const [pct, setPct] = useState("");
  const [months, setMonths] = useState("");
  const [bonus, setBonus] = useState("");
  const [customerPct, setCustomerPct] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await clientApi.get<Settings>("/api/settings");
      setPct(String(data.referralCommissionPct ?? ""));
      setMonths(String(data.referralCommissionMonths ?? ""));
      setBonus(String(data.referralRewardAmount ?? ""));
      setCustomerPct(data.commissionPct ?? null);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Không tải được");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pctNum = Number(pct);
  const monthsNum = Number(months);
  const bonusNum = Number(bonus);
  const valid =
    pct !== "" && Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 100 &&
    months !== "" && Number.isInteger(monthsNum) && monthsNum >= 0 &&
    bonus !== "" && Number.isFinite(bonusNum) && bonusNum >= 0;

  // What the operator actually gives up, in points of the Shopee commission:
  // referrer % × customer cashback %. Shown so the admin sees the margin
  // impact before saving.
  const operatorCost = customerPct !== null && Number.isFinite(pctNum) ? (pctNum * customerPct) / 100 : null;
  const operatorLeft = customerPct !== null && operatorCost !== null ? 100 - customerPct - operatorCost : null;

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      await clientApi.put("/api/settings", {
        referralCommissionPct: pctNum,
        referralCommissionMonths: monthsNum,
        referralRewardAmount: bonusNum,
      });
      setMsg("Đã lưu. Áp dụng cho các đơn hàng được đối soát từ bây giờ; hoa hồng đã ghi nhận trước đó không đổi.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      id="gioi-thieu"
      title="Chương trình giới thiệu bạn bè"
      description="Người giới thiệu nhận % trên số tiền hoàn của mỗi đơn hoàn thành do người được giới thiệu đặt. Khoản này lấy từ phần của hệ thống, không trừ vào hoàn tiền của người được giới thiệu."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">% hoa hồng cho người giới thiệu</p>
          <div className="flex items-center gap-2">
            <TextField name="referralCommissionPct" value={pct} onChange={setPct} className="w-24" aria-label="% hoa hồng giới thiệu">
              <Input placeholder="15" inputMode="decimal" />
            </TextField>
            <span className="text-sm text-[var(--muted)]">% số tiền hoàn của bạn được mời</span>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">Thời hạn hưởng hoa hồng</p>
          <div className="flex items-center gap-2">
            <TextField name="referralCommissionMonths" value={months} onChange={setMonths} className="w-24" aria-label="Số tháng hưởng hoa hồng">
              <Input placeholder="0" inputMode="numeric" />
            </TextField>
            <span className="text-sm text-[var(--muted)]">tháng kể từ khi đăng ký (0 = trọn đời)</span>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">Thưởng thêm đơn đầu tiên (tuỳ chọn)</p>
          <div className="flex items-center gap-2">
            <TextField name="referralRewardAmount" value={bonus} onChange={setBonus} className="w-32" aria-label="Thưởng đơn đầu tiên">
              <Input placeholder="0" inputMode="numeric" />
            </TextField>
            <span className="text-sm text-[var(--muted)]">đ (0 = tắt)</span>
          </div>
        </div>
      </div>

      {operatorCost !== null && operatorLeft !== null && (
        <p className="mt-3 rounded-xl bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--muted)]">
          Với khách nhận {customerPct}% hoa hồng Shopee: mỗi đơn của người được giới thiệu, hệ thống trả thêm{" "}
          <span className="font-semibold text-[var(--foreground)]">{Math.round(operatorCost * 100) / 100} điểm %</span> cho
          người giới thiệu, còn lại{" "}
          <span className={`font-semibold ${operatorLeft < 10 ? "text-[var(--danger)]" : "text-[var(--foreground)]"}`}>
            {Math.round(operatorLeft * 100) / 100}%
          </span>{" "}
          hoa hồng Shopee cho hệ thống.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button onPress={save} isPending={saving} isDisabled={!valid}>
          Lưu
        </Button>
        {msg && <p className="text-xs text-[var(--muted)]">{msg}</p>}
      </div>
    </SectionCard>
  );
}

// Smallest withdrawal the app accepts. Read by the wallet screen (through
// GET /app/wallet), by the withdraw route and by the withdrawal worker, so
// one edit here covers all three.
function MinWithdrawSection() {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await clientApi.get<Settings>("/api/settings");
      setAmount(String(data.minWithdrawAmount ?? ""));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Không tải được");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      await clientApi.put("/api/settings", { minWithdrawAmount: Number(amount) });
      setMsg("Đã lưu.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard id="rut-toi-thieu" title="Số tiền rút tối thiểu" description="Áp dụng cho mọi yêu cầu thanh toán từ app, tính bằng đồng.">
      <div className="flex items-center gap-2">
        <TextField
          name="minWithdrawAmount"
          value={amount}
          onChange={(next) => setAmount(next.replace(/[^\d]/g, ""))}
          className="w-32"
          aria-label="Số tiền rút tối thiểu"
        >
          <Input placeholder="50000" inputMode="numeric" />
        </TextField>
        <span className="text-sm text-[var(--muted)]">đ</span>
        <Button onPress={save} isPending={saving} isDisabled={amount === ""}>
          Lưu
        </Button>
      </div>
      {msg && <p className="mt-2 text-xs text-[var(--muted)]">{msg}</p>}
    </SectionCard>
  );
}

// The rollout dial for an_redir links (api/lib/anRedirLink.js). Shopee only
// documents one shape of affiliate link - s.shopee.vn/an_redir - and a click
// through it comes back carrying a credential_token and mmp_pid that a link
// we assemble ourselves cannot produce. It also needs no browser, so those
// taps answer instantly instead of waiting 2-6s on Playwright.
//
// It lives here, next to the money settings, because it IS a money setting:
// no real order has yet confirmed that a sub id survives an an_redir click
// into the conversion report, so every percent moved across is a bet. The
// point of the dial is that the bet can be called off in one save.
function AnRedirSection() {
  const [percent, setPercent] = useState("");
  const [saved, setSaved] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await clientApi.get<Settings>("/api/settings");
      setPercent(String(data.anRedirPercent ?? 0));
      setSaved(Number(data.anRedirPercent ?? 0));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Không tải được");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(next?: number) {
    const value = next ?? Number(percent);
    setSaving(true);
    setMsg("");
    try {
      const res = await clientApi.put<Settings>("/api/settings", { anRedirPercent: value });
      const stored = Number(res.anRedirPercent ?? value);
      setPercent(String(stored));
      setSaved(stored);
      setMsg(stored === 0 ? "Đã tắt. Mọi link mới quay lại đường cũ." : `Đã lưu: ${stored}% link mới đi qua an_redir.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      id="an-redir"
      title="Link qua an_redir"
      description="Bao nhiêu phần trăm link MỚI được tạo bằng đường chuyển hướng chính thức của Shopee, thay cho cách tự dựng link. Link đã tạo rồi không đổi."
    >
      <div className="flex items-center gap-2">
        <TextField
          name="anRedirPercent"
          value={percent}
          onChange={(next) => setPercent(next.replace(/[^\d]/g, ""))}
          className="w-24"
          aria-label="Phần trăm link qua an_redir"
        >
          <Input placeholder="0" inputMode="numeric" />
        </TextField>
        <span className="text-sm text-[var(--muted)]">%</span>
        <Button onPress={() => save()} isPending={saving} isDisabled={percent === ""}>
          Lưu
        </Button>
        {saved !== null && saved > 0 && (
          <Button variant="ghost" size="sm" onPress={() => save(0)} isDisabled={saving}>
            Tắt ngay
          </Button>
        )}
        <Chip color={saved ? "warning" : undefined}>{saved ? `Đang bật ${saved}%` : "Đang tắt"}</Chip>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Chưa có đơn thật nào xác nhận sub_id về đúng qua đường này, nên hãy tăng dần và đối chiếu báo cáo
        hoa hồng. Link đi đường mới nhận ra được ngay trong bảng Link: địa chỉ bắt đầu bằng
        {" "}<code className="font-mono">s.shopee.vn/an_redir</code>. Đổi về 0 là quay lại hoàn toàn, có hiệu lực
        ngay từ link kế tiếp.
      </p>
      {msg && <p className="mt-2 text-xs text-[var(--muted)]">{msg}</p>}
    </SectionCard>
  );
}

function ProductOfferMaxPagesSection() {
  const [pages, setPages] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [tabName, setTabName] = useState(TAB_LABELS[0]);
  const [startPage, setStartPage] = useState("");
  const [searchText, setSearchText] = useState("");
  const [sortLabel, setSortLabel] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await clientApi.get<Settings>("/api/settings");
      setPages(String(data.productOfferMaxPages ?? ""));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Không tải được");
    }
  }, []);

  const describeStatus = useCallback((status: SyncStatus) => {
    if (status.status === "done" && status.result) {
      const r = status.result;
      const base = `Xong: ${r.pagesVisited} trang, cào được ${r.scraped} sản phẩm, lưu ${r.saved} sản phẩm.`;
      return r.stoppedEarly ? `${base} (dừng sớm: ${r.stoppedEarly})` : base;
    }
    if (status.status === "error") return status.error || "Chạy cào thất bại";
    return "Đang cào dữ liệu, có thể mất vài phút...";
  }, []);

  // The backend runs the crawl in the background and returns right away, so
  // a held-open request would time out at Cloudflare's own ~100s upstream
  // limit well before a multi-page crawl finishes (even though the crawl
  // itself keeps running and completes fine server-side) - poll the status
  // endpoint instead of awaiting one long response.
  const pollStatus = useCallback(() => {
    const interval = setInterval(async () => {
      try {
        const status = await clientApi.get<SyncStatus>("/api/product-offer-sync");
        if (status.status === "running") return;
        clearInterval(interval);
        setSyncing(false);
        setSyncMsg(describeStatus(status));
      } catch (err) {
        clearInterval(interval);
        setSyncing(false);
        setSyncMsg(err instanceof Error ? err.message : "Không kiểm tra được trạng thái cào");
      }
    }, 3000);
    return interval;
  }, [describeStatus]);

  useEffect(() => {
    load();
    // Pick up a sync already running (e.g. the 6h cron, or a run started
    // from another tab) so the button reflects reality on page load.
    let interval: ReturnType<typeof setInterval> | undefined;
    clientApi
      .get<SyncStatus>("/api/product-offer-sync")
      .then((status) => {
        if (status.status !== "running") return;
        setSyncing(true);
        setSyncMsg(describeStatus(status));
        interval = pollStatus();
      })
      .catch(() => {});
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [load, pollStatus, describeStatus]);

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      await clientApi.put("/api/settings", { productOfferMaxPages: Number(pages) });
      setMsg("Đã lưu.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setSyncMsg("Đang cào dữ liệu, có thể mất vài phút...");
    try {
      const status = await clientApi.post<SyncStatus>("/api/product-offer-sync", {
        tabName,
        startPage: startPage ? Number(startPage) : undefined,
        searchText: searchText.trim() || undefined,
        sortLabel: searchText.trim() ? sortLabel || undefined : undefined,
      });
      if (status.status !== "running") {
        setSyncing(false);
        setSyncMsg(describeStatus(status));
        return;
      }
      pollStatus();
    } catch (err) {
      setSyncing(false);
      setSyncMsg(err instanceof Error ? err.message : "Chạy cào thất bại");
    }
  }

  return (
    <SectionCard
      id="cao-san-pham"
      title="Số trang cào sản phẩm Shopee (Mua sắm)"
      description="Số trang tối đa của affiliate.shopee.vn/offer/product_offer được cào mỗi lần chạy (20 sản phẩm/trang). Áp dụng cho cả lần chạy tự động 6h sáng và chạy tay bên dưới."
    >
      <div className="flex items-center gap-2">
        <TextField name="productOfferMaxPages" value={pages} onChange={setPages} className="w-24" aria-label="Số trang cào">
          <Input placeholder="3" />
        </TextField>
        <span className="text-sm text-[var(--muted)]">trang</span>
        <Button onPress={save} isPending={saving} isDisabled={pages === ""}>
          Lưu
        </Button>
      </div>
      {msg && <p className="mt-2 text-xs text-[var(--muted)]">{msg}</p>}
      <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-3">
        <p className="text-xs text-[var(--muted)]">
          Tuỳ chọn cho lần chạy tay này (không áp dụng cho lịch tự động 6h sáng):
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Select
            aria-label="Tab danh mục"
            selectedKey={tabName}
            onSelectionChange={(key) => setTabName(String(key ?? TAB_LABELS[0]))}
          >
            <Label className="text-xs">Tab danh mục</Label>
            <Select.Trigger className="min-w-[200px]">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {TAB_LABELS.map((label) => (
                  <ListBox.Item key={label} id={label}>
                    {label}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <TextField name="startPage" value={startPage} onChange={setStartPage} className="w-32" aria-label="Bắt đầu từ trang">
            <Label className="text-xs">Bắt đầu từ trang</Label>
            <Input placeholder="1" />
          </TextField>
          <TextField name="searchText" value={searchText} onChange={setSearchText} className="w-56" aria-label="Tìm kiếm">
            <Label className="text-xs">Tìm kiếm</Label>
            <Input placeholder="Để trống nếu không tìm" />
          </TextField>
          {searchText.trim() && (
            <Select
              aria-label="Sắp xếp theo"
              selectedKey={sortLabel}
              onSelectionChange={(key) => setSortLabel(String(key ?? ""))}
            >
              <Label className="text-xs">Sắp xếp theo</Label>
              <Select.Trigger className="min-w-[160px]">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {SORT_LABELS.map((label) => (
                    <ListBox.Item key={label} id={label}>
                      {label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          )}
        </div>
        <Button variant="outline" onPress={syncNow} isPending={syncing}>
          Chạy cào ngay
        </Button>
        {syncMsg && <p className="mt-2 text-xs text-[var(--muted)]">{syncMsg}</p>}
      </div>
    </SectionCard>
  );
}

function SecretsSection() {
  const [config, setConfig] = useState<ConfigMap | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<ConfigKey, string>>>({});
  const [busyKey, setBusyKey] = useState<ConfigKey | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setConfig(await clientApi.get<ConfigMap>("/api/config"));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Không tải được");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function rotate(key: ConfigKey) {
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
      setMsg(err instanceof Error ? err.message : "Cập nhật thất bại");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <SectionCard
      id="env"
      title="Khoá cấu hình (env) có thể chỉnh sửa"
      description="Chỉ hiển thị 4 ký tự cuối. Nhập giá trị mới rồi bấm Cập nhật để đổi. Riêng SERVICE_API_KEY không quản lý ở đây vì đổi trực tiếp có thể khiến dashboard tự khoá quyền truy cập của chính nó (chỉ sửa được qua SSH)."
    >
      <div className="space-y-3">
        {config &&
          (Object.keys(CONFIG_LABELS) as ConfigKey[]).map((key) => (
            <div key={key} className="flex flex-wrap items-center gap-2">
              <div className="w-56 shrink-0">
                <p className="text-sm font-medium text-[var(--foreground)]">{CONFIG_LABELS[key]}</p>
                <p className="text-xs text-[var(--muted)]">Hiện tại: {config[key] || "chưa đặt"}</p>
              </div>
              <TextField
                name={key}
                value={drafts[key] || ""}
                onChange={(v) => setDrafts((d) => ({ ...d, [key]: v }))}
                type="password"
                className="min-w-[180px] flex-1"
                aria-label={CONFIG_LABELS[key]}
              >
                <Input placeholder="Giá trị mới" />
              </TextField>
              <Button
                variant="outline"
                onPress={() => rotate(key)}
                isPending={busyKey === key}
                isDisabled={!(drafts[key] || "").trim()}
              >
                Cập nhật
              </Button>
            </div>
          ))}
      </div>
      {msg && <p className="mt-3 text-xs text-[var(--muted)]">{msg}</p>}
    </SectionCard>
  );
}

function SessionSection() {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [cookieText, setCookieText] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const check = useCallback(async () => {
    setChecking(true);
    setMsg("");
    try {
      setStatus(await clientApi.get<SessionStatus>("/api/session"));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Không kiểm tra được phiên");
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
      setMsg(err instanceof Error ? err.message : "Cập nhật cookie thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      id="cookie"
      title="Phiên đăng nhập Shopee Affiliate (cookie)"
      description="Dán cookie đã đăng nhập affiliate.shopee.vn (chuỗi 'name=value; name2=value2' hoặc JSON mảng cookie) để cập nhật phiên khi cookie hết hạn."
    >
      <div className="mb-3 flex items-center gap-2">
        <Chip color={status?.loggedIn ? "success" : "danger"}>
          {status ? (status.loggedIn ? "Đang hoạt động" : "Chưa đăng nhập / đã hết hạn") : "Đang kiểm tra..."}
        </Chip>
        <Button variant="ghost" size="sm" onPress={check} isPending={checking}>
          Kiểm tra lại
        </Button>
      </div>
      <TextField name="cookieText" value={cookieText} onChange={setCookieText} aria-label="Cookie Shopee">
        <Label className="sr-only">Cookie Shopee</Label>
        <TextArea rows={4} className="font-mono text-xs" placeholder="SPC_EC=...; SPC_ST=...; ..." />
      </TextField>
      <Button className="mt-2" onPress={submitCookie} isPending={submitting} isDisabled={!cookieText.trim()}>
        Cập nhật cookie
      </Button>
      {msg && <p className="mt-2 text-xs text-[var(--muted)]">{msg}</p>}
    </SectionCard>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cài đặt"
        description="Các tham số vận hành của hệ thống. Mỗi khối lưu riêng, đổi xong là có hiệu lực ngay với app và website."
      />

      <Tabs defaultSelectedKey="tien">
        <Tabs.List aria-label="Nhóm cài đặt">
          {TABS.map((t) => (
            <Tabs.Tab key={t.id} id={t.id}>
              {t.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel id="tien" className="space-y-6">
          <CommissionSection />
          <ReferralProgramSection />
          <MinWithdrawSection />
        </Tabs.Panel>

        <Tabs.Panel id="cao" className="space-y-6">
          <AnRedirSection />
          <ProductOfferMaxPagesSection />
        </Tabs.Panel>

        <Tabs.Panel id="he-thong" className="space-y-6">
          <SecretsSection />
          <SessionSection />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
