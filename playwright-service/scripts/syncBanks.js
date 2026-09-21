// Crawls the Vietnamese bank directory (name, short name, logo) from the
// free public VietQR API and stores it locally - both the metadata
// (Postgres, via banksRepo) and the logo images themselves
// (public/bank-logos/) - so the app's bank picker never depends on VietQR
// being reachable at request time. Idempotent (upsert by bank code), so it's
// safe to run manually (`node scripts/syncBanks.js`) or from server startup.
const fs = require('fs');
const path = require('path');
const banksRepo = require('../lib/repositories/banks');

const VIETQR_BANKS_URL = 'https://api.vietqr.io/v2/banks';
const LOGO_DIR = path.join(__dirname, '..', 'public', 'bank-logos');

async function downloadLogo(bank) {
  const ext = path.extname(new URL(bank.logo).pathname) || '.png';
  const fileName = `${bank.code}${ext}`;
  const filePath = path.join(LOGO_DIR, fileName);

  const res = await fetch(bank.logo);
  if (!res.ok) throw new Error(`logo download failed for ${bank.code}: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  return `/bank-logos/${fileName}`;
}

async function syncBanks() {
  fs.mkdirSync(LOGO_DIR, { recursive: true });

  const res = await fetch(VIETQR_BANKS_URL);
  if (!res.ok) throw new Error(`VietQR banks fetch failed: HTTP ${res.status}`);
  const payload = await res.json();
  const banks = payload.data || [];

  const rows = [];
  for (const [index, bank] of banks.entries()) {
    const logoPath = await downloadLogo(bank);
    rows.push({
      code: bank.code,
      bin: bank.bin,
      name: bank.name,
      shortName: bank.shortName,
      logoPath,
      swiftCode: bank.swift_code || null,
      sortOrder: index,
    });
  }

  await banksRepo.upsertMany(rows);
  return rows.length;
}

if (require.main === module) {
  require('dotenv').config();
  syncBanks()
    .then((count) => console.log(`Synced ${count} banks.`))
    .catch((err) => {
      console.error('syncBanks failed:', err);
      process.exitCode = 1;
    });
}

module.exports = { syncBanks };
