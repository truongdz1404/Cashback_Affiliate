// Tiny event bus behind the sign-in dialog. It lives outside React so plain
// modules (lib/appClient.ts on a 401, for instance) can ask for the dialog
// without importing components; AuthDialogProvider subscribes on mount.
export type AuthDialogMode = "login" | "register";

export type AuthDialogOptions = {
  mode?: AuthDialogMode;
  /** Why the visitor is being asked to sign in, shown above the form. */
  title?: string;
  description?: string;
  /** Runs after the session cookie is set, before the page data is refreshed. */
  onSuccess?: () => void;
  /**
   * Leave for another page once signed in. This is a full navigation, not a
   * client-side push: the shared (site) layout is served from the router cache
   * on a push, so the header would still show the guest buttons on arrival.
   * When set, onSuccess is not called.
   */
  redirectTo?: string;
};

const EVENT = "rewally:auth-dialog";

export function openAuthDialog(options: AuthDialogOptions = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AuthDialogOptions>(EVENT, { detail: options }));
}

export function subscribeAuthDialog(handler: (options: AuthDialogOptions) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<AuthDialogOptions>).detail ?? {});
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
