const usersRepo = require('./repositories/users');

const HELP_TEXT =
  'Lệnh không hợp lệ. Các lệnh hỗ trợ:\n' +
  '/sdt <số điện thoại>\n' +
  '   Ví dụ: /sdt 0901234567\n' +
  '/thanhtoan <ngân hàng> <số tài khoản> <tên chủ tài khoản>\n' +
  '   Ví dụ: /thanhtoan Vietcombank 0071000123456 NGUYEN VAN A\n' +
  '/thanhtoan (xem thông tin đã lưu)';

function formatPaymentInfo(user) {
  if (!user || (!user.bankName && !user.bankAccountNumber)) {
    return 'Bạn chưa cấu hình thông tin thanh toán.\nDùng lệnh: /thanhtoan <ngân hàng> <số tài khoản> <tên chủ tài khoản>';
  }
  return (
    `💳 Thông tin thanh toán hiện tại:\n` +
    `Ngân hàng: ${user.bankName || 'N/A'}\n` +
    `Số tài khoản: ${user.bankAccountNumber || 'N/A'}\n` +
    `Chủ tài khoản: ${user.bankAccountHolder || 'N/A'}`
  );
}

// Handles a slash command and returns the reply text. Persists any change
// (phone/payment) via the users repo directly - no HTTP hop needed now that
// this runs in the same process as the DB.
async function handleCommand(text, zaloUserId) {
  const trimmed = (text || '').trim();

  if (/^\/sdt\b/i.test(trimmed)) {
    const phone = trimmed.split(/\s+/)[1];
    if (!phone || !/^0\d{9,10}$/.test(phone)) {
      return 'Cú pháp: /sdt 0901234567 (số điện thoại Việt Nam, bắt đầu bằng 0)';
    }
    await usersRepo.updatePhone(zaloUserId, phone);
    return `✅ Đã lưu số điện thoại ${phone} để hoàn tiền sau này.`;
  }

  if (/^\/thanhtoan\b/i.test(trimmed)) {
    const rest = trimmed.replace(/^\/thanhtoan\s*/i, '').trim();
    if (!rest) {
      return formatPaymentInfo(await usersRepo.getPayment(zaloUserId));
    }
    const parts = rest.split(/\s+/);
    if (parts.length < 3) {
      return (
        'Cú pháp: /thanhtoan <ngân hàng> <số tài khoản> <tên chủ tài khoản>\n' +
        'Ví dụ: /thanhtoan Vietcombank 0071000123456 NGUYEN VAN A'
      );
    }
    const [bankName, accountNumber, ...holderParts] = parts;
    const accountHolder = holderParts.join(' ');
    await usersRepo.updatePayment(zaloUserId, { bankName, accountNumber, accountHolder });
    return (
      `✅ Đã lưu thông tin thanh toán:\n` +
      `Ngân hàng: ${bankName}\n` +
      `Số tài khoản: ${accountNumber}\n` +
      `Chủ tài khoản: ${accountHolder}`
    );
  }

  return HELP_TEXT;
}

module.exports = { handleCommand };
