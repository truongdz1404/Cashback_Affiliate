const { getLinkAndCommission } = require('./linkAndCommission');
const { handleCommand } = require('./commands');
const linkTracking = require('./linkTracking');

const WELCOME_TEXT =
  '👋 Chào bạn! Mình là bot tạo link mua hàng hoàn tiền Shopee.\n\n' +
  '📎 Gửi link sản phẩm Shopee bất kỳ để nhận link mua hàng hoàn tiền kèm số tiền hoàn ước tính.\n\n' +
  'Các lệnh hỗ trợ:\n' +
  '/sdt <số điện thoại> - lưu SĐT để hoàn tiền khi cần\n' +
  '/thanhtoan <ngân hàng> <số tài khoản> <tên chủ tài khoản> - lưu thông tin nhận hoa hồng\n' +
  '/thanhtoan - xem lại thông tin thanh toán đã lưu';

const NO_LINK_TEXT = 'Vui lòng gửi link sản phẩm Shopee để mình tạo link mua hàng hoàn tiền nhé 🙂';
const CANNOT_PARSE_TEXT =
  'Mình chưa nhận diện được sản phẩm từ link này, bạn thử gửi link đầy đủ (không phải link rút gọn) xem sao 🙏';

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

function formatProductReply(result) {
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
    lines.push(`💰 Số tiền hoàn ước tính: ${formatAmount(social.totalAmount)} (${formatPct(social.totalPct)})`);
  }
  return lines.join('\n');
}

async function handleProductLink(text, zaloUserId) {
  const foundLink = findShopeeLink(text);
  if (!foundLink) return NO_LINK_TEXT;

  // getLinkAndCommission resolves short links and extracts the itemId itself
  // (see customLink.js) - no need to pre-resolve the redirect here.
  const tracking = linkTracking.prepareSubId(zaloUserId, null);
  const result = await getLinkAndCommission([foundLink], tracking.finalSubIds);
  if (!result.pid) return CANNOT_PARSE_TEXT;

  if (tracking.userId) {
    linkTracking.recordLink(tracking.userId, tracking.subId, [foundLink], result, result.pid);
  }
  return formatProductReply(result);
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

module.exports = { handleIncomingMessage, WELCOME_TEXT };
