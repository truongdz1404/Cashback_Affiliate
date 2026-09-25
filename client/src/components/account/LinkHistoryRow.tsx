"use client";

import { useState } from "react";
import { toast } from "@heroui/react";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "@/components/icons";

// A row of the link history. Client-side only because of the copy button -
// the page itself stays a server component.
export default function LinkHistoryRow({
  link,
  source,
  createdAt,
  estimate,
}: {
  link: string | null;
  source: string | null;
  createdAt: string;
  estimate: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Đã sao chép", { description: "Link hoàn tiền đã được sao chép." });
    } catch {
      toast.danger("Không sao chép được", { description: "Hãy chọn và sao chép link thủ công." });
    }
  }

  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-[var(--foreground)]">{link ?? "Link chưa sẵn sàng"}</p>
        {/* The original Shopee URL is noise on a phone: it truncates to the
            same handful of characters on every row. */}
        {source && <p className="mt-0.5 hidden truncate text-xs text-[var(--muted)] sm:block">{source}</p>}
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          {createdAt}
          {estimate && <span className="ml-2 font-bold text-[var(--accent)]">Hoàn dự kiến {estimate}</span>}
        </p>
      </div>

      {link && (
        <>
          <button
            type="button"
            onClick={copy}
            aria-label="Sao chép link"
            className="shrink-0 rounded-lg p-2 text-[var(--muted)] transition hover:text-[var(--accent)]"
          >
            {copied ? <CheckIcon className="h-4 w-4 text-[var(--success)]" /> : <CopyIcon className="h-4 w-4" />}
          </button>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Mở link"
            className="shrink-0 rounded-lg p-2 text-[var(--muted)] transition hover:text-[var(--accent)]"
          >
            <ExternalLinkIcon className="h-4 w-4" />
          </a>
        </>
      )}
    </li>
  );
}
