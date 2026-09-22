"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@heroui/react";
import { appClient, AppRequestError } from "@/lib/appClient";
import { formatPct, formatVnd } from "@/lib/format";
import type { LinkResult } from "@/lib/appTypes";
import { BoltIcon, CheckIcon, CopyIcon, ExternalLinkIcon, WalletIcon } from "@/components/icons";

function resultLinkOf(result: LinkResult): string | null {
  return result.results?.[0]?.shortLink ?? result.results?.[0]?.longLink ?? null;
}

// Shopee is the only platform the backend automates (lib/customLink.js); the
// others answer "coming_soon", so the picker here says the same rather than
// offering buttons that fail.
const COMING_SOON = ["Lazada", "TikTok Shop", "Tiki"];

export default function LinkCreator() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LinkResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const productUrl = url.trim();
    if (!productUrl || submitting) return;

    setSubmitting(true);
    setResult(null);
    try {
      const created = await appClient.post<LinkResult>("/link", { platform: "shopee", productUrl });
      setResult(created);
      setCopied(false);
      setUrl("");
      // The history list below is rendered on the server.
      router.refresh();
    } catch (err) {
      const message = err instanceof AppRequestError ? translate(err.message) : "Vui lòng thử lại.";
      if (!(err instanceof AppRequestError) || err.status !== 401) {
        toast.danger("Không tạo được link", { description: message });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Đã sao chép", { description: "Link hoàn tiền đã được sao chép." });
    } catch {
      toast.danger("Không sao chép được", { description: "Hãy chọn và sao chép link thủ công." });
    }
  }

  const link = result ? resultLinkOf(result) : null;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <label htmlFor="product-url" className="mb-1.5 block text-sm font-bold text-[var(--foreground)]">
            URL sản phẩm
          </label>
          <input
            id="product-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://shopee.vn/..."
            autoComplete="off"
            disabled={submitting}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--field-background)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] disabled:opacity-60"
          />
        </div>

        <button
          type="submit"
          disabled={!url.trim() || submitting}
          className="flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] py-3.5 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105 disabled:opacity-50"
        >
          <BoltIcon className="h-4 w-4" />
          {submitting ? "Đang tạo link…" : "Tạo link hoàn tiền"}
        </button>

        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <CheckIcon className="h-3.5 w-3.5 text-[var(--success)]" />
            Tự lưu lịch sử
          </span>
          <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <WalletIcon className="h-3.5 w-3.5 text-[var(--success)]" />
            Tính hoàn tiền dự kiến
          </span>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
        <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-extrabold text-[var(--accent-dark)]">
          Shopee · Đang hỗ trợ
        </span>
        {COMING_SOON.map((name) => (
          <span
            key={name}
            className="rounded-full bg-[var(--surface-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]"
          >
            {name} · Sắp có
          </span>
        ))}
      </div>

      {result && (
        <div className="rounded-2xl border border-[var(--accent)] bg-[var(--accent-soft)] p-4">
          <p className="text-sm font-extrabold text-[var(--foreground)]">Link hoàn tiền đã sẵn sàng</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">Bấm mở link hoặc sao chép để mua hàng.</p>

          <div className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--surface)] px-3.5 py-3">
            <p className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--foreground)]">
              {link ?? "Link đã sẵn sàng"}
            </p>
            {link && (
              <>
                <button
                  type="button"
                  onClick={() => copy(link)}
                  aria-label="Sao chép link"
                  className="shrink-0 rounded-lg p-1.5 text-[var(--muted)] transition hover:text-[var(--accent)]"
                >
                  {copied ? (
                    <CheckIcon className="h-4 w-4 text-[var(--success)]" />
                  ) : (
                    <CopyIcon className="h-4 w-4" />
                  )}
                </button>
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Mở link"
                  className="shrink-0 rounded-lg p-1.5 text-[var(--muted)] transition hover:text-[var(--accent)]"
                >
                  <ExternalLinkIcon className="h-4 w-4" />
                </a>
              </>
            )}
          </div>

          {result.estimate && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--surface)] px-3.5 py-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Hoàn dự kiến</p>
                <p className="text-lg font-extrabold text-[var(--accent)]">
                  {formatVnd(result.estimate.userAmount)}
                </p>
              </div>
              {result.estimate.userPct != null && (
                <span className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-sm font-extrabold text-[var(--accent-foreground)]">
                  {formatPct(result.estimate.userPct)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function translate(message: string): string {
  switch (message) {
    case "coming_soon":
      return "Nền tảng này sắp được hỗ trợ. Hiện tại Rewally chỉ tạo link cho Shopee.";
    case "body.productUrl is required":
      return "Vui lòng dán link sản phẩm.";
    default:
      return message || "Vui lòng thử lại.";
  }
}
