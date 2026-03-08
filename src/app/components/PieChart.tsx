"use client";

import { useRef, useEffect, useState } from "react";
import { motion, animate, useMotionValue, useTransform } from "framer-motion";
import type { Choice } from "@/lib/store";

// ─── Per-theme slice palettes ─────────────────────────────────────────────────
// Each array is ordered so slice[0] uses the theme's primary, slice[1] its
// secondary, and the rest are harmonious companions that look great together.
const THEME_PALETTES: Record<string, string[]> = {
  light: ["#6366f1", "#a855f7", "#06b6d4", "#f59e0b", "#10b981", "#f43f5e"],
  midnight: ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#f43f5e"],
  vivid: ["#f26419", "#7c3aed", "#facc15", "#06b6d4", "#4ade80", "#f43f5e"],
  ocean: ["#06b6d4", "#10b981", "#3b82f6", "#a855f7", "#f59e0b", "#f43f5e"],
};

// ─── Helper: SVG arc path ─────────────────────────────────────────────────────
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  // Clamp to slightly less than 360° to avoid SVG degenerate full-circle path
  const clampedEnd = Math.min(endDeg, startDeg + 359.999);
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, clampedEnd);
  const large = clampedEnd - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`;
}

// ─── Animated number counter ──────────────────────────────────────────────────
function AnimatedNumber({ value }: { value: number }) {
  const motionVal = useMotionValue(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const controls = animate(motionVal, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return controls.stop;
  }, [value, motionVal]);

  return <>{display}</>;
}

// ─── Main component ───────────────────────────────────────────────────────────
interface PieChartProps {
  choices: Choice[];
}

export default function PieChart({ choices }: PieChartProps) {
  const SIZE = 260;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const RADIUS = SIZE / 2 - 20;
  const INNER = RADIUS * 0.44; // donut hole

  const totalVotes = choices.reduce((s, c) => s + c.votes, 0);

  // Detect which choice just got a new vote so we can flash its slice
  const prevVotes = useRef<Record<string, number>>({});
  const [justVoted, setJustVoted] = useState<string | null>(null);

  useEffect(() => {
    if (totalVotes === 0) return;
    for (const c of choices) {
      const prev = prevVotes.current[c.id] ?? 0;
      if (c.votes > prev) {
        setJustVoted(c.id);
        setTimeout(() => setJustVoted(null), 700);
        break;
      }
    }
    prevVotes.current = Object.fromEntries(choices.map(c => [c.id, c.votes]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalVotes]);

  // Resolve the active theme from the <html> data-theme attribute (client-side)
  const [palette, setPalette] = useState<string[]>(THEME_PALETTES.light);
  useEffect(() => {
    const read = () => {
      const theme = document.documentElement.dataset.theme ?? "light";
      setPalette(THEME_PALETTES[theme] ?? THEME_PALETTES.light);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  // Build slice descriptors
  type Slice = { choice: Choice; color: string; startDeg: number; endDeg: number; pct: number };
  const slices: Slice[] = [];
  let cursor = 0;
  choices.forEach((choice, i) => {
    const pct = totalVotes === 0 ? 0 : choice.votes / totalVotes;
    const deg = pct * 360;
    slices.push({
      choice,
      color: palette[i % palette.length],
      startDeg: cursor,
      endDeg: cursor + deg,
      pct,
    });
    cursor += deg;
  });

  return (
    <div className="flex flex-col items-center gap-8 w-full">
      {/* SVG Pie / Donut */}
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <defs>
            <mask id="donut-mask">
              <rect x="-200" y="-200" width="1000" height="1000" fill="white" />
              <circle cx={CX} cy={CY} r={INNER} fill="black" />
            </mask>
          </defs>

          {totalVotes === 0 ? (
            /* Placeholder ring */
            <circle
              cx={CX} cy={CY} r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeDasharray="8 6"
              opacity={0.2}
            />
          ) : (
            <g mask="url(#donut-mask)">
              {slices.map((s) => {
                const isFlash = justVoted === s.choice.id;
                const d = slicePath(CX, CY, RADIUS, s.startDeg, s.endDeg);
                return (
                  <motion.path
                    key={s.choice.id}
                    d={d}
                    fill={s.color}
                    animate={{
                      scale: isFlash ? 1.05 : 1,
                      filter: isFlash
                        ? `drop-shadow(0 0 16px ${s.color}) brightness(1.3)`
                        : `drop-shadow(0 8px 12px rgba(0,0,0,0.3)) brightness(1)`,
                      opacity: s.pct === 0 ? 0 : 1,
                    }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    transition={{
                      scale: { type: "spring", stiffness: 300, damping: 18 },
                      filter: { duration: 0.35 },
                      opacity: { duration: 0.4 },
                    }}
                    style={{ originX: `${CX}px`, originY: `${CY}px` }}
                    strokeLinejoin="round"
                    strokeWidth={1}
                    stroke="rgba(255,255,255,0.1)"
                  />
                );
              })}
            </g>
          )}
        </svg>

        {/* HTML Overlay for Centre Typography */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none drop-shadow-md">
          <span className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/40 bg-clip-text text-transparent">
            {totalVotes}
          </span>
          <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-foreground/50 mt-1">
            {totalVotes === 0 ? "waiting..." : totalVotes === 1 ? "vote" : "votes"}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="w-full flex flex-col gap-3">
        {slices.map((s) => {
          const isFlash = justVoted === s.choice.id;
          return (
            <motion.div
              key={s.choice.id}
              className="relative flex items-center gap-3 glass rounded-xl px-4 py-3 overflow-hidden group"
              animate={{ scale: isFlash ? 1.04 : 1, boxShadow: isFlash ? `0 0 20px ${s.color}66` : "0 4px 30px rgba(0, 0, 0, 0.1)" }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
            >
              {/* Blurred glowing orb behind the card */}
              <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{ background: `radial-gradient(circle at 0% 50%, ${s.color} 0%, transparent 70%)` }}
              />

              {/* Colour dot */}
              <span
                className="relative z-10 flex-shrink-0 w-3.5 h-3.5 rounded-full"
                style={{ background: s.color, boxShadow: `0 0 8px ${s.color}99` }}
              />
              <span className="relative z-10 flex-1 text-sm font-semibold truncate text-foreground/90">{s.choice.label}</span>
              <span className="relative z-10 text-sm font-bold tabular-nums" style={{ color: s.color }}>
                <AnimatedNumber value={Math.round(s.pct * 100)} />%
              </span>
              <span className="relative z-10 text-xs font-medium opacity-50 tabular-nums">
                (<AnimatedNumber value={s.choice.votes} />)
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
