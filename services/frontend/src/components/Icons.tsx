import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function Icon({ d, size = 20, className = '', strokeWidth = 1.8 }: { d: string } & IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

function MultiIcon({ children, size = 20, className = '' }: { children: React.ReactNode; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </MultiIcon>
  );
}

export function CardIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </MultiIcon>
  );
}

export function ListIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </MultiIcon>
  );
}

export function TransferIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <path d="M7 16V4m0 0L3 8m4-4l4 4" />
      <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
    </MultiIcon>
  );
}

export function UserIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </MultiIcon>
  );
}

export function LogoutIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </MultiIcon>
  );
}

export function BankIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </MultiIcon>
  );
}

export function ChevronLeftIcon(p: IconProps) {
  return <Icon d="M15 18l-6-6 6-6" {...p} />;
}

export function ChevronRightIcon(p: IconProps) {
  return <Icon d="M9 18l6-6-6-6" {...p} />;
}

export function ShieldIcon(p: IconProps) {
  return <Icon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" {...p} />;
}

export function PlusIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </MultiIcon>
  );
}

export function ArrowUpIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </MultiIcon>
  );
}

export function ArrowDownIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </MultiIcon>
  );
}

export function CheckIcon(p: IconProps) {
  return <Icon d="M20 6L9 17l-5-5" {...p} />;
}

export function DepositIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </MultiIcon>
  );
}

export function TrendUpIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </MultiIcon>
  );
}

export function BellIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </MultiIcon>
  );
}

export function EyeIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </MultiIcon>
  );
}

export function KeyIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </MultiIcon>
  );
}

export function LockIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </MultiIcon>
  );
}

export function PhoneIcon(p: IconProps) {
  return (
    <MultiIcon {...p}>
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </MultiIcon>
  );
}
