"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Checkbox, Chip, Input, Label, TextArea, TextField, toast } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { formatAmount } from "@/lib/format";
import { useDebounced } from "@/lib/useDebounced";
import { PlusIcon, RefreshIcon } from "@/components/icons";
import {
  EmptyState,
  ErrorBanner,
  FilterChips,
  PageHeader,
  SearchInput,
  SectionCard,
  SelectFilter,
  StatCard,
  StatGrid,
  Toolbar,
  type FilterOption,
} from "@/components/admin/ui";

type Tier = { amount: number; reward: number };

type Campaign = {
  id: number | string;
  title: string;
  description?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  tiers?: Tier[];
  isActive: boolean;
};

type CampaignFormState = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  tiersJson: string;
  isActive: boolean;
};

const EMPTY_FORM: CampaignFormState = { title: "", description: "", startsAt: "", endsAt: "", tiersJson: "[]", isActive: true };

const STATUS_OPTIONS: FilterOption[] = [
  { value: "", label: "Mọi trạng thái" },
  { value: "active", label: "Đang chạy" },
  { value: "inactive", label: "Đang tắt" },
  { value: "ended", label: "Đã hết hạn" },
];

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  return value.replace(" ", "T").slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  if (!value) return null;
  return value.replace("T", " ") + ":00";
}

// "Đang chạy" on the app side means isActive AND inside the window, so the
// admin list has to say the same thing - a campaign left switched on past its
// end date shows as expired here rather than as running, because expired is
// what the user actually sees.
function hasEnded(c: Campaign) {
  if (!c.endsAt) return false;
  const end = new Date(c.endsAt.replace(" ", "T"));
  return !Number.isNaN(end.getTime()) && end.getTime() < Date.now();
}

function totalReward(c: Campaign) {
  return (c.tiers || []).reduce((sum, t) => sum + (Number(t.reward) || 0), 0);
}

function CampaignForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Campaign;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<CampaignFormState>(
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
  const [calc, setCalc] = useState({ stepAmount: "100000", rewardPerStep: "10000", steps: "5" });
  const [calcMsg, setCalcMsg] = useState("");

  async function applyCalculator() {
    setCalcMsg("");
    try {
      const { tiers } = await clientApi.post<{ tiers: Tier[] }>("/api/campaigns/tier-calculator", calc);
      setForm((f) => ({ ...f, tiersJson: JSON.stringify(tiers, null, 2) }));
    } catch (err) {
      setCalcMsg(err instanceof Error ? err.message : "Tính mốc thất bại");
    }
  }

  async function save() {
    setMsg("");
    let tiers: Tier[];
    try {
      tiers = JSON.parse(form.tiersJson || "[]");
      if (!Array.isArray(tiers)) throw new Error('tiers phải là mảng JSON, ví dụ [{"amount":100000,"reward":10000}]');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "tiers JSON không hợp lệ");
      return;
    }
    if (!form.title.trim()) {
      setMsg("Tiêu đề là bắt buộc.");
      return;
    }

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
      setMsg(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="title" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))}>
          <Label>Tiêu đề</Label>
          <Input placeholder="Sự kiện tháng 9" />
        </TextField>
        <TextField name="description" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))}>
          <Label>Mô tả</Label>
          <Input />
        </TextField>
        <TextField name="startsAt" value={form.startsAt} onChange={(v) => setForm((f) => ({ ...f, startsAt: v }))}>
          <Label>Bắt đầu</Label>
          <Input type="datetime-local" />
        </TextField>
        <TextField name="endsAt" value={form.endsAt} onChange={(v) => setForm((f) => ({ ...f, endsAt: v }))}>
          <Label>Kết thúc</Label>
          <Input type="datetime-local" />
        </TextField>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
        <p className="mb-2 text-xs font-medium text-[var(--foreground)]">
          Tính nhanh mốc thưởng (mốc đều nhau, ví dụ: cứ hoàn thêm 100.000đ thì thưởng 10.000đ, lặp lại 5 lần)
        </p>
        <div className="grid grid-cols-3 gap-2">
          <TextField name="stepAmount" value={calc.stepAmount} onChange={(v) => setCalc((c) => ({ ...c, stepAmount: v }))}>
            <Label className="text-xs">Mỗi mốc cách nhau (đ)</Label>
            <Input inputMode="numeric" />
          </TextField>
          <TextField name="rewardPerStep" value={calc.rewardPerStep} onChange={(v) => setCalc((c) => ({ ...c, rewardPerStep: v }))}>
            <Label className="text-xs">Thưởng mỗi mốc (đ)</Label>
            <Input inputMode="numeric" />
          </TextField>
          <TextField name="steps" value={calc.steps} onChange={(v) => setCalc((c) => ({ ...c, steps: v }))}>
            <Label className="text-xs">Số mốc</Label>
            <Input inputMode="numeric" />
          </TextField>
        </div>
        <Button variant="outline" size="sm" className="mt-2" onPress={applyCalculator}>
          Tính và điền vào JSON bên dưới
        </Button>
        {calcMsg && <p className="mt-1 text-xs text-[var(--danger)]">{calcMsg}</p>}
      </div>

      <TextField name="tiersJson" value={form.tiersJson} onChange={(v) => setForm((f) => ({ ...f, tiersJson: v }))}>
        <Label>Mốc thưởng (JSON: mảng {"{amount, reward}"} - amount là tổng tiền hoàn đã thanh toán cần đạt)</Label>
        <TextArea
          rows={5}
          className="font-mono text-xs"
          placeholder={'[\n  { "amount": 100000, "reward": 10000 },\n  { "amount": 200000, "reward": 25000 }\n]'}
        />
      </TextField>

      <Checkbox isSelected={form.isActive} onChange={(isActive) => setForm((f) => ({ ...f, isActive }))}>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Content>Đang hoạt động</Checkbox.Content>
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

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<Campaign["id"] | null>(null);
  const [togglingId, setTogglingId] = useState<Campaign["id"] | null>(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ q: "", status: "" });

  const q = useDebounced(filters.q).trim().toLowerCase();

  const load = useCallback(async () => {
    setError("");
    try {
      setCampaigns(await clientApi.get<Campaign[]>("/api/campaigns"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách sự kiện");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleSaved() {
    setCreating(false);
    setEditingId(null);
    toast.success("Đã lưu sự kiện");
    load();
  }

  async function toggleActive(c: Campaign) {
    setTogglingId(c.id);
    try {
      await clientApi.put(`/api/campaigns/${c.id}`, { isActive: !c.isActive });
      toast.success(c.isActive ? "Đã tắt sự kiện" : "Đã bật sự kiện");
      await load();
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Đổi trạng thái thất bại");
    } finally {
      setTogglingId(null);
    }
  }

  const rows = useMemo(() => campaigns || [], [campaigns]);

  const filtered = useMemo(
    () =>
      rows.filter((c) => {
        if (q && !`${c.title} ${c.description || ""}`.toLowerCase().includes(q)) return false;
        if (filters.status === "active") return c.isActive && !hasEnded(c);
        if (filters.status === "inactive") return !c.isActive;
        if (filters.status === "ended") return hasEnded(c);
        return true;
      }),
    [rows, q, filters.status],
  );

  const stats = useMemo(
    () => ({
      running: rows.filter((c) => c.isActive && !hasEnded(c)).length,
      off: rows.filter((c) => !c.isActive).length,
      tiers: rows.reduce((sum, c) => sum + (c.tiers || []).length, 0),
    }),
    [rows],
  );

  const chips = [
    filters.q && { label: `Tìm: ${filters.q}`, onClear: () => setFilters((f) => ({ ...f, q: "" })) },
    filters.status && {
      label: STATUS_OPTIONS.find((o) => o.value === filters.status)!.label,
      onClear: () => setFilters((f) => ({ ...f, status: "" })),
    },
  ].filter(Boolean) as { label: string; onClear: () => void }[];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sự kiện"
        count={rows.length}
        description='Mốc thưởng theo tổng tiền hoàn đã thanh toán trong khoảng thời gian của sự kiện. Hiển thị ở tab "Sự kiện" trong app.'
        actions={
          <>
            <Button variant="outline" onPress={load}>
              <RefreshIcon className="h-4 w-4" />
              Làm mới
            </Button>
            {!creating && (
              <Button onPress={() => setCreating(true)}>
                <PlusIcon className="h-4 w-4" />
                Tạo sự kiện
              </Button>
            )}
          </>
        }
      />

      <ErrorBanner message={error} onRetry={load} />

      <StatGrid>
        <StatCard label="Tổng sự kiện" value={rows.length.toLocaleString("vi-VN")} />
        <StatCard label="Đang chạy" value={stats.running.toLocaleString("vi-VN")} tone="success" />
        <StatCard label="Đang tắt" value={stats.off.toLocaleString("vi-VN")} tone="muted" />
        <StatCard label="Tổng số mốc thưởng" value={stats.tiers.toLocaleString("vi-VN")} />
      </StatGrid>

      {creating && (
        <SectionCard title="Sự kiện mới">
          <CampaignForm onSaved={handleSaved} onCancel={() => setCreating(false)} />
        </SectionCard>
      )}

      <Toolbar>
        <SearchInput
          value={filters.q}
          onChange={(v) => setFilters((f) => ({ ...f, q: v }))}
          placeholder="Tìm theo tiêu đề hoặc mô tả…"
        />
        <SelectFilter
          label="Trạng thái"
          value={filters.status}
          options={STATUS_OPTIONS}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
        />
        <Button variant="ghost" size="sm" onPress={() => setFilters({ q: "", status: "" })} isDisabled={!chips.length}>
          Xoá lọc
        </Button>
      </Toolbar>

      <FilterChips items={chips} />

      <div className="space-y-3">
        {campaigns && filtered.length === 0 && !creating && (
          <Card>
            <Card.Content>
              <EmptyState
                title={rows.length ? "Không có sự kiện nào khớp bộ lọc" : "Chưa có sự kiện nào"}
                description={rows.length ? "Thử xoá bớt bộ lọc." : 'Bấm "Tạo sự kiện" để thêm mốc thưởng đầu tiên.'}
              />
            </Card.Content>
          </Card>
        )}

        {filtered.map((c) =>
          editingId === c.id ? (
            <SectionCard key={c.id} title={`Sửa: ${c.title}`}>
              <CampaignForm initial={c} onSaved={handleSaved} onCancel={() => setEditingId(null)} />
            </SectionCard>
          ) : (
            <Card key={c.id}>
              <Card.Content>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--foreground)]">{c.title}</h3>
                      <Chip color={c.isActive ? "success" : "danger"}>{c.isActive ? "Đang chạy" : "Tắt"}</Chip>
                      {hasEnded(c) && <Chip color="warning">Đã hết hạn</Chip>}
                    </div>
                    {c.description && <p className="mt-1 text-xs text-[var(--muted)]">{c.description}</p>}
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {c.startsAt || "không giới hạn"} → {c.endsAt || "không giới hạn"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={c.isActive ? "outline" : "primary"}
                      isPending={togglingId === c.id}
                      onPress={() => toggleActive(c)}
                    >
                      {c.isActive ? "Tắt" : "Bật"}
                    </Button>
                    <Button size="sm" variant="outline" onPress={() => setEditingId(c.id)}>
                      Sửa
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-3">
                  {(c.tiers || []).length === 0 ? (
                    <span className="text-xs text-[var(--muted)]">Chưa có mốc thưởng nào.</span>
                  ) : (
                    <>
                      {(c.tiers || []).map((t, i) => (
                        <Chip key={i} size="sm">
                          {formatAmount(t.amount)} → thưởng {formatAmount(t.reward)}
                        </Chip>
                      ))}
                      <span className="ml-1 text-xs text-[var(--muted)]">
                        tối đa {formatAmount(totalReward(c))} mỗi người
                      </span>
                    </>
                  )}
                </div>
              </Card.Content>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
