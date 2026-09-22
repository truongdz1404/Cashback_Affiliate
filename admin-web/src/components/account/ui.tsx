// Presentational bits shared by every /account page. No "use client" here on
// purpose - these render fine in server components, and the client pages that
// need them can import them just the same.
import Link from "next/link";

export function SectionCard({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-extrabold text-[var(--foreground)]">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "muted" | "danger";
  hint?: string;
}) {
  const valueColor =
    tone === "accent"
      ? "text-[var(--accent)]"
      : tone === "danger"
        ? "text-[var(--danger)]"
        : tone === "muted"
          ? "text-[var(--muted)]"
          : "text-[var(--foreground)]";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className={`mt-1.5 text-xl font-extrabold tabular-nums ${valueColor}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

const PILL_TONE = {
  neutral: "bg-[var(--surface-secondary)] text-[var(--foreground)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent-dark)]",
  success: "bg-[var(--success)]/12 text-[var(--success)]",
  warning: "bg-[var(--warning)]/18 text-[#9A6B00]",
  danger: "bg-[var(--danger)]/12 text-[var(--danger)]",
} as const;

export type PillTone = keyof typeof PILL_TONE;

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: PillTone }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${PILL_TONE[tone]}`}>{label}</span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-[var(--border)] px-6 py-14 text-center">
      <Icon className="h-8 w-8 text-[var(--muted)]" />
      <p className="mt-4 text-base font-extrabold text-[var(--foreground)]">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-[var(--muted)]">{description}</p>}
      {cta && (
        <Link
          href={cta.href}
          className="mt-5 rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
