"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { z } from "zod";
import { decodeData, getOrCreateVoterId } from "@/lib/utils";
import { usePeerConnection } from "@/hooks/usePeerConnection";
import { usePollStore, PollType } from "@/lib/store";
import { CheckCircle2, AlertTriangle, Loader2, Send, Lock, Pause } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

    const addVote = usePollStore((state) => state.addVote);

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

    const handleSelectRanked = (id: string) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(x => x !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    }

    const handleVote = async () => {
        if (voted || hostStatus !== 'open' || isSubmittingRef.current) return;

        let payloadContent: string | string[] | null = null;
        if (poll.t === 'multiple-choice') {
            if (!selectedId) return;
            payloadContent = selectedId;
        } else if (poll.t === 'multiple-select' || poll.t === 'ranked-choice') {
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

            if (poll.t === 'qna') {
                setTextInput("");
            } else if (poll.t === 'word-cloud') {
                addVote(payloadContent, voterId);
                setTextInput("");
                setWordSubmitted(true);
            } else {
                addVote(payloadContent, voterId);
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
        (poll.t === 'multiple-choice' && !selectedId) ||
        (poll.t === 'multiple-select' && selectedIds.length === 0) ||
        (poll.t === 'ranked-choice' && selectedIds.length !== poll.c.length) ||
        ((poll.t === 'word-cloud' || poll.t === 'qna') && textInput.trim().length === 0);

    return (
        <main className="min-h-screen p-4 md:p-8 flex flex-col items-center justify-center pb-24">
            <div className="w-full max-w-lg glass rounded-2xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 duration-700">

                {/* Header */}
                <div className="p-6 border-b border-border bg-background/20 relative">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary mb-2 block">
                        {poll.t.replace('-', ' ')}
                    </span>
                    <h1 className="text-2xl font-bold pr-16">{poll.q}</h1>
                    <div className="absolute top-6 right-6 flex flex-col items-end" aria-live="polite">
                        <StatusIcon status={status} />
                        <span className="mt-2 text-xs text-foreground/70">{getConnectionStatusText(status)}</span>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {hostStatus === 'closed' ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Lock className="w-12 h-12 text-red-500 mb-4" />
                            <h2 className="text-2xl font-bold mb-2">Poll Closed</h2>
                            <p className="text-foreground/70">The host has closed this session.</p>
                        </div>
                    ) : hostStatus === 'paused' ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Pause className="w-12 h-12 text-yellow-500 mb-4" />
                            <h2 className="text-2xl font-bold mb-2">Poll Paused</h2>
                            <p className="text-foreground/70">Wait for the host to resume voting.</p>
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
                                    {poll.t === 'multiple-choice' && poll.c.map((choice) => (
                                        <button
                                            key={choice.i}
                                            onClick={() => setSelectedId(choice.i)}
                                            aria-pressed={selectedId === choice.i}
                                            className={`w-full p-4 rounded-xl border text-left flex justify-between items-center transition-all ${selectedId === choice.i
                                                ? "border-primary bg-primary/20 scale-[1.02]"
                                                : "border-border hover:bg-white/5"
                                                }`}
                                        >
                                            <span className="font-medium text-lg">{choice.l}</span>
                                            {selectedId === choice.i && (
                                                <CheckCircle2 className="w-5 h-5 text-primary animate-in zoom-in" />
                                            )}
                                        </button>
                                    ))}

                                    {poll.t === 'multiple-select' && poll.c.map((choice) => (
                                        <button
                                            key={choice.i}
                                            onClick={() => {
                                                if (selectedIds.includes(choice.i)) setSelectedIds(selectedIds.filter(id => id !== choice.i));
                                                else setSelectedIds([...selectedIds, choice.i]);
                                            }}
                                            aria-pressed={selectedIds.includes(choice.i)}
                                            className={`w-full p-4 rounded-xl border text-left flex justify-between items-center transition-all ${selectedIds.includes(choice.i)
                                                ? "border-primary bg-primary/20 scale-[1.02]"
                                                : "border-border hover:bg-white/5"
                                                }`}
                                        >
                                            <span className="font-medium text-lg">{choice.l}</span>
                                            {selectedIds.includes(choice.i) && (
                                                <CheckCircle2 className="w-5 h-5 text-primary animate-in zoom-in" />
                                            )}
                                        </button>
                                    ))}

                                    {poll.t === 'ranked-choice' && (
                                        <div className="space-y-2">
                                            <p className="text-sm text-foreground/70 mb-4">Click options in order of preference.</p>
                                            {poll.c.map((choice) => {
                                                const rank = selectedIds.indexOf(choice.i) + 1;
                                                const isSelected = rank > 0;
                                                return (
                                                    <button
                                                        key={choice.i}
                                                        onClick={() => handleSelectRanked(choice.i)}
                                                        aria-pressed={isSelected}
                                                        aria-label={isSelected ? `${choice.l}, rank ${rank}` : `Select ${choice.l}`}
                                                        className={`w-full p-4 rounded-xl border text-left flex items-center transition-all gap-4 ${isSelected
                                                            ? "border-primary bg-primary/20 scale-[1.02]"
                                                            : "border-border hover:bg-white/5"
                                                            }`}
                                                    >
                                                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold transition-all ${isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-transparent'}`}>
                                                            {isSelected ? rank : ''}
                                                        </div>
                                                        <span className="font-medium text-lg">{choice.l}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {['word-cloud', 'qna'].includes(poll.t) && (
                                        <div className="space-y-2">
                                            <label htmlFor="participant-response" className="sr-only">
                                                {poll.t === 'qna' ? 'Ask a question' : 'Enter a short word or phrase'}
                                            </label>
                                            <textarea
                                                id="participant-response"
                                                rows={3}
                                                placeholder={poll.t === 'qna' ? "Ask a question..." : "Enter a short word or phrase..."}
                                                className="w-full p-4 rounded-xl bg-background/50 border border-border focus:outline-none focus:ring-2 focus:ring-primary backdrop-blur-md transition-all text-lg resize-none"
                                                value={textInput}
                                                onChange={(e) => setTextInput(e.target.value)}
                                            />
                                            {poll.t === 'word-cloud' && wordSubmitted && (
                                                <p className="flex items-center gap-2 rounded-xl border border-green-400/30 bg-green-500/10 px-4 py-3 text-sm text-green-400" aria-live="polite">
                                                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                                                    Response added! You can submit another.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {submissionError && (
                                        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                            {submissionError}
                                        </p>
                                    )}

                                    <button
                                        onClick={handleVote}
                                        disabled={isSubmitDisabled}
                                        className="w-full mt-6 py-4 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                Submitting... <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                                            </>
                                        ) : (
                                            <>
                                                Submi{poll.t === 'qna' ? 't Question' : 't Vote'} <Send className="w-4 h-4 ml-2" />
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
                                    <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
                                        <CheckCircle2 className="w-10 h-10 text-green-500" />
                                    </div>
                                    <h2 className="text-2xl font-bold mb-2">Vote Submitted!</h2>
                                    <p className="text-foreground/70">Wait for the Host to advance to the next question.</p>
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
