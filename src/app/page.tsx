"use client";

import { useRouter } from "next/navigation";
import { BarChart2, CheckSquare, Cloud, ListOrdered, MessageCircle, ArrowRight } from "lucide-react";
import { PollType } from "@/lib/store";

interface PollTypeCard {
  type: PollType;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

const pollTypes: PollTypeCard[] = [
  {
    type: "multiple-choice",
    title: "Multiple Choice",
    description: "Standard poll where participants choose exactly one option.",
    icon: BarChart2,
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  },
  {
    type: "multiple-select",
    title: "Multiple Selection",
    description: "Participants can select more than one option from a list.",
    icon: CheckSquare,
    color: "bg-green-500/10 text-green-500 border-green-500/20",
  },
  {
    type: "word-cloud",
    title: "Word Cloud",
    description: "Participants type short answers that form a dynamic word cloud.",
    icon: Cloud,
    color: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  },
  {
    type: "ranked-choice",
    title: "Ranked Choice",
    description: "Participants drag and drop options to rank them by preference.",
    icon: ListOrdered,
    color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  },
  {
    type: "qna",
    title: "Q&A Board",
    description: "Participants submit questions and upvote others.",
    icon: MessageCircle,
    color: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  }
];

export default function Home() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen flex-col items-center p-4 py-12 md:p-12">
      <div className="w-full max-w-5xl space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">

        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-primary/10">
            <BarChart2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">TeamsVoter</h1>
          <p className="text-xl text-foreground/70 max-w-2xl mx-auto">
            Create real-time, peer-to-peer engagement sessions instantly. No database or sign-up required.
          </p>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pollTypes.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.type}
                onClick={() => router.push(`/create?type=${card.type}`)}
                className={`glass group relative p-6 rounded-2xl border text-left flex flex-col items-start gap-4 transition-all hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl ${card.color} hover:border-current`}
              >
                <div className={`p-4 rounded-xl bg-background shadow-inner`}>
                  <Icon className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2 text-foreground">{card.title}</h3>
                  <p className="text-foreground/70 text-sm leading-relaxed">{card.description}</p>
                </div>
                <div className="mt-auto pt-4 flex items-center text-sm font-semibold opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-current">
                  Create <ArrowRight className="w-4 h-4 ml-1" />
                </div>
              </button>
            )
          })}
        </div>

      </div>
    </main>
  );
}
