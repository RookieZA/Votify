"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Users, Copy, CheckCircle2, AlertTriangle, EyeOff, Eye, PauseCircle, PlayCircle, StopCircle, ArrowRight, ArrowLeft, Download } from "lucide-react";
import { usePollStore, useHistoryStore, QnaItem, limitQnaItems, sanitizeQnaText } from "@/lib/store";
import { usePeer } from "@/hooks/usePeer";
import { encodeData, randomId } from "@/lib/utils";
import BarResults, { usePalette } from "@/app/components/BarResults";
import WordBubbles from "@/app/components/WordBubbles";
import { Logo } from "@/app/components/Logo";
import { motion, AnimatePresence } from "framer-motion";

const FALLBACK_SYNC_INTERVAL_MS = 3000;

interface VoteSyncResponse {
    votes?: Record<string, number>;
}

interface QnaSyncResponse {
    qnaItems?: QnaItem[];
}

export default function HostDashboard() {
    const params = useParams();
    const router = useRouter();
    const hostId = params.id as string;

    const {
        hostId: storedHostId, pollType, status, resultsHidden, questions, currentQuestionIndex,
        question, choices, qnaItems,
        addVote, addQnaItem, upvoteQnaItem, setStatus, setResultsHidden, nextQuestion, resetPoll
    } = usePollStore();

    const addPastPoll = useHistoryStore(state => state.addPastPoll);
    const palette = usePalette();

    const [isMounted, setIsMounted] = useState(false);
    const [copied, setCopied] = useState(false);
    const [origin, setOrigin] = useState("");
    const [emojis, setEmojis] = useState<{ id: string, emoji: string, x: number }[]>([]);
    const fallbackSyncInFlightRef = useRef(false);

    useEffect(() => {
        setOrigin(window.location.origin);
        setIsMounted(true);
    }, []);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, []);

    useEffect(() => {
        if (isMounted && storedHostId !== hostId) {
            router.push("/");
        }
    }, [isMounted, storedHostId, hostId, router]);

    const syncFallbackState = useCallback(async (signal: AbortSignal) => {
        if (fallbackSyncInFlightRef.current) return;

        fallbackSyncInFlightRef.current = true;
        try {
            const currentPollType = usePollStore.getState().pollType;
            if (currentPollType === 'qna') {
                const res = await fetch(`/api/qna?hostId=${hostId}`, { cache: "no-store", signal });
                if (!res.ok) return;

                const data: QnaSyncResponse = await res.json();
                if (!data.qnaItems?.length) return;

                const currentQna = usePollStore.getState().qnaItems;
                let updated = false;
                const newQna = [...currentQna];

                data.qnaItems.forEach((apiItem) => {
                    const sanitizedText = sanitizeQnaText(apiItem.text);
                    if (!sanitizedText) {
                        return;
                    }

                    const existing = newQna.find((item) => sanitizeQnaText(item.text) === sanitizedText && item.userId === apiItem.userId);
                    if (!existing) {
                        newQna.push({
                            id: apiItem.id,
                            text: sanitizedText,
                            upvotes: apiItem.upvotes,
                            userId: apiItem.userId,
                            upvoterIds: apiItem.upvoterIds || []
                        });
                        updated = true;
                        return;
                    }

                    if (apiItem.upvotes > existing.upvotes) {
                        existing.upvotes = apiItem.upvotes;
                        existing.upvoterIds = apiItem.upvoterIds || [];
                        updated = true;
                    }
                });

                if (updated) {
                    usePollStore.setState({ qnaItems: limitQnaItems(newQna) });
                }
                return;
            }

            const res = await fetch(`/api/vote?hostId=${hostId}`, { cache: "no-store", signal });
            if (!res.ok) return;

            const data: VoteSyncResponse = await res.json();
            if (!data.votes) return;

            const currentChoices = usePollStore.getState().choices;
            let updated = false;
            const newChoices = [...currentChoices];

            Object.entries(data.votes).forEach(([key, apiVotes]) => {
                const activePollType = usePollStore.getState().pollType;
                if (activePollType === 'word-cloud') {
                    const lowerKey = key.toLowerCase();
                    const existing = newChoices.find((choice) => choice.label.toLowerCase() === lowerKey);
                    if (existing) {
                        if (apiVotes > existing.votes) {
                            existing.votes = apiVotes;
                            updated = true;
                        }
                        return;
                    }

                    newChoices.push({ id: randomId(), label: key, votes: apiVotes });
                    updated = true;
                    return;
                }

                const existing = newChoices.find((choice) => choice.id === key);
                if (existing && apiVotes > existing.votes) {
                    existing.votes = apiVotes;
                    updated = true;
                }
            });

            if (updated) {
                usePollStore.setState({ choices: newChoices });
            }
        } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError")) {
                console.error("Fallback sync failed:", error);
            }
        } finally {
            fallbackSyncInFlightRef.current = false;
        }
    }, [hostId]);

    useEffect(() => {
        if (!isMounted || storedHostId !== hostId || status === 'closed') return;

        let cancelled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let activeController: AbortController | null = null;

        const poll = async () => {
            if (cancelled) return;

            activeController = new AbortController();
            await syncFallbackState(activeController.signal);

            if (!cancelled) {
                timeoutId = setTimeout(poll, FALLBACK_SYNC_INTERVAL_MS);
            }
        };

        void poll();

        return () => {
            cancelled = true;
            activeController?.abort();
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [hostId, isMounted, status, storedHostId, syncFallbackState]);

    // Poll emoji API every second as fallback for PeerJS
    useEffect(() => {
        if (!isMounted || storedHostId !== hostId) return;
        const poll = async () => {
            try {
                const res = await fetch(`/api/emoji?hostId=${hostId}`);
                if (res.ok) {
                    const data = await res.json();
                    (data.emojis as string[]).forEach(emoji => handleEmojiRef.current(emoji));
                }
            } catch { }
        };
        const interval = setInterval(poll, 1000);
        return () => clearInterval(interval);
    }, [isMounted, storedHostId, hostId]);

    const handleEmoji = useCallback((emoji: string) => {
        const id = Math.random().toString();
        const x = Math.random() * 80 + 10; // 10% to 90% across screen
        setEmojis(prev => [...prev.slice(-20), { id, emoji, x }]);
        setTimeout(() => {
            setEmojis(prev => prev.filter(e => e.id !== id));
        }, 3000);
    }, []);

    // Use a ref so the usePeer callback always calls the latest handleEmoji
    const handleEmojiRef = useRef(handleEmoji);
    useEffect(() => { handleEmojiRef.current = handleEmoji; }, [handleEmoji]);

    const { connections, peerId, broadcast } = usePeer(hostId, (payload) => {
        if (payload.type === "VOTE") {
            addVote(payload.choiceId, payload.voterId);
        } else if (payload.type === "EMOJI") {
            handleEmojiRef.current(payload.emoji);
        } else if (payload.type === "QNA_POST") {
            addQnaItem(payload.text, payload.voterId);
        } else if (payload.type === "QNA_UPVOTE") {
            upvoteQnaItem(payload.id, payload.voterId);
        }
    });

    const totalVotes = pollType === 'qna' ? qnaItems.length : choices.reduce((acc, curr) => acc + curr.votes, 0);

    const joinUrl = useMemo(() => {
        if (!origin) return "";
        // Exclude huge choice lists for word clouds or qna in the URL to keep QR scannable
        const questionData = {
            q: question,
            t: pollType,
            c: ['single-choice', 'multiple-choice', 'ranked-choice'].includes(pollType) ? choices.map(c => ({ i: c.id, l: c.label })) : []
        };
        const b64 = encodeData(questionData);
        return `${origin}/join?peerId=${hostId}&d=${b64}`;
    }, [origin, hostId, question, choices, pollType]);

    const handleCopy = () => {
        if (!joinUrl) return;
        navigator.clipboard.writeText(joinUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleClosePoll = () => {
        setStatus('closed');
        // Broadcast state change to peers to lock their screens immediately
        broadcast({ type: "STATE_CHANGE", status: "closed" });
        // Save to history
        addPastPoll({
            id: hostId,
            date: new Date().toISOString(),
            pollType,
            question,
            totalVotes
        });
    };

    const handlePauseToggle = () => {
        const newStatus = status === 'paused' ? 'open' : 'paused';
        setStatus(newStatus);
        broadcast({ type: "STATE_CHANGE", status: newStatus });
    };

    const handleNextQuestion = () => {
        nextQuestion();
        // Allow state to update, then broadcast the new question
        setTimeout(() => {
            const state = usePollStore.getState();
            broadcast({
                type: "STATE_CHANGE",
                action: "next_question",
                data: {
                    q: state.question,
                    t: state.pollType,
                    c: ['single-choice', 'multiple-choice', 'ranked-choice'].includes(state.pollType) ? state.choices.map(c => ({ i: c.id, l: c.label })) : []
                }
            });
        }, 100);
    };

    const exportCSV = () => {
        // Escape a value for CSV, and neutralise spreadsheet formula injection by
        // prefixing cells that begin with a formula trigger (= + - @, tab, CR).
        const csvCell = (value: string) => {
            let v = value ?? "";
            if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
            return `"${v.replace(/"/g, '""')}"`;
        };

        const rows: string[] = [];
        if (pollType === 'qna') {
            rows.push("Question,Upvotes");
            qnaItems.forEach(item => {
                rows.push(`${csvCell(item.text)},${item.upvotes}`);
            });
        } else {
            rows.push("Option,Votes");
            choices.forEach(c => {
                rows.push(`${csvCell(c.label)},${c.votes}`);
            });
        }

        const csvContent = rows.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `poll_results_${hostId}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    if (!isMounted || storedHostId !== hostId) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

    return (
        <main className="min-h-screen p-4 md:p-8 flex flex-col items-center relative overflow-hidden">

            {/* Live Emoji Layer */}
            <div className="pointer-events-none fixed inset-0 z-50">
                <AnimatePresence>
                    {emojis.map((e) => (
                        <motion.div
                            key={e.id}
                            initial={{ opacity: 0, y: 100, x: `${e.x}vw`, scale: 0.5 }}
                            animate={{ opacity: [0, 1, 1, 0], y: -500, scale: [0.5, 1.5, 1.5, 1] }}
                            transition={{ duration: 3, ease: "easeOut" }}
                            exit={{ opacity: 0 }}
                            className="absolute bottom-0 text-4xl"
                        >
                            {e.emoji}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-4 gap-8 z-10">

                {/* Left Col: Info & QR */}
                <div className="lg:col-span-1 space-y-5">
                    <div className="flex items-center justify-between px-1">
                        <Logo size={24} />
                        <button
                            onClick={() => {
                                resetPoll();
                                router.push('/');
                            }}
                            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Exit
                        </button>
                    </div>

                    <div className="glass rounded-3xl p-6 flex flex-col items-center text-center space-y-4">
                        <h2 className="text-lg font-semibold tracking-tight">Scan to join</h2>
                        <div className="bg-white p-4 rounded-2xl shadow-sm">
                            {joinUrl ? (
                                <QRCodeSVG value={joinUrl} size={150} role="img" aria-label="QR code for joining the poll" title="QR code for joining the poll" />
                            ) : (
                                <div className="w-[150px] h-[150px] bg-gray-100 animate-pulse rounded-xl" aria-hidden="true" />
                            )}
                        </div>
                        <button
                            onClick={handleCopy}
                            className="w-full flex items-center justify-center gap-2 rounded-full bg-secondary py-2.5 px-4 text-sm font-medium transition-all hover:brightness-110"
                        >
                            {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                            {copied ? "Link copied" : "Copy join link"}
                        </button>
                    </div>

                    {/* Connection Status */}
                    <div className="glass rounded-3xl p-6">
                        <div className="flex items-center gap-3">
                            <div className="relative flex h-2.5 w-2.5">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${status === 'closed' ? 'bg-red-400' : status === 'paused' ? 'bg-yellow-400' : 'bg-green-400'}`}></span>
                                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${status === 'closed' ? 'bg-red-500' : status === 'paused' ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
                            </div>
                            <span className="font-medium capitalize tracking-tight">{status === 'open' ? 'Live' : status}</span>
                        </div>
                        <div className="mt-4 flex items-center gap-2 text-sm text-foreground/60">
                            <Users className="w-4 h-4" aria-hidden="true" />
                            <span>{connections.length} attendee{connections.length !== 1 ? 's' : ''} connected</span>
                        </div>
                        {!peerId && (
                            <p className="text-xs text-yellow-500 mt-2 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Initializing peer-to-peer…
                            </p>
                        )}
                    </div>
                </div>

                {/* Main Col: Results & Host Controls */}
                <div className="lg:col-span-3 space-y-6">

                    {/* Host Controls Panel */}
                    <div className="glass rounded-full px-3 py-2.5 flex flex-wrap gap-2 items-center justify-between">
                        <div className="flex flex-wrap gap-1.5">
                            <button
                                onClick={() => setResultsHidden(!resultsHidden)}
                                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${resultsHidden ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:brightness-110'}`}
                            >
                                {resultsHidden ? <><Eye className="w-4 h-4" aria-hidden="true" /> Show results</> : <><EyeOff className="w-4 h-4" aria-hidden="true" /> Hide results</>}
                            </button>
                            {status !== 'closed' && (
                                <button
                                    onClick={handlePauseToggle}
                                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${status === 'paused' ? 'bg-yellow-400 text-yellow-950' : 'bg-secondary text-secondary-foreground hover:brightness-110'}`}
                                >
                                    {status === 'paused' ? <><PlayCircle className="w-4 h-4" aria-hidden="true" /> Resume</> : <><PauseCircle className="w-4 h-4" aria-hidden="true" /> Pause</>}
                                </button>
                            )}
                            {status !== 'closed' && (
                                <button
                                    onClick={handleClosePoll}
                                    className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium bg-red-500/10 text-red-500 transition-all hover:bg-red-500/20"
                                >
                                    <StopCircle className="w-4 h-4" aria-hidden="true" /> Close
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            <button
                                onClick={exportCSV}
                                className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground transition-all hover:brightness-110"
                            >
                                <Download className="w-4 h-4" aria-hidden="true" /> Export
                            </button>

                            {currentQuestionIndex < questions.length - 1 && (
                                <button
                                    onClick={handleNextQuestion}
                                    className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-md shadow-primary/25 transition-all hover:brightness-110"
                                >
                                    Next question <ArrowRight className="w-4 h-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="glass rounded-3xl p-8 md:p-10 min-h-[500px] flex flex-col justify-center relative">
                        {status === 'closed' && (
                            <div className="absolute inset-0 bg-background/80 backdrop-blur-md z-20 flex flex-col items-center justify-center rounded-3xl">
                                <StopCircle className="w-14 h-14 text-red-500 mb-4" aria-hidden="true" />
                                <h2 className="font-display text-3xl font-bold tracking-tight">Session closed</h2>
                                <p className="text-foreground/60 mt-2">Final results are locked.</p>
                                <button
                                    onClick={() => setStatus('open')}
                                    aria-label="Reopen the closed session"
                                    className="mt-6 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-md shadow-primary/25 transition-all hover:brightness-110"
                                >
                                    Reopen session
                                </button>
                            </div>
                        )}

                        <div className="mb-8">
                            <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider">
                                <span className="text-primary">{pollType.replace('-', ' ')}</span>
                                {questions.length > 1 && (
                                    <span className="text-foreground/45">
                                        Question {currentQuestionIndex + 1} of {questions.length}
                                    </span>
                                )}
                            </div>
                            <h1 className="font-display text-3xl md:text-5xl font-bold mb-3 leading-[1.08] tracking-tight">{question}</h1>
                            <p className="text-lg text-foreground/55 tabular-nums">
                                {totalVotes} {pollType === 'qna' ? (totalVotes === 1 ? 'question' : 'questions') : (totalVotes === 1 ? 'vote' : 'votes')}
                            </p>
                        </div>

                        {resultsHidden ? (
                            <div className="flex-1 rounded-2xl bg-secondary/60 flex flex-col items-center justify-center py-20 text-foreground/50">
                                <EyeOff className="w-14 h-14 mb-4 opacity-50" aria-hidden="true" />
                                <h3 className="text-xl font-semibold tracking-tight">Results hidden</h3>
                                <p className="mt-1 text-sm">Participants are voting…</p>
                            </div>
                        ) : (
                            <div className="flex-1 w-full flex items-center justify-center">
                                {/* Type-specific visualizations */}
                                {['single-choice', 'multiple-choice'].includes(pollType) && (
                                    <div className="w-full max-w-3xl mx-auto">
                                        <BarResults choices={choices} />
                                    </div>
                                )}

                                {pollType === 'ranked-choice' && (
                                    <div className="w-full max-w-3xl mx-auto">
                                        <BarResults choices={choices} ranked />
                                    </div>
                                )}

                                {pollType === 'word-cloud' && (
                                    <div className="relative w-full h-[500px]">
                                        {choices.length === 0 && (
                                            <p className="absolute inset-0 flex items-center justify-center text-foreground/45 animate-pulse">
                                                Waiting for the first word…
                                            </p>
                                        )}
                                        <WordBubbles choices={choices} palette={palette} />
                                    </div>
                                )}

                                {pollType === 'qna' && (
                                    <div className="w-full h-[500px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                                        {qnaItems.length === 0 ? (
                                            <p className="text-center text-foreground/45 py-12 animate-pulse">Waiting for the first question…</p>
                                        ) : (
                                            [...qnaItems].sort((a, b) => b.upvotes - a.upvotes).map((item, idx) => (
                                                <motion.div
                                                    key={item.id}
                                                    layout
                                                    initial={{ opacity: 0, y: 16 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ type: "spring", stiffness: 300, damping: 28 }}
                                                    className={`flex items-center gap-4 rounded-2xl px-5 py-4 ${idx === 0 && item.upvotes > 0 ? 'bg-secondary shadow-sm' : 'bg-secondary/60'}`}
                                                >
                                                    <div className={`flex flex-col items-center justify-center rounded-xl px-3 py-1.5 min-w-[3rem] ${item.upvotes > 0 ? 'bg-primary/10 text-primary' : 'bg-secondary text-foreground/40'}`}>
                                                        <span className="text-[0.6rem] font-semibold uppercase tracking-wide" aria-hidden="true">▲</span>
                                                        <span className="text-lg font-bold tabular-nums leading-tight">{item.upvotes}</span>
                                                    </div>
                                                    <div className="flex-1 text-base md:text-lg leading-snug">
                                                        {item.text}
                                                    </div>
                                                </motion.div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </main>
    );
}
