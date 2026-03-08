import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Zod Schemas for Validation
const choiceIdSchema = z.string().min(1).max(100);
const hostIdSchema = z.string().min(1).max(100);
const voterIdSchema = z.string().min(1).max(100);

const votePostSchema = z.object({
    hostId: hostIdSchema,
    choiceId: z.union([choiceIdSchema, z.array(choiceIdSchema)]),
    voterId: voterIdSchema,
    pollType: z.string().optional(),
});

const voteGetSchema = z.object({
    hostId: hostIdSchema,
});

// Global store using nested Maps to prevent Prototype Pollution
// Map<hostId, { votes: Map<choiceId, count>, voters: Set<voterId> }>
const globalAny = global as any;
if (!globalAny.votesStore) {
    globalAny.votesStore = new Map<string, { votes: Map<string, number>, voters: Set<string> }>();
}
const store: Map<string, { votes: Map<string, number>, voters: Set<string> }> = globalAny.votesStore;

// Basic Rate Limiting Store
if (!globalAny.rateLimitStore) {
    globalAny.rateLimitStore = new Map<string, { count: number, resetAt: number }>();
}
const rateLimitStore: Map<string, { count: number, resetAt: number }> = globalAny.rateLimitStore;

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // 30 votes per minute per IP

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const record = rateLimitStore.get(ip);

    if (!record || record.resetAt < now) {
        // Create new record or reset expired one
        rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }

    if (record.count >= MAX_REQUESTS_PER_WINDOW) {
        return true;
    }

    // Increment count
    record.count++;
    return false;
}

export async function POST(request: Request) {
    try {
        const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
        if (ip !== 'unknown' && isRateLimited(ip)) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const body = await request.json();
        const parsed = votePostSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 });
        }

        const { hostId, choiceId, voterId, pollType } = parsed.data;

        // Initialize host poll if it doesn't exist
        if (!store.has(hostId)) {
            store.set(hostId, { votes: new Map<string, number>(), voters: new Set<string>() });
        }

        const pollData = store.get(hostId)!;

        // Check if this voter has already voted
        if (pollData.voters.has(voterId)) {
            return NextResponse.json({ error: 'Already voted' }, { status: 409 });
        }

        // Record the vote and the voter
        pollData.voters.add(voterId);

        if (Array.isArray(choiceId)) {
            if (pollType === 'ranked-choice') {
                const n = choiceId.length;
                choiceId.forEach((id, index) => {
                    const points = n - index;
                    const currentCount = pollData.votes.get(id) || 0;
                    pollData.votes.set(id, currentCount + points);
                });
            } else {
                choiceId.forEach(id => {
                    const currentCount = pollData.votes.get(id) || 0;
                    pollData.votes.set(id, currentCount + 1);
                });
            }
        } else {
            const finalChoiceId = (pollType === 'word-cloud') ? choiceId.trim().toLowerCase() : choiceId;
            const currentCount = pollData.votes.get(finalChoiceId) || 0;
            pollData.votes.set(finalChoiceId, currentCount + 1);
        }

        // Convert Map to plain object for JSON response
        const votesObj = Object.fromEntries(pollData.votes);
        return NextResponse.json({ success: true, votes: votesObj });
    } catch (error) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const hostIdParam = searchParams.get('hostId');

    const parsed = voteGetSchema.safeParse({ hostId: hostIdParam });

    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid or missing hostId' }, { status: 400 });
    }

    const { hostId } = parsed.data;

    const pollData = store.get(hostId);
    const votesObj = pollData ? Object.fromEntries(pollData.votes) : {};

    return NextResponse.json({ votes: votesObj });
}
