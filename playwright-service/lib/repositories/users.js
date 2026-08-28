const crypto = require('crypto');
const { Prisma } = require('@prisma/client');
const prisma = require('../prisma');
const passwordHash = require('../passwordHash');

async function getOrCreateUserByZaloId(zaloUserId) {
  const existing = await prisma.user.findUnique({ where: { zaloUserId } });
  if (existing) return existing;

  return prisma.user.create({ data: { zaloUserId } });
}

// Used to decide whether to send the one-time welcome message - checked
// (and the row created via getOrCreateUserByZaloId) before any command
// handling runs, so a user's very first message is always caught regardless
// of what it says (invalid command, plain text, etc).
async function isNewUser(zaloUserId) {
  const row = await prisma.user.findUnique({ where: { zaloUserId }, select: { id: true } });
  return !row;
}

async function updatePhone(zaloUserId, phone) {
  const user = await getOrCreateUserByZaloId(zaloUserId);
  return prisma.user.update({ where: { id: user.id }, data: { phone } });
}

async function updatePayment(zaloUserId, { bankName, accountNumber, accountHolder }) {
  const user = await getOrCreateUserByZaloId(zaloUserId);
  return prisma.user.update({
    where: { id: user.id },
    data: { bankName, bankAccountNumber: accountNumber, bankAccountHolder: accountHolder },
  });
}

async function getPayment(zaloUserId) {
  return prisma.user.findUnique({ where: { zaloUserId } });
}

// Per-user commission_pct override (nullable). Null means "use the
// system-wide default from lib/repositories/settings.js". Admin-facing only
// (unlike getById, which internal bot logic reads fields from) - safe to
// return as-is.
async function setCommissionPct(userId, pct) {
  return prisma.user.update({
    where: { id: Number(userId) },
    data: { commissionPct: pct === null || pct === undefined ? null : Number(pct) },
  });
}

// Admin-facing only.
async function listAll() {
  return prisma.user.findMany({ orderBy: { id: 'desc' } });
}

async function getById(userId) {
  return prisma.user.findUnique({ where: { id: Number(userId) } });
}

// Used by the admin dashboard's edit-in-place forms - any field left
// undefined/null is left unchanged rather than cleared.
async function updateProfileById(userId, { phone, bankName, bankAccountNumber, bankAccountHolder } = {}) {
  const current = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!current) return null;
  return prisma.user.update({
    where: { id: Number(userId) },
    data: {
      phone: phone ?? current.phone,
      bankName: bankName ?? current.bankName,
      bankAccountNumber: bankAccountNumber ?? current.bankAccountNumber,
      bankAccountHolder: bankAccountHolder ?? current.bankAccountHolder,
    },
  });
}

async function findByPhone(phone) {
  return prisma.user.findFirst({ where: { phone } });
}

async function findByGoogleId(googleId) {
  return prisma.user.findUnique({ where: { googleId } });
}

async function findByFacebookId(facebookId) {
  return prisma.user.findUnique({ where: { facebookId } });
}

async function findByEmail(email) {
  if (!email) return null;
  return prisma.user.findUnique({ where: { email } });
}

// First Google/Facebook sign-in for this provider id: reuse an existing row
// matched by email (e.g. already registered by phone with the same email on
// file) so order history carries over, same idea as phone-matching in
// /app/register; otherwise create a fresh app-only user.
async function findOrCreateOAuthUser({ provider, providerId, email, name }) {
  const existingByProvider = provider === 'google' ? await findByGoogleId(providerId) : await findByFacebookId(providerId);
  if (existingByProvider) return existingByProvider;

  const providerColumn = provider === 'google' ? { googleId: providerId } : { facebookId: providerId };
  const existingByEmail = await findByEmail(email);
  if (existingByEmail) {
    return prisma.user.update({
      where: { id: existingByEmail.id },
      data: { ...providerColumn, fullName: existingByEmail.fullName ?? name ?? null },
    });
  }

  const zaloUserId = `app:${crypto.randomBytes(8).toString('hex')}`;
  return prisma.user.create({
    data: {
      zaloUserId,
      email: email || null,
      fullName: name || null,
      ...providerColumn,
    },
  });
}

async function findByReferralCode(code) {
  if (!code) return null;
  return prisma.user.findUnique({ where: { referralCode: code } });
}

// referral_code is generated lazily (on first need) rather than at row
// creation time, so bot-created rows (which never call this) don't carry
// dead codes. Collision retry is essentially never hit at this scale but
// costs nothing to guard.
function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex');
}

async function ensureReferralCode(userId) {
  const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!user) return null;
  if (user.referralCode) return user.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      await prisma.user.update({ where: { id: Number(userId) }, data: { referralCode: code } });
      return code;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
    }
  }
  throw new Error('could not generate a unique referral code');
}

// Registers a brand-new app user. Callers must have already checked the
// phone isn't taken (see server.js POST /app/register) - this always
// inserts a fresh row rather than merging into an existing bot-created one.
// zalo_user_id is a synthetic "app:<hex>" placeholder so it satisfies the
// existing UNIQUE NOT NULL constraint without colliding with a real numeric
// Zalo ID.
async function createAppUser(phone, password, referredByUserId) {
  const zaloUserId = `app:${crypto.randomBytes(8).toString('hex')}`;
  const hash = passwordHash.hashPassword(password);
  return prisma.user.create({
    data: {
      zaloUserId,
      phone,
      passwordHash: hash,
      referredByUserId: referredByUserId ?? null,
    },
  });
}

// Attaches app login to an existing bot-created row found by phone, so the
// user inherits their prior order history instead of starting a fresh row.
async function setPassword(userId, password) {
  const hash = passwordHash.hashPassword(password);
  return prisma.user.update({ where: { id: Number(userId) }, data: { passwordHash: hash } });
}

async function setReferredBy(userId, referredByUserId) {
  await prisma.user.update({ where: { id: Number(userId) }, data: { referredByUserId: Number(referredByUserId) } });
}

async function verifyLogin(phone, password) {
  const user = await findByPhone(phone);
  if (!user || !user.passwordHash) return null;
  if (!passwordHash.verifyPassword(password, user.passwordHash)) return null;
  return user;
}

// App-facing responses must never leak passwordHash - strip it rather than
// remembering to omit it at every call site.
function toPublicAppUser(user) {
  if (!user) return null;
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

module.exports = {
  getOrCreateUserByZaloId,
  updatePhone,
  updatePayment,
  getPayment,
  isNewUser,
  setCommissionPct,
  listAll,
  getById,
  updateProfileById,
  findByPhone,
  findByGoogleId,
  findByFacebookId,
  findByEmail,
  findOrCreateOAuthUser,
  findByReferralCode,
  ensureReferralCode,
  createAppUser,
  setPassword,
  setReferredBy,
  verifyLogin,
  toPublicAppUser,
};
