import { CSSProperties } from "react";

interface LogoMarkProps {
  className?: string;
  style?: CSSProperties;
  /** Pixel size of the square mark. */
  size?: number;
}

/**
 * Votify mark — three ascending bars (a rising poll) topped with a spark.
 * Bars render in the current foreground colour at stepped opacities; the
 * spark uses the theme's primary accent. Monochrome-plus-accent keeps it
 * quiet and lets the content carry the colour.
 */
export function LogoMark({ className, style, size = 40 }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role="img"
      aria-label="Votify"
    >
      <rect x="5.5" y="22" width="7" height="12" rx="3.5" fill="currentColor" opacity="0.35" />
      <rect x="16.5" y="15" width="7" height="19" rx="3.5" fill="currentColor" opacity="0.65" />
      <rect x="27.5" y="8" width="7" height="26" rx="3.5" fill="currentColor" />
      <circle cx="31" cy="4.5" r="3" fill="var(--primary)" />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  /** Pixel size of the mark; the wordmark scales with it. */
  size?: number;
  /** Hide the "Votify" wordmark and show only the mark. */
  markOnly?: boolean;
}

export function Logo({ className, size = 32, markOnly = false }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-foreground ${className ?? ""}`}>
      <LogoMark size={size} />
      {!markOnly && (
        <span
          className="font-display font-semibold tracking-tight"
          style={{ fontSize: size * 0.72 }}
        >
          Votify
        </span>
      )}
    </span>
  );
}
