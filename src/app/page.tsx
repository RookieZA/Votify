"use client";

import { useRouter } from "next/navigation";
import {
  BarChart2,
  CheckSquare,
  Cloud,
  ListOrdered,
  MessageCircle,
  ArrowRight,
  Zap,
  QrCode,
  Radio,
} from "lucide-react";
import { PollType } from "@/lib/store";
import { Logo } from "./components/Logo";

interface PollTypeCard {
  type: PollType;
  title: string;
  description: string;
  icon: React.ElementType;
  /** [from, to] gradient for the icon tile + hover glow. */
  gradient: [string, string];
}

// iOS system palette — [lighter top, base bottom] for a subtle app-icon sheen.
const pollTypes: PollTypeCard[] = [
  {
    type: "multiple-choice",
    title: "Multiple Choice",
    description: "Ask a question, get one answer. The classic live poll with instant results.",
    icon: BarChart2,
    gradient: ["#4da2ff", "#0a84ff"],
  },
  {
    type: "multiple-select",
    title: "Multiple Selection",
    description: "Let people pick as many options as apply and compare the spread.",
    icon: CheckSquare,
    gradient: ["#5fdd7e", "#30d158"],
  },
  {
    type: "word-cloud",
    title: "Word Cloud",
    description: "Collect short answers that bloom into a living, weighted word cloud.",
    icon: Cloud,
    gradient: ["#64d2ff", "#30b0c7"],
  },
  {
    type: "ranked-choice",
    title: "Ranked Choice",
    description: "Everyone picks their favorite — watch the ranking emerge live as votes come in.",
    icon: ListOrdered,
    gradient: ["#ffb84d", "#ff9f0a"],
  },
  {
    type: "qna",
    title: "Q&A Board",
    description: "Crowd-source questions and let the best ones rise with upvotes.",
    icon: MessageCircle,
    gradient: ["#ff6482", "#ff375f"],
  },
];

const steps = [
  { icon: Zap, title: "Pick a format", text: "Choose a poll type and add your questions — no account needed." },
  { icon: QrCode, title: "Share the link", text: "Drop a QR code or link on screen. People join in one tap." },
  { icon: Radio, title: "Watch it live", text: "Answers stream in over peer-to-peer, in real time." },
];

export default function Home() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen flex-col items-center px-4 pb-20">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="w-full max-w-6xl flex items-center justify-between py-6">
        <Logo size={30} />
      </header>

      <div className="w-full max-w-6xl">
        {/* ── Hero ──────────────────────────────────────────────── */}
        <section className="text-center pt-10 md:pt-16 pb-14 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <span className="inline-flex items-center gap-2 rounded-full border border-border glass px-4 py-1.5 text-xs font-semibold tracking-wide text-foreground/80">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Real-time · Peer-to-peer · No sign-up
          </span>

          <h1 className="font-display font-bold tracking-tight text-5xl sm:text-6xl md:text-7xl leading-[1.02] mt-7">
            Turn any room into
            <br className="hidden sm:block" />{" "}
            <span className="text-gradient">a live conversation.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg md:text-xl text-foreground/70 leading-relaxed">
            Votify spins up real-time polls, word clouds, and Q&amp;A in seconds.
            Your audience answers from their phones — you watch it unfold on the big screen.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => router.push(`/create?type=multiple-choice`)}
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0"
            >
              Create a session
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </button>
            <a
              href="#formats"
              className="inline-flex items-center gap-2 rounded-full glass px-7 py-3.5 font-medium text-primary transition-all hover:brightness-110"
            >
              Explore formats
            </a>
          </div>
        </section>

        {/* ── Formats grid ──────────────────────────────────────── */}
        <section id="formats" className="scroll-mt-8">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-display text-2xl font-bold tracking-tight">Choose a format</h2>
            <span className="text-sm text-foreground/50">5 ways to hear your audience</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {pollTypes.map((card, i) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.type}
                  onClick={() => router.push(`/create?type=${card.type}`)}
                  aria-label={`Create a ${card.title} session`}
                  style={{ animationDelay: `${i * 70}ms` }}
                  className="group glass relative flex flex-col items-start gap-5 overflow-hidden rounded-3xl p-6 text-left transition-all duration-300 hover:-translate-y-1.5 animate-in fade-in slide-in-from-bottom-4 fill-mode-both"
                >
                  {/* hover wash in the card's own colour */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background: `radial-gradient(120% 80% at 0% 0%, ${card.gradient[1]}14 0%, transparent 60%)`,
                    }}
                  />

                  <div
                    className="relative flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg transition-transform duration-300 group-hover:scale-105"
                    style={{
                      backgroundImage: `linear-gradient(180deg, ${card.gradient[0]}, ${card.gradient[1]})`,
                      boxShadow: `0 10px 24px -10px ${card.gradient[1]}b3`,
                    }}
                  >
                    <Icon className="h-7 w-7" aria-hidden="true" />
                  </div>

                  <div className="relative">
                    <h3 className="font-display text-xl font-bold tracking-tight">{card.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-foreground/65">{card.description}</p>
                  </div>

                  <div
                    className="relative mt-auto inline-flex items-center gap-1.5 text-sm font-semibold transition-all"
                    style={{ color: card.gradient[1] }}
                  >
                    Create
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </div>
                </button>
              );
            })}

            {/* “How it works” tile fills the 6th grid cell */}
            <div className="glass rounded-3xl p-6 flex flex-col justify-center gap-5">
              <h3 className="font-display text-lg font-bold tracking-tight text-foreground/90">How it works</h3>
              <ol className="space-y-4">
                {steps.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <li key={s.title} className="flex items-start gap-3">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">
                          <span className="text-foreground/40 tabular-nums mr-1.5">{i + 1}.</span>
                          {s.title}
                        </p>
                        <p className="text-xs leading-relaxed text-foreground/60 mt-0.5">{s.text}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </section>

        {/* ── Footer ────────────────────────────────────────────── */}
        <footer className="mt-16 flex flex-col items-center gap-3 border-t border-border pt-8 text-center">
          <Logo size={24} markOnly />
          <p className="text-sm text-foreground/50">
            Peer-to-peer engagement. No database, no account, your data never leaves the room.
          </p>
        </footer>
      </div>
    </main>
  );
}
