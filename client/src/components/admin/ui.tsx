"use client";

import type { ReactNode } from "react";
import { Button, Card, ListBox, Select } from "@heroui/react";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, InfoIcon, SearchIcon, SlidersIcon } from "@/components/icons";
import { matchPreset, RANGE_PRESETS, type DayRange } from "@/lib/dateRange";

// Shared furniture for the admin screens. Before this every page invented its
// own heading, its own filter row and its own pair of Trước/Sau buttons, so no
// two tables lined up and a filter added to one screen never reached the next.

export function PageHeader({
  title,
  description,
  count,
  actions,
}: {
  title: string;
  description?: string;
  count?: number;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-baseline gap-2 text-xl font-semibold text-[var(--foreground)]">
          {title}
          {count !== undefined && (
            <span className="text-sm font-medium text-[var(--muted)]">{count.toLocaleString("vi-VN")}</span>
          )}
        </h1>
        {description && <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionCard({
  id,
  title,
  description,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: {
  // Anchor target, for screens long enough to want a jump list (app-config).
  // scroll-mt keeps the heading clear of the sticky nav that does the jumping.
  id?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card id={id} className={`${id ? "scroll-mt-24 " : ""}${className}`}>
      {(title || actions) && (
        <Card.Header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <Card.Title>{title}</Card.Title>}
            {description && <Card.Description>{description}</Card.Description>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </Card.Header>
      )}
      <Card.Content className={bodyClassName}>{children}</Card.Content>
    </Card>
  );
}

const TONE_CLASS = {
  default: "text-[var(--foreground)]",
  accent: "text-[var(--accent-dark)]",
  success: "text-[var(--success)]",
  warning: "text-[var(--warning)]",
  danger: "text-[var(--danger)]",
  muted: "text-[var(--muted)]",
} as const;

export type StatTone = keyof typeof TONE_CLASS;

// A percentage change is meaningless when the previous period was zero (every
// first sale is "+∞%"), so those show as "mới" instead of a number.
export function deltaPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
  current,
  previous,
  invertDelta = false,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: StatTone;
  icon?: ReactNode;
  current?: number;
  previous?: number;
  invertDelta?: boolean;
}) {
  const hasComparison = current !== undefined && previous !== undefined;
  const pct = hasComparison ? deltaPct(current, previous) : null;
  const rose = hasComparison && current > previous;
  const flat = hasComparison && current === previous;
  // "Good" is not always "up": more cancelled orders going up is bad news, so
  // those cards pass invertDelta and get the colours the other way round.
  const good = invertDelta ? !rose : rose;

  return (
    <Card className="h-full">
      <Card.Content className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
          {icon && <span className="shrink-0 text-[var(--muted)]">{icon}</span>}
        </div>
        <p className={`text-xl font-semibold tabular-nums ${TONE_CLASS[tone]}`}>{value}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {hasComparison && (
            <span
              className={
                flat
                  ? "text-[var(--muted)]"
                  : good
                    ? "font-medium text-[var(--success)]"
                    : "font-medium text-[var(--danger)]"
              }
            >
              {flat ? "không đổi" : pct === null ? "mới" : `${rose ? "+" : ""}${pct.toFixed(1)}%`}
            </span>
          )}
          {hint && <span className="text-[var(--muted)]">{hint}</span>}
        </div>
      </Card.Content>
    </Card>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

// Filters live in one bar on every screen: search on the left, the selects and
// the date window after it, and whatever bulk actions the screen has on the
// right. The active filters are echoed back as removable chips underneath, so
// an empty table always explains itself.
export function Toolbar({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5">
      <span className="hidden shrink-0 pl-1 text-[var(--muted)] sm:block">
        <SlidersIcon className="h-4 w-4" />
      </span>
      {children}
      {trailing && <div className="ml-auto flex flex-wrap items-center gap-2">{trailing}</div>}
    </div>
  );
}

const FIELD =
  "h-9 rounded-lg border border-[var(--border)] bg-[var(--field-background)] px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25";

export function SearchInput({
  value,
  onChange,
  placeholder = "Tìm kiếm…",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className || "min-w-[220px] flex-1 sm:max-w-xs"}`}>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${FIELD} w-full pl-9`}
      />
    </div>
  );
}

export type FilterOption = { value: string; label: string };

export function SelectFilter({
  label,
  value,
  options,
  onChange,
  className = "min-w-[180px]",
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select aria-label={label} selectedKey={value} onSelectionChange={(key) => onChange(String(key ?? ""))}>
      <Select.Trigger className={className}>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((opt) => (
            <ListBox.Item key={opt.value} id={opt.value}>
              {opt.label}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

// Native date inputs rather than a picker component: they open the browser's
// own calendar, accept typing, and already speak the visitor's locale.
export function DateRangeInput({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        value={from}
        max={to || undefined}
        aria-label="Từ ngày"
        onChange={(e) => onChange({ from: e.target.value, to })}
        className={FIELD}
      />
      <span className="text-xs text-[var(--muted)]">đến</span>
      <input
        type="date"
        value={to}
        min={from || undefined}
        aria-label="Đến ngày"
        onChange={(e) => onChange({ from, to: e.target.value })}
        className={FIELD}
      />
    </div>
  );
}

export function FilterChips({ items }: { items: { label: string; onClear: () => void }[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-[var(--muted)]">Đang lọc:</span>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClear}
          className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-secondary)] py-1 pl-2.5 pr-1.5 text-xs font-medium text-[var(--accent-dark)] transition hover:opacity-80"
        >
          {item.label}
          <CloseIcon className="h-3 w-3" />
        </button>
      ))}
    </div>
  );
}

export const PAGE_SIZE_OPTIONS: FilterOption[] = [
  { value: "20", label: "20 dòng" },
  { value: "50", label: "50 dòng" },
  { value: "100", label: "100 dòng" },
];

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
      <span>
        {total === 0 ? "Không có dòng nào" : `${first}–${last} trên ${total.toLocaleString("vi-VN")}`}
      </span>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <SelectFilter
            label="Số dòng mỗi trang"
            value={String(pageSize)}
            options={PAGE_SIZE_OPTIONS}
            onChange={(v) => onPageSize(Number(v))}
            className="min-w-[110px]"
          />
        )}
        <Button variant="outline" size="sm" onPress={() => onPage(Math.max(0, page - 1))} isDisabled={page === 0}>
          <ChevronLeftIcon className="h-4 w-4" />
          Trước
        </Button>
        <span className="tabular-nums">
          {page + 1} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onPress={() => onPage(Math.min(totalPages - 1, page + 1))}
          isDisabled={page >= totalPages - 1}
        >
          Sau
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-10 text-center">
      <span className="text-[var(--muted)]">
        <InfoIcon className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
      {description && <p className="max-w-sm text-xs text-[var(--muted)]">{description}</p>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/8 px-3 py-2 text-sm text-[var(--danger)]">
      <span>{message}</span>
      {onRetry && (
        <Button size="sm" variant="outline" onPress={onRetry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}

// A table that is reloading keeps showing the previous page rather than
// blanking out - the dimming is enough of a signal, and a table that empties
// on every keystroke of a search box is unreadable.
export function TableShell({
  children,
  isLoading = false,
  minWidth,
}: {
  children: ReactNode;
  isLoading?: boolean;
  minWidth?: string;
}) {
  return (
    <div className={`transition-opacity ${isLoading ? "opacity-60" : ""}`}>
      <div style={minWidth ? { minWidth } : undefined}>{children}</div>
    </div>
  );
}

// Presets plus an exact window, because the two questions admins actually ask
// are "how did the last 30 days go" and "what happened between these two
// dates I was given", and making the first one cost six clicks is the quickest
// way to get a dashboard nobody opens.
export function RangePicker({
  range,
  onChange,
}: {
  range: DayRange;
  onChange: (next: DayRange) => void;
}) {
  const active = matchPreset(range);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-lg bg-[var(--surface-secondary)] p-1">
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onChange(preset.range())}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              active === preset.key
                ? "bg-[var(--surface)] text-[var(--accent-dark)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <DateRangeInput from={range.from} to={range.to} onChange={onChange} />
    </div>
  );
}
