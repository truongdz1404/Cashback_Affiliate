"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "@heroui/react";
import AuthForm from "@/components/public/AuthForm";
import { openAuthDialog, subscribeAuthDialog, type AuthDialogMode, type AuthDialogOptions } from "@/lib/authDialog";
import { CheckIcon, CloseIcon } from "@/components/icons";

// Sign-in/sign-up as a modal. Every "you need an account for this" moment on
// the public site opens this instead of navigating to /login, so the visitor
// keeps the page (and whatever they were doing) underneath. Only the explicit
// Đăng nhập / Đăng ký buttons in the header and footer still go to the full
// pages. Built on the native <dialog>: focus trap, Escape and the top layer
// come for free, and there is no portal to manage.

const PERKS = [
  "Hoàn tiền cho mọi đơn Shopee, rút thẳng về ngân hàng",
  "Dán link bất kỳ sản phẩm nào để nhận link hoàn tiền",
  "Theo dõi đơn hàng và ví ngay trên web hoặc app",
];

const MODE_LABEL: Record<AuthDialogMode, string> = { login: "Đăng nhập", register: "Đăng ký" };

type DialogState = {
  open: boolean;
  mode: AuthDialogMode;
  title?: string;
  description?: string;
};

export function AuthDialogProvider({ isAuthenticated, children }: { isAuthenticated: boolean; children: ReactNode }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onSuccessRef = useRef<(() => void) | undefined>(undefined);
  const redirectRef = useRef<string | undefined>(undefined);
  const [state, setState] = useState<DialogState>({ open: false, mode: "login" });

  const close = useCallback(() => {
    onSuccessRef.current = undefined;
    redirectRef.current = undefined;
    setState((s) => ({ ...s, open: false }));
  }, []);

  // 1. openAuthDialog() from anywhere.
  useEffect(
    () =>
      subscribeAuthDialog((options: AuthDialogOptions) => {
        if (isAuthenticated) {
          // Stale caller (page data not refreshed yet): nothing to sign in to.
          if (options.redirectTo) router.push(options.redirectTo);
          else options.onSuccess?.();
          return;
        }
        onSuccessRef.current = options.onSuccess;
        redirectRef.current = options.redirectTo;
        setState({ open: true, mode: options.mode ?? "login", title: options.title, description: options.description });
      }),
    [isAuthenticated, router],
  );

  // 2. A guest following any link into the account area gets the dialog and
  // is taken there after signing in, instead of proxy.js bouncing them to
  // /login. Capture phase + stopPropagation so next/link never sees the click.
  useEffect(() => {
    if (isAuthenticated) return;
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      const href = anchor.getAttribute("href") ?? "";
      if (!/^\/account(\/|\?|$)/.test(href)) return;
      event.preventDefault();
      event.stopPropagation();
      openAuthDialog({
        title: "Đăng nhập để vào tài khoản của bạn",
        description: "Ví hoàn tiền, đơn hàng và link của bạn sẽ hiển thị ngay sau khi đăng nhập.",
        redirectTo: href,
      });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [isAuthenticated]);

  // 3. React state → native <dialog>.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (state.open && !el.open) el.showModal();
    else if (!state.open && el.open) el.close();
  }, [state.open]);

  // The top layer does not stop the page behind from scrolling.
  useEffect(() => {
    if (!state.open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [state.open]);

  function handleSuccess() {
    const callback = onSuccessRef.current;
    const redirect = redirectRef.current;
    onSuccessRef.current = undefined;
    redirectRef.current = undefined;
    setState((s) => ({ ...s, open: false }));

    if (redirect) {
      // Full load so the destination and the shared header both render for
      // the member; a toast here would not survive the navigation anyway.
      window.location.assign(redirect);
      return;
    }

    toast.success(state.mode === "register" ? "Đăng ký thành công" : "Đăng nhập thành công", {
      description: "Hoàn tiền của bạn sẽ được ghi nhận vào ví Rewally.",
    });
    // Every server component re-renders with the new cookie (header, product
    // cards, account pages) without a full reload.
    router.refresh();
    callback?.();
  }

  const setMode = (mode: AuthDialogMode) => setState((s) => ({ ...s, mode }));

  return (
    <>
      {children}

      <dialog
        ref={dialogRef}
        onClose={close}
        onClick={(event) => {
          // Clicks on the ::backdrop are delivered with the dialog itself as target.
          if (event.target === event.currentTarget) close();
        }}
        aria-label={`${MODE_LABEL[state.mode]} Rewally`}
        className="auth-dialog m-auto w-[calc(100%-1.5rem)] max-w-[920px] overflow-hidden rounded-[28px] bg-white p-0 text-[var(--foreground)] shadow-[0_40px_120px_-40px_rgba(20,49,34,0.65)] outline-none backdrop:bg-[#0f1f16]/60 backdrop:backdrop-blur-[2px]"
      >
        {state.open && (
          <div className="grid max-h-[calc(100dvh-1.5rem)] overflow-y-auto md:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
            <aside className="hidden flex-col bg-[var(--accent-soft)] p-8 md:flex">
              <Link href="/" onClick={close} className="inline-flex items-center gap-2">
                <Image src="/logo.png" alt="Rewally" width={36} height={36} className="rounded-xl" />
                <span className="text-lg font-extrabold text-[var(--foreground)]">Rewally</span>
              </Link>

              <h2 className="mt-7 text-[26px] font-extrabold leading-tight text-[var(--foreground)]">
                Mua sắm Shopee,
                <br />
                nhận hoàn tiền về ví
              </h2>

              <ul className="mt-5 flex flex-col gap-2.5">
                {PERKS.map((perk) => (
                  <li key={perk} className="flex items-start gap-2.5 text-sm leading-5 text-[var(--foreground)]">
                    <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                      <CheckIcon className="h-2.5 w-2.5" />
                    </span>
                    {perk}
                  </li>
                ))}
              </ul>

              <div className="relative mt-auto aspect-[4/3] w-full overflow-hidden rounded-[22px] pt-6">
                <Image
                  src="/marketing/reward-ways.png"
                  alt="Ví Rewally nhận hoàn tiền từ đơn hàng Shopee"
                  fill
                  sizes="420px"
                  className="object-cover"
                  priority
                />
              </div>
            </aside>

            <section className="relative p-6 sm:p-8">
              <button
                type="button"
                onClick={close}
                aria-label="Đóng"
                className="absolute right-4 top-4 rounded-full p-2 text-[var(--muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
              >
                <CloseIcon className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-2 md:hidden">
                <Image src="/logo.png" alt="Rewally" width={28} height={28} className="rounded-lg" />
                <span className="text-base font-extrabold text-[var(--foreground)]">Rewally</span>
              </div>

              {(state.title || state.description) && (
                <div className="mt-4 rounded-2xl bg-[var(--accent-soft)] px-4 py-3 md:mt-0 md:mr-10">
                  {state.title && <p className="text-sm font-extrabold text-[var(--accent-dark)]">{state.title}</p>}
                  {state.description && <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{state.description}</p>}
                </div>
              )}

              <div role="tablist" aria-label="Chọn đăng nhập hoặc đăng ký" className="mt-4 grid grid-cols-2 rounded-full bg-[var(--surface-secondary)] p-1">
                {(["login", "register"] as const).map((mode) => {
                  const active = state.mode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setMode(mode)}
                      className={`h-10 rounded-full text-sm font-extrabold transition ${
                        active ? "bg-white text-[var(--foreground)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      {MODE_LABEL[mode]}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5">
                <AuthForm key={state.mode} mode={state.mode} embedded onSuccess={handleSuccess} onSwitchMode={setMode} />
              </div>
            </section>
          </div>
        )}
      </dialog>
    </>
  );
}

// For server components (CampaignCard and friends) that want an inline
// "Đăng nhập" affordance without becoming client components themselves.
export function AuthDialogTrigger({
  children,
  className,
  mode,
  title,
  description,
}: {
  children: ReactNode;
  className?: string;
  mode?: AuthDialogMode;
  title?: string;
  description?: string;
}) {
  return (
    <button type="button" onClick={() => openAuthDialog({ mode, title, description })} className={className}>
      {children}
    </button>
  );
}
