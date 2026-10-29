const PATHS = {
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  "chevron-left": "m15 6-6 6 6 6",
  "chevron-right": "m9 6 6 6-6 6",
  "chevron-down": "m6 9 6 6 6-6",
} as const;

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
