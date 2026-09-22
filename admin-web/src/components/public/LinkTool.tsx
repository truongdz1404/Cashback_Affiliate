"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "@heroui/react";
import { appClient, AppRequestError } from "@/lib/appClient";
import { openAuthDialog } from "@/lib/authDialog";
import { formatPct, formatVnd } from "@/lib/format";
import type { LinkResult } from "@/lib/appTypes";
import { BoltIcon, CheckIcon, CopyIcon, ExternalLinkIcon, LinkIcon } from "@/components/icons";

// "Dán link → nhận link hoàn tiền" is the action that actually earns money,
// so this one widget is embedded everywhere: the /link landing page, both
// home pages and the account area. Guests can paste right away; on submit the
// sign-in dialog opens on top and, once they are in, the link they pasted is
// created immediately so nothing is lost.
//
// Shopee is the only platform the backend automates (lib/customLink.js); the
// others answer "coming_soon", so the picker here says the same rather than
// offering buttons that fail.
const COMING_SOON = ["Lazada", "TikTok Shop", "Tiki"];

const SHOPEE_HOSTS = /(^|\.)(shopee\.vn|shp\.ee|shope\.ee)$/i;

function resultLinkOf(result: LinkResult): string | null {
  return result.results?.[0]?.shortLink ?? result.results?.[0]?.longLink ?? null;
}

function normalizeUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  // People paste whole Shopee share messages ("Mua ngay ... https://shp.ee/xyz").
  const match = text.match(/https?:\/\/\S+/i);
  const candidate = match ? match[0] : text.includes(".") ? `https://${text}` : text;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isShopee(url: string): boolean {
  try {
    return SHOPEE_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export default function LinkTool({
  isAuthenticated,
  initialUrl = "",
  variant = "card",
  autoSubmit = false,
  onCreated,
}: {
  isAuthenticated: boolean;
  initialUrl?: string;
  /** hero: large green input row for landing sections; card: stacked form for the account area. */
  variant?: "hero" | "card";
  /** Submit the initialUrl once on mount (used after the login round-trip). */
  autoSubmit?: boolean;
  onCreated?: (result: LinkResult) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [url, setUrl] = useState(initialUrl);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LinkResult | null>(null);
  const [copied, setCopied] = useState(false);
  const autoSubmitted = useRef(false);

  // `signedIn` lets the dialog's success callback finish the job before the
  // refreshed `isAuthenticated` prop has arrived from the server.
  async function create(productUrl: string, signedIn = isAuthenticated) {
    if (submitting) return;

    if (!signedIn) {
      // Signing in re-renders the page for a member. On /link the tree is the
      // same for guests and members, so the link can be created right here.
      // The home page swaps the whole guest tree (MarketingHome) for the
      // member home, which would unmount this widget and lose the result, so
      // from anywhere else the pasted URL is handed to /link, whose
      // autoSubmit creates it once and shows it next to the history.
      const stayHere = pathname === "/link";
      openAuthDialog({
        title: "Đăng nhập để nhận link hoàn tiền",
        description: "Link bạn vừa dán sẽ được tạo ngay sau khi đăng nhập, hoàn tiền ghi nhận vào ví của bạn.",
        onSuccess: stayHere ? () => void create(productUrl, true) : undefined,
        redirectTo: stayHere ? undefined : `/link?url=${encodeURIComponent(productUrl)}`,
      });
      return;
    }

    setSubmitting(true);
    setResult(null);
    setCopied(false);
    try {
      const created = await appClient.post<LinkResult>("/link", { platform: "shopee", productUrl });
      setResult(created);
      setUrl("");
      onCreated?.(created);
      // Any server-rendered history list on the page picks up the new row.
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

  function submit(e: FormEvent) {
    e.preventDefault();
    const productUrl = normalizeUrl(url);
    if (!productUrl) {
      toast.danger("Link chưa hợp lệ", { description: "Hãy dán link sản phẩm bắt đầu bằng https://shopee.vn/…" });
      return;
    }
    if (!isShopee(productUrl)) {
      toast.danger("Hiện chỉ hỗ trợ Shopee", { description: "Lazada, TikTok Shop và Tiki sẽ được mở trong các bản cập nhật tới." });
      return;
    }
    void create(productUrl);
  }

  useEffect(() => {
    if (!autoSubmit || autoSubmitted.current || !isAuthenticated) return;
    const productUrl = normalizeUrl(initialUrl);
    if (!productUrl || !isShopee(productUrl)) return;
    autoSubmitted.current = true;
    void create(productUrl);
    // Only ever runs once for the URL we arrived with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const hero = variant === "hero";

  return (
    <div className={hero ? "flex flex-col gap-3" : "flex flex-col gap-4"}>
      <form onSubmit={submit} className={hero ? "flex flex-col gap-2 sm:flex-row" : "flex flex-col gap-3"}>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Link sản phẩm Shopee</span>
          <LinkIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={(e) => {
              // Pasting is the whole interaction: normalise immediately so the
              // user sees the clean URL and can just hit the button.
              const pasted = normalizeUrl(e.clipboardData.getData("text"));
              if (pasted) {
                e.preventDefault();
                setUrl(pasted);
              }
            }}
            placeholder="Dán link sản phẩm Shopee vào đây…"
            autoComplete="off"
            spellCheck={false}
            disabled={submitting}
            className={`w-full rounded-full bg-white pl-11 pr-4 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] disabled:opacity-60 ${
              hero
                ? "h-12 ring-1 ring-[var(--border)] focus:ring-2 focus:ring-[var(--accent)] sm:h-13"
                : "h-12 ring-1 ring-[var(--border)] focus:ring-2 focus:ring-[var(--accent)]"
            }`}
          />
        </label>

        <button
          type="submit"
          disabled={!url.trim() || submitting}
          className={`flex shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105 disabled:opacity-50 ${
            hero ? "h-12 sm:h-13" : "h-12"
          }`}
        >
          <BoltIcon className="h-4 w-4" />
          {submitting ? "Đang tạo link…" : isAuthenticated ? "Tạo link hoàn tiền" : "Nhận link hoàn tiền"}
        </button>
      </form>

      {!hero && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-extrabold text-[var(--accent-dark)]">
            Shopee · Đang hỗ trợ
          </span>
          {COMING_SOON.map((name) => (
            <span key={name} className="rounded-full bg-[var(--surface-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]">
              {name} · Sắp có
            </span>
          ))}
        </div>
      )}

      {hero && !result && (
        <p className="text-xs text-[var(--muted)]">
          Hỗ trợ mọi link shopee.vn và link rút gọn shp.ee.
          {!isAuthenticated && (
            <>
              {" "}
              Bạn cần{" "}
              <button
                type="button"
                onClick={() =>
                  openAuthDialog({
                    title: "Đăng nhập để nhận link hoàn tiền",
                    description: "Sau khi đăng nhập, dán link Shopee để nhận link hoàn tiền của riêng bạn.",
                  })
                }
                className="font-bold text-[var(--accent)] hover:underline"
              >
                đăng nhập
              </button>{" "}
              để hoàn tiền được ghi nhận vào ví của bạn.
            </>
          )}
        </p>
      )}

      {result && (
        <div className="rounded-2xl bg-[var(--accent-soft)] p-4 ring-1 ring-[var(--accent)]/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-[var(--foreground)]">Link hoàn tiền đã sẵn sàng</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">Mở link này để mua hàng, đơn sẽ được ghi nhận hoàn tiền.</p>
            </div>
            {result.estimate?.userPct != null && (
              <span className="shrink-0 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-extrabold text-[var(--accent-foreground)]">
                Hoàn {formatPct(result.estimate.userPct)}
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-[var(--border)]">
            <p className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--foreground)]">{link ?? "Link đã sẵn sàng"}</p>
            {link && (
              <>
                <button
                  type="button"
                  onClick={() => copy(link)}
                  aria-label="Sao chép link"
                  className="shrink-0 rounded-lg p-1.5 text-[var(--muted)] transition hover:text-[var(--accent)]"
                >
                  {copied ? <CheckIcon className="h-4 w-4 text-[var(--success)]" /> : <CopyIcon className="h-4 w-4" />}
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

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {result.estimate ? (
              <p className="text-sm text-[var(--muted)]">
                Hoàn dự kiến{" "}
                <span className="text-base font-extrabold text-[var(--accent)]">{formatVnd(result.estimate.userAmount)}</span>
              </p>
            ) : (
              <span />
            )}
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--foreground)] px-5 text-sm font-extrabold text-white transition hover:opacity-90"
              >
                Mở Shopee và mua ngay
                <ExternalLinkIcon className="h-4 w-4" />
              </a>
            )}
          </div>
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
