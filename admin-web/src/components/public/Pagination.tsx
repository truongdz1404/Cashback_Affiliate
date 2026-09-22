import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

// Window of numbered pages around the current one, so 500 pages still render
// as a dozen links.
function pagesAround(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current]);
  for (let delta = 1; delta <= 1; delta += 1) {
    if (current - delta > 1) pages.add(current - delta);
    if (current + delta < total) pages.add(current + delta);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  sorted.forEach((page, i) => {
    if (i > 0 && page - sorted[i - 1] > 1) result.push("gap");
    result.push(page);
  });
  return result;
}

export default function Pagination({
  basePath,
  params,
  page,
  totalPages,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  function hrefFor(target: number) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    if (target > 1) search.set("page", String(target));
    else search.delete("page");
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const base =
    "flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-bold transition";

  return (
    <nav aria-label="Phân trang" className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} aria-label="Trang trước" className={`${base} border-[var(--border)] text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent)]`}>
          <ChevronLeftIcon className="h-4 w-4" />
        </Link>
      ) : (
        <span className={`${base} border-[var(--border)] text-[var(--muted)] opacity-50`}>
          <ChevronLeftIcon className="h-4 w-4" />
        </span>
      )}

      {pagesAround(page, totalPages).map((entry, i) =>
        entry === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-sm text-[var(--muted)]">
            …
          </span>
        ) : (
          <Link
            key={entry}
            href={hrefFor(entry)}
            aria-current={entry === page ? "page" : undefined}
            className={
              entry === page
                ? `${base} border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]`
                : `${base} border-[var(--border)] text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent)]`
            }
          >
            {entry}
          </Link>
        ),
      )}

      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} aria-label="Trang sau" className={`${base} border-[var(--border)] text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent)]`}>
          <ChevronRightIcon className="h-4 w-4" />
        </Link>
      ) : (
        <span className={`${base} border-[var(--border)] text-[var(--muted)] opacity-50`}>
          <ChevronRightIcon className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}
