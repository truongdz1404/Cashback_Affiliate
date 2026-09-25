#!/usr/bin/env node
// Sinh bảng translate() mà prisma/migrations/*_add_folded_name_search dùng.
//
// Cột shopping_products.name_folded phải gấp dấu ĐÚNG BẰNG foldForSearch() của
// lib/textMatch.js. Nếu hai bên lệch nhau thì gợi ý từ khoá sẽ chào những cụm
// mà lưới sản phẩm trả về rỗng - đúng loại lỗi không ai nghĩ tới việc đi tìm.
// Script này không chép lại logic gấp dấu; nó require thẳng lib/textMatch.js và
// đọc kết quả ra, nên bảng SQL không thể lệch khỏi hàm JS mà không ai hay.
//
//   node scripts/gen-fold-table.js            # in bảng ra để xem
//   node scripts/gen-fold-table.js --check    # thoát khác 0 nếu migration đã cũ
//   node scripts/gen-fold-table.js --write    # ghi bảng mới vào migration
//
// Chạy --write mỗi khi stripDiacritics/foldForSearch đổi. Lưu ý migration đã
// chạy rồi thì sửa file không cập nhật dữ liệu: muốn đổi cách gấp thì phải thêm
// một migration mới CREATE OR REPLACE lại hàm và ép tính lại cột.
const fs = require('fs');
const path = require('path');
const { foldForSearch } = require('../lib/textMatch');

// Chỉ hai khối Latin. Dải ở giữa là Hy Lạp/Kirin/IPA: gấp chúng lại không giúp
// gì cho tên sản phẩm Shopee và chỉ làm bảng to thêm.
const LATIN = [[0x00c0, 0x024f], [0x1e00, 0x1eff]];

function build() {
  const from = [];
  const to = [];

  // (1) Ký tự Latin có dấu -> không dấu.
  for (const [lo, hi] of LATIN) {
    for (let cp = lo; cp <= hi; cp += 1) {
      const ch = String.fromCodePoint(cp);
      const folded = foldForSearch(ch);
      // translate() ánh xạ một ký tự sang đúng một ký tự; thứ gấp ra hai ký tự
      // (ß -> ss) hoặc ra rỗng thì không biểu diễn được ở đây.
      if (folded.length !== 1) continue;
      // Bỏ những ký tự mà foldForSearch chỉ đổi chữ hoa thành chữ thường chứ
      // không gỡ dấu (Æ -> æ, Ɓ -> ɓ, Ⱥ -> ⱥ). SQL đã lower() trước khi
      // translate(), nên để chúng vào chỉ làm bảng phình ra và làm mờ ý nghĩa
      // của nó. Chữ hoa CÓ dấu thì vẫn giữ (À -> a), vì đó là gỡ dấu thật.
      if (folded === ch.toLowerCase()) continue;
      from.push(ch);
      to.push(folded);
    }
  }
  const latin = from.length;

  // (2) Mọi ký tự mà /\s/ của JS coi là khoảng trắng -> dấu cách ASCII.
  // Postgres [[:space:]] chỉ biết khoảng trắng ASCII, nên U+00A0 sống sót qua
  // regexp_replace và làm hai bản gấp lệch nhau - nó có thật trong 24 tên sản
  // phẩm và 72 tên shop của production. Quy về ASCII ngay tại translate() thì
  // khỏi phải viết \uXXXX trong regex, thứ mà Postgres không đọc được bên
  // trong bracket expression.
  const spaces = [];
  for (let cp = 0; cp <= 0xffff; cp += 1) {
    const ch = String.fromCodePoint(cp);
    if (ch !== ' ' && /\s/.test(ch)) spaces.push(ch);
  }
  for (const ch of spaces) {
    from.push(ch);
    to.push(' ');
  }

  // (3) Dấu tổ hợp được nối vào SAU khi chuỗi đích đã hết độ dài, nên
  // translate() XOÁ chúng. Nhờ vậy tên viết dạng tách dấu (NFD - có thật trong
  // catalogue) gấp ra cùng kết quả với tên dạng dựng sẵn (NFC), giống hệt bước
  // .normalize('NFD').replace(/[\u0300-\u036f]/g, '') bên JS.
  const marks = [];
  for (let cp = 0x0300; cp <= 0x036f; cp += 1) marks.push(String.fromCodePoint(cp));
  for (const ch of marks) from.push(ch);

  return { from: from.join(''), to: to.join(''), latin, spaces: spaces.length, marks: marks.length };
}

// Diễn lại đúng ngữ nghĩa translate() + regexp_replace + btrim của SQL, thay vì
// tin rằng mình viết đúng.
function simulate({ from, to }, text) {
  const table = new Map();
  [...from].forEach((c, i) => table.set(c, i < to.length ? to[i] : ''));
  return [...text.toLowerCase()]
    .map((c) => table.get(c) ?? c)
    .join('')
    .replace(/[ \t\n\r\f\v]+/g, ' ')
    .trim();
}

function selfTest(table) {
  const bad = [];
  const ranges = [[0x20, 0x7e], [0xa0, 0xa0], ...LATIN, [0x300, 0x36f], [0x2000, 0x200f]];
  for (const [lo, hi] of ranges) {
    for (let cp = lo; cp <= hi; cp += 1) {
      const ch = String.fromCodePoint(cp);
      if (simulate(table, ch) !== foldForSearch(ch)) bad.push('U+' + cp.toString(16));
    }
  }
  for (const s of ['Váy Đầm Nữ', 'ĐIỆN THOẠI', 'Sữa\u00a0Rửa  Mặt', 'Tai Nghe Không Dây', '  Áo\tthun\u00a0 ', 'Ổ cắm ĐA NĂNG']) {
    if (simulate(table, s) !== foldForSearch(s)) bad.push(JSON.stringify(s));
  }
  return bad;
}

const table = build();
const bad = selfTest(table);
if (bad.length) {
  console.error(`LỆCH so với foldForSearch ở ${bad.length} chỗ: ${bad.slice(0, 8).join(', ')}`);
  process.exit(1);
}

const migration = path.join(__dirname, '..', 'prisma', 'migrations', '20260925180000_add_folded_name_search', 'migration.sql');
// Mọi ký tự VÔ HÌNH được viết dưới dạng \uXXXX trong chuỗi E'...' của
// Postgres, chữ cái có dấu thì để nguyên cho người đọc.
//
// Không phải để cho đẹp: bảng này chứa xuống dòng, về đầu dòng, tab dọc, sang
// trang và U+00A0. Đặt chúng thẳng vào file .sql thì chỉ cần một lần ghi ở chế
// độ text trên Windows, hay một lần checkout với core.autocrlf, là một ký tự
// xuống dòng thành hai - `from` dài thêm còn `to` thì không, và vì translate()
// XOÁ mọi ký tự nằm quá độ dài của `to`, cả phần đuôi bảng lệch đi một chỗ.
// Lỗi đó im lặng tuyệt đối: migration vẫn chạy xong, chỉ có kết quả gấp dấu là
// sai. Đã dính một lần rồi.
const BACKSLASH = String.fromCharCode(92);

function sqlEscape(text) {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    // Vô hình (khoảng trắng mọi loại, ký tự điều khiển, dấu tổ hợp), hoặc là
    // ký tự mà cú pháp chuỗi của Postgres nuốt mất.
    const invisible = cp < 0x20 || cp === 0x7f || /\s/.test(ch) || (cp >= 0x300 && cp <= 0x36f);
    if (ch === "'") out += BACKSLASH + "'";
    else if (ch === BACKSLASH) out += BACKSLASH + BACKSLASH;
    else if (invisible) out += BACKSLASH + 'u' + cp.toString(16).padStart(4, '0');
    else out += ch;
  }
  return out;
}

const CALL = `translate(lower(input), E'${sqlEscape(table.from)}', E'${sqlEscape(table.to)}')`;
// Bắt lời gọi translate(...) trong migration bất kể nó đang mang bảng nào.
const CALL_RE = new RegExp(`translate${BACKSLASH}(lower${BACKSLASH}(input${BACKSLASH}), E'[${BACKSLASH}s${BACKSLASH}S]*?', E'[${BACKSLASH}s${BACKSLASH}S]*?'${BACKSLASH})`);

if (process.argv.includes('--write')) {
  const sql = fs.readFileSync(migration, 'utf8');
  if (!CALL_RE.test(sql)) {
    console.error('không tìm thấy lời gọi translate() trong migration');
    process.exit(1);
  }
  fs.writeFileSync(migration, sql.replace(CALL_RE, CALL), 'utf8');
  console.log('đã ghi bảng mới vào migration');
  process.exit(0);
}

if (process.argv.includes('--check')) {
  const found = fs.readFileSync(migration, 'utf8').match(CALL_RE);
  const ok = !!found && found[0] === CALL;
  console.log(ok ? 'bảng trong migration khớp với lib/textMatch.js' : 'BẢNG ĐÃ CŨ: chạy `node scripts/gen-fold-table.js --write`');
  process.exit(ok ? 0 : 1);
}

console.log(`${table.latin} cặp Latin + ${table.spaces} ký tự trắng + ${table.marks} dấu tổ hợp bị xoá`);
console.log(`\n${CALL}`);
