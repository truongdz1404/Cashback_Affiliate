const { getConnection } = require('./connection');

const WITHDRAWAL_QUEUE = 'withdrawal.create';
const WITHDRAWAL_DLQ = 'withdrawal.create.dlq';
const WITHDRAWAL_DLX = 'withdrawal.create.dlx';

// Asserted by both the publisher (server.js) and the consumer
// (worker/withdrawalWorker.js) so whichever starts first creates the
// topology - assertions are idempotent, amqplib no-ops once it matches.
async function assertTopology(channel) {
  await channel.assertExchange(WITHDRAWAL_DLX, 'fanout', { durable: true });
  await channel.assertQueue(WITHDRAWAL_DLQ, { durable: true });
  await channel.bindQueue(WITHDRAWAL_DLQ, WITHDRAWAL_DLX, '');
  await channel.assertQueue(WITHDRAWAL_QUEUE, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': WITHDRAWAL_DLX },
  });
}

async function publishWithdrawalRequest(payload) {
  const connection = await getConnection();
  const channel = await connection.createChannel();
  try {
    await assertTopology(channel);
    channel.sendToQueue(WITHDRAWAL_QUEUE, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: 'application/json',
    });
  } finally {
    await channel.close();
  }
}

module.exports = { WITHDRAWAL_QUEUE, WITHDRAWAL_DLQ, WITHDRAWAL_DLX, assertTopology, publishWithdrawalRequest };
