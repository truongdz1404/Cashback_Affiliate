const { Prisma } = require('@prisma/client');
const prisma = require('../prisma');
const coinsRepo = require('./coins');
const { settleWithdrawal } = require('./withdrawalSettlement');

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

async function pendingTotalForUser(userId, tx = prisma) {
  const result = await tx.withdrawalRequest.aggregate({
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

// The admin queue carries the payee's bank details with it. Paying a request
// out is a manual transfer, and without these the admin had to leave the queue
// and look the user up on the customers screen for every single row.
async function listAll({ status } = {}) {
  const rows = await prisma.withdrawalRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: { id: 'desc' },
    include: {
      user: {
        select: {
          phone: true,
          fullName: true,
          bankName: true,
          bankAccountNumber: true,
          bankAccountHolder: true,
        },
      },
    },
  });
  return rows.map(({ user, ...withdrawal }) => ({
    ...withdrawal,
    userPhone: user ? user.phone : null,
    userName: user ? user.fullName : null,
    bankName: user ? user.bankName : null,
    bankAccountNumber: user ? user.bankAccountNumber : null,
    bankAccountHolder: user ? user.bankAccountHolder : null,
  }));
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
  return prisma.$transaction(async (tx) => {
    const current = await tx.withdrawalRequest.findUnique({ where: { id: Number(id) } });
    if (!current) throw new Error('withdrawal request not found');
    if (current.status === status) return current;

    const allowed = VALID_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(status)) {
      throw new Error(`cannot transition withdrawal request from '${current.status}' to '${status}'`);
    }

    // Compare-and-swap on the status we just read. The read used to happen
    // outside any transaction and the write was by id alone, so two admins
    // clicking at once both passed the check above and both acted on it -
    // refunding the same coins twice. Losing the race now updates no row.
    const { count } = await tx.withdrawalRequest.updateMany({
      where: { id: Number(id), status: current.status },
      data: { status, processedAt: new Date().toISOString() },
    });
    if (count !== 1) {
      throw new Error('withdrawal request was changed by someone else - reload and try again');
    }

    // Cash needs no refund: it is never deducted, only reserved by the row's
    // own status. Coins are a ledger, so a rejection has to write the money
    // back.
    if (status === 'rejected' && current.coinAmount > 0) {
      await coinsRepo.refundWithdrawal(
        { userId: current.userId, coinAmount: current.coinAmount, withdrawalId: current.id },
        tx,
      );
    }

    // The payout and the settlement of the rows behind it are one act, not
    // two - see lib/repositories/withdrawalSettlement.js for why that matters.
    if (status === 'paid') {
      await settleWithdrawal(current, tx);
    }

    return tx.withdrawalRequest.findUnique({ where: { id: Number(id) } });
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
