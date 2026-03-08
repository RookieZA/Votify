import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PollType = 'multiple-choice' | 'multiple-select' | 'word-cloud' | 'ranked-choice' | 'qna';

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
    addVote: (payload: any, voterId?: string) => void;
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
            pollType: 'multiple-choice',
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

            addVote: (payload: any, voterId?: string) => {
                const state = get();

                // If a voterId is provided and they already voted on this question (except for QnA where they can ask multiple)
                if (voterId && state.votedUsers.includes(voterId) && state.pollType !== 'qna') {
                    // For multiple-select, maybe array payload is sent at once, so it's fine.
                    return;
                }

                if (state.pollType === 'multiple-select' && Array.isArray(payload)) {
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
                            choices: [...state.choices, { id: Math.random().toString(36).substring(7), label: payload.trim(), votes: 1 }],
                            votedUsers: voterId ? [...state.votedUsers, voterId] : state.votedUsers
                        });
                    }
                } else if (state.pollType === 'ranked-choice' && Array.isArray(payload)) {
                    // payload is ordered array of choiceIds: [first, second, third]
                    // Award points: 1st = n points, 2nd = n-1, etc.
                    const n = payload.length;
                    set({
                        choices: state.choices.map(c => {
                            const index = payload.indexOf(c.id);
                            const points = index !== -1 ? (n - index) : 0;
                            return { ...c, votes: c.votes + points };
                        }),
                        votedUsers: voterId ? [...state.votedUsers, voterId] : state.votedUsers
                    });
                } else if (typeof payload === 'string') {
                    // Default multiple choice
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
                const newItem: QnaItem = {
                    id: Math.random().toString(36).substring(7),
                    text,
                    upvotes: 0,
                    userId,
                    upvoterIds: []
                };
                set({ qnaItems: [...state.qnaItems, newItem] });
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
