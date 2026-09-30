import { type CSSProperties } from "react";


export type MarkKind = "scales" | "themis";

const common = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function Mark({ kind = "scales", size = 36, title, style, className }: {
  kind?: MarkKind;
  size?: number | string;
  title?: string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      style={{ display: "block", flexShrink: 0, ...style }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {kind === "themis" ? <ThemisPaths /> : <ScalesPaths />}
    </svg>
  );
}

function ScalesPaths() {
  return (
    <g {...common} strokeWidth={2.1}>
      <circle cx={24} cy={10.5} r={1.9} />
      <path d="M24 12.4v27.1" />
      <path d="M16 39.5h16" />
      <path d="M7.5 15.5h33" />
      <path d="M12 15.5V22M36 15.5V22" />
      <path d="M4.5 22c0 4.4 3.4 6.9 7.5 6.9s7.5-2.5 7.5-6.9" />
      <path d="M28.5 22c0 4.4 3.4 6.9 7.5 6.9s7.5-2.5 7.5-6.9" />
    </g>
  );
}

function ThemisPaths() {
  return (
    <g {...common} strokeWidth={2.1}>
      <circle cx={24} cy={9.5} r={3.3} />
      <path d="M20 9.1h8" />
      <path d="M20.8 15.6 18.5 40M27.2 15.6 29.5 40" />
      <path d="M16 40h16" />
      <path d="M7.5 17.2h33" />
      <path d="M12 17.2v5.4M36 17.2v5.4" />
      <path d="M5.5 22.6c0 4 3.1 6.3 6.5 6.3s6.5-2.3 6.5-6.3" />
      <path d="M29.5 22.6c0 4 3.1 6.3 6.5 6.3s6.5-2.3 6.5-6.3" />
    </g>
  );
}

export function Lockup({ size = 36, mono, disp }: { size?: number; mono: CSSProperties; disp: CSSProperties }) {
  return (
    <>
      <Mark kind="scales" size={size} style={{ color: "var(--c-accent-text)" }} />
      <span style={{ ...disp, fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>
        Клуб выпускников
        <span style={{ ...mono, display: "block", fontSize: "var(--t-micro)", letterSpacing: "0.1em", color: "var(--c-text-3)", fontWeight: 400, marginTop: 3, textTransform: "uppercase" }}>
          факультета права Вышки
        </span>
      </span>
    </>
  );
}
