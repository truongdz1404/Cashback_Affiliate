"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SlidersIcon } from "@/components/icons";

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

  function reset() {
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

  const activeCount = Object.values(readFilters(new URLSearchParams(params.toString()))).filter(Boolean).length;
  const category = params.get("category") ?? "";
  const sort = params.get("sort") ?? "newest";
  const bestSeller = params.get("bestSeller") === "1";
  const xtra = params.get("xtra") === "1";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--foreground)] transition hover:border-[var(--accent)]"
        >
          <SlidersIcon className="h-4 w-4" />
          Tùy chọn tìm kiếm
          {activeCount > 0 && (
            <span className="rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-extrabold text-[var(--accent-foreground)]">
              {activeCount}
            </span>
          )}
        </button>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-[var(--muted)]">Sắp xếp</span>
          <select
            value={sort}
            onChange={(e) => setParam("sort", e.target.value === "newest" ? "" : e.target.value)}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => setParam("bestSeller", bestSeller ? "" : "1")}
          className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
            bestSeller
              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border-[var(--border)] text-[var(--foreground)] hover:border-[var(--accent)]"
          }`}
        >
          Bán chạy
        </button>
        <button
          type="button"
          onClick={() => setParam("xtra", xtra ? "" : "1")}
          className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
            xtra
              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border-[var(--border)] text-[var(--foreground)] hover:border-[var(--accent)]"
          }`}
        >
          Hoa hồng Xtra
        </button>

        {(activeCount > 0 || category || bestSeller || xtra || sort !== "newest") && (
          <button
            type="button"
            onClick={reset}
            className="ml-auto text-sm font-bold text-[var(--danger)] hover:underline"
          >
            Thiết lập lại
          </button>
        )}
      </div>

      {categories.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setParam("category", "")}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              category === ""
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "bg-[var(--surface-secondary)] text-[var(--foreground)] hover:text-[var(--accent)]"
            }`}
          >
            Tất cả
          </button>
          {categories.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setParam("category", category === name ? "" : name)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                category === name
                  ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "bg-[var(--surface-secondary)] text-[var(--foreground)] hover:text-[var(--accent)]"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-4 grid gap-4 border-t border-[var(--border)] pt-4 sm:grid-cols-3">
          <Range
            label="Khoảng Giá (đ)"
            min={draft.minPrice}
            max={draft.maxPrice}
            onMin={(v) => setDraft((d) => ({ ...d, minPrice: v }))}
            onMax={(v) => setDraft((d) => ({ ...d, maxPrice: v }))}
          />
          <Range
            label="Tỉ Lệ Hoàn Tiền (%)"
            min={draft.minCommissionPct}
            max={draft.maxCommissionPct}
            onMin={(v) => setDraft((d) => ({ ...d, minCommissionPct: v }))}
            onMax={(v) => setDraft((d) => ({ ...d, maxCommissionPct: v }))}
          />
          <Range
            label="Số Tiền Hoàn (đ)"
            min={draft.minCommissionAmount}
            max={draft.maxCommissionAmount}
            onMin={(v) => setDraft((d) => ({ ...d, minCommissionAmount: v }))}
            onMax={(v) => setDraft((d) => ({ ...d, maxCommissionAmount: v }))}
          />

          <div className="flex gap-2 sm:col-span-3">
            <button
              type="button"
              onClick={applyDraft}
              className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105"
            >
              Tìm kiếm
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-[var(--border)] px-6 py-2.5 text-sm font-bold text-[var(--foreground)] transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
            >
              Thiết lập lại
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Range({
  label,
  min,
  max,
  onMin,
  onMax,
}: {
  label: string;
  min: string;
  max: string;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
}) {
  const input =
    "w-full rounded-xl border border-[var(--border)] bg-[var(--field-background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]";
  return (
    <div>
      <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <div className="flex items-center gap-2">
        <input type="number" min="0" inputMode="numeric" placeholder="Từ" value={min} onChange={(e) => onMin(e.target.value)} className={input} />
        <span className="text-[var(--muted)]">–</span>
        <input type="number" min="0" inputMode="numeric" placeholder="Đến" value={max} onChange={(e) => onMax(e.target.value)} className={input} />
      </div>
    </div>
  );
}
