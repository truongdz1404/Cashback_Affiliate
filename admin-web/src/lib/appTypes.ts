// DTOs returned by playwright-service's /app/* API, mirrored from the mobile
// app's src/lib/types.ts so the website and the app stay in step. Keep the
// two in sync when the backend changes.

export type AppUser = {
  id: number;
  zaloUserId: string | null;
  phone: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  commissionPct: number | null;
  referralCode: string | null;
  referredByUserId: number | null;
  email: string | null;
  fullName: string | null;
  googleId: string | null;
  facebookId: string | null;
  hasPassword: boolean;
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
};

// display_order_status: 1=Pending, 2=Completed, 3=Cancelled, 4=Unpaid.
export type DisplayOrderStatus = 1 | 2 | 3 | 4;

export type Order = {
  id: number;
  orderSn: string;
  userId: number | null;
  subId: string | null;
  totalCommission: number | null;
  userCommission: number | null;
  operatorCommission: number | null;
  displayOrderStatus: DisplayOrderStatus | null;
  payoutStatus: "paid" | "unpaid" | "cancelled" | null;
  paidAt: string | null;
  purchaseTime: string | null;
  productName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

// userCommissionRateValue / userCommissionValue are what THIS user actually
// receives. Never display the raw commissionRateValue / commissionValue -
// those are the operator-side gross figures and overstate the cashback.
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
  commissionRateText: string | null;
  commissionRateValue: number | null;
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
  "shopId" | "name" | "imageUrl" | "portraitUrl" | "commissionRateText" | "isFeatured"
>;

export type ShoppingProduct = {
  id: number;
  productId: string;
  name: string;
  priceText: string | null;
  priceValue: number | null;
  revenueText: string | null;
  shopName: string | null;
  commissionRateText: string | null;
  commissionText: string | null;
  commissionRateValue: number | null;
  commissionValue: number | null;
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
  reused: boolean;
};

export type WithdrawalRequest = {
  id: number;
  userId: number;
  amount: number;
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

// referrals.listForReferrer returns the whole Referral row with the invitee's
// phone folded in as referredPhone - not a `phone` field. commissionTotal /
// orderCount are the per-order referral commissions this invitee has earned
// the referrer so far (revoked rows excluded).
export type ReferralInvitee = {
  id: number;
  referrerUserId: number;
  referredUserId: number;
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
  referralId: number;
  referrerUserId: number;
  referredUserId: number;
  orderId: number;
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
  userId: number;
  itemId: string | null;
  subId: string | null;
  shopeeUrl: string | null;
  affiliateUrl: string | null;
  estimatedAmount: number | null;
  estimatedPct: number | null;
  createdAt: string | null;
};

export type Bank = { code: string; bin: string; name: string; shortName: string; logoUrl: string | null };

export type Banner = { id: number; imageUrl: string; linkUrl: string | null; sortOrder: number };

export type OAuthConfig = {
  google: { enabled: true; clientId: string } | { enabled: false };
  facebook: { enabled: true; appId: string } | { enabled: false };
};
