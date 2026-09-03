const { Prisma } = require('@prisma/client');
const prisma = require('../prisma');

// Requests still in 'pending' or already 'approved' both hold the user's
// money reserved - only 'paid'/'rejected' release it. Filtering on
// 'pending' alone let a user get a second request approved against the same
// balance before the first was marked 'paid'.
const RESERVED_STATUSES = ['pending', 'approved'];

async function create({ userId, amount, method = 'bank', clientRequestId, status } = {}, tx = prisma) {
  return tx.withdrawalRequest.create({
    data: {
      userId: Number(userId),
      amount,
      method,
      clientRequestId: clientRequestId ?? null,
      ...(status ? { status } : {}),
    },
  });
}

// Idempotent create for the RabbitMQ consumer: a redelivered message must
// not create a second request. Relies on the unique clientRequestId column.
async function createIdempotent({ userId, amount, method = 'bank', clientRequestId, status }, tx = prisma) {
  try {
    return await create({ userId, amount, method, clientRequestId, status }, tx);
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

async function listForUser(userId) {
  return prisma.withdrawalRequest.findMany({
    where: { userId: Number(userId) },
    orderBy: { id: 'desc' },
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
  return prisma.withdrawalRequest.update({
    where: { id: Number(id) },
    data: { status, processedAt: new Date().toISOString() },
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
