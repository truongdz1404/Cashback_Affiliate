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
  isBestSeller: boolean;
  isXtraCommission: boolean;
  scrapedAt: string | null;
  updatedAt: string | null;
};

export type ShoppingCategory = { category: string; count: number };

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
// phone folded in as referredPhone - not a `phone` field.
export type ReferralInvitee = {
  id: number;
  referrerUserId: number;
  referredUserId: number;
  referredPhone: string | null;
  status: "pending" | "qualified" | "rewarded";
  rewardAmount: number | null;
  payoutStatus?: string | null;
  createdAt: string | null;
  qualifiedAt?: string | null;
};

export type ReferralView = {
  referralCode: string;
  stats: { totalInvited: number; qualified: number; totalReward: number };
  invited: ReferralInvitee[];
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
