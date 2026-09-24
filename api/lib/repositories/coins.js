const { Prisma } = require('@prisma/client');
const prisma = require('../prisma');

// Coins are their own currency, separate from the cashback wallet. They are
// earned by checking in once a day and can be cashed out alongside a normal
// withdrawal request at 1 coin = 1 VND.
//
// Two rules shape everything below:
//
//   1. A day is a Vietnam day. The server runs on UTC; using its calendar
//      would roll the streak over at 07:00 local, which is the middle of the
//      morning for the people using this.
//   2. Nothing is credited twice. Every earn carries a dedupe key and the
//      unique index on (user_id, kind, dedupe_key) is what enforces it, not a
//      read-then-write check that two concurrent taps can both pass.

const CHECKIN_KIND = 'checkin';
const WITHDRAW_KIND = 'withdraw';
const WITHDRAW_REFUND_KIND = 'withdraw_refund';
const ADMIN_ADJUST_KIND = 'admin_adjust';

// Requests whose coins are already spent but not yet paid out. Cash works by
// reservation - the wallet total stays put and open requests are subtracted
// from it. Coins cannot: a ledger has no "reserved" state, so the debit is
// written the moment the request is created and written back if it is
// rejected. These statuses are therefore only used to *report* what is in
// flight, never to subtract a second time.
const PENDING_STATUSES = ['pending', 'approved'];

const VN_OFFSET_MINUTES = 7 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

// "2026-09-24" for whatever Vietnam-time day the given instant falls in.
// Done by shifting the instant rather than with Intl so the result cannot
// depend on which timezone database the container happens to ship.
function vnDate(at = new Date()) {
  return new Date(at.getTime() + VN_OFFSET_MINUTES * 60 * 1000).toISOString().slice(0, 10);
}

function vnDateShifted(days, at = new Date()) {
  return vnDate(new Date(at.getTime() + days * DAY_MS));
}

// Milliseconds until the next Vietnam midnight, so the app can show a
// countdown to the next check-in without trusting the phone's clock.
function msUntilNextVnDay(at = new Date()) {
  const shifted = at.getTime() + VN_OFFSET_MINUTES * 60 * 1000;
  return DAY_MS - (shifted % DAY_MS);
}

async function balanceForUser(userId, tx = prisma) {
  const result = await tx.coinTransaction.aggregate({
    where: { userId: Number(userId) },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

async function pendingForUser(userId, tx = prisma) {
  const result = await tx.withdrawalRequest.aggregate({
    where: { userId: Number(userId), status: { in: PENDING_STATUSES } },
    _sum: { coinAmount: true },
  });
  return result._sum.coinAmount ?? 0;
}

// The three numbers the wallet screen shows.
//
//   available - the ledger sum, i.e. what can be spent right now. Coins put
//               into an open request are already debited from it.
//   pending   - coins sitting in a request that has not been paid yet.
//   balance   - the two added back together: everything the user still owns.
async function availableForUser(userId, tx = prisma) {
  const [available, pending] = await Promise.all([balanceForUser(userId, tx), pendingForUser(userId, tx)]);
  const spendable = Math.max(available, 0);
  return { balance: spendable + pending, pending, available: spendable };
}

// Which rung of the reward ladder a user is standing on.
//
// `streak` is how many days in a row they have checked in. The ladder repeats,
// so day 8 of a streak pays what day 1 pays. Missing a day drops them back to
// the first rung when `resetOnMiss` is set; otherwise the streak is frozen and
// they carry on where they left off.
function cycleStateFor({ rewards, streak, lastCheckinDate, today, yesterday, resetOnMiss }) {
  const cycleLength = rewards.length;
  const claimedToday = lastCheckinDate === today;

  let effectiveStreak = streak;
  if (!claimedToday && lastCheckinDate !== yesterday) {
    // The chain is broken. Either start over, or keep the position and simply
    // resume - the difference is a config switch because it is a product call,
    // not a technical one.
    effectiveStreak = resetOnMiss ? 0 : streak;
  }

  // How many rungs of the current pass are already done. After claiming, that
  // includes today's; before claiming, it is where the next claim lands.
  const doneInCycle = claimedToday
    ? ((effectiveStreak - 1) % cycleLength) + 1
    : effectiveStreak % cycleLength;
  const highlightIndex = claimedToday ? doneInCycle - 1 : doneInCycle;

  const days = rewards.map((reward, index) => ({
    day: index + 1,
    reward,
    claimed: index < doneInCycle,
    isToday: index === highlightIndex,
  }));

  return {
    streak: effectiveStreak,
    cycleLength,
    claimedToday,
    nextReward: rewards[claimedToday ? effectiveStreak % cycleLength : doneInCycle],
    days,
  };
}

async function statusForUser(userId, { rewards, resetOnMiss }) {
  const id = Number(userId);
  const [user, wallet] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { coinStreak: true, lastCheckinDate: true } }),
    availableForUser(id),
  ]);

  const state = cycleStateFor({
    rewards,
    streak: user?.coinStreak ?? 0,
    lastCheckinDate: user?.lastCheckinDate ?? null,
    today: vnDate(),
    yesterday: vnDateShifted(-1),
    resetOnMiss,
  });

  return {
    ...wallet,
    ...state,
    today: vnDate(),
    canClaim: !state.claimedToday,
    msUntilNextDay: msUntilNextVnDay(),
  };
}

// Claims today's coins. Safe to call twice: the second call loses the race on
// the unique index and comes back { alreadyClaimed: true } rather than
// crediting again.
async function checkin(userId, { rewards, resetOnMiss }) {
  const id = Number(userId);
  const today = vnDate();
  const yesterday = vnDateShifted(-1);

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: { coinStreak: true, lastCheckinDate: true },
      });
      if (!user) throw new Error('user not found');
      if (user.lastCheckinDate === today) return { alreadyClaimed: true };

      // A streak that reached yesterday continues; anything older starts a new
      // one. resetOnMiss: false keeps the position instead, so a missed day
      // costs the day's coins but not the progress.
      const continues = user.lastCheckinDate === yesterday;
      const baseStreak = continues ? user.coinStreak : resetOnMiss ? 0 : user.coinStreak;
      const streak = baseStreak + 1;
      const dayInCycle = ((streak - 1) % rewards.length) + 1;
      const reward = rewards[dayInCycle - 1];

      // Written before the streak update. If the same user taps twice, both
      // transactions reach here and the unique index rejects one of them,
      // rolling back its streak update too - so the counter can never run
      // ahead of the coins actually credited.
      await tx.coinTransaction.create({
        data: {
          userId: id,
          amount: reward,
          kind: CHECKIN_KIND,
          dedupeKey: today,
          note: `Điểm danh ngày ${dayInCycle}`,
        },
      });

      await tx.user.update({ where: { id }, data: { coinStreak: streak, lastCheckinDate: today } });

      return { alreadyClaimed: false, reward, streak, balance: await balanceForUser(id, tx) };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { alreadyClaimed: true };
    }
    throw err;
  }
}

// Spends coins for a withdrawal request. Called from inside the worker's
// advisory-locked transaction, so the balance it read cannot move underneath
// it. clientRequestId doubles as the dedupe key: a redelivered queue message
// debits once.
async function spendForWithdrawal({ userId, coinAmount, clientRequestId }, tx = prisma) {
  if (!coinAmount) return null;
  return tx.coinTransaction.create({
    data: {
      userId: Number(userId),
      amount: -Math.abs(coinAmount),
      kind: WITHDRAW_KIND,
      dedupeKey: clientRequestId,
      note: 'Rút xu về tài khoản ngân hàng',
    },
  });
}

// Puts coins back when a request that reserved them is rejected. The request
// id is the dedupe key, so re-running the transition is harmless.
async function refundWithdrawal({ userId, coinAmount, withdrawalId }, tx = prisma) {
  if (!coinAmount) return null;
  try {
    return await tx.coinTransaction.create({
      data: {
        userId: Number(userId),
        amount: Math.abs(coinAmount),
        kind: WITHDRAW_REFUND_KIND,
        dedupeKey: String(withdrawalId),
        note: 'Hoàn xu do yêu cầu rút bị từ chối',
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

// Manual correction from the dashboard. No dedupe key - an operator granting
// the same bonus twice on purpose is a legitimate thing to do.
async function adjust({ userId, amount, note }) {
  return prisma.coinTransaction.create({
    data: {
      userId: Number(userId),
      amount: Math.round(amount),
      kind: ADMIN_ADJUST_KIND,
      note: note || 'Điều chỉnh từ quản trị',
    },
  });
}

async function listForUser(userId, { limit = 20, offset = 0 } = {}) {
  return prisma.coinTransaction.findMany({
    where: { userId: Number(userId) },
    orderBy: { id: 'desc' },
    take: limit,
    skip: offset,
  });
}

module.exports = {
  CHECKIN_KIND,
  WITHDRAW_KIND,
  WITHDRAW_REFUND_KIND,
  ADMIN_ADJUST_KIND,
  vnDate,
  vnDateShifted,
  msUntilNextVnDay,
  cycleStateFor,
  balanceForUser,
  pendingForUser,
  availableForUser,
  statusForUser,
  checkin,
  spendForWithdrawal,
  refundWithdrawal,
  adjust,
  listForUser,
};
