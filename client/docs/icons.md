# Bộ icon website

Website dùng **Iconsax**, style linear, viewBox 24x24, stroke 1.5 — đúng bộ mà
app Rewally đang dùng, để hai nền tảng nhìn ra cùng một ngôn ngữ hình.

| | |
|---|---|
| Path icon | [`src/components/iconPaths.ts`](../src/components/iconPaths.ts) — bảng path, **chỉ chép vào chứ đừng vẽ tay** |
| Component | [`src/components/icons.tsx`](../src/components/icons.tsx) — chỗ duy nhất được import icon |
| Kích thước | do class Tailwind ở nơi gọi quyết định (`h-4 w-4`, `h-5 w-5`…) |
| Màu | `currentColor`, ăn theo màu chữ của phần tử cha |

## Path lấy từ đâu

Hai nguồn, cùng là Iconsax:

1. **Chép nguyên văn từ app** — 19 icon app đã export từ Figma, chép thẳng từ
   `src/components/icons/paths.ts` của repo app sang. Nhờ vậy app và web vẽ ra
   đúng một hình, không lệch một nét: `element`, `archive-book`, `users`, `bag`,
   `shop`, `wallet-change`, `coin`, `setting`, `logout`, `search`, `link`,
   `copy`, `gift`, `home`, `shield-tick`, `clock`, `bank`, `filter`, `sort`.
2. **Gói npm `iconsax-react`** (MIT, biến thể `Linear`) — 25 icon app chưa
   export. Gói chỉ dùng lúc sinh file, **không** nằm trong `package.json` của
   web: `add`, `arrow-down-2`, `arrow-left-2`, `arrow-right`, `arrow-right-2`,
   `call`, `document-download`, `document-upload`, `edit-2`, `export-square`,
   `eye`, `eye-slash`, `flash`, `gallery`, `hamberger-menu`, `info-circle`,
   `lock`, `profile-add`, `refresh-2`, `sms`, `star-1`, `tick`, `trash`,
   `trend-up`, `volume-high`.

Bản npm là một revision Iconsax hơi khác bản Figma của app, nên thứ tự ưu tiên
luôn là **lấy từ app trước**, hết mới lấy từ npm.

## Thêm một icon

1. Tìm tên icon trên [iconsax.io](https://iconsax.io) (đặt tên theo Iconsax, ví
   dụ `arrow-right-2`, không đặt `chevron-right`).
2. Lấy path:
   - Nếu app đã có trong `src/components/icons/paths.ts` → chép nguyên khối sang
     `iconPaths.ts`.
   - Nếu chưa → lấy biến thể `Linear` trong `iconsax-react/dist/cjs/<Tên>.js`.
     Chỉ giữ `d`; thêm `w: <số>` khi stroke-width khác 1.5 (Iconsax dùng 2 cho
     mấy chấm tròn nhỏ), thêm `fill: true` cho path tô đặc.
3. Khai báo một dòng `export const XxxIcon = iconsax("<tên>");` trong
   `icons.tsx`.
4. `npx tsc --noEmit` để chắc tên icon hợp lệ — `IconName` là union sinh từ
   chính `iconPaths.ts` nên gõ sai tên là báo lỗi ngay.

## Vài chỗ cố tình lệch tên

- `CloseIcon` không có path riêng: Iconsax không vẽ dấu X, nó là dấu cộng xoay
  45° — nên component nhận thêm tham số `transform`.
- `TrendUpIcon` (mũi tên xu hướng) đứng ở rail "Bán chạy nhất", thay ngọn lửa cũ.
- `MegaphoneIcon` thật ra là `volume-high` — Iconsax không có loa phóng thanh.

Ba chỗ này đều có ghi chú ngay trong `icons.tsx`.
