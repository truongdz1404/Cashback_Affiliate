/**
 * Doi chieu ham gap dau ben JS (lib/textMatch.foldForSearch) voi ham
 * fold_for_search() trong Postgres tren TOAN BO du lieu that.
 *
 * Vi sao can: tim kiem khong dau dua tren mot gia dinh duy nhat - cot
 * shopping_products.name_folded (GENERATED ALWAYS, do Postgres tinh) phai
 * giong het ket qua foldForSearch() ma JS dung de gap tu khoa nguoi dung go.
 * Neu hai ben lech mot ky tu, tim kiem se im lang tra ve rong dung o nhung
 * san pham do, khong loi, khong log. Bang translate() trong migration duoc
 * sinh tu chinh ham JS (scripts/gen-fold-table.js), nhung "sinh dung" va
 * "chay dung tren 90k dong that" la hai chuyen khac nhau - day la cai thu hai.
 *
 * Chay:  docker exec shopee-affiliate node scripts/verify-fold-parity.js
 * Thoat 0 neu khop 100%, 1 neu co dong lech (dung duoc trong CI).
 */
const prisma = require('../lib/prisma');
const { foldForSearch } = require('../lib/textMatch');

const BATCH = 5000;
const TABLES = ['shopping_products', 'shops'];

const codepoints = (text) => [...text].map((ch) => ch.codePointAt(0));

// Diem lech dau tien, theo codepoint - de doc hon la nhin hai chuoi giong het
// nhau bang mat thuong roi khong hieu vi sao chung khac nhau.
function firstDiff(a, b) {
  const x = codepoints(a);
  const y = codepoints(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if (x[i] === y[i]) continue;
    const show = (cp) => (cp === undefined ? 'het' : 'U+' + cp.toString(16));
    return 'vi tri ' + i + ': js=' + show(x[i]) + ' sql=' + show(y[i]);
  }
  return null;
}

async function checkTable(table) {
  let lastId = 0;
  let checked = 0;
  const kinds = new Map();
  const samples = [];
  const note = (key, id, name) => {
    kinds.set(key, (kinds.get(key) || 0) + 1);
    if (samples.length < 5) samples.push('  #' + id + ' ' + JSON.stringify(name.slice(0, 60)));
  };

  for (;;) {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT id, name, name_folded AS stored, fold_for_search(name) AS computed ' +
        'FROM ' + table + ' WHERE id > $1 ORDER BY id LIMIT ' + BATCH,
      lastId
    );
    if (!rows.length) break;
    for (const row of rows) {
      lastId = row.id;
      checked += 1;
      const js = foldForSearch(row.name);
      // Hai phep so sanh khac nhau: computed bat loi bang translate() sai,
      // stored bat loi cot sinh ra tu mot phien ban ham cu hon (cot STORED
      // khong tu tinh lai khi ham doi).
      if (js !== row.computed) note('JS != fold_for_search()  ' + firstDiff(js, row.computed), row.id, row.name);
      else if (js !== row.stored) note('fold_for_search() != name_folded da luu', row.id, row.name);
    }
  }
  return { checked, kinds, samples };
}

(async () => {
  let lech = 0;
  for (const table of TABLES) {
    const { checked, kinds, samples } = await checkTable(table);
    const bad = [...kinds.values()].reduce((a, b) => a + b, 0);
    lech += bad;
    console.log(table + ': ' + checked + ' dong -> ' + (bad ? bad + ' DONG LECH' : 'khop 100%'));
    for (const [kind, n] of [...kinds].sort((a, b) => b[1] - a[1])) console.log('  x' + n + '  ' + kind);
    for (const s of samples) console.log(s);
  }
  await prisma.$disconnect();
  console.log(lech ? 'KET QUA: co ' + lech + ' dong lech' : 'KET QUA: JS va SQL gap dau giong het nhau');
  process.exit(lech ? 1 : 0);
})().catch(async (err) => {
  // Truong hop hay gap nhat: migration chua chay tren may nay.
  const msg = String(err && err.message);
  if (/fold_for_search|name_folded/.test(msg)) {
    console.log('Chua co fold_for_search()/name_folded - migration 20260925180000 chua duoc ap dung o day.');
  } else {
    console.log('LOI: ' + msg.split(String.fromCharCode(10)).slice(-3).join(' '));
  }
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
