// Where a referral code waits between the invite link and the sign-up form.
//
// An invite link points at /register?ref=CODE, and the register page reads the
// code straight out of the URL. That only works for the visitor who signs up on
// the very first screen they see - and almost nobody does. They click the link
// from Zalo, look at the shop, browse for a while, come back tomorrow, and by
// then the code is long gone from the address bar. The friend who invited them
// gets nothing, which is the one outcome the whole referral programme cannot
// afford.
//
// So the code is copied into localStorage the moment it appears in any URL, and
// kept for seven days. Whenever an account is created inside that window - on
// the register form, or straight through Google/Facebook - the code goes along
// with it.
//
// Seven days, and not forever, because a code lying around for months would
// start attaching itself to sign-ups the inviter had nothing to do with.

const STORAGE_KEY = "rewally.referral";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** How long a captured code stays valid, for the copy that has to say it out loud. */
export const REFERRAL_TTL_DAYS = 7;

type StoredReferral = { code: string; savedAt: number };

// Every localStorage call is wrapped: Safari in private mode throws on write,
// and a visitor who has blocked site data should still be able to register -
// just without the referral being remembered across pages.
function readRaw(): StoredReferral | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { code, savedAt } = parsed as Partial<StoredReferral>;
    if (typeof code !== "string" || !code || typeof savedAt !== "number") return null;
    return { code, savedAt };
  } catch {
    return null;
  }
}

/**
 * Picks `?ref=` (or `?referralCode=`) out of a URL and remembers it.
 * Called on every page, because an invite link can point anywhere on the site.
 */
export function captureReferralCodeFromUrl(search: string): void {
  if (typeof window === "undefined") return;
  let code: string | null = null;
  try {
    const params = new URLSearchParams(search);
    code = (params.get("ref") ?? params.get("referralCode") ?? "").trim() || null;
  } catch {
    return;
  }
  if (!code) return;

  // A fresh link wins over a stored one, and re-opening the same link restarts
  // the seven days: the visitor has just shown the invite is still live.
  try {
    const value: StoredReferral = { code, savedAt: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable - the code still works if they register on this page */
  }
}

/** The remembered code, or null once the seven days are up. */
export function readReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  const stored = readRaw();
  if (!stored) return null;
  if (Date.now() - stored.savedAt > TTL_MS) {
    clearReferralCode();
    return null;
  }
  return stored.code;
}

/** Called once an account exists: the code has done its job either way. */
export function clearReferralCode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clean up */
  }
}
