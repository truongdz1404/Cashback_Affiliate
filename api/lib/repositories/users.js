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
async function updateProfileById(userId, { phone, bankName, bankAccountNumber, bankAccountHolder, fullName, email } = {}) {
  const current = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!current) return null;
  return prisma.user.update({
    where: { id: Number(userId) },
    data: {
      phone: phone ?? current.phone,
      bankName: bankName ?? current.bankName,
      bankAccountNumber: bankAccountNumber ?? current.bankAccountNumber,
      bankAccountHolder: bankAccountHolder ?? current.bankAccountHolder,
      fullName: fullName ?? current.fullName,
      email: email ?? current.email,
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

// email is @unique but stored as typed; compare case-insensitively so the
// role tooling finds "Foo@Gmail.com" when asked for "foo@gmail.com".
async function findByEmail(email) {
  if (!email) return null;
  return prisma.user.findFirst({ where: { email: { equals: String(email).trim(), mode: 'insensitive' } } });
}

const ROLES = ['user', 'admin'];

// Admin-facing only (PUT /admin/users/:id/role and scripts/set-role.js).
// Returns null when the row doesn't exist rather than throwing Prisma's P2025.
async function setRole(userId, role) {
  if (!ROLES.includes(role)) throw new Error(`role must be one of: ${ROLES.join(', ')}`);
  const id = Number(userId);
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return null;
  return prisma.user.update({ where: { id }, data: { role } });
}

async function countAdmins() {
  return prisma.user.count({ where: { role: 'admin' } });
}

// First Google/Facebook sign-in for this provider id: create a fresh
// app-only user. Deliberately does NOT match/merge onto an existing row by
// email: email is a free-text, unverified field a user can set to anything
// via PUT /app/me (see server.js), so matching on it let an attacker
// pre-register a phone/password account with a victim's real email address
// and "claim" it - when the victim later signed in with Google/Facebook
// using that same (verified, but merely email-matching) address, they'd be
// silently logged into the attacker's account instead of getting their own,
// handing the attacker control of any bank details the victim then entered.
// A provider id (Google/Facebook sub) is unforgeable proof of ownership;
// a bare email string on our own row is not - so only the former may merge.
// Returns { user, created }. `created` is what the referral code hangs off:
// a social sign-in is a sign-up only the first time, and an existing account
// signing back in must never be credited to an inviter again.
async function findOrCreateOAuthUser({ provider, providerId, email, name }) {
  const existingByProvider = provider === 'google' ? await findByGoogleId(providerId) : await findByFacebookId(providerId);
  if (existingByProvider) return { user: existingByProvider, created: false };

  const providerColumn = provider === 'google' ? { googleId: providerId } : { facebookId: providerId };
  const zaloUserId = `app:${crypto.randomBytes(8).toString('hex')}`;
  try {
    const user = await prisma.user.create({
      data: {
        zaloUserId,
        email: email || null,
        fullName: name || null,
        ...providerColumn,
      },
    });
    return { user, created: true };
  } catch (err) {
    // email is @unique - if some other row already holds this address (most
    // likely someone squatted it via the free-text PUT /app/me email field,
    // see the comment above), don't block this real, verified sign-in over
    // it: create the account without the email rather than 500ing.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const user = await prisma.user.create({
        data: { zaloUserId, email: null, fullName: name || null, ...providerColumn },
      });
      return { user, created: true };
    }
    throw err;
  }
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

// Used by PUT /app/password before allowing a change. Accounts that signed
// up via OAuth and never set a password have no passwordHash yet - treat
// that as nothing to verify rather than an automatic rejection.
async function verifyPassword(userId, password) {
  const user = await getById(userId);
  if (!user || !user.passwordHash) return true;
  return passwordHash.verifyPassword(password, user.passwordHash);
}

// App-facing responses list what goes out rather than what stays in. Spreading
// the row and deleting passwordHash meant every column added to User since
// then shipped to the client by default, which is how googleId, facebookId and
// zaloUserId - the identifiers our OAuth providers key accounts on - ended up
// in a response the account screen renders. Nothing here is rendered as an id:
// the screens that used to read those fields only ever asked "is this account
// linked?", so they get that answer as a boolean instead.
//
// commissionPct is left out for a different reason: it is this user's own
// cashback rate, set per account by an operator, and showing it invites
// "why does he get more than me". referredByUserId is left out because it is
// somebody else's row id.
//
// `role` is deliberately kept: the website reads it to decide whether to show
// the admin entry point at all (it's not a secret - the /admin/* API re-checks
// the DB on every call).
function toPublicAppUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    fullName: user.fullName,
    bankName: user.bankName,
    bankAccountNumber: user.bankAccountNumber,
    bankAccountHolder: user.bankAccountHolder,
    referralCode: user.referralCode,
    role: user.role || 'user',
    coinStreak: user.coinStreak,
    lastCheckinDate: user.lastCheckinDate,
    createdAt: user.createdAt,
    hasPassword: Boolean(user.passwordHash),
    googleLinked: Boolean(user.googleId),
    facebookLinked: Boolean(user.facebookId),
  };
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
  setRole,
  countAdmins,
  ROLES,
  findOrCreateOAuthUser,
  findByReferralCode,
  ensureReferralCode,
  createAppUser,
  setPassword,
  setReferredBy,
  verifyLogin,
  verifyPassword,
  toPublicAppUser,
};
