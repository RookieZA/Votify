"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePollStore, PollType, QuestionData } from "@/lib/store";
import { randomId } from "@/lib/utils";
import { PlusCircle, Trash2, ArrowRight, ArrowLeft, Plus } from "lucide-react";

const MAX_QUESTION_LENGTH = 300;
const MAX_CHOICE_LABEL_LENGTH = 100;
const MAX_CHOICES = 10;
const INITIAL_QUESTION_ID = "question-1";
const INITIAL_CHOICE_IDS = ["choice-1", "choice-2"] as const;

function createFormItemId(prefix: string): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `${prefix}-${crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createInitialQuestions(isChoicesNeeded: boolean): QuestionData[] {
    return [
        {
            id: INITIAL_QUESTION_ID,
            question: "",
            choices: isChoicesNeeded
                ? INITIAL_CHOICE_IDS.map((id) => ({ id, label: "", votes: 0 }))
                : []
        }
    ];
}

function CreateForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const type = (searchParams.get("type") as PollType) || "multiple-choice";

    const setPoll = usePollStore((state) => state.setPoll);

    const isChoicesNeeded = ["multiple-choice", "multiple-select", "ranked-choice"].includes(type);

    // Support for multiple questions in a single session
    const [questions, setQuestions] = useState<QuestionData[]>(() => createInitialQuestions(isChoicesNeeded));

    const handleAddQuestion = () => {
        setQuestions([
            ...questions,
            {
                id: createFormItemId("question"),
                question: "",
                choices: isChoicesNeeded
                    ? [
                        { id: createFormItemId("choice"), label: "", votes: 0 },
                        { id: createFormItemId("choice"), label: "", votes: 0 }
                    ]
                    : []
            }
        ]);
    };

    const handleRemoveQuestion = (qIndex: number) => {
        if (questions.length <= 1) return;
        setQuestions(questions.filter((_, i) => i !== qIndex));
    };

    const handleQuestionChange = (qIndex: number, val: string) => {
        const newQs = [...questions];
        newQs[qIndex].question = val.slice(0, MAX_QUESTION_LENGTH);
        setQuestions(newQs);
    };

    const handleAddChoice = (qIndex: number) => {
        const newQs = [...questions];
        if (newQs[qIndex].choices.length >= MAX_CHOICES) return;
        newQs[qIndex].choices.push({ id: createFormItemId("choice"), label: "", votes: 0 });
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
        newQs[qIndex].choices[cIndex].label = val.slice(0, MAX_CHOICE_LABEL_LENGTH);
        setQuestions(newQs);
    };

    const handleStartPoll = (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        const validQs: QuestionData[] = [];
        for (const q of questions) {
            const sanitizedQuestion = q.question.trim().slice(0, MAX_QUESTION_LENGTH);
            if (!sanitizedQuestion) continue;
            if (isChoicesNeeded) {
                const validChoices = q.choices
                    .map((choice) => ({
                        ...choice,
                        label: choice.label.trim().slice(0, MAX_CHOICE_LABEL_LENGTH)
                    }))
                    .filter((choice) => choice.label !== "");
                if (validChoices.length < 2) continue; // Skip invalid
                validQs.push({ ...q, question: sanitizedQuestion, choices: validChoices });
            } else {
                validQs.push({ ...q, question: sanitizedQuestion });
            }
        }

        if (validQs.length === 0) return;

        const hostId = `poll-${randomId()}`;
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
                                        aria-label={`Remove question ${qIndex + 1}`}
                                        className="absolute -top-3 -right-3 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
                                    >
                                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                                    </button>
                                )}

                                <div className="space-y-2 mb-6">
                                    <label htmlFor={`question-${q.id}`} className="text-sm font-semibold flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">
                                            {qIndex + 1}
                                        </span>
                                        Question / Prompt
                                    </label>
                                    <input
                                        id={`question-${q.id}`}
                                        type="text"
                                        required
                                        placeholder="e.g., What is your favorite framework?"
                                        className="w-full p-4 rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary backdrop-blur-md transition-all text-lg"
                                        value={q.question}
                                        maxLength={MAX_QUESTION_LENGTH}
                                        onChange={(e) => handleQuestionChange(qIndex, e.target.value)}
                                    />
                                    <p className="text-xs text-foreground/50 text-right">
                                        {q.question.length}/{MAX_QUESTION_LENGTH}
                                    </p>
                                </div>

                                {isChoicesNeeded && (
                                    <fieldset className="space-y-3 pl-8 border-l-2 border-border/50">
                                        <legend className="text-sm font-semibold text-foreground/80">Options</legend>
                                        {q.choices.map((choice, cIndex) => (
                                            <div key={choice.id} className="flex gap-2">
                                                <label htmlFor={`choice-${q.id}-${choice.id}`} className="sr-only">
                                                    Option {cIndex + 1} for question {qIndex + 1}
                                                </label>
                                                <input
                                                    id={`choice-${q.id}-${choice.id}`}
                                                    type="text"
                                                    required={cIndex < 2} // First two are required
                                                    placeholder={`Option ${cIndex + 1}`}
                                                    className="flex-1 p-3 rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                                                    value={choice.label}
                                                    maxLength={MAX_CHOICE_LABEL_LENGTH}
                                                    onChange={(e) => handleChoiceChange(qIndex, cIndex, e.target.value)}
                                                />
                                                <span className="min-w-16 self-center text-right text-xs text-foreground/50">
                                                    {choice.label.length}/{MAX_CHOICE_LABEL_LENGTH}
                                                </span>
                                                {q.choices.length > 2 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveChoice(qIndex, cIndex)}
                                                        aria-label={`Remove option ${cIndex + 1} from question ${qIndex + 1}`}
                                                        className="p-3 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-xl transition-colors"
                                                    >
                                                        <Trash2 className="w-5 h-5" aria-hidden="true" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => handleAddChoice(qIndex)}
                                            disabled={q.choices.length >= MAX_CHOICES}
                                            aria-label={`Add another option to question ${qIndex + 1}`}
                                            className="flex items-center gap-2 py-2 text-sm text-primary transition-colors hover:text-primary/80 disabled:cursor-not-allowed disabled:text-foreground/40"
                                        >
                                            <PlusCircle className="w-4 h-4" aria-hidden="true" /> Add Option
                                        </button>
                                        <p className="text-xs text-foreground/50">
                                            {q.choices.length}/{MAX_CHOICES} options
                                        </p>
                                    </fieldset>
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
