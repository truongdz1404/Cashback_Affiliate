import type { AppUser, WalletSummary } from "@/lib/appTypes";
import {
  BankIcon,
  GiftIcon,
  HomeIcon,
  InfoIcon,
  LinkIcon,
  LockIcon,
  ReceiptIcon,
  ShieldIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/icons";

export type MenuBadge = { label: string; tone: "danger" | "warning" | "accent" };

export type AccountMenuItem = {
  href: string;
  label: string;
  /** Shorter wording for the header dropdown and phone chips. */
  short?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: MenuBadge;
};

// Plain booleans so a server component can hand them to the header's client
// component; the icons above are functions and would not survive that trip.
export type AccountFacts = {
  hasEmail: boolean;
  hasBank: boolean;
  hasPassword: boolean;
  pendingWithdrawal: boolean;
  /** users.role === "admin": the only thing that ever reveals /admin exists. */
  isAdmin: boolean;
};

export function hasBankAccount(user: Pick<AppUser, "bankName" | "bankAccountNumber" | "bankAccountHolder">): boolean {
  return Boolean(user.bankName && user.bankAccountNumber && user.bankAccountHolder);
}

export function accountFacts(user: AppUser, wallet: Pick<WalletSummary, "pendingWithdrawal">): AccountFacts {
  return {
    hasEmail: Boolean(user.email),
    hasBank: hasBankAccount(user),
    hasPassword: Boolean(user.hasPassword),
    pendingWithdrawal: Boolean(wallet.pendingWithdrawal),
    isAdmin: user.role === "admin",
  };
}

// One list, three renderers (account sidebar, header dropdown, phone drawer):
// the badges tell the member what still needs doing before they can be paid.
// Admins get one extra entry on top; nobody else ever sees the word.
export function accountMenu(facts: AccountFacts): AccountMenuItem[] {
  const admin: AccountMenuItem[] = facts.isAdmin
    ? [{ href: "/admin", label: "Trang quản trị", short: "Quản trị", icon: ShieldIcon }]
    : [];
  return [
    ...admin,
    { href: "/account", label: "Tổng quan", icon: HomeIcon },
    {
      href: "/account/profile",
      label: "Thông tin tài khoản",
      icon: UsersIcon,
      badge: facts.hasEmail ? undefined : { label: "Chưa có email", tone: "danger" },
    },
    {
      href: "/account/bank",
      label: "Tài khoản ngân hàng",
      icon: BankIcon,
      badge: facts.hasBank ? undefined : { label: "Chưa thiết lập", tone: "warning" },
    },
    {
      href: "/account/password",
      label: "Cập nhật mật khẩu",
      short: "Mật khẩu",
      icon: LockIcon,
      badge: facts.hasPassword ? undefined : { label: "Chưa tạo", tone: "warning" },
    },
    { href: "/account/orders", label: "Tiền hoàn của tôi", short: "Tiền hoàn", icon: ReceiptIcon },
    {
      href: "/account/wallet",
      label: "Rút tiền",
      icon: WalletIcon,
      badge: facts.pendingWithdrawal ? { label: "Đang chờ duyệt", tone: "accent" } : undefined,
    },
    { href: "/account/links", label: "Tạo link hoàn tiền", short: "Tạo link", icon: LinkIcon },
    { href: "/account/referral", label: "Giới thiệu bạn bè & nhận thưởng", short: "Mời bạn bè", icon: GiftIcon },
    { href: "/support", label: "Hỗ trợ & Hỏi đáp", short: "Hỗ trợ", icon: InfoIcon },
  ];
}

// /account is a prefix of every other entry, so it only matches exactly.
export function isMenuActive(pathname: string, href: string): boolean {
  return href === "/account" ? pathname === "/account" : pathname === href || pathname.startsWith(`${href}/`);
}
