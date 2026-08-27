const crypto = require('crypto');
const db = require('../db');

function generateSubId() {
  return crypto.randomBytes(5).toString('hex');
}

function saveLink({ userId, subId, itemId, shopeeUrl, affiliateUrl }) {
  db.prepare(
    `INSERT INTO links (user_id, item_id, sub_id, shopee_url, affiliate_url)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, itemId || null, subId, shopeeUrl || null, affiliateUrl || null);
  return db.prepare('SELECT * FROM links WHERE sub_id = ?').get(subId);
}

function findBySubId(subId) {
  return db.prepare('SELECT * FROM links WHERE sub_id = ?').get(subId) || null;
}

module.exports = { generateSubId, saveLink, findBySubId };
