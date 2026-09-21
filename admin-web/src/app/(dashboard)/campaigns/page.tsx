"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button, Card, Checkbox, Chip, Input, Label, TextArea, TextField } from "@heroui/react";
import { clientApi } from "@/lib/clientApi";
import { PlusIcon } from "@/components/icons";

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

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  return value.replace(" ", "T").slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  if (!value) return null;
  return value.replace("T", " ") + ":00";
}

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
  const [error, setError] = useState("");

  const load = useCallback(async () => {
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
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Sự kiện</h1>
        {!creating && (
          <Button onPress={() => setCreating(true)}>
            <PlusIcon className="h-4 w-4" />
            Tạo sự kiện
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {creating && (
        <SectionCard title="Sự kiện mới">
          <CampaignForm onSaved={handleSaved} onCancel={() => setCreating(false)} />
        </SectionCard>
      )}

      {campaigns && campaigns.length === 0 && !creating && <p className="text-sm text-[var(--muted)]">Chưa có sự kiện nào.</p>}

      <div className="space-y-4">
        {campaigns &&
          campaigns.map((c) =>
            editingId === c.id ? (
              <SectionCard key={c.id} title={`Sửa: ${c.title}`}>
                <CampaignForm initial={c} onSaved={handleSaved} onCancel={() => setEditingId(null)} />
              </SectionCard>
            ) : (
              <Card key={c.id}>
                <Card.Content>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-[var(--foreground)]">{c.title}</h3>
                        <Chip color={c.isActive ? "success" : "danger"}>{c.isActive ? "Đang chạy" : "Tắt"}</Chip>
                      </div>
                      {c.description && <p className="mt-1 text-xs text-[var(--muted)]">{c.description}</p>}
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {c.startsAt || "không giới hạn"} → {c.endsAt || "không giới hạn"}
                      </p>
                      <p className="mt-2 text-xs text-[var(--foreground)]">
                        Mốc: {(c.tiers || []).map((t) => `hoàn ${t.amount}đ → thưởng ${t.reward}đ`).join(", ") || "chưa có"}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onPress={() => setEditingId(c.id)}>
                      Sửa
                    </Button>
                  </div>
                </Card.Content>
              </Card>
            )
          )}
      </div>
    </div>
  );
}
