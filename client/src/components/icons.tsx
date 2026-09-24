import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(paths: React.ReactNode) {
  return function Icon({ className, ...props }: IconProps) {
    return (
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const GridIcon = base(
  <>
    <rect x="2.5" y="2.5" width="6" height="6" rx="1.3" />
    <rect x="11.5" y="2.5" width="6" height="6" rx="1.3" />
    <rect x="2.5" y="11.5" width="6" height="6" rx="1.3" />
    <rect x="11.5" y="11.5" width="6" height="6" rx="1.3" />
  </>
);

export const ReceiptIcon = base(
  <>
    <path d="M5 2.5h10v15l-1.8-1.2-1.8 1.2-1.8-1.2-1.8 1.2-1.8-1.2L5 17.5z" />
    <path d="M7.2 7h5.6M7.2 10h5.6M7.2 13h3.6" />
  </>
);

export const UsersIcon = base(
  <>
    <circle cx="7.3" cy="6.8" r="2.6" />
    <path d="M2.8 17c0-2.7 2-4.5 4.5-4.5s4.5 1.8 4.5 4.5" />
    <circle cx="14.2" cy="7.3" r="2.1" />
    <path d="M12.7 12.7c1.9.2 3.5 1.9 3.5 4.3" />
  </>
);

export const MegaphoneIcon = base(
  <>
    <path d="M2.8 8v4l2.4.5V17c0 .6.5 1 1 1h.6c.6 0 1-.4 1-1v-3.9l7.4 1.9V6.1L5.2 8z" />
    <path d="M14.8 6.1a3.2 3.2 0 0 1 0 7.8" />
  </>
);

export const BagIcon = base(
  <>
    <path d="M5.2 6.5h9.6l.9 10.2a1.3 1.3 0 0 1-1.3 1.4H5.6a1.3 1.3 0 0 1-1.3-1.4z" />
    <path d="M7.3 6.2a2.7 2.7 0 0 1 5.4 0" />
  </>
);

export const StoreIcon = base(
  <>
    <path d="M3.4 3.2h13.2l1.1 4.1a2.3 2.3 0 0 1-4.5.7 2.3 2.3 0 0 1-4.4 0 2.3 2.3 0 0 1-4.5-.7z" />
    <path d="M4.3 9.2v6.4a1.2 1.2 0 0 0 1.2 1.2h9a1.2 1.2 0 0 0 1.2-1.2V9.2" />
    <path d="M8.2 16.8v-4.3h3.6v4.3" />
  </>
);

export const ImageIcon = base(
  <>
    <rect x="2.5" y="3.8" width="15" height="12.4" rx="1.6" />
    <circle cx="7" cy="8" r="1.3" />
    <path d="M4 15l4.2-4.4a1.4 1.4 0 0 1 2 0L13 13.4l1-1a1.4 1.4 0 0 1 2 0l1.5 1.6" />
  </>
);

export const WalletIcon = base(
  <>
    <path d="M3 6.2A1.7 1.7 0 0 1 4.7 4.5h9.8A1.7 1.7 0 0 1 16.2 6.2V15a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 15z" />
    <path d="M12.6 10.3h2.9a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-2.9a1.7 1.7 0 0 1 0-3.4z" />
  </>
);

export const GearIcon = base(
  <>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2.8v1.6M10 15.6v1.6M17.2 10h-1.6M4.4 10H2.8M15.1 4.9l-1.1 1.1M6 14l-1.1 1.1M15.1 15.1 14 14M6 6 4.9 4.9" />
  </>
);

export const LogoutIcon = base(
  <>
    <path d="M8 17.2H4.8a1.3 1.3 0 0 1-1.3-1.3V4.1a1.3 1.3 0 0 1 1.3-1.3H8" />
    <path d="M12.8 13.8 17 10l-4.2-3.8M17 10H7.5" />
  </>
);

export const SearchIcon = base(
  <>
    <circle cx="8.7" cy="8.7" r="5.4" />
    <path d="M16.5 16.5 13 13" />
  </>
);

export const UploadIcon = base(
  <>
    <path d="M10 13.2V3.6M6.4 7.2 10 3.6l3.6 3.6" />
    <path d="M3.6 13.2v2.1a1.1 1.1 0 0 0 1.1 1.1h10.6a1.1 1.1 0 0 0 1.1-1.1v-2.1" />
  </>
);

export const TrashIcon = base(
  <>
    <path d="M3.5 5.5h13M7.8 5.5V4a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1v1.5" />
    <path d="M5.3 5.5 6 16a1.4 1.4 0 0 0 1.4 1.3h5.2A1.4 1.4 0 0 0 14 16l.7-10.5" />
    <path d="M8.4 9v4.6M11.6 9v4.6" />
  </>
);

export const MenuIcon = base(<path d="M3 5.5h14M3 10h14M3 14.5h14" />);

export const CloseIcon = base(<path d="M5 5l10 10M15 5 5 15" />);

export const RefreshIcon = base(
  <>
    <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6" />
    <path d="M16.5 3.5V8h-4.5" />
  </>
);

export const PlusIcon = base(<path d="M10 3.6v12.8M3.6 10h12.8" />);

export const EditIcon = base(
  <>
    <path d="M12.4 3.4a1.7 1.7 0 0 1 2.4 0l1.8 1.8a1.7 1.7 0 0 1 0 2.4L7 17.2l-4 .8.8-4z" />
    <path d="M11 4.8 15.2 9" />
  </>
);

export const CheckIcon = base(<path d="M3.5 10.5 7.5 14.5 16.5 5.5" />);

export const ChevronLeftIcon = base(<path d="M12.5 4.5 7 10l5.5 5.5" />);

export const ChevronRightIcon = base(<path d="M7.5 4.5 13 10l-5.5 5.5" />);

export const ChevronDownIcon = base(<path d="M4.5 7.5 10 13l5.5-5.5" />);

export const ArrowRightIcon = base(
  <>
    <path d="M3.5 10h13" />
    <path d="M11.5 5 16.5 10l-5 5" />
  </>
);

export const ExternalLinkIcon = base(
  <>
    <path d="M9 4.5H4.5v11h11V11" />
    <path d="M12 3.5h4.5V8" />
    <path d="M16.5 3.5 9.5 10.5" />
  </>
);

export const LinkIcon = base(
  <>
    <path d="M8.5 11.5a3 3 0 0 0 4.3 0l2.5-2.5a3 3 0 0 0-4.3-4.3l-1 1" />
    <path d="M11.5 8.5a3 3 0 0 0-4.3 0l-2.5 2.5a3 3 0 1 0 4.3 4.3l1-1" />
  </>
);

export const CopyIcon = base(
  <>
    <rect x="7" y="7" width="9.5" height="9.5" rx="1.8" />
    <path d="M13 7V5.3A1.8 1.8 0 0 0 11.2 3.5H5.3A1.8 1.8 0 0 0 3.5 5.3v5.9A1.8 1.8 0 0 0 5.3 13H7" />
  </>
);

export const FireIcon = base(
  <path d="M10 2.8c2.6 2.2 4.4 4.3 4.4 7a4.4 4.4 0 1 1-8.8 0c0-1.3.5-2.4 1.4-3.4.2 1 .8 1.7 1.6 1.9-.2-2 .3-3.7 1.4-5.5z" />
);

export const BoltIcon = base(<path d="M11.2 2.5 4.8 11h4.2l-.9 6.5L15.2 9H11z" />);

export const GiftIcon = base(
  <>
    <rect x="3" y="7.5" width="14" height="3" rx="0.8" />
    <path d="M4.3 10.5v6.2h11.4v-6.2" />
    <path d="M10 7.5v9.2" />
    <path d="M10 7.5S9 3.5 7 3.5a1.8 1.8 0 1 0 0 4M10 7.5s1-4 3-4a1.8 1.8 0 1 1 0 4" />
  </>
);

export const HomeIcon = base(
  <>
    <path d="M3.2 9.2 10 3.4l6.8 5.8" />
    <path d="M5 8.4v8.2h10V8.4" />
  </>
);

export const ShieldIcon = base(
  <>
    <path d="M10 2.6 16 5v4.4c0 3.6-2.4 6.6-6 8-3.6-1.4-6-4.4-6-8V5z" />
    <path d="M7.4 9.9 9.3 11.8 12.9 8.2" />
  </>
);

export const ClockIcon = base(
  <>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 5.8V10l3 1.8" />
  </>
);

export const BankIcon = base(
  <>
    <path d="M2.8 7.8 10 3.4l7.2 4.4" />
    <path d="M4.6 8.6v6.2M8.2 8.6v6.2M11.8 8.6v6.2M15.4 8.6v6.2" />
    <path d="M3 16.6h14" />
  </>
);

export const PhoneIcon = base(
  <path d="M6.6 3.4h-2A1.6 1.6 0 0 0 3 5.2c0 6.4 5.4 11.8 11.8 11.8a1.6 1.6 0 0 0 1.8-1.6v-2l-3.4-1.2-1.6 1.7a11.6 11.6 0 0 1-4.5-4.5l1.7-1.6z" />
);

export const MailIcon = base(
  <>
    <rect x="2.8" y="4.6" width="14.4" height="10.8" rx="1.8" />
    <path d="m3.4 6 6.6 4.8L16.6 6" />
  </>
);

export const LockIcon = base(
  <>
    <rect x="4.2" y="8.8" width="11.6" height="8" rx="2" />
    <path d="M6.8 8.8V6.6a3.2 3.2 0 0 1 6.4 0v2.2" />
  </>
);

export const EyeIcon = base(
  <>
    <path d="M1.8 10S5 4.8 10 4.8 18.2 10 18.2 10 15 15.2 10 15.2 1.8 10 1.8 10z" />
    <circle cx="10" cy="10" r="2.3" />
  </>
);

export const EyeOffIcon = base(
  <>
    <path d="M7.6 5.3A7.6 7.6 0 0 1 10 4.8c5 0 8.2 5.2 8.2 5.2a15 15 0 0 1-2.7 3.2M4.8 6.6A15 15 0 0 0 1.8 10S5 15.2 10 15.2c.9 0 1.7-.2 2.5-.4" />
    <path d="M8.4 8.4a2.3 2.3 0 0 0 3.2 3.2" />
    <path d="M3 3l14 14" />
  </>
);

export const SlidersIcon = base(
  <>
    <path d="M3.5 6h13M3.5 14h13" />
    <circle cx="8" cy="6" r="1.8" />
    <circle cx="13" cy="14" r="1.8" />
  </>
);

export const SortIcon = base(
  <>
    <path d="M6 3.8v12.4M3.2 13.4 6 16.2l2.8-2.8" />
    <path d="M14 16.2V3.8M11.2 6.6 14 3.8l2.8 2.8" />
  </>
);

export const DownloadIcon = base(
  <>
    <path d="M10 3v9" />
    <path d="M6.4 8.6 10 12.2l3.6-3.6" />
    <path d="M3.6 14.4v1.2a1.4 1.4 0 0 0 1.4 1.4h10a1.4 1.4 0 0 0 1.4-1.4v-1.2" />
  </>
);

export const InfoIcon = base(
  <>
    <circle cx="10" cy="10" r="7.2" />
    <path d="M10 9.2v4.4" />
    <path d="M10 6.6h.01" />
  </>
);

export const UserPlusIcon = base(
  <>
    <circle cx="8" cy="6.8" r="2.9" />
    <path d="M2.8 16.4c0-2.7 2.3-4.6 5.2-4.6 1 0 2 .2 2.8.7" />
    <path d="M14.4 11.6v4.8M12 14h4.8" />
  </>
);

export const StarIcon = base(<path d="m10 3 2.2 4.5 5 .7-3.6 3.5.9 4.9L10 14.3 5.5 16.6l.9-4.9L2.8 8.2l5-.7z" />);
