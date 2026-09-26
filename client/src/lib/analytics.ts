// The shape of GET /api/analytics, shared by the reports screen and the
// dashboard so the two can never disagree about what a field means. Mirrors
// api/lib/repositories/analytics.js - change one and change the other.

export type AnalyticsTotals = {
  orders: number;
  completedOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  buyers: number;
  totalCommission: number;
  userCommission: number;
  operatorCommission: number;
  paidAmount: number;
  unpaidAmount: number;
  newUsers: number;
  withdrawals: number;
  withdrawalAmount: number;
  withdrawalsPaid: number;
  withdrawalPaidAmount: number;
  referralCommissions: number;
  referralAmount: number;
  avgCommissionPerOrder: number;
};

export type AnalyticsPoint = {
  date: string;
  orders: number;
  completedOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  buyers: number;
  totalCommission: number;
  userCommission: number;
  operatorCommission: number;
  paidAmount: number;
  unpaidAmount: number;
  newUsers: number;
  withdrawals: number;
  withdrawalAmount: number;
};

export type Analytics = {
  range: { from: string; to: string; days: number; previousFrom: string; previousTo: string };
  totals: AnalyticsTotals;
  previous: AnalyticsTotals;
  series: AnalyticsPoint[];
  topProducts: { name: string; orders: number; userCommission: number; totalCommission: number }[];
  topCustomers: {
    userId: number;
    fullName: string | null;
    phone: string | null;
    email: string | null;
    orders: number;
    completedOrders: number;
    userCommission: number;
  }[];
  statusMix: { status: number | null; orders: number; userCommission: number }[];
};

/** A share of something that did not happen is 0, not NaN. */
export function share(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}
