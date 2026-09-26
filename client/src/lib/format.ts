export function formatAmount(n: number | string | null | undefined): string {
  const value = Number(n) || 0;
  return value.toLocaleString("vi-VN") + " ₫";
}

// Matches the mobile app's formatVnd (src/lib/format.ts) exactly, so the same
// balance never reads differently on the phone and on the web.
export function formatVnd(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0đ";
  return `${Math.round(n).toLocaleString("vi-VN")}đ`;
}

export function formatPct(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n * 10) / 10}%`;
}

// The backend hands back bare "YYYY-MM-DD HH:mm:ss" strings from the DB with
// no zone marker; the mobile app reads those as UTC, so the web must too or
// every timestamp shifts by the local offset.
//
// orders.purchase_time is a different animal: Shopee reports it as a Unix
// timestamp and the column is TEXT, so it arrives as "1787855363". Passing
// that digit string to `new Date()` yields Invalid Date, which is why every
// "Ngày mua" column used to render "-". Seconds vs milliseconds is decided by
// magnitude, the same rule the API uses in repositories/referralCommissions.js.
function toDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  let raw = value;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    raw = Number(raw.trim());
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    raw = raw > 1e12 ? raw : raw * 1000;
  }
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) {
    raw = `${raw.slice(0, 10)}T${raw.slice(11, 19)}Z`;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "-";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "-";
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const DISPLAY_STATUS_LABELS: Record<number, string> = {
  1: "Đang chờ",
  2: "Hoàn thành",
  3: "Đã huỷ",
  4: "Chưa thanh toán (Shopee)",
};

export function displayStatusLabel(status: number | string | null | undefined): string {
  if (status === null || status === undefined) return "Không rõ";
  return DISPLAY_STATUS_LABELS[Number(status)] || `Trạng thái ${status}`;
}

// The app's own wording for the same four states (src/lib/format.ts
// STATUS_LABELS) - shorter, and what users already recognise from the phone.
export const ORDER_STATUS_LABELS: Record<number, string> = {
  1: "Chờ xác nhận",
  2: "Hoàn thành",
  3: "Đã huỷ",
  4: "Chưa thanh toán",
};

export function orderStatusLabel(status: number | null | undefined): string {
  if (status === null || status === undefined) return "Không rõ";
  return ORDER_STATUS_LABELS[Number(status)] || "Không rõ";
}

export const WITHDRAWAL_STATUS_LABELS: Record<string, string> = {
  pending: "Đang chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Bị từ chối",
  paid: "Đã thanh toán",
};

export function displayName(user: { fullName?: string | null; phone?: string | null } | null): string {
  return user?.fullName || user?.phone || "Cộng tác viên";
}

// All but the last 2 digits masked, same as the app's profile screen.
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "-";
  if (phone.length <= 2) return phone;
  return "*".repeat(phone.length - 2) + phone.slice(-2);
}
