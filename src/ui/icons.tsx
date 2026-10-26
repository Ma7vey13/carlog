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

export const TAB_ICONS: Record<TabId, (p: IconProps) => ReactNode> = {
  state: GaugeIcon,
  history: HistoryIcon,
  inbox: InboxIcon,
  regulation: RegulationIcon,
  more: MoreIcon,
};
