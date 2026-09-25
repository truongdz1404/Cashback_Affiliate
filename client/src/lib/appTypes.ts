// DTOs returned by the backend's /app/* API, mirrored from the mobile
// app's src/lib/types.ts so the website and the app stay in step. Keep the
// two in sync when the backend changes.

// The backend sends exactly these fields (usersRepo.toPublicAppUser) - the
// provider ids it keys OAuth accounts on, this account's own cashback rate and
// the id of whoever referred it all stay server-side. googleLinked /
// facebookLinked answer the only question the account screen ever asked of
// googleId / facebookId.
export type AppUser = {
  id: number;
  phone: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
  createdAt: string | null;
  referralCode: string | null;
  email: string | null;
  fullName: string | null;
  hasPassword: boolean;
  googleLinked: boolean;
  facebookLinked: boolean;
  // "admin" unlocks the dashboard at /admin for this same account; the
  // backend re-checks users.role on every /admin/* call, so this is only a
  // hint for what to render, never the thing that grants access.
  role: "user" | "admin";
};

export type WalletSummary = {
  paidOrders: number;
  paidAmount: number;
  unpaidOrders: number;
  unpaidAmount: number;
  pendingOrders: number;
  pendingAmount: number;
  paidThisMonth: number;
  availableAmount: number;
  minWithdrawAmount: number;
  pendingWithdrawal: WithdrawalRequest | null;
  // Coins are their own currency at 1 xu = 1d. They are never added to
  // availableAmount; the only place the two meet is a withdrawal request.
  coinBalance: number;
  coinPending: number;
  coinAvailable: number;
  coinWithdrawEnabled: boolean;
};

export type CoinDay = { day: number; reward: number; claimed: boolean; isToday: boolean };

export type CoinStatus = {
  balance: number;
  pending: number;
  available: number;
  streak: number;
  cycleLength: number;
  claimedToday: boolean;
  canClaim: boolean;
  nextReward: number;
  days: CoinDay[];
  today: string;
  msUntilNextDay: number;
  enabled: boolean;
  withdrawEnabled: boolean;
  title: string;
  subtitle: string;
  note: string;
};

// display_order_status: 1=Pending, 2=Completed, 3=Cancelled, 4=Unpaid.
export type DisplayOrderStatus = 1 | 2 | 3 | 4;

// totalCommission (what Shopee paid) and operatorCommission (what we kept)
// are deliberately absent: they are our margin. userCommission is the only
// commission figure a shopper has any use for.
export type Order = {
  id: number;
  orderSn: string;
  userCommission: number | null;
  displayOrderStatus: DisplayOrderStatus | null;
  payoutStatus: "paid" | "unpaid" | "cancelled" | null;
  paidAt: string | null;
  purchaseTime: string | null;
  productName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

// Every commission figure below is already this user's share. Shopee's own
// rate never reaches a client - the API multiplies it by the user's split and
// sends only the result, so there is no raw field here to display by mistake.
// A shop in Shopee's affiliate programme. Only shops that are active, resolved
// to a real shop_id and actually holding products are ever served here, so the
// site can render one without checking whether it leads anywhere.
export type Shop = {
  id: number;
  shopId: string;
  name: string;
  imageUrl: string | null;
  portraitUrl: string | null;
  coverUrl: string | null;
  userCommissionRateText: string | null;
  userCommissionRateValue: number | null;
  rating: number | null;
  soldTotal: number | null;
  followerCount: number | null;
  followersText: string | null;
  productCount: number;
  isFeatured: boolean;
};

// The trimmed shop embedded in each product row, so a card can link to the
// storefront without a request per product.
export type EmbeddedShop = Pick<
  Shop,
  "shopId" | "name" | "imageUrl" | "portraitUrl" | "isFeatured"
>;

export type ShoppingProduct = {
  id: number;
  productId: string;
  name: string;
  priceText: string | null;
  priceValue: number | null;
  revenueText: string | null;
  shopName: string | null;
  userCommissionRateValue: number | null;
  userCommissionValue: number | null;
  productUrl: string | null;
  offerUrl: string | null;
  imageUrl: string | null;
  category: string | null;
  // Null until the shop-name resolver maps this product's `shopName` onto a
  // real Shopee shop, so every consumer has to treat the storefront as
  // optional - plenty of products will never get one.
  shopId: string | null;
  shop: EmbeddedShop | null;
  isBestSeller: boolean;
  isXtraCommission: boolean;
  scrapedAt: string | null;
  updatedAt: string | null;
};

export type ShoppingCategory = { category: string; count: number };

// POST /app/shops/:shopId/open. `tracked` is false when the link carries no sub
// id - a logged-out visitor, or a shop we could not build an affiliate link for
// at all. The buyer earns no cashback in that case, so the UI must not promise
// any; the redirect still happens, because a dead button earns even less.
export type ShopOpenResult = { affiliateUrl: string; tracked: boolean; reused: boolean };

export type ShoppingProductOpenResult = {
  affiliateUrl: string;
  estimate: { userAmount: number; userPct: number | null } | null;
  // Same meaning as ShopOpenResult.tracked: the link always carries the
  // affiliate id, this says whether it also carries a sub id that can pay
  // cashback back to someone. False for a guest.
  tracked: boolean;
  reused: boolean;
};

export type WithdrawalRequest = {
  id: number;
  userId: number;
  amount: number;
  coinAmount?: number;
  method: "bank";
  status: "pending" | "approved" | "rejected" | "paid";
  createdAt: string | null;
  processedAt: string | null;
};

export type CampaignTier = { amount: number; reward: number };

export type CampaignReward = {
  id: number;
  campaignId: number;
  userId: number;
  thresholdAmount: number;
  rewardAmount: number;
  payoutStatus: string;
  campaignTitle?: string;
  createdAt?: string | null;
};

export type Campaign = {
  id: number;
  title: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  tiers: CampaignTier[];
  paidAmount: number;
  rewardsEarned: CampaignReward[];
};

// One person this user invited: a masked phone, how far along they are and
// what they have earned the referrer so far (revoked rows excluded). The
// invitee's own row id and phone digits stay on the server.
export type ReferralInvitee = {
  id: number;
  // Already masked by the backend; masking it again is a no-op.
  referredPhone: string | null;
  status: "pending" | "qualified" | "rewarded";
  // Legacy fixed first-order bonus snapshotted at registration; 0 when the
  // programme runs on percentage only.
  rewardAmount: number | null;
  payoutStatus?: string | null;
  createdAt: string | null;
  qualifiedAt?: string | null;
  commissionTotal: number;
  orderCount: number;
};

// One Completed order placed by an invitee -> one commission row for the
// referrer: `pct` % of the invitee's cashback (`baseAmount`) = `amount`.
export type ReferralCommission = {
  id: number;
  pct: number;
  baseAmount: number;
  amount: number;
  payoutStatus: "unpaid" | "paid" | "revoked";
  paidAt: string | null;
  createdAt: string | null;
  referredPhone: string | null;
  orderSn: string;
  productName: string | null;
  purchaseTime: string | null;
};

// What the programme currently pays, as configured by the admin:
// commissionPct % of every invitee order's cashback, for commissionMonths
// months after they register (0 = no limit), plus an optional fixed
// firstOrderBonus (0 = off) on their first completed order.
export type ReferralProgram = {
  commissionPct: number;
  commissionMonths: number;
  firstOrderBonus: number;
};

export type ReferralStats = {
  totalInvited: number;
  qualified: number;
  bonusTotal: number;
  commissionTotal: number;
  commissionUnpaid: number;
  commissionPaid: number;
  orderCount: number;
  // bonusTotal + commissionTotal
  totalReward: number;
};

export type ReferralView = {
  referralCode: string;
  program: ReferralProgram;
  stats: ReferralStats;
  invited: ReferralInvitee[];
  // Recent per-order history, only sent with the first page (offset 0).
  commissions: ReferralCommission[];
};

export type LinkResult = {
  results?: { shortLink?: string; longLink?: string; itemId?: string }[];
  commission?: unknown;
  pid?: string;
  estimate: { userAmount: number; userPct: number | null } | null;
};

export type LinkHistoryItem = {
  id: number;
  itemId: string | null;
  shopeeUrl: string | null;
  affiliateUrl: string | null;
  estimatedAmount: number | null;
  estimatedPct: number | null;
  createdAt: string | null;
};

export type Bank = { code: string; bin: string; name: string; shortName: string; logoUrl: string | null };

export type Banner = {
  id: number;
  imageUrl: string;
  linkUrl: string | null;
  sortOrder: number;
  // Which carousel the slide belongs to. The app and the website keep separate
  // lists; the backend defaults to "app" when a caller does not say.
  platform?: "app" | "web";

  // The pieces a web slide is built from. The artwork leaves an empty left
  // column and these are drawn as HTML on top of it. All optional - a row with
  // no title is just a picture, which is what an app banner is.
  bgColor?: string | null;
  eyebrow?: string | null;
  title?: string | null;
  body?: string | null;
  imageAlt?: string | null;
  /** Where the copy sits on wide screens: "center" or "top". */
  textAlign?: string | null;
  primaryLabel?: string | null;
  primaryUrl?: string | null;
  secondaryLabel?: string | null;
  secondaryUrl?: string | null;
  // Used instead of the two above for a signed-in member, whom it makes no
  // sense to invite to register.
  memberPrimaryLabel?: string | null;
  memberPrimaryUrl?: string | null;
  memberSecondaryLabel?: string | null;
  memberSecondaryUrl?: string | null;
};

export type OAuthConfig = {
  google: { enabled: true; clientId: string } | { enabled: false };
  facebook: { enabled: true; appId: string } | { enabled: false };
};
