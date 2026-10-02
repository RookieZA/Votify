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
    // False while the bubble is still dropping in from above the container;
    // once fully inside, the top wall applies so the pile can't push it out.
    entered: boolean;
    el: HTMLDivElement;
    textEl: HTMLSpanElement;
}

const GRAVITY = 0.5;
const FRICTION = 0.992;
const WALL_RESTITUTION = 0.4;
const COLLISION_ITERATIONS = 4;
const RADIUS_EASE = 0.12;
const MIN_RADIUS = 30;
// Max fraction of the container's area the bubbles may cover in total. Circles
// can't tile perfectly, so leave plenty of slack or the pile overflows.
const MAX_FILL = 0.5;
// Inner text box as a fraction of the bubble diameter (keeps text inside the circle).
const TEXT_BOX = 0.72;
const LINE_HEIGHT = 1.1;

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
            layout();
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

    const choicesRef = useRef<BubbleChoice[]>(choices);

    // Reconcile the bubble set whenever the words or their votes change.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        choicesRef.current = choices;

        const bubbles = bubblesRef.current;
        const { w, h } = sizeRef.current;
        const reduced = reducedMotionRef.current;
        const seen = new Set<string>();

        for (const choice of choices) {
            seen.add(choice.id);
            const existing = bubbles.get(choice.id);
            if (existing) {
                existing.label = choice.label;
                existing.textEl.textContent = choice.label;
                continue;
            }

            const color = palette[colorSeqRef.current % palette.length];
            colorSeqRef.current += 1;

            const { el, textEl } = createBubbleEl(choice.label, color);
            container.appendChild(el);

            const bubble: Bubble = {
                id: choice.id,
                label: choice.label,
                color,
                x: w > 0 ? w * (0.25 + Math.random() * 0.5) : 100,
                // Reduced motion: place inside the bowl and let it settle gently.
                // Otherwise: drop in from above the container (y fixed up in layout).
                y: reduced ? h * 0.4 : -MIN_RADIUS,
                vx: reduced ? 0 : (Math.random() - 0.5) * 2,
                vy: reduced ? 0 : 1,
                r: MIN_RADIUS * 0.4,
                targetR: MIN_RADIUS,
                fontSize: 13,
                entered: reduced,
                el,
                textEl,
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

        layout();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [choices, palette]);

    // Compute every bubble's target radius and font size. Sizes are first
    // derived from votes and text length, then scaled down uniformly so the
    // whole set always fits inside the container — long, sentence-length
    // entries (e.g. questions) would otherwise overflow the bowl after a few.
    function layout() {
        const bubbles = bubblesRef.current;
        const { w, h } = sizeRef.current;
        if (bubbles.size === 0 || w === 0 || h === 0) return;

        const votesById = new Map(choicesRef.current.map((c) => [c.id, c.votes]));
        const maxVotes = Math.max(1, ...votesById.values());
        const maxRadius = Math.max(MIN_RADIUS + 10, Math.min(w, h) * 0.42);

        const sized: { b: Bubble; r: number; fontSize: number }[] = [];
        let totalArea = 0;
        for (const b of bubbles.values()) {
            const weight = (votesById.get(b.id) ?? 1) / maxVotes;
            const fontSize = 13 + weight * 22; // px
            const r = clamp(
                Math.max(MIN_RADIUS + weight * 46, textRadius(b.label, fontSize)),
                MIN_RADIUS,
                maxRadius
            );
            sized.push({ b, r, fontSize });
            totalArea += Math.PI * r * r;
        }

        const scale = Math.min(1, Math.sqrt((MAX_FILL * w * h) / totalArea));

        for (const { b, r, fontSize } of sized) {
            b.targetR = r * scale;
            b.fontSize = Math.max(9, fontSize * scale);
            // Clamp the text to however many lines fit in the circle; anything
            // longer is truncated with an ellipsis.
            const lines = Math.max(1, Math.floor((b.targetR * 2 * TEXT_BOX) / (b.fontSize * LINE_HEIGHT)));
            b.textEl.style.webkitLineClamp = String(lines);
            b.el.style.fontSize = `${b.fontSize}px`;
            if (!b.entered && b.y < 0) b.y = -b.targetR;
            b.x = clamp(b.x, b.targetR, Math.max(b.targetR, w - b.targetR));
        }
    }

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
            if (!b.entered && b.y - b.r >= 0) b.entered = true;
            constrainToWalls(b, w, h);
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

        // Collisions can shove bubbles through a wall; pull them back inside.
        for (const b of list) constrainToWalls(b, w, h);

        // Write to the DOM once per frame.
        for (const b of list) {
            const d = b.r * 2;
            b.el.style.width = `${d}px`;
            b.el.style.height = `${d}px`;
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

function createBubbleEl(label: string, color: string): { el: HTMLDivElement; textEl: HTMLSpanElement } {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.left = "0";
    el.style.top = "0";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.textAlign = "center";
    el.style.borderRadius = "9999px";
    el.style.boxSizing = "border-box";
    el.style.overflow = "hidden";
    el.style.fontWeight = "700";
    el.style.lineHeight = String(LINE_HEIGHT);
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

    const textEl = document.createElement("span");
    textEl.textContent = label;
    textEl.style.display = "-webkit-box";
    textEl.style.webkitBoxOrient = "vertical";
    textEl.style.overflow = "hidden";
    textEl.style.overflowWrap = "anywhere";
    textEl.style.width = `${TEXT_BOX * 100}%`;
    el.appendChild(textEl);

    requestAnimationFrame(() => {
        el.style.opacity = "1";
    });
    return { el, textEl };
}

// Radius needed to fit `label` inside a circle at `fontSize`, letting
// multi-word text wrap onto several lines instead of one very wide line.
function textRadius(label: string, fontSize: number): number {
    const charW = fontSize * 0.66;
    const longestWord = Math.max(...label.split(/\s+/).map((word) => word.length));
    // Text wraps into a square-ish block that must fit in the circle's inner box.
    const blockSide = Math.sqrt(label.length * charW * fontSize * LINE_HEIGHT);
    const side = Math.max(blockSide, Math.min(longestWord, 14) * charW);
    return side / (2 * TEXT_BOX) + 4;
}

function constrainToWalls(b: Bubble, w: number, h: number) {
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
    } else if (b.entered && b.y - b.r < 0) {
        b.y = b.r;
        b.vy = Math.abs(b.vy) * WALL_RESTITUTION;
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
