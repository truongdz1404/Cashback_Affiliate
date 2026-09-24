const jobRunsRepo = require('./repositories/jobRuns');

/**
 * Wraps a background job so every execution leaves a row in `job_runs`.
 *
 * One wrapper rather than each job doing its own bookkeeping, for two reasons:
 * nobody can forget it, and every row ends up the same shape - which is what
 * makes a single dashboard table possible instead of one bespoke reader per
 * job.
 *
 * Deliberately transparent to callers: the job's own return value comes back
 * untouched and its errors are re-thrown, so adding this to an existing job
 * cannot change what that job's caller sees. The audit trail is a side effect,
 * never a new failure mode - if `job_runs` itself is unwritable (bad
 * migration, disk full), the job still runs and still reports normally; only
 * the record is lost, and it says so in the log.
 *
 * Does NOT take the browser lock. Only some jobs drive Playwright, and
 * wrapping the rest in a browser mutex would serialise work that has no reason
 * to wait - the lock belongs at each browser-driving call site
 * (lib/browserJobLock.js).
 *
 * @param {string} job      stable job name, see the JobRun model
 * @param {string} trigger  'cron' | 'admin' | 'boot'
 * @param {(ctx: {runId: number|null}) => Promise<*>} fn
 * @param {object}   [opts]
 * @param {(result:*) => boolean} [opts.discardIf]  drop the row when a
 *   SUCCESSFUL run turns out to have had nothing to do. For a job that wakes
 *   every few minutes and usually finds an empty queue, keeping every
 *   heartbeat would make the audit table useless to read. Never consulted on
 *   the error path - a failure is always recorded.
 */
async function withJobRun(job, trigger, fn, { discardIf } = {}) {
  let run = null;
  try {
    run = await jobRunsRepo.start(job, trigger);
  } catch (err) {
    console.error(`[job-run] không ghi được lượt chạy "${job}": ${err.message}`);
  }

  try {
    const result = await fn({ runId: run ? run.id : null });
    if (run) {
      // A throwing discardIf must not take the job down with it - the return
      // value below is the whole point of the call, the bookkeeping is not.
      let drop = false;
      try {
        drop = typeof discardIf === 'function' && discardIf(result) === true;
      } catch (err) {
        console.error(`[job-run] discardIf của "${job}" ném lỗi: ${err.message}`);
      }
      await (drop ? jobRunsRepo.discard(run.id) : jobRunsRepo.finish(run.id, result)).catch((err) =>
        console.error(`[job-run] không đóng được lượt chạy #${run.id}: ${err.message}`)
      );
    }
    return result;
  } catch (err) {
    if (run) {
      await jobRunsRepo
        .fail(run.id, err)
        .catch((e) => console.error(`[job-run] không ghi được lỗi cho lượt chạy #${run.id}: ${e.message}`));
    }
    throw err;
  } finally {
    // Runs on the error path too: a job that keeps failing is exactly the one
    // whose rows pile up fastest.
    await jobRunsRepo.prune().catch(() => {});
  }
}

module.exports = { withJobRun };
