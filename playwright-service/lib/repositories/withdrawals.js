const prisma = require('../prisma');

async function create({ userId, amount, method = 'bank' }) {
  return prisma.withdrawalRequest.create({ data: { userId: Number(userId), amount, method } });
}

async function latestPendingForUser(userId) {
  return prisma.withdrawalRequest.findFirst({
    where: { userId: Number(userId), status: 'pending' },
    orderBy: { id: 'desc' },
  });
}

async function pendingTotalForUser(userId) {
  const result = await prisma.withdrawalRequest.aggregate({
    where: { userId: Number(userId), status: 'pending' },
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

async function setStatus(id, status) {
  return prisma.withdrawalRequest.update({
    where: { id: Number(id) },
    data: { status, processedAt: new Date().toISOString() },
  });
}

module.exports = { create, latestPendingForUser, pendingTotalForUser, listForUser, listAll, setStatus };
