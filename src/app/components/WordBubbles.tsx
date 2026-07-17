"use client";

/**
 * EXPERIMENTAL — physics-based word cloud.
 *
 * Words render as bubbles that drop into a "bowl" (the results container),
 * collide with each other and the walls, and settle under gravity. New words
 * fall in from the top and jostle the pile; a word's bubble grows as it gains
 * votes, pushing its neighbours aside.
 *
 * The simulation is a small impulse-based circle solver driven by
 * requestAnimationFrame. Bubbles are managed as imperative DOM nodes (not React
 * state) so we can update ~60fps without triggering React re-renders.
 *
 * If this experiment doesn't land, delete this file and revert the word-cloud
 * block in host/[id]/page.tsx — nothing else depends on it.
 */

import { useEffect, useRef } from "react";

export interface BubbleChoice {
    id: string;
    label: string;
    votes: number;
}

interface Bubble {
    id: string;
    label: string;
    color: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    targetR: number;
    fontSize: number;
    el: HTMLDivElement;
}

const GRAVITY = 0.5;
const FRICTION = 0.992;
const WALL_RESTITUTION = 0.4;
const COLLISION_ITERATIONS = 4;
const RADIUS_EASE = 0.12;
const MIN_RADIUS = 30;

export default function WordBubbles({
    choices,
    palette,
}: {
    choices: BubbleChoice[];
    palette: string[];
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const bubblesRef = useRef<Map<string, Bubble>>(new Map());
    const sizeRef = useRef({ w: 0, h: 0 });
    const rafRef = useRef<number | null>(null);
    const reducedMotionRef = useRef(false);
    // Colour index is assigned once per bubble, in arrival order, so colours
    // stay stable as votes reshuffle who is biggest.
    const colorSeqRef = useRef(0);

    // Measure the container and track resizes. Kick off the physics loop.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        reducedMotionRef.current = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;

        const measure = () => {
            sizeRef.current = { w: el.clientWidth, h: el.clientHeight };
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);

        const step = () => {
            simulate();
            rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);

        return () => {
            ro.disconnect();
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reconcile the bubble set whenever the words or their votes change.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const bubbles = bubblesRef.current;
        const { w, h } = sizeRef.current;
        const reduced = reducedMotionRef.current;

        const maxVotes = Math.max(1, ...choices.map((c) => c.votes));
        const minDim = Math.min(w || 600, h || 500);
        const maxRadius = Math.max(MIN_RADIUS + 10, minDim * 0.42);

        const seen = new Set<string>();

        for (const choice of choices) {
            seen.add(choice.id);
            const weight = choice.votes / maxVotes;
            const fontSize = 13 + weight * 22; // px
            const estTextWidth = choice.label.length * fontSize * 0.62;
            const targetR = clamp(
                Math.max(MIN_RADIUS + weight * 46, estTextWidth / 2 + 12),
                MIN_RADIUS,
                maxRadius
            );

            const existing = bubbles.get(choice.id);
            if (existing) {
                existing.targetR = targetR;
                existing.fontSize = fontSize;
                existing.label = choice.label;
                existing.el.textContent = choice.label;
                continue;
            }

            const color = palette[colorSeqRef.current % palette.length];
            colorSeqRef.current += 1;

            const spawnX = w > 0 ? clamp(w * (0.25 + Math.random() * 0.5), targetR, w - targetR) : 100;
            const el = createBubbleEl(choice.label, color);
            container.appendChild(el);

            const bubble: Bubble = {
                id: choice.id,
                label: choice.label,
                color,
                x: spawnX,
                // Reduced motion: place inside the bowl and let it settle gently.
                // Otherwise: drop in from above the container.
                y: reduced ? clamp(h * 0.4, targetR, Math.max(targetR, h - targetR)) : -targetR,
                vx: reduced ? 0 : (Math.random() - 0.5) * 2,
                vy: reduced ? 0 : 1,
                r: MIN_RADIUS * 0.4,
                targetR,
                fontSize,
                el,
            };
            bubbles.set(choice.id, bubble);
        }

        // Remove bubbles whose word disappeared (rare — word clouds only grow).
        for (const [id, bubble] of bubbles) {
            if (!seen.has(id)) {
                bubble.el.remove();
                bubbles.delete(id);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [choices, palette]);

    function simulate() {
        const bubbles = bubblesRef.current;
        if (bubbles.size === 0) return;
        const { w, h } = sizeRef.current;
        if (w === 0 || h === 0) return;

        const list = Array.from(bubbles.values());

        // Integrate: gravity, friction, movement, wall constraints.
        for (const b of list) {
            b.r += (b.targetR - b.r) * RADIUS_EASE;

            b.vy += GRAVITY;
            b.vx *= FRICTION;
            b.vy *= FRICTION;
            b.x += b.vx;
            b.y += b.vy;

            if (b.x - b.r < 0) {
                b.x = b.r;
                b.vx = Math.abs(b.vx) * WALL_RESTITUTION;
            } else if (b.x + b.r > w) {
                b.x = w - b.r;
                b.vx = -Math.abs(b.vx) * WALL_RESTITUTION;
            }
            if (b.y + b.r > h) {
                b.y = h - b.r;
                b.vy = -Math.abs(b.vy) * WALL_RESTITUTION;
            } else if (b.y - b.r < 0 && b.vy < 0) {
                b.y = b.r;
                b.vy = Math.abs(b.vy) * WALL_RESTITUTION;
            }
        }

        // Resolve pairwise collisions over a few iterations for a stable pile.
        for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    const a = list[i];
                    const b = list[j];
                    let dx = b.x - a.x;
                    let dy = b.y - a.y;
                    let dist = Math.hypot(dx, dy);
                    const minDist = a.r + b.r;
                    if (dist >= minDist) continue;

                    if (dist === 0) {
                        // Perfectly overlapping — nudge apart in a random dir.
                        dx = Math.random() - 0.5;
                        dy = Math.random() - 0.5;
                        dist = Math.hypot(dx, dy) || 1;
                    }

                    const nx = dx / dist;
                    const ny = dy / dist;
                    const overlap = minDist - dist;

                    // Split the separation by area so big bubbles shove little ones.
                    const aMass = a.r * a.r;
                    const bMass = b.r * b.r;
                    const total = aMass + bMass;
                    const aShare = bMass / total;
                    const bShare = aMass / total;

                    a.x -= nx * overlap * aShare;
                    a.y -= ny * overlap * aShare;
                    b.x += nx * overlap * bShare;
                    b.y += ny * overlap * bShare;

                    // Mild velocity response along the collision normal.
                    const rvx = b.vx - a.vx;
                    const rvy = b.vy - a.vy;
                    const relN = rvx * nx + rvy * ny;
                    if (relN < 0) {
                        const impulse = -relN * 0.5;
                        a.vx -= impulse * nx * bShare;
                        a.vy -= impulse * ny * bShare;
                        b.vx += impulse * nx * aShare;
                        b.vy += impulse * ny * aShare;
                    }
                }
            }
        }

        // Write to the DOM once per frame.
        for (const b of list) {
            const d = b.r * 2;
            b.el.style.width = `${d}px`;
            b.el.style.height = `${d}px`;
            b.el.style.fontSize = `${b.fontSize}px`;
            b.el.style.transform = `translate(${b.x - b.r}px, ${b.y - b.r}px)`;
        }
    }

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full overflow-hidden"
            aria-hidden="true"
        />
    );
}

function createBubbleEl(label: string, color: string): HTMLDivElement {
    const el = document.createElement("div");
    el.textContent = label;
    el.style.position = "absolute";
    el.style.left = "0";
    el.style.top = "0";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.textAlign = "center";
    el.style.borderRadius = "9999px";
    el.style.padding = "0 8px";
    el.style.boxSizing = "border-box";
    el.style.overflow = "hidden";
    el.style.fontWeight = "700";
    el.style.lineHeight = "1.05";
    el.style.letterSpacing = "-0.02em";
    el.style.userSelect = "none";
    el.style.willChange = "transform";
    el.style.background = `radial-gradient(circle at 32% 26%, ${color}42, ${color}17 58%, ${color}0d)`;
    el.style.border = `1.5px solid ${color}66`;
    el.style.color = color;
    el.style.boxShadow = `inset 0 -6px 16px ${color}22, 0 8px 22px ${color}1f`;
    el.style.backdropFilter = "blur(2px)";
    el.style.opacity = "0";
    el.style.transition = "opacity 0.45s ease";
    requestAnimationFrame(() => {
        el.style.opacity = "1";
    });
    return el;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
