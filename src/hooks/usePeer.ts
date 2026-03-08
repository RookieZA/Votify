"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { DataConnection, Peer } from "peerjs";
import { z } from "zod";

export type PeerPayload =
    | { type: "VOTE"; choiceId: string | string[]; voterId: string }
    | { type: "EMOJI"; emoji: string; voterId: string }
    | { type: "QNA_POST"; text: string; voterId: string }
    | { type: "QNA_UPVOTE"; id: string; voterId: string };

const voteSchema = z.object({
    type: z.literal("VOTE"),
    choiceId: z.union([z.string().min(1), z.array(z.string())]),
    voterId: z.string().min(1).max(100)
});

const emojiSchema = z.object({
    type: z.literal("EMOJI"),
    emoji: z.string(),
    voterId: z.string().min(1).max(100)
});

const qnaPostSchema = z.object({
    type: z.literal("QNA_POST"),
    text: z.string().min(1),
    voterId: z.string().min(1).max(100)
});

const qnaUpvoteSchema = z.object({
    type: z.literal("QNA_UPVOTE"),
    id: z.string().min(1),
    voterId: z.string().min(1).max(100)
});

const payloadSchema = z.discriminatedUnion("type", [
    voteSchema,
    emojiSchema,
    qnaPostSchema,
    qnaUpvoteSchema
]);

export function usePeer(customId?: string, onPayload?: (payload: PeerPayload, peerId: string) => void) {
    const [peerId, setPeerId] = useState<string | null>(null);
    const [connections, setConnections] = useState<DataConnection[]>([]);
    const peerInstance = useRef<Peer | null>(null);

    const onPayloadRef = useRef(onPayload);
    useEffect(() => {
        onPayloadRef.current = onPayload;
    }, [onPayload]);

    useEffect(() => {
        let isMounted = true;
        if (typeof window !== "undefined") {
            import("peerjs").then(({ default: Peer }) => {
                if (!isMounted) return;
                try {
                    const id = customId || `poll-${Math.random().toString(36).substring(2, 9)}`;
                    const peer = new Peer(id);

                    peer.on("open", (id) => {
                        if (!isMounted) {
                            peer.destroy();
                            return;
                        }
                        setPeerId(id);
                    });

                    peer.on("connection", (conn) => {
                        if (!isMounted) return;
                        setConnections((prev) => [...prev, conn]);

                        conn.on("data", (data) => {
                            const parsed = payloadSchema.safeParse(data);
                            if (parsed.success && onPayloadRef.current) {
                                onPayloadRef.current(parsed.data, conn.peer);
                            } else if (!parsed.success) {
                                console.warn("Received invalid P2P payload format", parsed.error);
                            }
                        });

                        conn.on("close", () => {
                            setConnections((prev) => prev.filter((c) => c.peer !== conn.peer));
                        });
                    });

                    peer.on("error", (err) => {
                        console.error("Host Peer error:", err);
                    });

                    peerInstance.current = peer;
                } catch (error) {
                    console.error("Failed to initialize Host Peer:", error);
                }
            }).catch(err => {
                console.error("Failed to load peerjs:", err);
            });
        }

        return () => {
            isMounted = false;
            if (peerInstance.current) {
                peerInstance.current.destroy();
            }
        };
    }, [customId]);

    const broadcast = useCallback((data: any) => {
        connections.forEach((conn) => {
            if (conn.open) {
                conn.send(data);
            }
        });
    }, [connections]);

    return { peerId, connections, broadcast };
}
