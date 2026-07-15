"use client";

import { useEffect, useState } from "react";
import { motion, animate, useMotionValue } from "framer-motion";
import type { Choice } from "@/lib/store";

// iOS system colours, led by each theme's own accent.
const THEME_PALETTES: Record<string, string[]> = {
  light: ["#0a84ff", "#30d158", "#ff9f0a", "#ff375f", "#64d2ff", "#ffd60a"],
  midnight: ["#2997ff", "#30d158", "#ff9f0a", "#ff375f", "#64d2ff", "#ffd60a"],
  vivid: ["#ff9f0a", "#ffd60a", "#ff375f", "#0a84ff", "#30d158", "#64d2ff"],
  ocean: ["#30b0c7", "#34c759", "#0a84ff", "#64d2ff", "#ffd60a", "#ff9f0a"],
};

/** Resolve the active theme's palette from <html data-theme> (client-side). */
export function usePalette(): string[] {
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
  return palette;
}

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

interface BarResultsProps {
  choices: Choice[];
  /**
   * Sort by vote count (most-voted first) and show a rank badge per row,
   * with the top three medal-coloured. Use for single-pick "ranked choice"
   * polls where the ranking itself is the result.
   */
  ranked?: boolean;
}

const RANK_BADGE_CLASSES = [
  "bg-yellow-400/20 text-yellow-500",
  "bg-gray-400/20 text-gray-400",
  "bg-orange-600/20 text-orange-500",
];

/**
 * Projector-grade live results: large labels and percentages over full-width
 * animated bars, with the current leader glowing in its own colour.
 */
export default function BarResults({ choices, ranked = false }: BarResultsProps) {
  const palette = usePalette();
  const total = choices.reduce((s, c) => s + c.votes, 0);
  const max = Math.max(...choices.map((c) => c.votes), 0);

  // Colour is keyed to each choice's original position so it stays stable
  // even as `ranked` reorders rows while votes come in.
  const colorFor = (id: string) => {
    const idx = choices.findIndex((c) => c.id === id);
    return palette[idx % palette.length];
  };

  const ordered = ranked ? [...choices].sort((a, b) => b.votes - a.votes) : choices;

  return (
    <div className="w-full space-y-6">
      {ordered.map((c, i) => {
        const pct = total === 0 ? 0 : (c.votes / total) * 100;
        const isLeader = max > 0 && c.votes === max;
        const color = colorFor(c.id);
        return (
          <motion.div key={c.id} layout transition={{ type: "spring", stiffness: 300, damping: 28 }}>
            <div className="mb-2 flex items-end justify-between gap-4">
              <span className="flex items-center gap-3 min-w-0">
                {ranked && (
                  <span
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${RANK_BADGE_CLASSES[i] ?? "bg-primary/10 text-primary"}`}
                  >
                    {i + 1}
                  </span>
                )}
                <span className={`text-lg md:text-2xl font-semibold tracking-tight truncate ${isLeader ? "text-foreground" : "text-foreground/75"}`}>
                  {c.label}
                </span>
              </span>
              <span className="flex items-baseline gap-2 whitespace-nowrap">
                <span
                  className="text-xl md:text-3xl font-bold tabular-nums tracking-tight"
                  style={{ color: max > 0 ? color : undefined }}
                >
                  <AnimatedNumber value={Math.round(pct)} />%
                </span>
                <span className="text-sm text-foreground/50 tabular-nums">
                  <AnimatedNumber value={c.votes} />
                </span>
              </span>
            </div>
            <div className="h-3.5 md:h-4 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  background: color,
                  boxShadow: isLeader ? `0 0 16px ${color}80` : undefined,
                  width: `${pct}%`,
                }}
              />
            </div>
          </motion.div>
        );
      })}

      {total === 0 && (
        <p className="pt-2 text-center text-sm text-foreground/45 animate-pulse">
          Waiting for the first vote…
        </p>
      )}
    </div>
  );
}
