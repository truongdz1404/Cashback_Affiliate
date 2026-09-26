"use client";

import { useId, useMemo, useState } from "react";

// Charts are hand-drawn SVG rather than a charting library. HeroUI ships no
// chart component, and the three shapes this dashboard needs - a trend line, a
// ranked bar list and a status donut - are less code here than the wiring a
// library would need, with no extra megabyte in the bundle and colours that
// come straight from the same CSS variables as everything else.

const PALETTE = [
  "var(--accent)",
  "var(--warning)",
  "var(--danger)",
  "var(--success)",
  "var(--muted)",
  "var(--accent-dark)",
];

export type SeriesPoint = { label: string; value: number };

export type LineSeries = {
  key: string;
  name: string;
  color?: string;
  values: number[];
  /** Draw as a soft filled area under the line rather than a bare stroke. */
  area?: boolean;
};

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")} tỷ`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")} tr`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(Math.round(value));
}

/**
 * Multi-series trend chart. The x axis is positional (one slot per label), so
 * the caller is responsible for handing over a gap-free day series - which is
 * exactly what /admin/analytics returns.
 */
export function TrendChart({
  labels,
  series,
  height = 220,
  formatValue = compact,
  emptyMessage = "Chưa có dữ liệu trong khoảng này",
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  formatValue?: (value: number) => string;
  emptyMessage?: string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const width = 720;
  const padding = { top: 12, right: 12, bottom: 26, left: 48 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const max = useMemo(
    () => niceCeil(Math.max(0, ...series.flatMap((s) => s.values))),
    [series],
  );
  const hasData = series.some((s) => s.values.some((v) => v > 0));

  const x = (i: number) => (labels.length <= 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
  const y = (v: number) => plotH - (v / max) * plotH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  // Enough ticks to read, never so many they overlap: roughly one every 90px.
  const tickEvery = Math.max(1, Math.ceil(labels.length / 6));

  if (!labels.length || !hasData) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-[var(--muted)]">{emptyMessage}</div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s, i) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: s.color ?? PALETTE[i % PALETTE.length] }}
            />
            {s.name}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Biểu đồ xu hướng: ${series.map((s) => s.name).join(", ")}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? PALETTE[i % PALETTE.length]} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color ?? PALETTE[i % PALETTE.length]} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        <g transform={`translate(${padding.left},${padding.top})`}>
          {gridLines.map((g) => (
            <g key={g}>
              <line x1={0} x2={plotW} y1={plotH * g} y2={plotH * g} stroke="var(--border)" strokeWidth={1} />
              <text
                x={-8}
                y={plotH * g + 4}
                textAnchor="end"
                className="fill-[var(--muted)]"
                style={{ fontSize: 10 }}
              >
                {formatValue(max * (1 - g))}
              </text>
            </g>
          ))}

          {series.map((s, i) => {
            const color = s.color ?? PALETTE[i % PALETTE.length];
            const points = s.values.map((v, idx) => `${x(idx)},${y(v)}`).join(" ");
            return (
              <g key={s.key}>
                {s.area && (
                  <polygon
                    points={`0,${plotH} ${points} ${x(s.values.length - 1)},${plotH}`}
                    fill={`url(#${gradientId}-${s.key})`}
                  />
                )}
                <polyline
                  points={points}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {hover !== null && s.values[hover] !== undefined && (
                  <circle cx={x(hover)} cy={y(s.values[hover])} r={3.5} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
                )}
              </g>
            );
          })}

          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={0} y2={plotH} stroke="var(--muted)" strokeDasharray="3 3" strokeWidth={1} />
          )}

          {labels.map((label, i) => (
            <g key={label}>
              {i % tickEvery === 0 && (
                <text
                  x={x(i)}
                  y={plotH + 16}
                  textAnchor="middle"
                  className="fill-[var(--muted)]"
                  style={{ fontSize: 10 }}
                >
                  {label}
                </text>
              )}
              {/* One invisible column per point so the whole width is hoverable,
                  not just the 4px the marker occupies. */}
              <rect
                x={x(i) - plotW / Math.max(1, labels.length) / 2}
                y={0}
                width={plotW / Math.max(1, labels.length)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          ))}
        </g>
      </svg>

      <p className="h-4 text-xs text-[var(--muted)]">
        {hover !== null && (
          <>
            <span className="font-medium text-[var(--foreground)]">{labels[hover]}</span>
            {series.map((s) => ` · ${s.name}: ${formatValue(s.values[hover] ?? 0)}`)}
          </>
        )}
      </p>
    </div>
  );
}

/** Ranked horizontal bars - top products, top customers, anything sorted. */
export function BarList({
  items,
  formatValue = compact,
  emptyMessage = "Chưa có dữ liệu",
}: {
  items: (SeriesPoint & { sublabel?: string })[];
  formatValue?: (value: number) => string;
  emptyMessage?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="py-6 text-center text-sm text-[var(--muted)]">{emptyMessage}</p>;

  return (
    <ol className="space-y-2.5">
      {items.map((item, i) => (
        <li key={`${item.label}-${i}`} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-[var(--foreground)]" title={item.label}>
              <span className="mr-1.5 text-xs font-medium text-[var(--muted)]">{i + 1}.</span>
              {item.label}
            </span>
            <span className="shrink-0 tabular-nums font-medium text-[var(--foreground)]">
              {formatValue(item.value)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
              />
            </div>
            {item.sublabel && <span className="shrink-0 text-xs text-[var(--muted)]">{item.sublabel}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Status mix. Drawn with stroke-dasharray on a single circle - no arc maths. */
export function DonutChart({
  items,
  centerLabel,
  centerValue,
  formatValue = compact,
}: {
  items: (SeriesPoint & { color?: string })[];
  centerLabel?: string;
  centerValue?: string;
  formatValue?: (value: number) => string;
}) {
  const total = items.reduce((sum, i) => sum + i.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  if (!total) {
    return <p className="py-8 text-center text-sm text-[var(--muted)]">Chưa có dữ liệu</p>;
  }

  let offset = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label="Tỉ trọng theo trạng thái">
        <g transform="rotate(-90 70 70)">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--surface-secondary)" strokeWidth={16} />
          {items.map((item, i) => {
            const length = (item.value / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const node = (
              <circle
                key={item.label}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={item.color ?? PALETTE[i % PALETTE.length]}
                strokeWidth={16}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
              />
            );
            offset += length;
            return node;
          })}
        </g>
        {(centerValue || centerLabel) && (
          <g>
            <text x="70" y="68" textAnchor="middle" className="fill-[var(--foreground)]" style={{ fontSize: 18, fontWeight: 600 }}>
              {centerValue}
            </text>
            <text x="70" y="84" textAnchor="middle" className="fill-[var(--muted)]" style={{ fontSize: 10 }}>
              {centerLabel}
            </text>
          </g>
        )}
      </svg>

      <ul className="min-w-[150px] space-y-1.5">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-[var(--muted)]">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: item.color ?? PALETTE[i % PALETTE.length] }}
              />
              {item.label}
            </span>
            <span className="tabular-nums font-medium text-[var(--foreground)]">
              {formatValue(item.value)}
              <span className="ml-1 text-xs font-normal text-[var(--muted)]">
                {Math.round((item.value / total) * 100)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Thumbnail trend for a stat card - no axes, no labels, just the shape. */
export function Sparkline({ values, color = "var(--accent)" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${24 - (v / max) * 22}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export { compact as compactNumber, PALETTE as CHART_PALETTE };
