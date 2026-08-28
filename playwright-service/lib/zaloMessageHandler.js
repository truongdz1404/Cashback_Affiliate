const { getLinkAndCommission } = require('./linkAndCommission');
const { handleCommand } = require('./commands');
const linkTracking = require('./linkTracking');
const usersRepo = require('./repositories/users');
const { getEffectivePct, splitAmount } = require('./commissionSplit');

const WELCOME_TEXT =
  '👋 Chào bạn! Mình là bot tạo link mua hàng hoàn tiền Shopee.\n\n' +
  '📎 Gửi link sản phẩm Shopee bất kỳ để nhận link mua hàng hoàn tiền kèm số tiền hoàn ước tính.\n\n' +
  '⚠️ Lưu ý khi dán link: Zalo hay tự tạo 1 thẻ xem trước (có hình ảnh, tên sản phẩm) ngay bên dưới link bạn vừa dán. ' +
  'Trước khi bấm Gửi, bạn bấm dấu ✕ ở góc thẻ xem trước đó để xoá nó đi (chỉ xoá thẻ preview thôi, link chữ vẫn còn nguyên), ' +
  'rồi mới gửi tin nhắn - nếu không, tin nhắn có thể bị lỗi và mình sẽ không nhận được link.\n\n' +
  'Các lệnh hỗ trợ:\n' +
  '/sdt <số điện thoại> - lưu SĐT để hoàn tiền khi cần\n' +
  '   Ví dụ: /sdt 0901234567\n' +
  '/thanhtoan <ngân hàng> <số tài khoản> <tên chủ tài khoản> - lưu thông tin nhận hoa hồng\n' +
  '   Ví dụ: /thanhtoan Vietcombank 0071000123456 NGUYEN VAN A\n' +
  '/thanhtoan - xem lại thông tin thanh toán đã lưu';

const NO_LINK_TEXT =
  'Vui lòng gửi link sản phẩm Shopee để mình tạo link mua hàng hoàn tiền nhé 🙂\n\n' +
  '⚠️ Nếu bạn vừa dán link mà không thấy mình phản hồi đúng, có thể do Zalo đã tự tạo thẻ xem trước cho link đó - ' +
  'bạn thử bấm dấu ✕ để xoá thẻ xem trước rồi gửi lại nhé.';
const CANNOT_PARSE_TEXT =
  'Mình chưa nhận diện được sản phẩm từ link này, bạn thử gửi link đầy đủ (không phải link rút gọn) xem sao 🙏';

// Sent when Zalo delivers a message.unsupported.received event: this happens
// when Zalo auto-turns a bare link into a rich preview card - the webhook
// payload carries no text at all in that case, so there's nothing to parse,
// only guidance to send.
const UNSUPPORTED_LINK_TEXT =
  '😅 Mình không đọc được nội dung bạn vừa gửi. Đây là do Zalo đã tự tạo 1 thẻ xem trước (hình ảnh + tên sản phẩm) cho link bạn dán, ' +
  'nên tin nhắn gửi đi không còn giữ link nữa.\n\n' +
  'Bạn gửi lại giúp mình nhé: sau khi dán link, bấm dấu ✕ ở góc thẻ xem trước để xoá nó đi (link chữ vẫn còn), rồi mới bấm Gửi.';

// Matches any host that is (or is a subdomain of) shopee.<tld>, shp.ee, or
// shope.ee - covers full product links, the older s.shopee.vn/shope.ee short
// links, and the newer shp.ee short links (e.g. vn.shp.ee), across regions.
const SHOPEE_HOST_RE = /(?:^|\.)(?:shopee\.[a-z.]{2,12}|shp\.ee|shope\.ee)$/i;

function findShopeeLink(text) {
  const candidates = (text || '').match(/https?:\/\/[^\s]+/g);
  if (!candidates) return null;
  return (
    candidates.find((url) => {
      try {
        return SHOPEE_HOST_RE.test(new URL(url).hostname);
      } catch (err) {
        return false;
      }
    }) || null
  );
}

function formatAmount(n) {
  return `₫${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function formatPct(n) {
  const s = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return `${s}%`;
}

function formatProductReply(result, effectivePct) {
  const first = (result.results && result.results[0]) || null;
  const link = first ? first.shortLink || first.longLink : null;
  const table = (result.commission && result.commission.commissionTable) || [];
  const social = table.find((r) => (r.channel || '').includes('Mạng xã hội')) || table[0] || {};

  const lines = [];
  lines.push(link ? `🔗 Link mua hàng hoàn tiền: ${link}` : '⚠️ Không tạo được link mua hàng hoàn tiền.');
  lines.push('');
  if ((result.commission && result.commission.error) || social.totalAmount === null || social.totalAmount === undefined) {
    lines.push('⚠️ Không tra được số tiền hoàn cho sản phẩm này.');
  } else {
    // Only the user's share (effectivePct% of the total commission Shopee
    // pays) is ever shown to the end user - the rest is kept as the
    // operator's cut, tracked separately once the order is reconciled.
    const { userAmount } = splitAmount(social.totalAmount, effectivePct);
    const userPct = social.totalPct === null || social.totalPct === undefined ? null : (social.totalPct * effectivePct) / 100;
    lines.push(
      userPct === null
        ? `💰 Số tiền hoàn ước tính: ${formatAmount(userAmount)}`
        : `💰 Số tiền hoàn ước tính: ${formatAmount(userAmount)} (${formatPct(userPct)})`
    );
  }
  return lines.join('\n');
}

async function handleProductLink(text, zaloUserId) {
  const foundLink = findShopeeLink(text);
  if (!foundLink) return NO_LINK_TEXT;

  // getLinkAndCommission resolves short links and extracts the itemId itself
  // (see customLink.js) - no need to pre-resolve the redirect here.
  const tracking = await linkTracking.prepareSubId(zaloUserId, null);
  const result = await getLinkAndCommission([foundLink], tracking.finalSubIds);
  if (!result.pid) return CANNOT_PARSE_TEXT;

  if (tracking.userId) {
    await linkTracking.recordLink(tracking.userId, tracking.subId, [foundLink], result, result.pid);
  }
  const user = tracking.userId ? await usersRepo.getById(tracking.userId) : null;
  return formatProductReply(result, await getEffectivePct(user));
}

// Returns the reply text for one incoming text message. Slash commands are
// handled synchronously against the DB; anything else is treated as a
// product-link request.
async function handleIncomingMessage(text, zaloUserId) {
  const trimmed = (text || '').trim();
  if (trimmed.startsWith('/')) {
    return handleCommand(trimmed, zaloUserId);
  }
  return handleProductLink(trimmed, zaloUserId);
}

module.exports = { handleIncomingMessage, WELCOME_TEXT, UNSUPPORTED_LINK_TEXT };
