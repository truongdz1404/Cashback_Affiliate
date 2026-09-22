"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDownIcon, CloseIcon, SlidersIcon } from "@/components/icons";

export type FilterState = {
  minPrice: string;
  maxPrice: string;
  minCommissionPct: string;
  maxCommissionPct: string;
  minCommissionAmount: string;
  maxCommissionAmount: string;
};

const EMPTY: FilterState = {
  minPrice: "",
  maxPrice: "",
  minCommissionPct: "",
  maxCommissionPct: "",
  minCommissionAmount: "",
  maxCommissionAmount: "",
};

const SORTS = [
  { value: "newest", label: "Mới nhất" },
  { value: "commission_desc", label: "Hoàn tiền cao nhất" },
  { value: "commission_asc", label: "Hoàn tiền thấp nhất" },
  { value: "price_asc", label: "Giá thấp đến cao" },
  { value: "price_desc", label: "Giá cao đến thấp" },
];

function readFilters(params: URLSearchParams): FilterState {
  return {
    minPrice: params.get("minPrice") ?? "",
    maxPrice: params.get("maxPrice") ?? "",
    minCommissionPct: params.get("minCommissionPct") ?? "",
    maxCommissionPct: params.get("maxCommissionPct") ?? "",
    minCommissionAmount: params.get("minCommissionAmount") ?? "",
    maxCommissionAmount: params.get("maxCommissionAmount") ?? "",
  };
}

const chipBase = "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition";
const chipOn = `${chipBase} bg-[var(--foreground)] text-white`;
const chipOff = `${chipBase} bg-white text-[var(--foreground)] ring-1 ring-[var(--border)] hover:ring-[var(--foreground)]`;

// The commission inputs are USER-FACING: the backend converts them to
// Shopee's raw scale using this visitor's effective % before querying
// (see server.js /app/shopping-products), so "5%" here means "5% back to me".
export default function ProductFilters({ categories }: { categories: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterState>(() => readFilters(new URLSearchParams(params.toString())));

  useEffect(() => {
    setDraft(readFilters(new URLSearchParams(params.toString())));
  }, [params]);

  function push(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    // Any change to the result set invalidates the current page number.
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/products?${qs}` : "/products");
  }

  function setParam(key: string, value: string) {
    push((next) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
  }

  function applyDraft() {
    push((next) => {
      for (const [key, value] of Object.entries(draft)) {
        if (value.trim()) next.set(key, value.trim());
        else next.delete(key);
      }
    });
    setOpen(false);
  }

  function clearRanges() {
    setDraft(EMPTY);
    push((next) => {
      for (const key of Object.keys(EMPTY)) next.delete(key);
    });
    setOpen(false);
  }

  function resetAll() {
    setDraft(EMPTY);
    push((next) => {
      for (const key of Object.keys(EMPTY)) next.delete(key);
      next.delete("category");
      next.delete("bestSeller");
      next.delete("xtra");
      next.delete("sort");
    });
    setOpen(false);
  }

  const activeRanges = Object.values(readFilters(new URLSearchParams(params.toString()))).filter(Boolean).length;
  const category = params.get("category") ?? "";
  const sort = params.get("sort") ?? "newest";
  const bestSeller = params.get("bestSeller") === "1";
  const xtra = params.get("xtra") === "1";
  const anythingActive = activeRanges > 0 || category !== "" || bestSeller || xtra || sort !== "newest";

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="-mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() =>
              push((next) => {
                next.delete("category");
                next.delete("bestSeller");
                next.delete("xtra");
              })
            }
            className={category === "" && !bestSeller && !xtra ? chipOn : chipOff}
          >
            Tất cả
          </button>
          <button type="button" onClick={() => setParam("bestSeller", bestSeller ? "" : "1")} className={bestSeller ? chipOn : chipOff}>
            Bán chạy
          </button>
          <button type="button" onClick={() => setParam("xtra", xtra ? "" : "1")} className={xtra ? chipOn : chipOff}>
            Xtra
          </button>
          {categories.length > 0 && <span aria-hidden className="my-1.5 w-px shrink-0 bg-[var(--border)]" />}
          {categories.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setParam("category", category === name ? "" : name)}
              className={category === name ? chipOn : chipOff}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <label className="relative hidden sm:block">
            <span className="sr-only">Sắp xếp</span>
            <select
              value={sort}
              onChange={(e) => setParam("sort", e.target.value === "newest" ? "" : e.target.value)}
              className="h-9 appearance-none rounded-full bg-white pl-3.5 pr-8 text-[13px] font-semibold text-[var(--foreground)] ring-1 ring-[var(--border)] outline-none hover:ring-[var(--foreground)] focus:ring-[var(--foreground)]"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
          </label>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition ${
              open || activeRanges > 0
                ? "bg-[var(--foreground)] text-white"
                : "bg-white text-[var(--foreground)] ring-1 ring-[var(--border)] hover:ring-[var(--foreground)]"
            }`}
          >
            <SlidersIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Bộ lọc</span>
            {activeRanges > 0 && <span className="text-[11px] opacity-80">({activeRanges})</span>}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-[var(--border)] sm:p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Range
              label="Giá"
              unit="đ"
              min={draft.minPrice}
              max={draft.maxPrice}
              onMin={(v) => setDraft((d) => ({ ...d, minPrice: v }))}
              onMax={(v) => setDraft((d) => ({ ...d, maxPrice: v }))}
            />
            <Range
              label="Tỉ lệ hoàn tiền"
              unit="%"
              min={draft.minCommissionPct}
              max={draft.maxCommissionPct}
              onMin={(v) => setDraft((d) => ({ ...d, minCommissionPct: v }))}
              onMax={(v) => setDraft((d) => ({ ...d, maxCommissionPct: v }))}
            />
            <Range
              label="Số tiền hoàn"
              unit="đ"
              min={draft.minCommissionAmount}
              max={draft.maxCommissionAmount}
              onMin={(v) => setDraft((d) => ({ ...d, minCommissionAmount: v }))}
              onMax={(v) => setDraft((d) => ({ ...d, maxCommissionAmount: v }))}
            />
          </div>

          <label className="mt-4 flex items-center gap-2 text-[13px] sm:hidden">
            <span className="text-[var(--muted)]">Sắp xếp</span>
            <select
              value={sort}
              onChange={(e) => setParam("sort", e.target.value === "newest" ? "" : e.target.value)}
              className="h-9 flex-1 rounded-xl bg-white px-3 text-[13px] font-semibold text-[var(--foreground)] ring-1 ring-[var(--border)] outline-none"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={applyDraft}
              className="h-10 rounded-full bg-[var(--accent)] px-6 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105"
            >
              Áp dụng
            </button>
            {activeRanges > 0 && (
              <button type="button" onClick={clearRanges} className="text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]">
                Xoá khoảng lọc
              </button>
            )}
          </div>
        </div>
      )}

      {anythingActive && !open && (
        <button
          type="button"
          onClick={resetAll}
          className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]"
        >
          <CloseIcon className="h-3.5 w-3.5" />
          Bỏ tất cả bộ lọc
        </button>
      )}
    </div>
  );
}

function Range({
  label,
  unit,
  min,
  max,
  onMin,
  onMax,
}: {
  label: string;
  unit: string;
  min: string;
  max: string;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-[var(--foreground)]">{label}</p>
      <div className="flex items-center gap-2">
        <Field placeholder="Từ" unit={unit} value={min} onChange={onMin} />
        <span className="text-[var(--muted)]">–</span>
        <Field placeholder="Đến" unit={unit} value={max} onChange={onMax} />
      </div>
    </div>
  );
}

function Field({
  placeholder,
  unit,
  value,
  onChange,
}: {
  placeholder: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <span className="relative flex-1">
      <input
        type="number"
        min="0"
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl bg-[#f6f7f6] pl-3 pr-8 text-sm text-[var(--foreground)] outline-none ring-1 ring-transparent transition placeholder:text-[var(--muted)] focus:bg-white focus:ring-[var(--foreground)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--muted)]">{unit}</span>
    </span>
  );
}
