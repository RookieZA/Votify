"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePollStore, PollType, QuestionData } from "@/lib/store";
import { PlusCircle, Trash2, ArrowRight, ArrowLeft, Plus } from "lucide-react";

function CreateForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const type = (searchParams.get("type") as PollType) || "multiple-choice";

    const setPoll = usePollStore((state) => state.setPoll);

    const isChoicesNeeded = ["multiple-choice", "multiple-select", "ranked-choice"].includes(type);

    // Support for multiple questions in a single session
    const [questions, setQuestions] = useState<QuestionData[]>([
        {
            id: Math.random().toString(36).substring(7),
            question: "",
            choices: isChoicesNeeded ? [{ id: "1", label: "", votes: 0 }, { id: "2", label: "", votes: 0 }] : []
        }
    ]);

    const handleAddQuestion = () => {
        setQuestions([
            ...questions,
            {
                id: Math.random().toString(36).substring(7),
                question: "",
                choices: isChoicesNeeded ? [{ id: Math.random().toString(36).substring(7), label: "", votes: 0 }, { id: Math.random().toString(36).substring(7), label: "", votes: 0 }] : []
            }
        ]);
    };

    const handleRemoveQuestion = (qIndex: number) => {
        if (questions.length <= 1) return;
        setQuestions(questions.filter((_, i) => i !== qIndex));
    };

    const handleQuestionChange = (qIndex: number, val: string) => {
        const newQs = [...questions];
        newQs[qIndex].question = val;
        setQuestions(newQs);
    };

    const handleAddChoice = (qIndex: number) => {
        const newQs = [...questions];
        newQs[qIndex].choices.push({ id: Math.random().toString(36).substring(7), label: "", votes: 0 });
        setQuestions(newQs);
    };

    const handleRemoveChoice = (qIndex: number, cIndex: number) => {
        const newQs = [...questions];
        if (newQs[qIndex].choices.length <= 2) return;
        newQs[qIndex].choices = newQs[qIndex].choices.filter((_, i) => i !== cIndex);
        setQuestions(newQs);
    };

    const handleChoiceChange = (qIndex: number, cIndex: number, val: string) => {
        const newQs = [...questions];
        newQs[qIndex].choices[cIndex].label = val;
        setQuestions(newQs);
    };

    const handleStartPoll = (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        const validQs: QuestionData[] = [];
        for (const q of questions) {
            if (!q.question.trim()) continue;
            if (isChoicesNeeded) {
                const validChoices = q.choices.filter(c => c.label.trim() !== "");
                if (validChoices.length < 2) continue; // Skip invalid
                validQs.push({ ...q, choices: validChoices });
            } else {
                validQs.push(q);
            }
        }

        if (validQs.length === 0) return;

        const hostId = `poll-${Math.random().toString(36).substring(2, 9)}`;
        setPoll(hostId, type, validQs);
        router.push(`/host/${hostId}`);
    };

    const typeLabels: Record<PollType, string> = {
        "multiple-choice": "Multiple Choice",
        "multiple-select": "Multiple Selection",
        "word-cloud": "Word Cloud",
        "ranked-choice": "Ranked Choice",
        "qna": "Q&A Board"
    };

    const isValid = questions.some(q =>
        q.question.trim() !== "" && (!isChoicesNeeded || q.choices.filter(c => c.label.trim() !== "").length >= 2)
    );

    return (
        <main className="flex min-h-screen flex-col items-center p-4 md:p-8">
            <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                <button
                    onClick={() => router.push("/")}
                    className="mb-8 flex items-center text-sm font-medium text-foreground/60 hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
                </button>

                <div className="glass rounded-3xl p-6 md:p-10">
                    <div className="mb-8">
                        <span className="text-xs font-bold uppercase tracking-wider text-primary mb-2 block">
                            Create Session
                        </span>
                        <h1 className="text-3xl font-bold tracking-tight">{typeLabels[type] || "New Poll"}</h1>
                        <p className="text-foreground/70 mt-2">
                            {isChoicesNeeded
                                ? "Configure your questions and options below."
                                : "Just type your prompt. Participants will be able to submit their own text."}
                        </p>
                    </div>

                    <form onSubmit={handleStartPoll} className="space-y-8">
                        {questions.map((q, qIndex) => (
                            <div key={q.id} className="p-6 rounded-2xl bg-background/40 border border-border/50 relative group">
                                {questions.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveQuestion(qIndex)}
                                        className="absolute -top-3 -right-3 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}

                                <div className="space-y-2 mb-6">
                                    <label className="text-sm font-semibold flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">
                                            {qIndex + 1}
                                        </span>
                                        Question / Prompt
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g., What is your favorite framework?"
                                        className="w-full p-4 rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary backdrop-blur-md transition-all text-lg"
                                        value={q.question}
                                        onChange={(e) => handleQuestionChange(qIndex, e.target.value)}
                                    />
                                </div>

                                {isChoicesNeeded && (
                                    <div className="space-y-3 pl-8 border-l-2 border-border/50">
                                        <label className="text-sm font-semibold text-foreground/80">Options</label>
                                        {q.choices.map((choice, cIndex) => (
                                            <div key={choice.id} className="flex gap-2">
                                                <input
                                                    type="text"
                                                    required={cIndex < 2} // First two are required
                                                    placeholder={`Option ${cIndex + 1}`}
                                                    className="flex-1 p-3 rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                                                    value={choice.label}
                                                    onChange={(e) => handleChoiceChange(qIndex, cIndex, e.target.value)}
                                                />
                                                {q.choices.length > 2 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveChoice(qIndex, cIndex)}
                                                        className="p-3 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-xl transition-colors"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => handleAddChoice(qIndex)}
                                            className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors py-2"
                                        >
                                            <PlusCircle className="w-4 h-4" /> Add Option
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}

                        <div className="flex justify-center">
                            <button
                                type="button"
                                onClick={handleAddQuestion}
                                className="py-3 px-6 rounded-xl border-2 border-dashed border-primary/50 text-primary font-medium hover:bg-primary/5 transition-colors flex items-center gap-2"
                            >
                                <Plus className="w-5 h-5" /> Add Another Question
                            </button>
                        </div>

                        <div className="pt-6 border-t border-border mt-8">
                            <button
                                type="submit"
                                disabled={!isValid}
                                className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-primary/20"
                            >
                                Launch Session <ArrowRight className="w-5 h-5" />
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </main>
    );
}

export default function CreatePage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
            <CreateForm />
        </Suspense>
    );
}
