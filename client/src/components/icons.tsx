import type { SVGProps } from "react";
import { ICON_PATHS, type IconName } from "./iconPaths";

type IconProps = SVGProps<SVGSVGElement>;

/**
 * Vẽ một icon Iconsax từ bộ path trong ./iconPaths.
 *
 * Kích thước vẫn do class `h-4 w-4`… ở nơi gọi quyết định, màu vẫn ăn theo
 * `currentColor`, nên đổi sang bộ này không phải sửa chỗ nào đang dùng. Nét nằm
 * trong viewBox 24x24 y như app, khác với bộ vẽ tay 20x20 trước đây.
 *
 * `transform` dành cho vài icon Iconsax cố tình không vẽ riêng — dấu X chính là
 * dấu cộng xoay 45°, đúng như bản thiết kế trong Figma.
 */
function iconsax(name: IconName, transform?: string) {
  const paths = ICON_PATHS[name];
  return function Icon({ className, ...props }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
        <g transform={transform}>
          {paths.map((path, index) =>
            path.fill ? (
              <path key={index} d={path.d} fill="currentColor" />
            ) : (
              <path
                key={index}
                d={path.d}
                stroke="currentColor"
                strokeWidth={path.w ?? 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )
          )}
        </g>
      </svg>
    );
  };
}

export const GridIcon = iconsax("element");
export const ReceiptIcon = iconsax("archive-book");
export const UsersIcon = iconsax("users");
export const BagIcon = iconsax("bag");
export const StoreIcon = iconsax("shop");
export const ImageIcon = iconsax("gallery");
export const WalletIcon = iconsax("wallet-change");
export const CoinIcon = iconsax("coin");
export const GearIcon = iconsax("setting");
export const LogoutIcon = iconsax("logout");
export const SearchIcon = iconsax("search");
export const UploadIcon = iconsax("document-upload");
export const DownloadIcon = iconsax("document-download");
export const TrashIcon = iconsax("trash");
export const MenuIcon = iconsax("hamberger-menu");
export const RefreshIcon = iconsax("refresh-2");
export const PlusIcon = iconsax("add");
export const EditIcon = iconsax("edit-2");
export const CheckIcon = iconsax("tick");
export const ChevronLeftIcon = iconsax("arrow-left-2");
export const ChevronRightIcon = iconsax("arrow-right-2");
export const ChevronDownIcon = iconsax("arrow-down-2");
// Cùng nét với ChevronDownIcon, lật ngược 180° — vẽ riêng "arrow-up-2" thì hai
// mũi tên đứng cạnh nhau sẽ lệch nhau vài pixel.
export const ChevronUpIcon = iconsax("arrow-down-2", "rotate(180 12 12)");
export const ArrowRightIcon = iconsax("arrow-right");
export const ExternalLinkIcon = iconsax("export-square");
export const LinkIcon = iconsax("link");
export const CopyIcon = iconsax("copy");
export const BoltIcon = iconsax("flash");
export const GiftIcon = iconsax("gift");
export const HomeIcon = iconsax("home");
export const ShieldIcon = iconsax("shield-tick");
export const ClockIcon = iconsax("clock");
export const BankIcon = iconsax("bank");
export const PhoneIcon = iconsax("call");
export const MailIcon = iconsax("sms");
export const LockIcon = iconsax("lock");
export const EyeIcon = iconsax("eye");
export const EyeOffIcon = iconsax("eye-slash");
export const SlidersIcon = iconsax("filter");
export const SortIcon = iconsax("sort");
export const InfoIcon = iconsax("info-circle");
export const UserPlusIcon = iconsax("profile-add");
export const StarIcon = iconsax("star-1");

// Iconsax không vẽ dấu X riêng: nó là dấu cộng xoay 45° quanh tâm 12,12.
export const CloseIcon = iconsax("add", "rotate(45 12 12)");

// Hai chỗ dưới đây Iconsax không có đúng vật thể, nên lấy icon gần nghĩa nhất
// và gọi đúng tên icon thật để không ai phải đoán:
// - "Bán chạy nhất" từng là ngọn lửa, giờ là mũi tên xu hướng đi lên.
// - "Sự kiện" trong admin từng là cái loa phóng thanh, giờ là loa có sóng âm.
export const TrendUpIcon = iconsax("trend-up");
export const MegaphoneIcon = iconsax("volume-high");
