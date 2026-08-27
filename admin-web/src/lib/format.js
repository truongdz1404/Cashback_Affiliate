export function formatAmount(n) {
  const value = Number(n) || 0;
  return value.toLocaleString("vi-VN") + " ₫";
}

export function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("vi-VN");
}

export const DISPLAY_STATUS_LABELS = {
  1: "Đang chờ",
  2: "Hoàn thành",
  3: "Đã huỷ",
  4: "Chưa thanh toán (Shopee)",
};

export function displayStatusLabel(status) {
  if (status === null || status === undefined) return "Không rõ";
  return DISPLAY_STATUS_LABELS[Number(status)] || `Trạng thái ${status}`;
}
