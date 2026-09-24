const crypto = require('crypto');
const prisma = require('./prisma');
const { hashPassword, verifyPassword } = require('./passwordHash');
const mailer = require('./mailer');

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function generateOtp() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Sends a 6-digit code to `newEmail` and stores its hash tied to `userId`.
// Does not touch users.email - that only happens in verifyOtp, once the
// caller has proven control of the address.
async function requestOtp(userId, newEmail) {
  const pending = await prisma.emailVerification.findFirst({
    where: { userId, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (pending && Date.now() - pending.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - pending.createdAt.getTime())) / 1000);
    throw httpError(429, `vui long doi ${waitSec}s truoc khi gui lai ma`);
  }

  const otp = generateOtp();
  await prisma.emailVerification.create({
    data: {
      userId,
      newEmail,
      codeHash: hashPassword(otp),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  await mailer.sendMail({
    to: newEmail,
    subject: 'Ma xac thuc email',
    text: `Ma xac thuc cua ban la: ${otp}\nMa co hieu luc trong 10 phut. Neu khong phai ban yeu cau, vui long bo qua email nay.`,
    html: `<p>Ma xac thuc cua ban la: <strong style="font-size:22px">${otp}</strong></p><p>Ma co hieu luc trong 10 phut. Neu khong phai ban yeu cau, vui long bo qua email nay.</p>`,
  });
}

// Verifies the latest un-consumed code for (userId, newEmail) and, on match,
// consumes it. Caller (server.js) is responsible for actually writing the
// new email onto the user row - kept separate so a P2002 (email taken by
// someone else in the meantime) can be handled without leaving the code
// consumed.
async function verifyOtp(userId, newEmail, otp) {
  const record = await prisma.emailVerification.findFirst({
    where: { userId, newEmail, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw httpError(400, 'khong co yeu cau xac thuc nao dang cho - vui long gui lai ma');
  if (record.expiresAt.getTime() < Date.now()) throw httpError(400, 'ma da het han - vui long gui lai ma');
  if (record.attempts >= MAX_ATTEMPTS) throw httpError(429, 'sai qua nhieu lan - vui long gui lai ma');

  if (!verifyPassword(String(otp || ''), record.codeHash)) {
    await prisma.emailVerification.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    throw httpError(400, 'ma xac thuc khong dung');
  }

  await prisma.emailVerification.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
}

module.exports = { requestOtp, verifyOtp };
