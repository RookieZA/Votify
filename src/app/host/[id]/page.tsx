"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Users, Copy, CheckCircle2, AlertTriangle, EyeOff, Eye, PauseCircle, PlayCircle, StopCircle, ArrowRight, Download, Heart } from "lucide-react";
import { usePollStore, useHistoryStore } from "@/lib/store";
import { usePeer } from "@/hooks/usePeer";
import { encodeData } from "@/lib/utils";
import PieChart from "@/app/components/PieChart";
import { motion, AnimatePresence } from "framer-motion";

export default function HostDashboard() {
    const params = useParams();
    const router = useRouter();
    const hostId = params.id as string;

    const {
        hostId: storedHostId, pollType, status, resultsHidden, questions, currentQuestionIndex,
        question, choices, qnaItems, votedUsers,
        addVote, addQnaItem, upvoteQnaItem, setStatus, setResultsHidden, nextQuestion, resetPoll
    } = usePollStore();

    const addPastPoll = useHistoryStore(state => state.addPastPoll);

    const [isMounted, setIsMounted] = useState(false);
    const [copied, setCopied] = useState(false);
    const [origin, setOrigin] = useState("");
    const [emojis, setEmojis] = useState<{ id: string, emoji: string, x: number }[]>([]);

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

    // Fallback sync logic omited for brevity, or simplified
    useEffect(() => {
        if (!isMounted || storedHostId !== hostId) return;

        const syncVotes = async () => {
            try {
                const currentPollType = usePollStore.getState().pollType;
                if (currentPollType === 'qna') {
                    const res = await fetch(`/api/qna?hostId=${hostId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.qnaItems) {
                            const currentQna = usePollStore.getState().qnaItems;
                            let updated = false;
                            const newQna = [...currentQna];

                            data.qnaItems.forEach((apiItem: any) => {
                                const existing = newQna.find((item: any) => item.text === apiItem.text && item.userId === apiItem.userId);
                                if (!existing) {
                                    newQna.push({
                                        id: apiItem.id,
                                        text: apiItem.text,
                                        upvotes: apiItem.upvotes,
                                        userId: apiItem.userId,
                                        upvoterIds: apiItem.upvoterIds || []
                                    });
                                    updated = true;
                                } else if (apiItem.upvotes > existing.upvotes) {
                                    existing.upvotes = apiItem.upvotes;
                                    existing.upvoterIds = apiItem.upvoterIds || [];
                                    updated = true;
                                }
                            });

                            if (updated) {
                                usePollStore.setState({ qnaItems: newQna });
                            }
                        }
                    }
                } else {
                    const res = await fetch(`/api/vote?hostId=${hostId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.votes) {
                            const currentChoices = usePollStore.getState().choices;
                            let updated = false;
                            const newChoices = [...currentChoices];

                            Object.entries(data.votes).forEach(([key, apiVotes]: [string, any]) => {
                                const currentPollType = usePollStore.getState().pollType;
                                if (currentPollType === 'word-cloud') {
                                    const lowerKey = key.toLowerCase();
                                    const existing = newChoices.find(c => c.label.toLowerCase() === lowerKey);
                                    if (existing) {
                                        if (apiVotes > existing.votes) {
                                            existing.votes = apiVotes;
                                            updated = true;
                                        }
                                    } else {
                                        newChoices.push({ id: Math.random().toString(36).substring(7), label: key, votes: apiVotes });
                                        updated = true;
                                    }
                                } else {
                                    const existing = newChoices.find(c => c.id === key);
                                    if (existing && apiVotes > existing.votes) {
                                        existing.votes = apiVotes;
                                        updated = true;
                                    }
                                }
                            });

                            if (updated) {
                                usePollStore.setState({ choices: newChoices });
                            }
                        }
                    }
                }
            } catch (error) { }
        };

        const interval = setInterval(syncVotes, 3000);
        syncVotes();

        return () => clearInterval(interval);
    }, [isMounted, storedHostId, hostId]);

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
            c: ['multiple-choice', 'multiple-select', 'ranked-choice'].includes(pollType) ? choices.map(c => ({ i: c.id, l: c.label })) : []
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
                    c: ['multiple-choice', 'multiple-select', 'ranked-choice'].includes(state.pollType) ? state.choices.map(c => ({ i: c.id, l: c.label })) : []
                }
            });
        }, 100);
    };

    const exportCSV = () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        if (pollType === 'qna') {
            csvContent += "Question,Upvotes\\n";
            qnaItems.forEach(item => {
                csvContent += `"${item.text.replace(/"/g, '""')}",${item.upvotes}\\n`;
            });
        } else {
            csvContent += "Option,Votes\\n";
            choices.forEach(c => {
                csvContent += `"${c.label.replace(/"/g, '""')}",${c.votes}\\n`;
            });
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `poll_results_${hostId}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
                <div className="lg:col-span-1 space-y-6">
                    <button
                        onClick={() => {
                            resetPoll();
                            router.push('/');
                        }}
                        className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-secondary text-secondary-foreground hover:brightness-110 transition-all font-bold"
                    >
                        Exit Session
                    </button>

                    <div className="glass rounded-2xl p-6 flex flex-col items-center text-center space-y-4">
                        <h2 className="text-xl font-semibold">Join the Poll</h2>
                        <div className="bg-white p-4 rounded-xl">
                            {joinUrl ? (
                                <QRCodeSVG value={joinUrl} size={150} />
                            ) : (
                                <div className="w-[150px] h-[150px] bg-gray-100 animate-pulse rounded-xl" />
                            )}
                        </div>
                        <div className="w-full">
                            <button
                                onClick={handleCopy}
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-background/50 border border-border hover:bg-white/5 transition-all text-sm font-medium"
                            >
                                {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                {copied ? "Copied Link" : "Copy Join Link"}
                            </button>
                        </div>
                    </div>

                    {/* Connection Status */}
                    <div className="glass rounded-2xl p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="relative flex h-3 w-3">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${status === 'closed' ? 'bg-red-400' : 'bg-green-400'}`}></span>
                                <span className={`relative inline-flex rounded-full h-3 w-3 ${status === 'closed' ? 'bg-red-500' : 'bg-green-500'}`}></span>
                            </div>
                            <span className="font-medium capitalize">{status} Connection</span>
                        </div>
                        <div className="flex items-center gap-2 text-foreground/70 mt-4">
                            <Users className="w-5 h-5" />
                            <span>{connections.length} Attendee{connections.length !== 1 ? 's' : ''} Connected</span>
                        </div>
                        {!peerId && (
                            <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Initializing P2P...
                            </p>
                        )}
                    </div>
                </div>

                {/* Main Col: Results & Host Controls */}
                <div className="lg:col-span-3 space-y-6">

                    {/* Host Controls Panel */}
                    <div className="glass rounded-2xl p-4 flex flex-wrap gap-4 items-center justify-between">
                        <div className="flex gap-2">
                            <button
                                onClick={() => setResultsHidden(!resultsHidden)}
                                className={`flexItemsCenter gap-2 py-2 px-4 rounded-xl text-sm font-semibold transition-all ${resultsHidden ? 'bg-indigo-500 text-white' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
                            >
                                {resultsHidden ? <><Eye className="w-4 h-4 mr-2" /> Show Results</> : <><EyeOff className="w-4 h-4 mr-2" /> Hide Results</>}
                            </button>
                            {status !== 'closed' && (
                                <button
                                    onClick={handlePauseToggle}
                                    className={`flexItemsCenter gap-2 py-2 px-4 rounded-xl text-sm font-semibold transition-all ${status === 'paused' ? 'bg-yellow-500 text-white' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
                                >
                                    {status === 'paused' ? <><PlayCircle className="w-4 h-4 mr-2" /> Resume</> : <><PauseCircle className="w-4 h-4 mr-2" /> Pause</>}
                                </button>
                            )}
                            {status !== 'closed' && (
                                <button
                                    onClick={handleClosePoll}
                                    className="flex items-center gap-2 py-2 px-4 rounded-xl text-sm font-semibold bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all border border-red-500/20"
                                >
                                    <StopCircle className="w-4 h-4" /> Close Session
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={exportCSV}
                                className="flex items-center gap-2 py-2 px-4 rounded-xl text-sm font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all"
                            >
                                <Download className="w-4 h-4" /> CSV Export
                            </button>

                            {currentQuestionIndex < questions.length - 1 && (
                                <button
                                    onClick={handleNextQuestion}
                                    className="flex items-center gap-2 py-2 px-6 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md"
                                >
                                    Next Q <ArrowRight className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="glass rounded-2xl p-8 min-h-[500px] flex flex-col justify-center relative">
                        {status === 'closed' && (
                            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center rounded-2xl">
                                <StopCircle className="w-16 h-16 text-red-500 mb-4" />
                                <h2 className="text-3xl font-bold">Session Closed</h2>
                                <p className="text-foreground/70 mt-2">Final results are locked.</p>
                                <button
                                    onClick={() => setStatus('open')}
                                    className="mt-6 text-sm text-primary underline"
                                >
                                    Reopen Session
                                </button>
                            </div>
                        )}

                        <div className="mb-8">
                            {questions.length > 1 && (
                                <span className="text-sm font-bold text-primary mb-2 block tracking-wider uppercase">
                                    Question {currentQuestionIndex + 1} of {questions.length}
                                </span>
                            )}
                            <h1 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">{question}</h1>
                            <p className="text-lg text-foreground/60">{totalVotes} Total {pollType === 'qna' ? 'Questions' : 'Votes'}</p>
                        </div>

                        {resultsHidden ? (
                            <div className="flex-1 border-2 border-dashed border-border/50 rounded-2xl flex flex-col items-center justify-center text-foreground/50">
                                <EyeOff className="w-16 h-16 mb-4 opacity-50" />
                                <h3 className="text-xl font-semibold">Results Hidden</h3>
                                <p>Participants are voting...</p>
                            </div>
                        ) : (
                            <div className="flex-1 w-full flex items-center justify-center">
                                {/* Type-specific visualizations */}
                                {['multiple-choice', 'multiple-select'].includes(pollType) && (
                                    <div className="w-full max-w-lg mx-auto">
                                        <PieChart choices={choices} />
                                    </div>
                                )}

                                {pollType === 'ranked-choice' && (
                                    <div className="space-y-4 w-full max-w-2xl mx-auto">
                                        {[...choices].sort((a, b) => b.votes - a.votes).map((c, idx) => (
                                            <div key={c.id} className="flex items-center gap-4 p-4 rounded-xl bg-background/50 border border-border">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${idx === 0 ? 'bg-yellow-500/20 text-yellow-500' : idx === 1 ? 'bg-gray-400/20 text-gray-400' : idx === 2 ? 'bg-orange-700/20 text-orange-700' : 'bg-primary/10 text-primary'}`}>
                                                    #{idx + 1}
                                                </div>
                                                <div className="flex-1 font-semibold text-lg">{c.label}</div>
                                                <div className="text-foreground/60 font-mono">{c.votes} pts</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {pollType === 'word-cloud' && (
                                    <div className="flex flex-wrap justify-center items-center gap-4 w-full h-full p-8 content-center">
                                        {choices.length === 0 ? (
                                            <p className="text-foreground/50">No responses yet...</p>
                                        ) : (
                                            choices.map(c => {
                                                // Calculate simple font size relative to max votes
                                                const maxVotes = Math.max(...choices.map(x => x.votes));
                                                const size = Math.max(1, 1 + (c.votes / maxVotes) * 3);
                                                return (
                                                    <motion.span
                                                        key={c.id}
                                                        initial={{ opacity: 0, scale: 0 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        style={{ fontSize: `${size}rem`, lineHeight: 1 }}
                                                        className="font-bold text-primary m-2 drop-shadow-sm"
                                                    >
                                                        {c.label}
                                                    </motion.span>
                                                )
                                            })
                                        )}
                                    </div>
                                )}

                                {pollType === 'qna' && (
                                    <div className="w-full h-[500px] overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                                        {qnaItems.length === 0 ? (
                                            <p className="text-center text-foreground/50 py-12">No questions asked yet...</p>
                                        ) : (
                                            [...qnaItems].sort((a, b) => b.upvotes - a.upvotes).map(item => (
                                                <motion.div
                                                    key={item.id}
                                                    layout
                                                    initial={{ opacity: 0, y: 20 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="p-6 rounded-2xl bg-background/50 border border-border flex gap-4"
                                                >
                                                    <div className="flex flex-col items-center justify-start gap-1">
                                                        <button className="text-foreground/40 hover:text-primary transition-colors">
                                                            ▲
                                                        </button>
                                                        <span className="font-bold text-lg">{item.upvotes}</span>
                                                    </div>
                                                    <div className="flex-1 text-lg pt-1">
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
