import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const hostIdSchema = z.string().min(1).max(100);

const qnaPostSchema = z.object({
    hostId: hostIdSchema,
    text: z.string().min(1),
    voterId: z.string().min(1).max(100),
    action: z.literal('post').optional(),
});

const getQnaSchema = z.object({
    hostId: hostIdSchema,
});

const globalAny = global as any;
if (!globalAny.qnaStore) {
    globalAny.qnaStore = new Map<string, any[]>();
}
const store: Map<string, any[]> = globalAny.qnaStore;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const action = body.action || 'post';

        if (action === 'post') {
            const parsed = qnaPostSchema.safeParse(body);
            if (!parsed.success) {
                return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
            }

            const { hostId, text, voterId } = parsed.data;
            if (!store.has(hostId)) {
                store.set(hostId, []);
            }

            const qnaData = store.get(hostId)!;
            const newItem = {
                id: Math.random().toString(36).substring(7),
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
