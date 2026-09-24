const amqp = require('amqplib');

function getAmqpUrl() {
  const user = process.env.RABBITMQ_USER || 'guest';
  const password = process.env.RABBITMQ_PASSWORD || 'guest';
  const host = process.env.RABBITMQ_HOST || 'rabbitmq';
  const port = process.env.RABBITMQ_PORT || '5672';
  return `amqp://${user}:${password}@${host}:${port}`;
}

let connectionPromise = null;

// Shared across publishes (server.js) and the worker's consume loop -
// amqplib connections are meant to be long-lived, not reopened per call.
// Cleared on failure so the next caller retries a fresh connect instead of
// reusing a dead one forever.
async function getConnection() {
  if (!connectionPromise) {
    connectionPromise = amqp.connect(getAmqpUrl()).then((conn) => {
      conn.on('error', () => {
        connectionPromise = null;
      });
      conn.on('close', () => {
        connectionPromise = null;
      });
      return conn;
    });
    connectionPromise.catch(() => {
      connectionPromise = null;
    });
  }
  return connectionPromise;
}

module.exports = { getConnection, getAmqpUrl };
