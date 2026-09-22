require('dotenv').config();

const prisma = require('../lib/prisma');
const withdrawalsRepo = require('../lib/repositories/withdrawals');
const settingsRepo = require('../lib/repositories/settings');
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
async function processWithdrawalRequest({ clientRequestId, userId, amount, method }) {
  const existing = await withdrawalsRepo.findByClientRequestId(clientRequestId);
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${Number(userId)})`;

    const alreadyInTx = await withdrawalsRepo.findByClientRequestId(clientRequestId, tx);
    if (alreadyInTx) return alreadyInTx;

    const existingReserved = await tx.withdrawalRequest.findFirst({
      where: { userId: Number(userId), status: { in: ['pending', 'approved'] } },
    });
    if (existingReserved) {
      return withdrawalsRepo.createIdempotent({ userId, amount, method, clientRequestId, status: 'rejected' }, tx);
    }

    // Same admin-configured minimum the HTTP route checked; re-validated here
    // as a defensive backstop in case the request was published by anything
    // else, and read per message so an admin change takes effect immediately.
    const minWithdrawAmount = await settingsRepo.getMinWithdrawAmount();
    if (amount < minWithdrawAmount) {
      return withdrawalsRepo.createIdempotent({ userId, amount, method, clientRequestId, status: 'rejected' }, tx);
    }

    const { available } = await availableAmountForUser(userId);
    if (amount > available) {
      return withdrawalsRepo.createIdempotent({ userId, amount, method, clientRequestId, status: 'rejected' }, tx);
    }

    return withdrawalsRepo.createIdempotent({ userId, amount, method, clientRequestId, status: 'pending' }, tx);
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

start().catch((err) => {
  console.error('[withdrawal-worker] fatal startup error:', err);
  process.exit(1);
});
