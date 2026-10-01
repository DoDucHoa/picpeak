import React from 'react';

/**
 * The client gallery's own icon set: 24px outlines on currentColor, so an
 * icon takes the colour of the text around it. Inline SVG rather than an icon
 * package, so the look is fixed and nothing extra is fetched.
 */
function Svg({ children, ...rest }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

const HEART = 'M12 20.25s-7.5-4.6-7.5-10.1A4.15 4.15 0 0 1 8.65 6c1.4 0 2.6.7 3.35 1.8A4.05 4.05 0 0 1 15.35 6a4.15 4.15 0 0 1 4.15 4.15c0 5.5-7.5 10.1-7.5 10.1Z';

export function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <Svg>
      <path d={HEART} fill={filled ? 'var(--cg-like)' : 'none'} stroke={filled ? 'var(--cg-like)' : 'currentColor'} />
    </Svg>
  );
}

export function PickIcon({ filled = false }: { filled?: boolean }) {
  if (filled) {
    return (
      <Svg>
        <circle cx={12} cy={12} r={9} fill="var(--cg-pick)" stroke="var(--cg-pick)" />
        <path d="m8.25 12.25 2.5 2.5 5-5.25" stroke="#fff" />
      </Svg>
    );
  }
  return (
    <Svg>
      <circle cx={12} cy={12} r={9} />
      <path d="m8.25 12.25 2.5 2.5 5-5.25" />
    </Svg>
  );
}

export function DownloadIcon() {
  return (
    <Svg>
      <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M4.5 19.5h15" />
    </Svg>
  );
}

export function ShareIcon() {
  return (
    <Svg>
      <path d="M12 15V4m0 0L8 8m4-4 4 4M7.5 11H6a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 18 11h-1.5" />
    </Svg>
  );
}

export function SortChevron({ up = false }: { up?: boolean }) {
  return (
    <Svg>
      <path d={up ? 'm7 14.5 5-5 5 5' : 'm7 9.5 5 5 5-5'} />
    </Svg>
  );
}

export function GridIcon() {
  return (
    <Svg>
      <rect x={4} y={4} width={6.5} height={6.5} rx={1} />
      <rect x={13.5} y={4} width={6.5} height={6.5} rx={1} />
      <rect x={4} y={13.5} width={6.5} height={6.5} rx={1} />
      <rect x={13.5} y={13.5} width={6.5} height={6.5} rx={1} />
    </Svg>
  );
}

export function ListIcon() {
  return (
    <Svg>
      <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
    </Svg>
  );
}

export function BackIcon() {
  return (
    <Svg>
      <path d="M19.5 12h-15m0 0 6-6m-6 6 6 6" />
    </Svg>
  );
}

export function CommentIcon() {
  return (
    <Svg>
      <path d="M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4.5 3.5v-3.5h-1v-10Z" />
    </Svg>
  );
}

export function InfoIcon() {
  return (
    <Svg>
      <circle cx={12} cy={12} r={9} />
      <path d="M12 11v5.5M12 7.75h.01" />
    </Svg>
  );
}

export function CloseIcon() {
  return (
    <Svg>
      <path d="m6 6 12 12M18 6 6 18" />
    </Svg>
  );
}

export function ArrowUpIcon() {
  return (
    <Svg>
      <path d="M12 19.5v-15m0 0-6 6m6-6 6 6" />
    </Svg>
  );
}

export function LogoutIcon() {
  return (
    <Svg>
      <path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14M10 12h10m0 0-3.5-3.5M20 12l-3.5 3.5" />
    </Svg>
  );
}

export function PeopleIcon() {
  return (
    <Svg>
      <circle cx={9} cy={8.5} r={3.25} />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M15.5 5.5a3.25 3.25 0 0 1 0 6.25M17.5 14.25a5.5 5.5 0 0 1 3 5.25" />
    </Svg>
  );
}

export function CartIcon() {
  return (
    <Svg>
      <path d="M3.5 4.5h2l2.1 10.1a1.5 1.5 0 0 0 1.47 1.2h8.36a1.5 1.5 0 0 0 1.46-1.15L20.5 8H6.4" />
      <circle cx={9.5} cy={19.5} r={1} />
      <circle cx={17} cy={19.5} r={1} />
    </Svg>
  );
}

export function SortIcon() {
  return (
    <Svg>
      <path d="M4.5 7h15M7 12h10M9.5 17h5" />
    </Svg>
  );
}

export function PhotosIcon() {
  return (
    <Svg>
      <rect x={3.5} y={5} width={17} height={14} rx={1.5} />
      <circle cx={8.75} cy={9.75} r={1.5} />
      <path d="m3.5 16.5 4.75-4.25 3.5 3 3.25-3.25 5.5 5" />
    </Svg>
  );
}

export function CheckIcon() {
  return (
    <Svg>
      <path d="m5.5 12.5 4 4 9-9.5" />
    </Svg>
  );
}

export function DeliveredIcon() {
  return (
    <Svg>
      <circle cx={12} cy={12} r={8.25} />
      <path d="m8.5 12.25 2.5 2.5 4.5-5" />
    </Svg>
  );
}

export function EyeIcon() {
  return (
    <Svg>
      <path d="M2.75 12S6 5.75 12 5.75 21.25 12 21.25 12 18 18.25 12 18.25 2.75 12 2.75 12Z" />
      <circle cx={12} cy={12} r={3} />
    </Svg>
  );
}

export function EyeOffIcon() {
  return (
    <Svg>
      <path d="M9.9 6.05A8.7 8.7 0 0 1 12 5.75c6 0 9.25 6.25 9.25 6.25a15.6 15.6 0 0 1-2.6 3.35M6.2 7.7C3.95 9.4 2.75 12 2.75 12S6 18.25 12 18.25a8.9 8.9 0 0 0 4.45-1.2" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3.75 3.75 16.5 16.5" />
    </Svg>
  );
}

export function ShieldIcon() {
  return (
    <Svg>
      <path d="M12 3.5 5 6.25v5.5c0 4.15 2.95 7.6 7 8.75 4.05-1.15 7-4.6 7-8.75v-5.5L12 3.5Z" />
    </Svg>
  );
}
