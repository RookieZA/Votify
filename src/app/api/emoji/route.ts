import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// In-memory store: hostId -> array of emoji events (drained once read).
// Uses a global guard so it survives dev HMR, consistent with the other routes.
const globalAny = global as any;
if (!globalAny.emojiQueues) {
    globalAny.emojiQueues = new Map<string, { emoji: string; ts: number }[]>();
}
const emojiQueues: Map<string, { emoji: string; ts: number }[]> = globalAny.emojiQueues;

const emojiPostSchema = z.object({
    hostId: z.string().min(1).max(100),
    emoji: z.string().min(1).max(32),
});

const MAX_REQUESTS_PER_WINDOW = 120; // reactions are frequent; allow more headroom
const MAX_POLLS = 10_000;
const MAX_QUEUE_PER_POLL = 100;

export async function POST(req: NextRequest) {
    try {
        const ip = getClientIp(req);
        if (ip !== "unknown" && isRateLimited(`emoji:${ip}`, MAX_REQUESTS_PER_WINDOW)) {
            return NextResponse.json({ error: "Too many requests" }, { status: 429 });
        }

        const body = await req.json();
        const parsed = emojiPostSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }
        const { hostId, emoji } = parsed.data;

        if (!emojiQueues.has(hostId) && emojiQueues.size >= MAX_POLLS) {
            return NextResponse.json({ error: "Service busy, try again later" }, { status: 503 });
        }

        const queue = emojiQueues.get(hostId) ?? [];
        queue.push({ emoji, ts: Date.now() });
        // Keep at most MAX_QUEUE_PER_POLL pending emojis to limit memory
        if (queue.length > MAX_QUEUE_PER_POLL) queue.shift();
        emojiQueues.set(hostId, queue);
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
}

export async function GET(req: NextRequest) {
    const hostId = req.nextUrl.searchParams.get("hostId");
    if (!hostId) return NextResponse.json({ emojis: [] });
    // Drain the queue and return it – host consumes once
    const queue = emojiQueues.get(hostId) ?? [];
    emojiQueues.set(hostId, []);
    return NextResponse.json({ emojis: queue.map((e) => e.emoji) });
}
