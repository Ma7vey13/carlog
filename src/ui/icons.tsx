import type { ReactNode, SVGProps } from 'react';
import type { TabId } from '../app/routes';

// Small inline icon set: no icon font or CDN (SPEC rule 5).

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const GaugeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 16a8.5 8.5 0 1 1 17 0" />
    <path d="M12 16l4.2-5.2" />
    <circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none" />
    <path d="M6.2 10.2l1.2 1M12 7.5V9M17.8 10.2l-1.2 1" />
  </Icon>
);

export const HistoryIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" />
    <path d="M3.5 3.5v5h5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const InboxIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 13.5l2.6-7.8A2 2 0 0 1 7.5 4.3h9a2 2 0 0 1 1.9 1.4l2.6 7.8V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M3 13.5h5l1.5 2.5h5l1.5-2.5h5" />
  </Icon>
);

export const RegulationIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
    <path d="M9 4.5V3.5h6v1" />
    <path d="M8.5 12.5l2.3 2.3 4.7-4.8" />
  </Icon>
);

/** A ruble sign in a coin, for "Расходы". */
export const ExpensesIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M10 17V7.5h3a2.5 2.5 0 0 1 0 5H8.5M8.5 15h4.5" />
  </Icon>
);

export const MoreIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </Icon>
);

export const CloudOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3l18 18" />
    <path d="M8 6.6A6 6 0 0 1 17.6 10 4 4 0 0 1 20.7 16M17 19H7a4.5 4.5 0 0 1-1.6-8.7" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Icon>
);

export const BackIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9L17.5 7M10 11v5M14 11v5" />
  </Icon>
);

export const EditIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M13.5 6.5l4 4" />
  </Icon>
);

export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

/** Tiles of the main screen (D-098). */
export const ClipboardListIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
    <path d="M9 4.5V3.5h6v1" />
    <path d="M9 10h6M9 13.5h6M9 17h4" />
  </Icon>
);

export const WrenchIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5 4.5a4.5 4.5 0 0 0-4.3 5.8L4.5 16a2.1 2.1 0 0 0 3 3l5.7-5.7a4.5 4.5 0 0 0 5.8-5.8l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6a4.5 4.5 0 0 0-1.5-.4z" />
  </Icon>
);

export const ChecklistIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6.5l1.6 1.6L8.5 5M4 12.5l1.6 1.6 2.9-3.1M4 18.5l1.6 1.6 2.9-3.1" />
    <path d="M11.5 7h8.5M11.5 13h8.5M11.5 19h8.5" />
  </Icon>
);

export const CertificateIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h4" />
    <path d="M14 3.5l5 5V11" />
    <path d="M14 3.5v5h5" />
    <circle cx="17" cy="15.5" r="2.8" />
    <path d="M15.5 18l-.8 3.2 2.3-1.1 2.3 1.1-.8-3.2" />
  </Icon>
);

export const DragIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none" />
  </Icon>
);

export const ArrowUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);

export const ArrowDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);

export const TAB_ICONS: Record<TabId, (p: IconProps) => ReactNode> = {
  state: GaugeIcon,
  history: HistoryIcon,
  expenses: ExpensesIcon,
  inbox: InboxIcon,
  regulation: RegulationIcon,
  more: MoreIcon,
};
