-- Gõ không dấu. "điện thoại" có 873 sản phẩm trong catalogue, nhưng gõ
-- "dien thoai" vào ô tìm kiếm trả về 1. "váy" có 3.528, "vay" trả về 22.
-- "sữa" có 2.232, "sua" trả về 68. Người Việt gõ trên điện thoại phần lớn
-- không bỏ dấu, nên phần lớn lượt tìm kiếm đang trượt.
--
-- Cách chữa là một cột đã gấp dấu được index trigram, chứ không phải dựng một
-- search engine riêng: ở 90k dòng thì Postgres đã trả lời trong 14-160ms. Thứ
-- còn thiếu là *so cái gì với cái gì*, không phải tốc độ.
--
-- KHÔNG dùng extension unaccent, vì hai lý do. unaccent() là STABLE chứ không
-- IMMUTABLE (nó đọc một dictionary là đối tượng trong DB), nên generated column
-- lẫn index biểu thức đều từ chối nó. Và bộ luật mặc định của nó không gấp
-- "đ" -> "d" đáng tin, mà đó đúng là chữ phân biệt "điện" với "dien".
--
-- Hàm dưới đây thuần tuý immutable, và gấp đúng bằng
-- lib/textMatch.js#foldForSearch. Bảng translate được SINH RA từ chính hàm JS
-- đó (scripts/gen-fold-table.js), nên nếu sửa một phía thì phải sinh lại phía
-- kia - nếu không, "vì sao gợi ý có mà lưới trả rỗng" sẽ quay lại.

-- Bảng translate gồm ba phần nối liền nhau:
--   499 cặp   ký tự Latin có dấu -> không dấu.
--    24 ký tự  mọi thứ /\s/ của JS coi là khoảng trắng -> dấu cách ASCII.
--           Postgres [[:space:]] chỉ biết khoảng trắng ASCII, nên U+00A0 sống
--           sót qua regexp_replace - nó có thật trong 24 tên sản phẩm và 72
--           tên shop, và là nguyên nhân của toàn bộ 99 dòng lệch khi đối chiếu
--           thử lần đầu trên production.
--   112 dấu   dấu tổ hợp U+0300..U+036F. Chúng nằm SAU phần đuôi của
--           chuỗi đích nên translate() XOÁ hẳn - nhờ vậy tên viết dạng tách
--           dấu (NFD, cũng có thật trong catalogue) gấp ra cùng kết quả với
--           tên dạng dựng sẵn (NFC).
--
-- Mọi ký tự vô hình trong bảng được viết dạng E'\uXXXX' chứ không đặt thô
-- vào file: bảng có chứa ký tự xuống dòng, và chỉ cần một lần checkout với
-- core.autocrlf (hoặc một lần ghi file ở chế độ text trên Windows) là nó thành
-- hai ký tự, `from` dài thêm một mà `to` thì không, và vì translate() xoá mọi
-- ký tự nằm quá độ dài của `to`, cả phần đuôi bảng lệch đi một chỗ mà không hề
-- báo lỗi. Đã dính đúng một lần trong lúc viết migration này.
CREATE OR REPLACE FUNCTION fold_for_search(input text) RETURNS text
  LANGUAGE sql
  IMMUTABLE
  STRICT
  PARALLEL SAFE
AS $fn$
  SELECT btrim(regexp_replace(
    translate(lower(input), E'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİĴĵĶķĹĺĻļĽľŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžƠơƯưǍǎǏǐǑǒǓǔǕǖǗǘǙǚǛǜǞǟǠǡǢǣǦǧǨǩǪǫǬǭǮǯǰǴǵǸǹǺǻǼǽǾǿȀȁȂȃȄȅȆȇȈȉȊȋȌȍȎȏȐȑȒȓȔȕȖȗȘșȚțȞȟȦȧȨȩȪȫȬȭȮȯȰȱȲȳḀḁḂḃḄḅḆḇḈḉḊḋḌḍḎḏḐḑḒḓḔḕḖḗḘḙḚḛḜḝḞḟḠḡḢḣḤḥḦḧḨḩḪḫḬḭḮḯḰḱḲḳḴḵḶḷḸḹḺḻḼḽḾḿṀṁṂṃṄṅṆṇṈṉṊṋṌṍṎṏṐṑṒṓṔṕṖṗṘṙṚṛṜṝṞṟṠṡṢṣṤṥṦṧṨṩṪṫṬṭṮṯṰṱṲṳṴṵṶṷṸṹṺṻṼṽṾṿẀẁẂẃẄẅẆẇẈẉẊẋẌẍẎẏẐẑẒẓẔẕẖẗẘẙẛẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỴỵỶỷỸỹ\u0009\u000a\u000b\u000c\u000d\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff\u0300\u0301\u0302\u0303\u0304\u0305\u0306\u0307\u0308\u0309\u030a\u030b\u030c\u030d\u030e\u030f\u0310\u0311\u0312\u0313\u0314\u0315\u0316\u0317\u0318\u0319\u031a\u031b\u031c\u031d\u031e\u031f\u0320\u0321\u0322\u0323\u0324\u0325\u0326\u0327\u0328\u0329\u032a\u032b\u032c\u032d\u032e\u032f\u0330\u0331\u0332\u0333\u0334\u0335\u0336\u0337\u0338\u0339\u033a\u033b\u033c\u033d\u033e\u033f\u0340\u0341\u0342\u0343\u0344\u0345\u0346\u0347\u0348\u0349\u034a\u034b\u034c\u034d\u034e\u034f\u0350\u0351\u0352\u0353\u0354\u0355\u0356\u0357\u0358\u0359\u035a\u035b\u035c\u035d\u035e\u035f\u0360\u0361\u0362\u0363\u0364\u0365\u0366\u0367\u0368\u0369\u036a\u036b\u036c\u036d\u036e\u036f', E'aaaaaaceeeeiiiinooooouuuuyaaaaaaceeeeiiiinooooouuuuyyaaaaaaccccccccddddeeeeeeeeeegggggggghhiiiiiiiiijjkkllllllnnnnnnoooooorrrrrrssssssssttttuuuuuuuuuuuuwwyyyzzzzzzoouuaaiioouuuuuuuuuuaaaaææggkkooooʒʒjggnnaaææøøaaaaeeeeiiiioooorrrruuuusstthhaaeeooooooooyyaabbbbbbccddddddddddeeeeeeeeeeffgghhhhhhhhhhiiiikkkkkkllllllllmmmmmmnnnnnnnnoooooooopppprrrrrrrrssssssssssttttttttuuuuuuuuuuvvvvwwwwwwwwwwxxxxyyzzzzzzhtwyſaaaaaaaaaaaaaaaaaaaaaaaaeeeeeeeeeeeeeeeeiiiioooooooooooooooooooooooouuuuuuuuuuuuuuyyyyyyyy\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020\u0020'),
    '[[:space:]]+', ' ', 'g'))
$fn$;

-- STORED chứ không phải VIRTUAL: cột này được đọc ở mọi lượt tìm kiếm và chỉ
-- được ghi khi crawler chạy theo lô, nên trả giá một lần lúc ghi là đúng chiều
-- - cùng một đánh đổi mà GIN chọn so với GiST.
--
-- Postgres viết lại bảng khi thêm một cột generated, và giữ khoá
-- ACCESS EXCLUSIVE suốt lúc đó. ~90k dòng mất vài giây, và việc này chạy trong
-- bước migrate lúc container khởi động (api/scripts/start-xvfb.sh) trước khi
-- API phục vụ request nào, nên không có ai đang đọc để mà bị chặn.
ALTER TABLE "shopping_products"
  ADD COLUMN "name_folded" text
  GENERATED ALWAYS AS (fold_for_search("name")) STORED;

ALTER TABLE "shops"
  ADD COLUMN "name_folded" text
  GENERATED ALWAYS AS (fold_for_search("name")) STORED;

-- Cùng lý do với shopping_products_name_trgm_idx: LIKE '%...%' có dấu sao ở
-- đầu thì btree chịu, còn trigram thì đúng việc. Cột đã là chữ thường sẵn nên
-- phía gọi dùng LIKE chứ không phải ILIKE, và bỏ được mode: 'insensitive'.
--
-- Không CONCURRENTLY: prisma migrate chạy mỗi migration trong một transaction,
-- mà CREATE INDEX CONCURRENTLY thì không nằm trong transaction được.
CREATE INDEX "shopping_products_name_folded_trgm_idx"
  ON "shopping_products" USING GIN ("name_folded" gin_trgm_ops);

CREATE INDEX "shops_name_folded_trgm_idx"
  ON "shops" USING GIN ("name_folded" gin_trgm_ops);
