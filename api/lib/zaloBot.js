const configStore = require('./configStore');

async function apiBase() {
  const token = await configStore.get('zaloBotToken');
  if (!token) {
    throw new Error('ZALO_BOT_TOKEN is not configured (.env or admin dashboard)');
  }
  return `https://bot-api.zaloplatforms.com/bot${token}`;
}

async function sendMessage(chatId, text) {
  const response = await fetch(`${await apiBase()}/sendMessage`, {
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
