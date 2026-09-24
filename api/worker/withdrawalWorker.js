require('dotenv').config();

const prisma = require('../lib/prisma');
const withdrawalsRepo = require('../lib/repositories/withdrawals');
const settingsRepo = require('../lib/repositories/settings');
const coinsRepo = require('../lib/repositories/coins');
const { availableAmountForUser } = require('../lib/walletBalance');
const { getConnection } = require('../lib/queue/connection');
const { WITHDRAWAL_QUEUE, assertTopology } = require('../lib/queue/withdrawalQueue');

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-runs the exact checks server.js already ran before publishing, but
// inside a Postgres advisory lock scoped to this user so a concurrent
// withdrawal request for the same person can't slip through between the
// read and the write (the TOCTOU race the HTTP-only version had). A single
// consumer with prefetch=1 already serializes this in practice; the lock is
// defense-in-depth if this ever runs with more than one worker.
async function processWithdrawalRequest({ clientRequestId, userId, amount, method, coinAmount = 0 }) {
  const existing = await withdrawalsRepo.findByClientRequestId(clientRequestId);
  if (existing) return existing;

  const coins = Math.max(Math.trunc(Number(coinAmount) || 0), 0);
  const cash = Math.max(Number(amount) || 0, 0);

  return prisma.$transaction(async (tx) => {
    // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns void and Prisma
    // cannot deserialize a void column, so $queryRaw throws P2010 here and the
    // request is nacked away before a row is ever written.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${Number(userId)})`;

    const alreadyInTx = await withdrawalsRepo.findByClientRequestId(clientRequestId, tx);
    if (alreadyInTx) return alreadyInTx;

    const reject = () =>
      withdrawalsRepo.createIdempotent(
        { userId, amount: cash, coinAmount: coins, method, clientRequestId, status: 'rejected' },
        tx,
      );

    const existingReserved = await tx.withdrawalRequest.findFirst({
      where: { userId: Number(userId), status: { in: ['pending', 'approved'] } },
    });
    if (existingReserved) return reject();

    // Same admin-configured minimum the HTTP route checked; re-validated here
    // as a defensive backstop in case the request was published by anything
    // else, and read per message so an admin change takes effect immediately.
    // The floor applies to the whole payout, cash and coins together, because
    // that is what actually leaves the bank account.
    const minWithdrawAmount = await settingsRepo.getMinWithdrawAmount();
    if (cash + coins < minWithdrawAmount) return reject();

    const { available } = await availableAmountForUser(userId);
    if (cash > available) return reject();

    // Coins come out of their own ledger, so this is a separate check against
    // a separate balance - a user with 200k cashback and 10 coins cannot
    // withdraw 50 coins by leaning on the cashback side.
    if (coins > 0) {
      const coinBalance = await coinsRepo.balanceForUser(userId, tx);
      if (coins > coinBalance) return reject();
    }

    const created = await withdrawalsRepo.createIdempotent(
      { userId, amount: cash, coinAmount: coins, method, clientRequestId, status: 'pending' },
      tx,
    );

    // The debit is written now, not on payout: the ledger balance is what the
    // check above reads, so leaving it until 'paid' would let the same coins
    // be requested again. A rejection writes them back.
    await coinsRepo.spendForWithdrawal({ userId, coinAmount: coins, clientRequestId }, tx);

    return created;
  });
}

async function handleMessage(channel, msg) {
  if (!msg) return;
  let payload;
  try {
    payload = JSON.parse(msg.content.toString('utf8'));
  } catch (err) {
    // Unparseable message can never succeed - straight to the DLQ rather
    // than looping on it.
    channel.nack(msg, false, false);
    return;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await processWithdrawalRequest(payload);
      channel.ack(msg);
      return;
    } catch (err) {
      console.error(`[withdrawal-worker] attempt ${attempt}/${MAX_ATTEMPTS} failed for ${payload.clientRequestId}:`, err.message);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      // Exhausted retries - dead-letter it instead of requeueing forever.
      channel.nack(msg, false, false);
    }
  }
}

async function start() {
  const connection = await getConnection();
  const channel = await connection.createChannel();
  await assertTopology(channel);
  // Serializes withdrawal-creation processing for this consumer - the
  // single-consumer + prefetch=1 pairing is what actually prevents the
  // TOCTOU race at this app's scale; the advisory lock above is only a
  // backstop in case a second worker instance is ever run.
  await channel.prefetch(1);

  console.log('[withdrawal-worker] waiting for messages on', WITHDRAWAL_QUEUE);
  channel.consume(WITHDRAWAL_QUEUE, (msg) => handleMessage(channel, msg), { noAck: false });
}

// Exported so the creation rules can be exercised directly, without a broker
// in the loop. Only `node worker/withdrawalWorker.js` starts consuming.
module.exports = { processWithdrawalRequest };

if (require.main === module) {
  start().catch((err) => {
    console.error('[withdrawal-worker] fatal startup error:', err);
    process.exit(1);
  });
}
