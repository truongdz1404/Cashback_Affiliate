const BOT_TOKEN = process.env.ZALO_BOT_TOKEN;

function apiBase() {
  if (!BOT_TOKEN || BOT_TOKEN === 'change-me') {
    throw new Error('ZALO_BOT_TOKEN is not configured on the server (.env)');
  }
  return `https://bot-api.zaloplatforms.com/bot${BOT_TOKEN}`;
}

async function sendMessage(chatId, text) {
  const response = await fetch(`${apiBase()}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Zalo sendMessage failed: ${response.status} ${body}`);
  }
  return response.json().catch(() => null);
}

module.exports = { sendMessage };
