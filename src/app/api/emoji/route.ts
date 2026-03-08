import { NextRequest, NextResponse } from "next/server";

// In-memory store: hostId -> array of emoji events (cleared once read)
const emojiQueues = new Map<string, { emoji: string; ts: number }[]>();

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { hostId, emoji } = body;
        if (!hostId || typeof emoji !== "string") {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }
        const queue = emojiQueues.get(hostId) ?? [];
        queue.push({ emoji, ts: Date.now() });
        // Keep at most 100 pending emojis to limit memory
        if (queue.length > 100) queue.shift();
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
