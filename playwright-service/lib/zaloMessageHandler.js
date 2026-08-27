const { getLinkAndCommission } = require('./linkAndCommission');
const { handleCommand } = require('./commands');
const linkTracking = require('./linkTracking');

const WELCOME_TEXT =
  '👋 Chào bạn! Mình là bot tạo link affiliate Shopee.\n\n' +
  '📎 Gửi link sản phẩm Shopee bất kỳ để nhận link affiliate kèm hoa hồng.\n\n' +
  'Các lệnh hỗ trợ:\n' +
  '/sdt <số điện thoại> - lưu SĐT để hoàn tiền khi cần\n' +
  '/thanhtoan <ngân hàng> <số tài khoản> <tên chủ tài khoản> - lưu thông tin nhận hoa hồng\n' +
  '/thanhtoan - xem lại thông tin thanh toán đã lưu';

const NO_LINK_TEXT = 'Vui lòng gửi link sản phẩm Shopee để mình tạo link affiliate nhé 🙂';
const CANNOT_PARSE_TEXT =
  'Mình chưa nhận diện được sản phẩm từ link này, bạn thử gửi link đầy đủ (không phải link rút gọn) xem sao 🙏';

function findShopeeLink(text) {
  const m = (text || '').match(/https?:\/\/(?:s\.shopee\.vn|shope\.ee|shopee\.vn)\/[^\s]+/i);
  return m ? m[0] : null;
}

function isShortLink(link) {
  return /s\.shopee\.vn|shope\.ee/i.test(link);
}

// Short links (s.shopee.vn/shope.ee) redirect to the full product URL, which
// is where the shop/item id lives - follow the redirect manually instead of
// letting fetch chase it, so we can read the Location header directly.
async function resolveFinalUrl(link) {
  if (!isShortLink(link)) return link;
  try {
    const res = await fetch(link, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    const loc = res.headers.get('location');
    return loc || link;
  } catch (err) {
    return link;
  }
}

function extractItemId(url) {
  const m = url.match(/i\.(\d+)\.(\d+)/);
  return m ? m[2] : null;
}

function formatProductReply(result) {
  const first = (result.results && result.results[0]) || null;
  const link = first ? first.shortLink || first.longLink : null;
  const table = (result.commission && result.commission.commissionTable) || [];
  const social = table.find((r) => (r.channel || '').includes('Mạng xã hội')) || table[0] || {};

  const lines = [];
  lines.push(link ? `🔗 Link Affiliate: ${link}` : '⚠️ Không tạo được link affiliate.');
  lines.push('');
  if (result.commission && result.commission.error) {
    lines.push('⚠️ Không tra được hoa hồng cho sản phẩm này.');
  } else {
    lines.push(`💰 Hoa hồng (Mạng xã hội): ${social.xtraCommissionPct || 'N/A'}`);
    lines.push(`📌 Tối đa: ${social.shopeeCommissionPct || 'N/A'}`);
  }
  return lines.join('\n');
}

async function handleProductLink(text, zaloUserId) {
  const foundLink = findShopeeLink(text);
  if (!foundLink) return NO_LINK_TEXT;

  const finalUrl = await resolveFinalUrl(foundLink);
  const itemId = extractItemId(finalUrl);
  if (!itemId) return CANNOT_PARSE_TEXT;

  const tracking = linkTracking.prepareSubId(zaloUserId, null);
  const result = await getLinkAndCommission([finalUrl], tracking.finalSubIds);
  if (tracking.userId) {
    linkTracking.recordLink(tracking.userId, tracking.subId, [finalUrl], result, result.pid);
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
