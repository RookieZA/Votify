import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp, isRateLimited } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// Zod Schemas for Validation
const choiceIdSchema = z.string().min(1).max(100);
const hostIdSchema = z.string().min(1).max(100);
const voterIdSchema = z.string().min(1).max(100);

const votePostSchema = z.object({
    hostId: hostIdSchema,
    choiceId: z.union([choiceIdSchema, z.array(choiceIdSchema).max(100)]),
    voterId: voterIdSchema,
    pollType: z.string().max(50).optional(),
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

const MAX_REQUESTS_PER_WINDOW = 30; // 30 votes per minute per IP
// Bounds to prevent unbounded memory growth from unauthenticated input.
const MAX_POLLS = 10_000;
const MAX_VOTERS_PER_POLL = 100_000;
const MAX_CHOICES_PER_POLL = 5_000; // e.g. distinct word-cloud entries

export async function POST(request: Request) {
    try {
        const ip = getClientIp(request);
        if (ip !== 'unknown' && isRateLimited(`vote:${ip}`, MAX_REQUESTS_PER_WINDOW)) {
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
            if (store.size >= MAX_POLLS) {
                return NextResponse.json({ error: 'Service busy, try again later' }, { status: 503 });
            }
            store.set(hostId, { votes: new Map<string, number>(), voters: new Set<string>() });
        }

        const pollData = store.get(hostId)!;

        // Check if this voter has already voted
        if (pollData.voters.has(voterId)) {
            return NextResponse.json({ error: 'Already voted' }, { status: 409 });
        }

        if (pollData.voters.size >= MAX_VOTERS_PER_POLL) {
            return NextResponse.json({ error: 'Poll is full' }, { status: 429 });
        }

        // Only count votes for choices we can track without unbounded growth.
        // New keys (e.g. word-cloud entries) are rejected once the cap is hit.
        const canAddNewChoice = (id: string) =>
            pollData.votes.has(id) || pollData.votes.size < MAX_CHOICES_PER_POLL;

        // Record the vote and the voter
        pollData.voters.add(voterId);

        if (Array.isArray(choiceId)) {
            if (pollType === 'ranked-choice') {
                const n = choiceId.length;
                choiceId.forEach((id, index) => {
                    if (!canAddNewChoice(id)) return;
                    const points = n - index;
                    const currentCount = pollData.votes.get(id) || 0;
                    pollData.votes.set(id, currentCount + points);
                });
            } else {
                choiceId.forEach(id => {
                    if (!canAddNewChoice(id)) return;
                    const currentCount = pollData.votes.get(id) || 0;
                    pollData.votes.set(id, currentCount + 1);
                });
            }
        } else {
            const finalChoiceId = (pollType === 'word-cloud') ? choiceId.trim().toLowerCase() : choiceId;
            if (canAddNewChoice(finalChoiceId)) {
                const currentCount = pollData.votes.get(finalChoiceId) || 0;
                pollData.votes.set(finalChoiceId, currentCount + 1);
            }
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
