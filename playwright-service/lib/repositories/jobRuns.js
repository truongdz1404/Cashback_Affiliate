const prisma = require('../prisma');

// Postgres text columns have no practical length limit, but a runaway job
// (say, one that stuffs every skipped product id into its result) would turn
// this audit table into the biggest thing in the database. Both free-text
// columns are capped; the marker makes a truncated value obvious rather than
// looking like valid-but-short JSON.
const MAX_TEXT = 8000;
const DEFAULT_RETENTION_DAYS = parseInt(process.env.JOB_RUN_RETENTION_DAYS || '30', 10);

function clip(value) {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return null; // JSON.stringify(undefined)
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…[cắt bớt]` : text;
}

function errorLabel(err) {
  const ctor = err.constructor && err.constructor.name;
  // Prefer whichever is more specific than the generic base.
  if (err.name && err.name !== 'Error') return err.name;
  if (ctor && ctor !== 'Error' && ctor !== 'Object') return ctor;
  return err.name || 'Error';
}

async function start(job, trigger = 'cron') {
  return prisma.jobRun.create({ data: { job, trigger, status: 'running' } });
}

async function finish(id, result) {
  const row = await prisma.jobRun.findUnique({ where: { id } });
  if (!row) return null;
  const finishedAt = new Date();
  return prisma.jobRun.update({
    where: { id },
    data: {
      status: 'done',
      finishedAt,
      durationMs: finishedAt.getTime() - row.startedAt.getTime(),
      resultJson: clip(result),
    },
  });
}

async function fail(id, err, partialResult) {
  const row = await prisma.jobRun.findUnique({ where: { id } });
  if (!row) return null;
  const finishedAt = new Date();
  return prisma.jobRun.update({
    where: { id },
    data: {
      status: 'error',
      finishedAt,
      durationMs: finishedAt.getTime() - row.startedAt.getTime(),
      // Keep the error class name: "BlockedError: ..." vs "SessionExpiredError:
      // ..." is the difference between "wait it out" and "a human must re-seed
      // the login", and that distinction is worth having in the audit trail.
      // Falls back to the constructor name because `err.name` is only the
      // class name if the class bothered to assign this.name - a subclass that
      // forgets would otherwise record a useless bare "Error: ...".
      error: clip(err ? `${errorLabel(err)}: ${err.message}` : 'unknown error'),
      resultJson: partialResult === undefined ? undefined : clip(partialResult),
    },
  });
}

/**
 * Throws away a finished row. For jobs that run on a tight schedule and are
 * usually a no-op - the category backfill wakes every 15 minutes and normally
 * finds nothing - keeping every heartbeat would bury the handful of runs that
 * actually did something under ~96 empty rows a day. Only ever used for
 * successful empty runs; a failure is always kept, however trivial it looks.
 */
async function discard(id) {
  await prisma.jobRun.delete({ where: { id } }).catch(() => {});
}

async function listRecent({ job, limit = 50, offset = 0 } = {}) {
  const where = job ? { job } : {};
  const [items, total] = await Promise.all([
    prisma.jobRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: Math.min(Number(limit) || 50, 200),
      skip: Number(offset) || 0,
    }),
    prisma.jobRun.count({ where }),
  ]);
  return { items, total };
}

async function lastByJob(job) {
  return prisma.jobRun.findFirst({ where: { job }, orderBy: { startedAt: 'desc' } });
}

/**
 * Called once on boot. A deploy (or an OOM kill - see the VPS note in
 * lib/browserManager.js) lands mid-run often enough that without this every
 * such run stays 'running' forever and the dashboard reports a job as still
 * working hours after the process that owned it died. Nothing else can tell
 * those rows apart from a genuinely live one, because "running" is the only
 * state a crashed process leaves behind.
 *
 * Safe because this service is a single process: any row still 'running' when
 * we boot necessarily belongs to a previous, now-dead one.
 */
async function sweepZombies() {
  const { count } = await prisma.jobRun.updateMany({
    where: { status: 'running' },
    data: { status: 'error', error: 'bị ngắt do service restart', finishedAt: new Date() },
  });
  return count;
}

/**
 * Housekeeping at the end of every run rather than on its own cron: this
 * table only grows when jobs run, so the cleanup belongs exactly where the
 * growth happens and there is no schedule to forget about.
 */
async function prune(days = DEFAULT_RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { count } = await prisma.jobRun.deleteMany({
    // Never prune a row that is still running, however old it looks - an
    // overdue job (browserJobLock's watchdog threshold is 45 minutes, but a
    // stuck one can sit far longer) must stay visible, not vanish.
    where: { startedAt: { lt: cutoff }, status: { in: ['done', 'error'] } },
  });
  return count;
}

module.exports = {
  start,
  finish,
  fail,
  discard,
  listRecent,
  lastByJob,
  sweepZombies,
  prune,
  DEFAULT_RETENTION_DAYS,
};
