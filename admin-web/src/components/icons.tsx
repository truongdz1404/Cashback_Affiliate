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
