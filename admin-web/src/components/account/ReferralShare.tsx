"use client";

import { useEffect, useState } from "react";
import { toast } from "@heroui/react";
import { CheckIcon, CopyIcon } from "@/components/icons";

// The invite link has to be built in the browser: the server renders this page
// for any host the deployment answers on, and hardcoding one would break the
// other.
export default function ReferralShare({ code }: { code: string }) {
  const [inviteLink, setInviteLink] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setInviteLink(`${window.location.origin}/register?ref=${encodeURIComponent(code)}`);
  }, [code]);

  async function copy(text: string, mark: (v: boolean) => void, description: string) {
    try {
      await navigator.clipboard.writeText(text);
      mark(true);
      toast.success("Đã sao chép", { description });
    } catch {
      toast.danger("Không sao chép được", { description: "Hãy chọn và sao chép thủ công." });
    }
  }

  async function share() {
    const message = `Tham gia hoàn tiền Shopee cùng mình! Dùng mã giới thiệu ${code} khi đăng ký nhé.\n${inviteLink}`;
    // navigator.share only exists on mobile browsers and secure contexts;
    // copying the same text is the honest fallback everywhere else.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: message, url: inviteLink });
        return;
      } catch {
        return; // the user dismissed the share sheet
      }
    }
    await copy(message, setCopiedLink, "Lời mời đã được sao chép, gửi cho bạn bè nhé.");
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-center">
        <p className="text-sm text-[var(--muted)]">Mã giới thiệu của bạn</p>
        <p className="mt-1 text-3xl font-extrabold tracking-[0.3em] text-[var(--accent-dark)]">{code}</p>
      </div>

      <div className="flex w-full max-w-sm gap-3">
        <button
          type="button"
          onClick={() => copy(code, setCopiedCode, "Mã giới thiệu đã được sao chép.")}
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[var(--border)] py-2.5 text-sm font-bold text-[var(--foreground)] transition hover:border-[var(--accent)]"
        >
          {copiedCode ? <CheckIcon className="h-4 w-4 text-[var(--success)]" /> : <CopyIcon className="h-4 w-4" />}
          Sao chép
        </button>
        <button
          type="button"
          onClick={share}
          className="flex-1 rounded-full bg-[var(--accent)] py-2.5 text-sm font-extrabold text-[var(--accent-foreground)] transition hover:brightness-105"
        >
          Chia sẻ
        </button>
      </div>

      {inviteLink && (
        <button
          type="button"
          onClick={() => copy(inviteLink, setCopiedLink, "Link mời đã được sao chép.")}
          className="flex w-full max-w-sm items-center gap-2 rounded-xl bg-[var(--surface-secondary)] px-3.5 py-2.5 text-left"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--foreground)]">{inviteLink}</span>
          {copiedLink ? (
            <CheckIcon className="h-4 w-4 shrink-0 text-[var(--success)]" />
          ) : (
            <CopyIcon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          )}
        </button>
      )}
    </div>
  );
}
