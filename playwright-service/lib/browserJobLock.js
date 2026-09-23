/**
 * Một mutex duy nhất trên Playwright context dùng chung (lib/browserManager.js).
 *
 * Mọi automation dài, nhiều tab, nhiều phút đều phải đi qua đây: product-offer
 * sync, crawl theo shop, và nấc page-transport của lib/shopeeAffiliateApi.js.
 * Trước khi có file này mỗi job giữ mutex riêng ở scope module, nên hai job khác
 * nhau vẫn giành nhau cùng một context trên con VPS 2 core.
 *
 * CỐ Ý không bao tab pool của /app/link (browserManager.acquireCustomLinkPage):
 * đó là request NGẮN, một tab, nhạy độ trễ, của NGƯỜI DÙNG, và pool đã tự chặn
 * số lượng bằng CUSTOM_LINK_POOL_SIZE. Bắt một cú chạm của user xếp hàng sau
 * lượt crawl 20 phút là làm hỏng app.
 *
 * LUẬT CHỐNG DEADLOCK: code đang chạy bên trong run()/tryRun() KHÔNG được gọi
 * run()/tryRun() lần nữa - lock này không reentrant và sẽ tự chờ chính mình.
 * Cụ thể: runShopProductSync không bao giờ được chạm vào nấc page-transport của
 * API client; cần detail shop thì lấy TRƯỚC khi vào lock.
 */

// Watchdog ngưỡng: quá lâu thì log, KHÔNG cướp lock (xem below).
const MAX_HOLD_MS = parseInt(process.env.BROWSER_JOB_LOCK_MAX_HOLD_MS || String(45 * 60 * 1000), 10);
const WATCHDOG_INTERVAL_MS = parseInt(process.env.BROWSER_JOB_LOCK_WATCHDOG_MS || '60000', 10);

let current = null; // { name, startedAt, warned }
const waiters = []; // FIFO: [{ name, resolve }]

let watchdogTimer = null;

/**
 * Chỉ log, KHÔNG force-release. Một lời gọi Playwright bị treo mà sau đó vẫn
 * hoàn tất sẽ đua với job thứ hai trên cùng bộ tab - hỏng dữ liệu im lặng, tệ
 * hơn nhiều so với một cái lock kẹt mà ta nhìn thấy được trên dashboard.
 */
function startWatchdog() {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(() => {
    if (!current) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
      return;
    }
    const elapsed = Date.now() - current.startedAt;
    if (elapsed > MAX_HOLD_MS && !current.warned) {
      current.warned = true;
      console.error(
        `[browser-lock] "${current.name}" đã giữ lock ${Math.round(elapsed / 1000)}s ` +
          `(ngưỡng ${Math.round(MAX_HOLD_MS / 1000)}s). Không cướp lock - kiểm tra thủ công. ` +
          `Đang chờ: ${waiters.map((w) => w.name).join(', ') || 'không ai'}`
      );
    }
  }, WATCHDOG_INTERVAL_MS);
  // Không giữ event loop sống chỉ vì cái watchdog.
  if (typeof watchdogTimer.unref === 'function') watchdogTimer.unref();
}

function take(name) {
  current = { name, startedAt: Date.now(), warned: false };
  startWatchdog();
}

function isBusy() {
  return current !== null;
}

function getCurrent() {
  if (!current) return null;
  const elapsedMs = Date.now() - current.startedAt;
  return {
    name: current.name,
    startedAt: new Date(current.startedAt).toISOString(),
    elapsedMs,
    overdue: elapsedMs > MAX_HOLD_MS,
    waiting: waiters.map((w) => w.name),
  };
}

function acquire(name) {
  if (!current) {
    take(name);
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push({ name, resolve }));
}

function release() {
  const next = waiters.shift();
  if (!next) {
    current = null;
    return;
  }
  take(next.name);
  next.resolve();
}

/** Xếp hàng FIFO cho tới khi browser rảnh. Luôn release, kể cả khi fn ném. */
async function run(name, fn) {
  await acquire(name);
  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * Chạy ngay nếu rảnh, còn bận thì trả về luôn - KHÔNG chờ. Dành cho việc ngắn
 * đi kèm một request đang sống (nấc page-transport của API client): xếp hàng
 * sau một lượt crawl 20 phút thì thà hỏng nhanh còn hơn.
 * @returns {{ran:true, result:*} | {ran:false, busyWith:object}}
 */
async function tryRun(name, fn) {
  if (current) return { ran: false, busyWith: getCurrent() };
  take(name);
  try {
    return { ran: true, result: await fn() };
  } finally {
    release();
  }
}

module.exports = { isBusy, getCurrent, run, tryRun, MAX_HOLD_MS };
