import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp, isRateLimited } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// Constants for TTL and size management
const POLL_STORE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_POLLS_IN_STORE = 1000; // Max concurrent polls
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Clean expired every hour

// Enhanced poll data structure with TTL metadata
interface PollData {
    votes: Map<string, number>;
    voters: Set<string>;
    createdAt: number;
    lastAccessedAt: number;
}

// Response type definitions
interface VoteResponse {
    success: boolean;
    votes: Record<string, number>;
}

interface VoteGetResponse {
    votes: Record<string, number>;
}

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

type VoteGlobalStore = typeof globalThis & {
    votesStore?: Map<string, PollData>;
    lastCleanup?: number;
};

// Global store using nested Maps to prevent Prototype Pollution
// Map<hostId, PollData>
const voteGlobalStore = globalThis as VoteGlobalStore;
if (!voteGlobalStore.votesStore) {
    voteGlobalStore.votesStore = new Map<string, PollData>();
    voteGlobalStore.lastCleanup = Date.now();
}
const store: Map<string, PollData> = voteGlobalStore.votesStore;

const MAX_REQUESTS_PER_WINDOW = 30; // 30 votes per minute per IP
// Bounds to prevent unbounded memory growth from unauthenticated input.
const MAX_VOTERS_PER_POLL = 100_000;
const MAX_CHOICES_PER_POLL = 5_000; // e.g. distinct word-cloud entries

/**
 * Cleans up expired polls and enforces max capacity limits
 */
function cleanupExpiredPolls(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // Find and collect expired polls
    store.forEach((pollData, hostId) => {
        if (now - pollData.createdAt > POLL_STORE_TTL_MS) {
            expiredKeys.push(hostId);
        }
    });

    // Remove expired polls
    expiredKeys.forEach(key => store.delete(key));

    // If over max capacity, remove least recently accessed polls
    if (store.size > MAX_POLLS_IN_STORE) {
        const entries = Array.from(store.entries())
            .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);
        const toRemove = entries.slice(0, store.size - MAX_POLLS_IN_STORE);
        toRemove.forEach(([key]) => store.delete(key));
    }
}

export async function POST(request: Request) {
    try {
        // Periodically clean up expired polls
        const now = Date.now();
        if (now - (voteGlobalStore.lastCleanup ?? 0) > CLEANUP_INTERVAL_MS) {
            cleanupExpiredPolls();
            voteGlobalStore.lastCleanup = now;
        }

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
            // Check if we're at capacity before creating new poll
            if (store.size >= MAX_POLLS_IN_STORE) {
                return NextResponse.json(
                    { error: 'Server at capacity' },
                    { status: 503 }
                );
            }
            store.set(hostId, {
                votes: new Map<string, number>(),
                voters: new Set<string>(),
                createdAt: now,
                lastAccessedAt: now
            });
        } else {
            // Update last accessed time for existing poll
            const pollData = store.get(hostId)!;
            pollData.lastAccessedAt = now;
        }

        const pollData = store.get(hostId)!;

        // Check if this voter has already voted (word clouds allow multiple submissions per voter)
        if (pollType !== 'word-cloud' && pollData.voters.has(voterId)) {
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
        const votesObj: Record<string, number> = Object.fromEntries(pollData.votes);
        const response: VoteResponse = { success: true, votes: votesObj };
        return NextResponse.json(response);
    } catch {
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

    // Update last accessed time if poll exists
    if (pollData) {
        pollData.lastAccessedAt = Date.now();
    }

    const votesObj: Record<string, number> = pollData ? Object.fromEntries(pollData.votes) : {};
    const response: VoteGetResponse = { votes: votesObj };

    return NextResponse.json(response);
}
