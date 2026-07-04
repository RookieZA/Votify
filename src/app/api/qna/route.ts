import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp, isRateLimited } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const hostIdSchema = z.string().min(1).max(100);

const qnaPostSchema = z.object({
    hostId: hostIdSchema,
    text: z.string().min(1).max(1000),
    voterId: z.string().min(1).max(100),
    action: z.literal('post').optional(),
});

const getQnaSchema = z.object({
    hostId: hostIdSchema,
});

interface QnaItem {
    id: string;
    text: string;
    upvotes: number;
    userId: string;
    upvoterIds: string[];
}

const globalAny = global as any;
if (!globalAny.qnaStore) {
    globalAny.qnaStore = new Map<string, QnaItem[]>();
}
const store: Map<string, QnaItem[]> = globalAny.qnaStore;

const MAX_REQUESTS_PER_WINDOW = 30; // 30 posts per minute per IP
const MAX_POLLS = 10_000;
const MAX_ITEMS_PER_POLL = 500;

export async function POST(request: Request) {
    try {
        const ip = getClientIp(request);
        if (ip !== 'unknown' && isRateLimited(`qna:${ip}`, MAX_REQUESTS_PER_WINDOW)) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const body = await request.json();
        const action = body?.action || 'post';

        if (action === 'post') {
            const parsed = qnaPostSchema.safeParse(body);
            if (!parsed.success) {
                return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
            }

            const { hostId, text, voterId } = parsed.data;
            if (!store.has(hostId)) {
                if (store.size >= MAX_POLLS) {
                    return NextResponse.json({ error: 'Service busy, try again later' }, { status: 503 });
                }
                store.set(hostId, []);
            }

            const qnaData = store.get(hostId)!;
            if (qnaData.length >= MAX_ITEMS_PER_POLL) {
                return NextResponse.json({ error: 'Question limit reached' }, { status: 429 });
            }

            const newItem: QnaItem = {
                id: crypto.randomUUID(),
                text,
                upvotes: 0,
                userId: voterId,
                upvoterIds: []
            };
            qnaData.push(newItem);
            return NextResponse.json({ success: true, item: newItem });
        }
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const hostIdParam = searchParams.get('hostId');

    const parsed = getQnaSchema.safeParse({ hostId: hostIdParam });
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid hostId' }, { status: 400 });
    }

    const { hostId } = parsed.data;
    const qnaData = store.get(hostId) || [];

    return NextResponse.json({ qnaItems: qnaData });
}
