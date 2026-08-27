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

function isShortLink(link) {
  let host;
  try {
    host = new URL(link).hostname.toLowerCase();
  } catch (err) {
    return false;
  }
  return /(?:^|\.)(?:shp\.ee|shope\.ee)$/.test(host) || /^s\.shopee\./.test(host);
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

// Shopee has used two URL shapes for the shop/item id pair: the older
// "...-i.{shopId}.{itemId}" slug suffix, and the newer "/product/{shopId}/{itemId}"
// path (what shortlinks like shp.ee currently redirect to).
function extractItemId(url) {
  const m = url.match(/i\.(\d+)\.(\d+)/) || url.match(/\/product\/(\d+)\/(\d+)(?:[/?]|$)/);
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
