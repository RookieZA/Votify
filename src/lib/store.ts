import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { randomId } from './utils';

export type PollType = 'single-choice' | 'multiple-choice' | 'word-cloud' | 'ranked-choice' | 'qna';

export const MAX_QNA_ITEMS = 500;
export const MAX_QNA_TEXT_LENGTH = 500;

export interface Choice {
    id: string;
    label: string;
    votes: number;
}

export interface QnaItem {
    id: string;
    text: string;
    upvotes: number;
    userId: string;
    upvoterIds: string[];
}

export function sanitizeQnaText(text: string): string {
    return text.trim().slice(0, MAX_QNA_TEXT_LENGTH);
}

export function limitQnaItems(items: QnaItem[]): QnaItem[] {
    if (items.length <= MAX_QNA_ITEMS) {
        return items;
    }

    return items.slice(-MAX_QNA_ITEMS);
}

export interface QuestionData {
    id: string;
    question: string;
    choices: Choice[];
}

export interface PollState {
    hostId: string | null;
    pollType: PollType;
    status: 'open' | 'paused' | 'closed';
    resultsHidden: boolean;

    // Multi-question support
    questions: QuestionData[];
    currentQuestionIndex: number;

    // Active question state
    question: string;
    choices: Choice[];
    qnaItems: QnaItem[];
    votedUsers: string[];

    // Actions
    setPoll: (hostId: string, pollType: PollType, questions: QuestionData[]) => void;
    addVote: (payload: string | string[], voterId?: string) => void;
    addQnaItem: (text: string, userId: string) => void;
    upvoteQnaItem: (id: string, userId: string) => void;
    setStatus: (status: 'open' | 'paused' | 'closed') => void;
    setResultsHidden: (hidden: boolean) => void;
    nextQuestion: () => void;
    resetPoll: () => void;
}

export const usePollStore = create<PollState>()(
    persist(
        (set, get) => ({
            hostId: null,
            pollType: 'single-choice',
            status: 'open',
            resultsHidden: false,

            questions: [],
            currentQuestionIndex: 0,

            question: "",
            choices: [],
            qnaItems: [],
            votedUsers: [],

            setPoll: (hostId, pollType, questions) => {
                if (!questions || questions.length === 0) return;
                const first = questions[0];
                set({
                    hostId,
                    pollType,
                    status: 'open',
                    resultsHidden: false,
                    questions,
                    currentQuestionIndex: 0,
                    question: first.question,
                    choices: first.choices.map(c => ({ ...c, votes: 0 })),
                    qnaItems: [],
                    votedUsers: []
                });
            },

            addVote: (payload: string | string[], voterId?: string) => {
                const state = get();

                // If a voterId is provided and they already voted on this question (except for QnA and word clouds where they can submit multiple)
                if (voterId && state.votedUsers.includes(voterId) && state.pollType !== 'qna' && state.pollType !== 'word-cloud') {
                    // For multiple-choice, the array payload is sent at once, so it's fine.
                    return;
                }

                if (state.pollType === 'multiple-choice' && Array.isArray(payload)) {
                    // payload is array of choiceIds
                    set({
                        choices: state.choices.map(c =>
                            payload.includes(c.id) ? { ...c, votes: c.votes + 1 } : c
                        ),
                        votedUsers: voterId ? [...state.votedUsers, voterId] : state.votedUsers
                    });
                } else if (state.pollType === 'word-cloud' && typeof payload === 'string') {
                    // payload is a new word or existing word text
                    const word = payload.trim().toLowerCase();
                    const existing = state.choices.find(c => c.label.toLowerCase() === word);
                    if (existing) {
                        set({
                            choices: state.choices.map(c =>
                                c.id === existing.id ? { ...c, votes: c.votes + 1 } : c
                            ),
                            votedUsers: voterId ? [...state.votedUsers, voterId] : state.votedUsers
                        });
                    } else {
                        set({
                            choices: [...state.choices, { id: randomId(), label: payload.trim(), votes: 1 }],
                            votedUsers: voterId ? [...state.votedUsers, voterId] : state.votedUsers
                        });
                    }
                } else if (typeof payload === 'string') {
                    // Default: single-choice and ranked-choice both cast a single
                    // vote for one choice; ranked-choice's ranking comes purely from
                    // sorting by vote count, not per-vote weighting.
                    set({
                        choices: state.choices.map((c) =>
                            c.id === payload ? { ...c, votes: c.votes + 1 } : c
                        ),
                        votedUsers: voterId ? [...state.votedUsers, voterId] : state.votedUsers
                    });
                }
            },

            addQnaItem: (text: string, userId: string) => {
                const state = get();
                const sanitizedText = sanitizeQnaText(text);
                if (!sanitizedText) {
                    return;
                }

                const newItem: QnaItem = {
                    id: randomId(),
                    text: sanitizedText,
                    upvotes: 0,
                    userId,
                    upvoterIds: []
                };

                set({ qnaItems: limitQnaItems([...state.qnaItems, newItem]) });
            },

            upvoteQnaItem: (id: string, userId: string) => {
                const state = get();
                set({
                    qnaItems: state.qnaItems.map(item => {
                        if (item.id === id && !item.upvoterIds.includes(userId)) {
                            return {
                                ...item,
                                upvotes: item.upvotes + 1,
                                upvoterIds: [...item.upvoterIds, userId]
                            };
                        }
                        return item;
                    })
                });
            },

            setStatus: (status) => set({ status }),

            setResultsHidden: (resultsHidden) => set({ resultsHidden }),

            nextQuestion: () => {
                const state = get();
                const nextIdx = state.currentQuestionIndex + 1;
                if (nextIdx < state.questions.length) {
                    const nextQ = state.questions[nextIdx];
                    set({
                        currentQuestionIndex: nextIdx,
                        question: nextQ.question,
                        choices: nextQ.choices.map(c => ({ ...c, votes: 0 })),
                        votedUsers: [],
                        status: 'open' // ensure it's open
                    });
                } else {
                    // No more questions, auto close
                    set({ status: 'closed' });
                }
            },

            resetPoll: () => set({
                hostId: null,
                questions: [],
                currentQuestionIndex: 0,
                question: "",
                choices: [],
                qnaItems: [],
                votedUsers: []
            }),
        }),
        {
            name: 'poll-storage',
        }
    )
);

// History Store
export interface HistoryItem {
    id: string;
    date: string;
    pollType: PollType;
    question: string;
    totalVotes: number;
}

export interface HistoryState {
    pastPolls: HistoryItem[];
    addPastPoll: (poll: HistoryItem) => void;
    clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>()(
    persist(
        (set) => ({
            pastPolls: [],
            addPastPoll: (poll) => set((state) => ({
                pastPolls: [poll, ...state.pastPolls]
            })),
            clearHistory: () => set({ pastPolls: [] })
        }),
        {
            name: 'poll-history-storage'
        }
    )
);


if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key === 'poll-storage') {
            usePollStore.persist.rehydrate();
        }
        if (e.key === 'poll-history-storage') {
            useHistoryStore.persist.rehydrate();
        }
    });
}
