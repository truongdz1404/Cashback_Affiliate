const { Prisma } = require('@prisma/client');
const prisma = require('../prisma');
const coinsRepo = require('./coins');

// Requests still in 'pending' or already 'approved' both hold the user's
// money reserved - only 'paid'/'rejected' release it. Filtering on
// 'pending' alone let a user get a second request approved against the same
// balance before the first was marked 'paid'.
const RESERVED_STATUSES = ['pending', 'approved'];

async function create({ userId, amount, coinAmount = 0, method = 'bank', clientRequestId, status } = {}, tx = prisma) {
  return tx.withdrawalRequest.create({
    data: {
      userId: Number(userId),
      amount,
      // Coins are paid out in the same bank transfer but tracked apart, so
      // the admin sees the split and the cashback wallet keeps its own total.
      coinAmount: Math.trunc(Number(coinAmount) || 0),
      method,
      clientRequestId: clientRequestId ?? null,
      ...(status ? { status } : {}),
    },
  });
}

// Idempotent create for the RabbitMQ consumer: a redelivered message must
// not create a second request. Relies on the unique clientRequestId column.
async function createIdempotent({ userId, amount, coinAmount = 0, method = 'bank', clientRequestId, status }, tx = prisma) {
  try {
    return await create({ userId, amount, coinAmount, method, clientRequestId, status }, tx);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return findByClientRequestId(clientRequestId, tx);
    }
    throw err;
  }
}

async function findByClientRequestId(clientRequestId, tx = prisma) {
  if (!clientRequestId) return null;
  return tx.withdrawalRequest.findUnique({ where: { clientRequestId } });
}

async function latestPendingForUser(userId) {
  return prisma.withdrawalRequest.findFirst({
    where: { userId: Number(userId), status: { in: RESERVED_STATUSES } },
    orderBy: { id: 'desc' },
  });
}

async function pendingTotalForUser(userId) {
  const result = await prisma.withdrawalRequest.aggregate({
    where: { userId: Number(userId), status: { in: RESERVED_STATUSES } },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

async function listForUser(userId, { limit, offset } = {}) {
  return prisma.withdrawalRequest.findMany({
    where: { userId: Number(userId) },
    orderBy: { id: 'desc' },
    ...(limit !== undefined ? { take: limit } : {}),
    ...(offset !== undefined ? { skip: offset } : {}),
  });
}

async function listAll({ status } = {}) {
  const rows = await prisma.withdrawalRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: { id: 'desc' },
    include: { user: { select: { phone: true } } },
  });
  return rows.map(({ user, ...withdrawal }) => ({ ...withdrawal, userPhone: user ? user.phone : null }));
}

// Only forward transitions out of a still-open state are allowed - a
// 'paid'/'rejected' request is final and can't be re-approved or re-opened.
const VALID_TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['paid', 'rejected'],
  rejected: [],
  paid: [],
};

async function setStatus(id, status) {
  const current = await prisma.withdrawalRequest.findUnique({ where: { id: Number(id) } });
  if (!current) throw new Error('withdrawal request not found');
  const allowed = VALID_TRANSITIONS[current.status] ?? [];
  if (current.status !== status && !allowed.includes(status)) {
    throw new Error(`cannot transition withdrawal request from '${current.status}' to '${status}'`);
  }
  // Cash needs no refund: it is never deducted, only reserved by the row's
  // own status. Coins are a ledger, so a rejection has to write the money
  // back. Same transaction as the status change, and the refund is keyed by
  // the request id so a double click cannot pay it twice.
  const refundCoins = status === 'rejected' && current.status !== 'rejected' && current.coinAmount > 0;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.withdrawalRequest.update({
      where: { id: Number(id) },
      data: { status, processedAt: new Date().toISOString() },
    });
    if (refundCoins) {
      await coinsRepo.refundWithdrawal(
        { userId: current.userId, coinAmount: current.coinAmount, withdrawalId: current.id },
        tx,
      );
    }
    return updated;
  });
}

module.exports = {
  create,
  createIdempotent,
  findByClientRequestId,
  latestPendingForUser,
  pendingTotalForUser,
  listForUser,
  listAll,
  setStatus,
};
