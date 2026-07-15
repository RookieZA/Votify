"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { z } from "zod";
import { decodeData, getOrCreateVoterId } from "@/lib/utils";
import { usePeerConnection } from "@/hooks/usePeerConnection";
import { PollType } from "@/lib/store";
import { CheckCircle2, AlertTriangle, Loader2, Send, Lock, Pause } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/app/components/Logo";

const POLL_TYPES = ['multiple-choice', 'multiple-select', 'word-cloud', 'ranked-choice', 'qna'] as const;

// Shape of the poll payload carried in the join URL / host broadcasts. Both come
// from an untrusted source (crafted URL, or any peer acting as host), so validate.
const joinQuestionSchema = z.object({
    q: z.string().min(1),
    t: z.enum(POLL_TYPES).optional(),
    c: z.array(z.object({ i: z.string(), l: z.string() })).default([]),
});

const stateChangeSchema = z.object({
    type: z.literal("STATE_CHANGE"),
    status: z.enum(['open', 'paused', 'closed']).optional(),
    action: z.literal("next_question").optional(),
    data: joinQuestionSchema.optional(),
});

interface JoinQuestion {
    q: string;
    t: PollType;
    c: { i: string; l: string }[];
}

function JoinScreen() {
    const searchParams = useSearchParams();
    const peerId = searchParams.get("peerId");
    const dataB64 = searchParams.get("d");

    const [poll, setPoll] = useState<JoinQuestion | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [textInput, setTextInput] = useState("");

    // Status from Host (locked, paused)
    const [hostStatus, setHostStatus] = useState<'open' | 'paused' | 'closed'>('open');

    const [voted, setVoted] = useState(false);
    const [wordSubmitted, setWordSubmitted] = useState(false);
    const [error, setError] = useState("");
    const [submissionError, setSubmissionError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [localEmojis, setLocalEmojis] = useState<{ id: string; emoji: string; x: number }[]>([]);
    const isSubmittingRef = useRef(false);

    const { status, sendMessage } = usePeerConnection(peerId || "", (data: unknown) => {
        const parsed = stateChangeSchema.safeParse(data);
        if (!parsed.success) return;
        const msg = parsed.data;
        if (msg.status) setHostStatus(msg.status);
        if (msg.action === "next_question" && msg.data) {
            // The Host advanced the poll
            setPoll({ t: 'multiple-choice', ...msg.data } as JoinQuestion);
            setVoted(false);
            setWordSubmitted(false);
            setSelectedId(null);
            setSelectedIds([]);
            setTextInput("");
            setHostStatus('open');
            setSubmissionError("");
            setIsSubmitting(false);
            isSubmittingRef.current = false;
        }
    });

    useEffect(() => {
        setIsMounted(true);
        if (dataB64) {
            const decoded = decodeData<unknown>(dataB64);
            const parsed = joinQuestionSchema.safeParse(decoded);
            if (parsed.success) {
                // If it's an older payload without 't', default to multiple-choice
                setPoll({ t: 'multiple-choice', ...parsed.data } as JoinQuestion);
            } else {
                setError("Invalid poll data.");
            }
        } else {
            setError("No poll data found in URL.");
        }
    }, [dataB64]);

    if (!peerId) return <ErrorState message="Missing Host ID in URL." />;
    if (error) return <ErrorState message={error} />;
    if (!isMounted) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
    if (!poll) return null;

    const handleVote = async () => {
        if (voted || hostStatus !== 'open' || isSubmittingRef.current) return;

        let payloadContent: string | string[] | null = null;
        if (poll.t === 'multiple-choice' || poll.t === 'ranked-choice') {
            if (!selectedId) return;
            payloadContent = selectedId;
        } else if (poll.t === 'multiple-select') {
            if (selectedIds.length === 0) return;
            payloadContent = selectedIds;
        } else if (poll.t === 'word-cloud') {
            if (!textInput.trim()) return;
            // Since store uses `addVote` for word clouds to append the word
            payloadContent = textInput.trim();
        } else if (poll.t === 'qna') {
            if (!textInput.trim()) return;
            payloadContent = textInput.trim();
        }

        if (payloadContent === null) {
            return;
        }

        const voterId = getOrCreateVoterId();
        setSubmissionError("");
        setIsSubmitting(true);
        isSubmittingRef.current = true;

        const sendFallback = async (): Promise<boolean> => {
            if (poll.t === 'qna') {
                const response = await fetch('/api/qna', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        hostId: peerId,
                        text: payloadContent,
                        voterId,
                        action: 'post'
                    })
                });

                return response.ok;
            }

            const response = await fetch('/api/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hostId: peerId,
                    choiceId: payloadContent,
                    voterId,
                    pollType: poll.t
                })
            });

            return response.ok || response.status === 409;
        };

        try {
            const peerDelivered = poll.t === 'qna'
                ? sendMessage({ type: "QNA_POST", text: payloadContent as string, voterId })
                : sendMessage({ type: "VOTE", choiceId: payloadContent, voterId });

            let fallbackDelivered = false;
            try {
                fallbackDelivered = await sendFallback();
            } catch (fallbackError) {
                if (!peerDelivered) {
                    throw fallbackError;
                }
            }

            if (!peerDelivered && !fallbackDelivered) {
                throw new Error("Failed to submit response");
            }

            // Note: the participant deliberately does NOT write to the poll store.
            // The store is the host's source of truth; writing here would corrupt
            // counts when host and participant share a browser (same localStorage).
            if (poll.t === 'qna') {
                setTextInput("");
            } else if (poll.t === 'word-cloud') {
                setTextInput("");
                setWordSubmitted(true);
            } else {
                setVoted(true);
            }
        } catch (submitError) {
            console.error("Failed to submit response:", submitError);
            setSubmissionError("Failed to submit. Check your connection and try again.");
        } finally {
            setIsSubmitting(false);
            isSubmittingRef.current = false;
        }
    };

    const sendEmoji = (emoji: string) => {
        sendMessage({ type: "EMOJI", emoji, voterId: getOrCreateVoterId() });
        // HTTP fallback so the host receives emojis even when PeerJS fails
        fetch('/api/emoji', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hostId: peerId, emoji })
        }).catch(() => { });
        // Local visual feedback regardless of PeerJS connection
        const id = Math.random().toString();
        const x = Math.random() * 60 + 20;
        setLocalEmojis(prev => [...prev.slice(-10), { id, emoji, x }]);
        setTimeout(() => setLocalEmojis(prev => prev.filter(e => e.id !== id)), 3000);
    }

    const isSubmitDisabled = voted || hostStatus !== 'open' || isSubmitting ||
        ((poll.t === 'multiple-choice' || poll.t === 'ranked-choice') && !selectedId) ||
        (poll.t === 'multiple-select' && selectedIds.length === 0) ||
        ((poll.t === 'word-cloud' || poll.t === 'qna') && textInput.trim().length === 0);

    return (
        <main className="min-h-screen p-4 md:p-8 flex flex-col items-center justify-center pb-24">
            <div className="mb-5 animate-in fade-in duration-700">
                <Logo size={22} />
            </div>
            <div className="w-full max-w-lg glass rounded-3xl overflow-hidden animate-in slide-in-from-bottom-8 duration-700">

                {/* Header */}
                <div className="p-6 border-b border-border relative">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary mb-2 block">
                        {poll.t.replace('-', ' ')}
                    </span>
                    <h1 className="font-display text-2xl font-bold tracking-tight leading-snug pr-16">{poll.q}</h1>
                    <div className="absolute top-6 right-6 flex flex-col items-end" aria-live="polite">
                        <StatusIcon status={status} />
                        <span className="mt-2 text-xs text-foreground/60">{getConnectionStatusText(status)}</span>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {hostStatus === 'closed' ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Lock className="w-12 h-12 text-red-500 mb-4" aria-hidden="true" />
                            <h2 className="font-display text-2xl font-bold tracking-tight mb-2">Session closed</h2>
                            <p className="text-foreground/60">The host has closed this session.</p>
                        </div>
                    ) : hostStatus === 'paused' ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Pause className="w-12 h-12 text-yellow-500 mb-4" aria-hidden="true" />
                            <h2 className="font-display text-2xl font-bold tracking-tight mb-2">Hang tight</h2>
                            <p className="text-foreground/60">The host has paused voting for a moment.</p>
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            {(!voted || poll.t === 'qna') ? (
                                <motion.div
                                    key="voting"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="space-y-4"
                                >
                                    {(poll.t === 'multiple-choice' || poll.t === 'ranked-choice') && (
                                        <>
                                            {poll.t === 'ranked-choice' && (
                                                <p className="text-sm text-foreground/60">
                                                    Pick your favorite — the most popular pick ranks #1.
                                                </p>
                                            )}
                                            {poll.c.map((choice) => (
                                                <button
                                                    key={choice.i}
                                                    onClick={() => setSelectedId(choice.i)}
                                                    aria-pressed={selectedId === choice.i}
                                                    className={`w-full px-5 py-4 rounded-2xl text-left flex justify-between items-center transition-all ${selectedId === choice.i
                                                        ? "bg-primary/10 ring-2 ring-primary"
                                                        : "bg-secondary hover:brightness-105 active:scale-[0.99]"
                                                        }`}
                                                >
                                                    <span className="font-medium text-[17px]">{choice.l}</span>
                                                    {selectedId === choice.i && (
                                                        <CheckCircle2 className="w-5 h-5 text-primary animate-in zoom-in" aria-hidden="true" />
                                                    )}
                                                </button>
                                            ))}
                                        </>
                                    )}

                                    {poll.t === 'multiple-select' && poll.c.map((choice) => (
                                        <button
                                            key={choice.i}
                                            onClick={() => {
                                                if (selectedIds.includes(choice.i)) setSelectedIds(selectedIds.filter(id => id !== choice.i));
                                                else setSelectedIds([...selectedIds, choice.i]);
                                            }}
                                            aria-pressed={selectedIds.includes(choice.i)}
                                            className={`w-full px-5 py-4 rounded-2xl text-left flex justify-between items-center transition-all ${selectedIds.includes(choice.i)
                                                ? "bg-primary/10 ring-2 ring-primary"
                                                : "bg-secondary hover:brightness-105 active:scale-[0.99]"
                                                }`}
                                        >
                                            <span className="font-medium text-[17px]">{choice.l}</span>
                                            {selectedIds.includes(choice.i) && (
                                                <CheckCircle2 className="w-5 h-5 text-primary animate-in zoom-in" aria-hidden="true" />
                                            )}
                                        </button>
                                    ))}

                                    {['word-cloud', 'qna'].includes(poll.t) && (
                                        <div className="space-y-2.5">
                                            <label htmlFor="participant-response" className="sr-only">
                                                {poll.t === 'qna' ? 'Ask a question' : 'Enter a short word or phrase'}
                                            </label>
                                            <textarea
                                                id="participant-response"
                                                rows={3}
                                                placeholder={poll.t === 'qna' ? "Ask a question…" : "Type a short word or phrase…"}
                                                className="w-full px-5 py-4 rounded-2xl bg-secondary border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/60 focus:bg-background transition-all text-[17px] resize-none placeholder:text-foreground/35"
                                                value={textInput}
                                                onChange={(e) => setTextInput(e.target.value)}
                                            />
                                            {poll.t === 'word-cloud' && wordSubmitted && (
                                                <p className="flex items-center gap-2 rounded-2xl bg-green-500/10 px-4 py-3 text-sm font-medium text-green-600 dark:text-green-400" aria-live="polite">
                                                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                                                    Added! Feel free to send another.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {submissionError && (
                                        <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-500">
                                            {submissionError}
                                        </p>
                                    )}

                                    <button
                                        onClick={handleVote}
                                        disabled={isSubmitDisabled}
                                        className="w-full mt-6 py-4 rounded-full bg-primary text-primary-foreground text-[17px] font-medium flex items-center justify-center gap-2 shadow-lg shadow-primary/25 transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                Submitting… <Loader2 className="w-4 h-4 ml-1 animate-spin" aria-hidden="true" />
                                            </>
                                        ) : (
                                            <>
                                                {poll.t === 'qna' ? 'Send question' : poll.t === 'word-cloud' ? 'Send response' : 'Submit vote'} <Send className="w-4 h-4 ml-1" aria-hidden="true" />
                                            </>
                                        )}
                                    </button>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="voted"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex flex-col items-center justify-center py-12 text-center"
                                >
                                    <div className="w-20 h-20 bg-green-500/15 rounded-full flex items-center justify-center mb-6">
                                        <CheckCircle2 className="w-10 h-10 text-green-500" aria-hidden="true" />
                                    </div>
                                    <h2 className="font-display text-2xl font-bold tracking-tight mb-2">You&apos;re in!</h2>
                                    <p className="text-foreground/60">Vote received — watch the big screen for results.</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    )}
                </div>

            </div>

            {/* Local Emoji Overlay */}
            <div className="pointer-events-none fixed inset-0 z-50">
                <AnimatePresence>
                    {localEmojis.map((e) => (
                        <motion.div
                            key={e.id}
                            initial={{ opacity: 0, y: 0, x: `${e.x}vw`, scale: 0.5 }}
                            animate={{ opacity: [0, 1, 1, 0], y: -400, scale: [0.5, 1.5, 1.5, 1] }}
                            transition={{ duration: 3, ease: "easeOut" }}
                            exit={{ opacity: 0 }}
                            className="absolute bottom-20 text-4xl"
                        >
                            {e.emoji}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Reactions Bar Overlay */}
            {hostStatus === 'open' && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 glass rounded-full px-6 py-3 flex gap-4 items-center shadow-xl shadow-black/10 border border-white/10 z-50">
                    {['❤️', '👍', '👏', '😂', '🔥'].map(emoji => (
                        <button
                            key={emoji}
                            onClick={() => sendEmoji(emoji)}
                            aria-label={`Send ${emoji} reaction`}
                            className="text-2xl hover:scale-125 transition-transform active:scale-95"
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            )}
        </main>
    );
}

function StatusIcon({ status }: { status: string }) {
    if (status === "connecting") return <Loader2 className="w-5 h-5 text-yellow-500 animate-spin" />;
    if (status === "connected") {
        return <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
        </span>;
    }
    return <AlertTriangle className="w-5 h-5 text-red-500" />;
}

function getConnectionStatusText(status: string): string {
    if (status === "connecting") return "Connecting";
    if (status === "connected") return "Connected";
    if (status === "disconnected") return "Disconnected";
    return "Connection error";
}

function ErrorState({ message }: { message: string }) {
    return (
        <main className="min-h-screen flex items-center justify-center p-4">
            <div className="glass p-8 rounded-2xl flex flex-col items-center text-center max-w-sm">
                <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-xl font-bold mb-2">Error</h2>
                <p className="text-foreground/70">{message}</p>
            </div>
        </main>
    );
}

export default function JoinPoll() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
            <JoinScreen />
        </Suspense>
    );
}
