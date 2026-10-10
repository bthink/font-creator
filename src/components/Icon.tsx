import type { CSSProperties } from 'react';

type IconName =
  | 'plus'
  | 'arrow'
  | 'back'
  | 'grid'
  | 'type'
  | 'scan'
  | 'download'
  | 'check'
  | 'search'
  | 'close'
  | 'file';
const paths: Record<IconName, React.ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </>
  ),
  type: <path d="m4 19 6-14 6 14M6 14h8m3-4h5m-2-3v12" />,
  scan: (
    <>
      <path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M3 12h18" />
      <path d="M8 8h8v8H8z" />
    </>
  ),
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" />,
  check: <path d="m5 12 4 4L19 6" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  file: (
    <>
      <path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h5" />
    </>
  ),
};
export function Icon({
  name,
  style,
}: {
  name: IconName;
  style?: CSSProperties;
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
