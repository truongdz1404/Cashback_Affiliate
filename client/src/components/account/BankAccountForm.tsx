"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@heroui/react";
import { appClient, AppRequestError } from "@/lib/appClient";
import type { AppUser, Bank } from "@/lib/appTypes";
import TextField from "@/components/public/TextField";
import Modal from "@/components/account/Modal";
import { BankIcon, CheckIcon, SearchIcon } from "@/components/icons";

// One bank account per user - the backend stores it on the user row
// (bankName/bankAccountNumber/bankAccountHolder), so this edits in place
// rather than managing a list. bankName is stored as the bank's shortName,
// exactly like the mobile app writes it.
export default function BankAccountForm({ user, banks }: { user: AppUser; banks: Bank[] }) {
  const router = useRouter();
  const [bankName, setBankName] = useState(user.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState(user.bankAccountNumber ?? "");
  const [accountHolder, setAccountHolder] = useState(user.bankAccountHolder ?? "");
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = useMemo(() => banks.find((bank) => bank.shortName === bankName) ?? null, [banks, bankName]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return banks;
    return banks.filter(
      (bank) =>
        bank.shortName.toLowerCase().includes(q) ||
        bank.name.toLowerCase().includes(q) ||
        bank.code.toLowerCase().includes(q),
    );
  }, [banks, query]);

  const dirty =
    bankName !== (user.bankName ?? "") ||
    accountNumber !== (user.bankAccountNumber ?? "") ||
    accountHolder !== (user.bankAccountHolder ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    if (!bankName) {
      toast.danger("Thiếu thông tin", { description: "Vui lòng chọn ngân hàng." });
      return;
    }
    if (!accountNumber.trim()) {
      toast.danger("Thiếu thông tin", { description: "Vui lòng nhập số tài khoản." });
      return;
    }
    if (!accountHolder.trim()) {
      toast.danger("Thiếu thông tin", { description: "Vui lòng nhập tên chủ tài khoản." });
      return;
    }

    setSaving(true);
    try {
      await appClient.put("/me", {
        bankName,
        bankAccountNumber: accountNumber.trim(),
        bankAccountHolder: accountHolder.trim(),
      });
      toast.success("Đã lưu", { description: "Thông tin tài khoản ngân hàng đã được cập nhật." });
      router.refresh();
    } catch (err) {
      if (!(err instanceof AppRequestError) || err.status !== 401) {
        toast.danger("Không lưu được", {
          description: err instanceof AppRequestError ? err.message : "Vui lòng thử lại.",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div>
        <p className="mb-1.5 text-sm font-bold text-[var(--foreground)]">Ngân hàng</p>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setPicking(true);
          }}
          disabled={saving || banks.length === 0}
          className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--field-background)] px-4 py-3 text-left transition hover:border-[var(--accent)] disabled:opacity-60"
        >
          {selected?.logoUrl ? (
            // Operator-provided absolute URL - next/image can't be given an
            // arbitrary remote host, so a plain <img> it is.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.logoUrl} alt="" className="h-6 w-12 shrink-0 object-contain" />
          ) : (
            <BankIcon className="h-5 w-5 shrink-0 text-[var(--muted)]" />
          )}
          <span
            className={`min-w-0 flex-1 truncate text-sm font-bold ${
              selected || bankName ? "text-[var(--foreground)]" : "text-[var(--muted)]"
            }`}
          >
            {selected?.shortName || bankName || "Chọn ngân hàng"}
          </span>
          <span className="shrink-0 text-sm font-bold text-[var(--accent)]">Thay đổi</span>
        </button>
        {banks.length === 0 && (
          <p className="mt-1.5 text-xs text-[var(--danger)]">
            Chưa tải được danh sách ngân hàng. Vui lòng tải lại trang.
          </p>
        )}
      </div>

      <TextField
        label="Số tài khoản"
        value={accountNumber}
        onChange={(value) => setAccountNumber(value.replace(/[^\d]/g, ""))}
        placeholder="Nhập số tài khoản"
        inputMode="numeric"
        disabled={saving}
      />

      <TextField
        label="Chủ tài khoản"
        value={accountHolder}
        onChange={(value) => setAccountHolder(value.toUpperCase())}
        placeholder="NGUYEN VAN A"
        hint="Nhập đúng tên in trên thẻ/tài khoản, không dấu."
        disabled={saving}
      />

      <div>
        <button
          type="submit"
          disabled={!dirty || saving}
          className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105 disabled:opacity-50"
        >
          {saving ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
      </div>

      <Modal
        open={picking}
        title="Chọn ngân hàng"
        description="Tiền hoàn sẽ được chuyển về tài khoản này."
        onClose={() => setPicking(false)}
      >
        <div className="relative mb-3">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm ngân hàng"
            autoComplete="off"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--field-background)] py-2.5 pl-10 pr-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
          />
        </div>

        <ul className="max-h-[50vh] divide-y divide-[var(--border)] overflow-y-auto">
          {results.map((bank) => (
            <li key={bank.code}>
              <button
                type="button"
                onClick={() => {
                  setBankName(bank.shortName);
                  setPicking(false);
                }}
                className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-[var(--surface-secondary)]"
              >
                {bank.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={bank.logoUrl} alt="" className="h-6 w-12 shrink-0 object-contain" />
                ) : (
                  <BankIcon className="h-5 w-5 shrink-0 text-[var(--muted)]" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[var(--foreground)]">
                    {bank.shortName}
                  </span>
                  <span className="block truncate text-xs text-[var(--muted)]">{bank.name}</span>
                </span>
                {bank.shortName === bankName && (
                  <CheckIcon className="h-4.5 w-4.5 shrink-0 text-[var(--accent)]" />
                )}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="py-8 text-center text-sm text-[var(--muted)]">Không tìm thấy ngân hàng phù hợp.</li>
          )}
        </ul>
      </Modal>
    </form>
  );
}
