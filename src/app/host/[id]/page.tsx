"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Users, Copy, CheckCircle2, AlertTriangle } from "lucide-react";
import { usePollStore } from "@/lib/store";
import { usePeer } from "@/hooks/usePeer";
import { encodeData } from "@/lib/utils";
import PieChart from "@/app/components/PieChart";

export default function HostDashboard() {
    const params = useParams();
    const router = useRouter();
    const hostId = params.id as string;

    const { hostId: storedHostId, question, choices, addVote, resetPoll } = usePollStore();
    const [isMounted, setIsMounted] = useState(false);
    const [copied, setCopied] = useState(false);
    const [origin, setOrigin] = useState("");

    useEffect(() => {
        setOrigin(window.location.origin);
        setIsMounted(true);
    }, []);

    // Ensure host doesn't close tab accidentally
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            // Required for Chrome
            e.returnValue = '';
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, []);

    // Redirect if not the host for this poll
    useEffect(() => {
        if (isMounted && storedHostId !== hostId) {
            router.push("/");
        }
    }, [isMounted, storedHostId, hostId, router]);

    // Poll API route as a fallback for production environments
    useEffect(() => {
        if (!isMounted || storedHostId !== hostId) return;

        const syncVotes = async () => {
            try {
                const res = await fetch(`/api/vote?hostId=${hostId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.votes) {
                        // We use the raw store state to compare and update
                        const currentChoices = usePollStore.getState().choices;
                        let updated = false;

                        const newChoices = currentChoices.map(c => {
                            const apiVotes = data.votes[c.id] || 0;
                            // Only update if the API has more votes than our local state
                            if (apiVotes > c.votes) {
                                updated = true;
                                return { ...c, votes: apiVotes };
                            }
                            return c;
                        });

                        if (updated) {
                            usePollStore.setState({ choices: newChoices });
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to sync votes from API", error);
            }
        };

        const interval = setInterval(syncVotes, 3000); // Poll every 3 seconds
        syncVotes(); // Initial sync

        return () => clearInterval(interval);
    }, [isMounted, storedHostId, hostId]);

    const { connections, peerId } = usePeer(hostId, (payload, peerId) => {
        if (payload.type === "VOTE") {
            addVote(payload.choiceId);
        }
    });

    const totalVotes = choices.reduce((acc, curr) => acc + curr.votes, 0);

    const joinUrl = useMemo(() => {
        if (!origin) return "";
        const questionData = {
            q: question,
            c: choices.map(c => ({ i: c.id, l: c.label })) // Minify payload
        };
        const b64 = encodeData(questionData);
        return `${origin}/join?peerId=${hostId}&d=${b64}`;
    }, [origin, hostId, question, choices]);

    const handleCopy = () => {
        if (!joinUrl) return;
        navigator.clipboard.writeText(joinUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isMounted || storedHostId !== hostId) return <div className="min-h-screen flex items-center justify-center">Loading...</div>; // Will redirect or wait to mount

    return (
        <main className="min-h-screen p-4 md:p-8 flex flex-col items-center">
            <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Col: Info & QR */}
                <div className="lg:col-span-1 space-y-6">
                    {/* New Poll Button */}
                    <button
                        onClick={() => {
                            resetPoll();
                            router.push('/');
                        }}
                        className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-primary text-primary-foreground hover:brightness-110 transition-all font-bold shadow-lg shadow-primary/20"
                    >
                        Create New Poll
                    </button>

                    <div className="glass rounded-2xl p-6 flex flex-col items-center text-center space-y-4">
                        <h2 className="text-xl font-semibold">Join the Poll</h2>

                        <div className="bg-white p-4 rounded-xl">
                            {joinUrl ? (
                                <QRCodeSVG value={joinUrl} size={200} />
                            ) : (
                                <div className="w-[200px] h-[200px] bg-gray-100 animate-pulse rounded-xl" />
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

                    <div className="glass rounded-2xl p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                            </div>
                            <span className="font-medium">Live Connection</span>
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

                {/* Right Col: Results */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="glass rounded-2xl p-8">
                        <h1 className="text-3xl font-bold mb-2">{question}</h1>
                        <p className="text-foreground/60 mb-6">{totalVotes} Total Vote{totalVotes !== 1 ? 's' : ''}</p>
                        <PieChart choices={choices} />
                    </div>
                </div>

            </div>
        </main>
    );
}
