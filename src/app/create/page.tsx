"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePollStore, PollType, QuestionData } from "@/lib/store";
import { randomId } from "@/lib/utils";
import { ArrowRight, ArrowLeft, Plus, X } from "lucide-react";
import { Logo } from "@/app/components/Logo";

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
    const type = (searchParams.get("type") as PollType) || "single-choice";

    const setPoll = usePollStore((state) => state.setPoll);

    const isChoicesNeeded = ["single-choice", "multiple-choice", "ranked-choice"].includes(type);

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
        "single-choice": "Single Choice",
        "multiple-choice": "Multiple Choice",
        "word-cloud": "Word Cloud",
        "ranked-choice": "Ranked Choice",
        "qna": "Q&A Board"
    };

    // Short labels for the segmented type picker
    const typeOptions: { id: PollType; label: string }[] = [
        { id: "single-choice", label: "Single Choice" },
        { id: "multiple-choice", label: "Multiple Choice" },
        { id: "word-cloud", label: "Word Cloud" },
        { id: "ranked-choice", label: "Ranked" },
        { id: "qna", label: "Q&A" },
    ];

    const handleTypeChange = (newType: PollType) => {
        if (newType === type) return;
        const needsChoices = ["single-choice", "multiple-choice", "ranked-choice"].includes(newType);
        if (needsChoices) {
            // Ensure every question has at least two option slots when switching
            // into a format that requires options.
            setQuestions(qs => qs.map(q => q.choices.length >= 2 ? q : {
                ...q,
                choices: [
                    ...q.choices,
                    ...Array.from({ length: 2 - q.choices.length }, () => ({
                        id: createFormItemId("choice"),
                        label: "",
                        votes: 0
                    }))
                ]
            }));
        }
        router.replace(`/create?type=${newType}`);
    };

    const isValid = questions.some(q =>
        q.question.trim() !== "" && (!isChoicesNeeded || q.choices.filter(c => c.label.trim() !== "").length >= 2)
    );

    return (
        <main className="flex min-h-screen flex-col items-center px-4 pb-16">
            {/* Top bar */}
            <header className="w-full max-w-2xl flex items-center justify-between py-6">
                <button
                    onClick={() => router.push("/")}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary transition-opacity hover:opacity-70"
                >
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Home
                </button>
                <Logo size={26} />
            </header>

            <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Title */}
                <div className="mb-6 mt-4">
                    <h1 className="font-display text-4xl font-bold tracking-tight">{typeLabels[type] || "New Poll"}</h1>
                    <p className="text-foreground/60 mt-2 text-[17px]">
                        {isChoicesNeeded
                            ? "Add your questions and options, then launch."
                            : "Just type your prompt — participants submit their own answers."}
                    </p>
                </div>

                {/* Segmented type picker */}
                <div className="mb-8 flex gap-1 rounded-full bg-secondary p-1 overflow-x-auto max-w-full custom-scrollbar">
                    {typeOptions.map((opt) => (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleTypeChange(opt.id)}
                            aria-pressed={type === opt.id}
                            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${type === opt.id
                                ? "glass text-foreground shadow-sm"
                                : "text-foreground/55 hover:text-foreground"
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleStartPoll} className="space-y-5">
                    {questions.map((q, qIndex) => (
                        <div key={q.id} className="glass rounded-3xl p-6 md:p-7">
                            {/* Card header */}
                            <div className="mb-4 flex items-center justify-between">
                                <label htmlFor={`question-${q.id}`} className="flex items-center gap-2.5 text-sm font-semibold text-foreground/80">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold tabular-nums">
                                        {qIndex + 1}
                                    </span>
                                    Question
                                </label>
                                {questions.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveQuestion(qIndex)}
                                        aria-label={`Remove question ${qIndex + 1}`}
                                        className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/40 transition-colors hover:bg-secondary hover:text-foreground"
                                    >
                                        <X className="w-4 h-4" aria-hidden="true" />
                                    </button>
                                )}
                            </div>

                            <input
                                id={`question-${q.id}`}
                                type="text"
                                required
                                placeholder={isChoicesNeeded ? "What should we ask the room?" : "e.g. Describe today in one word"}
                                className="w-full rounded-xl bg-secondary px-4 py-3.5 text-lg border border-transparent transition-all focus:outline-none focus:ring-2 focus:ring-primary/60 focus:bg-background placeholder:text-foreground/35"
                                value={q.question}
                                maxLength={MAX_QUESTION_LENGTH}
                                onChange={(e) => handleQuestionChange(qIndex, e.target.value)}
                            />
                            {q.question.length >= MAX_QUESTION_LENGTH * 0.8 && (
                                <p className="mt-1.5 text-right text-xs text-foreground/40 tabular-nums">
                                    {q.question.length}/{MAX_QUESTION_LENGTH}
                                </p>
                            )}

                            {isChoicesNeeded && (
                                <fieldset className="mt-6 space-y-2.5">
                                    <div className="flex items-center justify-between px-1">
                                        <legend className="text-xs font-semibold uppercase tracking-wider text-foreground/50">Options</legend>
                                        <span className="text-xs text-foreground/40 tabular-nums">{q.choices.length}/{MAX_CHOICES}</span>
                                    </div>
                                    {q.choices.map((choice, cIndex) => (
                                        <div key={choice.id} className="group/opt flex items-center gap-2">
                                            <label htmlFor={`choice-${q.id}-${choice.id}`} className="sr-only">
                                                Option {cIndex + 1} for question {qIndex + 1}
                                            </label>
                                            <input
                                                id={`choice-${q.id}-${choice.id}`}
                                                type="text"
                                                required={cIndex < 2} // First two are required
                                                placeholder={`Option ${cIndex + 1}`}
                                                className="flex-1 rounded-xl bg-secondary px-4 py-2.5 border border-transparent transition-all focus:outline-none focus:ring-2 focus:ring-primary/60 focus:bg-background placeholder:text-foreground/35"
                                                value={choice.label}
                                                maxLength={MAX_CHOICE_LABEL_LENGTH}
                                                onChange={(e) => handleChoiceChange(qIndex, cIndex, e.target.value)}
                                            />
                                            {q.choices.length > 2 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveChoice(qIndex, cIndex)}
                                                    aria-label={`Remove option ${cIndex + 1} from question ${qIndex + 1}`}
                                                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-foreground/35 transition-colors hover:bg-secondary hover:text-red-500"
                                                >
                                                    <X className="w-4 h-4" aria-hidden="true" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => handleAddChoice(qIndex)}
                                        disabled={q.choices.length >= MAX_CHOICES}
                                        aria-label={`Add another option to question ${qIndex + 1}`}
                                        className="mt-1 flex items-center gap-1.5 rounded-full px-1 py-1.5 text-sm font-medium text-primary transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:text-foreground/35"
                                    >
                                        <Plus className="w-4 h-4" aria-hidden="true" /> Add option
                                    </button>
                                </fieldset>
                            )}
                        </div>
                    ))}

                    <div className="flex justify-center pt-1">
                        <button
                            type="button"
                            onClick={handleAddQuestion}
                            className="flex items-center gap-2 rounded-full glass px-5 py-2.5 text-sm font-medium text-primary transition-all hover:-translate-y-0.5"
                        >
                            <Plus className="w-4 h-4" aria-hidden="true" /> Add another question
                        </button>
                    </div>

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={!isValid}
                            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 text-[17px] font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                        >
                            Launch session <ArrowRight className="w-5 h-5" aria-hidden="true" />
                        </button>
                        <p className="mt-3 text-center text-xs text-foreground/45">
                            You&apos;ll get a QR code and link for your audience to join.
                        </p>
                    </div>
                </form>
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
