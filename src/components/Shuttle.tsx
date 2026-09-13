export function Shuttle({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <path d="M16 2 L23 12 H9 Z" fill="currentColor" opacity=".9" />
      <path d="M9 12 L6 24 L16 30 L26 24 L23 12 Z" fill="currentColor" opacity=".28" />
      <path d="M9 12 L16 30 M23 12 L16 30 M12.5 12 L14 30 M19.5 12 L18 30" stroke="currentColor" strokeWidth="1.1" opacity=".65" />
      <path d="M7.6 18.5 H24.4" stroke="currentColor" strokeWidth="1.1" opacity=".5" />
      <circle cx="16" cy="6.5" r="2.6" fill="currentColor" />
    </svg>
  );
}
