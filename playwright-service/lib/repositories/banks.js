const prisma = require('../prisma');

// row.logoPath is relative (e.g. "/bank-logos/ICB.png"); served under the
// same /app prefix as the rest of the mobile API (see server.js static route).
function toPublicBank(row, baseUrl) {
  return {
    code: row.code,
    bin: row.bin,
    name: row.name,
    shortName: row.shortName,
    logoUrl: `${baseUrl}/app${row.logoPath}`,
  };
}

async function listAll() {
  return prisma.bank.findMany({ orderBy: [{ sortOrder: 'asc' }, { shortName: 'asc' }] });
}

async function count() {
  return prisma.bank.count();
}

async function upsertMany(banks) {
  for (const bank of banks) {
    await prisma.bank.upsert({
      where: { code: bank.code },
      create: bank,
      update: bank,
    });
  }
}

module.exports = { toPublicBank, listAll, count, upsertMany };
