<div align="center">
  <img src="./assets/hero_banner.png" alt="Votify Hero Banner" width="100%" />

  # Votify (LivePoll)

  **A real-time, peer-to-peer polling application** built with modern web technologies. Create polls, share join links, and watch responses roll in live — with a resilient serverless fallback so results still land even when WebRTC can't connect.

  [![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat&logo=next.js)](https://nextjs.org/)
  [![React](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
  [![Zustand](https://img.shields.io/badge/Zustand-State_Management-yellow?style=flat)](https://github.com/pmndrs/zustand)
  [![PeerJS](https://img.shields.io/badge/PeerJS-WebRTC-orange?style=flat)](https://peerjs.com/)
  [![Zod](https://img.shields.io/badge/Zod-Validation-3E67B1?style=flat)](https://zod.dev/)

</div>

---

## 📸 See it in Action

<p align="center">
  <img src="./assets/host_qna.png" alt="Votify Host Q&A Dashboard" width="800" />
</p>
<p align="center">
  <img src="./assets/join_page.png" alt="Votify Participant View" width="400" />
</p>

> Screenshots above predate the Apple-inspired visual redesign — the live UI now uses the glass/aurora look described below.

## ✨ Features

- ⚡️ **P2P Real-time Updates**: Uses WebRTC via `peerjs` for instant vote broadcasting from participants directly to the host.
- 🛡️ **Serverless Fallback Relay**: Every vote, Q&A submission, and emoji reaction is also sent to a lightweight API route (`/api/vote`, `/api/qna`, `/api/emoji`) that the host polls as a backstop. If WebRTC can't establish a connection (restrictive networks, NAT/firewall issues, or same-browser-tab testing) results still arrive. State is kept in server memory only — there's no persistent database, so it's ephemeral per server instance.
- 🔄 **Cross-Tab Syncing**: Leverages `zustand` with `localStorage` persistence, so multiple tabs/windows on the same browser stay in sync as an additional fallback layer.
- 🔗 **Auto-Generating Join Links**: Includes encoded poll data inside the join URL, so participants instantly see the question and choices without an initial server roundtrip.
- 🔒 **Validated at Every Boundary**: Incoming HTTP payloads, P2P data-channel messages, and URL-embedded join data are all schema-validated with `zod` before they touch app state, plus IP-based rate limiting on the fallback API routes.
- 🎨 **Interactive UI**: Built with `framer-motion` for smooth animated bars/counters and `lucide-react` for iconography.
- 📊 **Five Session Types**: Single Choice (pick one), Multiple Choice (pick several), Word Cloud (free-text, multiple submissions per participant), Ranked Choice (single vote per participant, presented as a gold/silver/bronze leaderboard), and a Q&A Board with upvoting.
- 💅 **Modern Styling**: Tailwind CSS v4, a shared glass/blur utility, an animated aurora background, and subtle film-grain texture — see [Design System](#-design-system) below.
- 🌈 **Colour Scheme Switcher**: Choose from four built-in themes — **Light** (default), **Midnight**, **Graphite**, and **Ocean**. Selection is persisted in `localStorage` and applied globally via a floating palette button (top-right).

## ⚙️ Environment Variables (Optional)

You can configure additional integrations by creating a `.env` or `.env.local` file in the root directory:

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | The domain used for Plausible Analytics. | `votify.example.com` |
| `NEXT_PUBLIC_PLAUSIBLE_URL` | The URL to your Plausible script. | `https://plausible.io/js/script.js` |
| `NEXT_PUBLIC_BUYMEACOFFEE_SLUG` | Your creator slug for the "Buy Me A Coffee" widget. If provided, a floating button will appear in the bottom-right corner. | `RookieZA` |

## 🎨 Design System

The UI follows an Apple-inspired visual language:

- **Typography**: Geist Sans/Mono (doubles as the display face — same DNA as SF Pro Display).
- **Motion**: a single shared easing curve (`--ease-out-expo`) used across transitions, the aurora animation, and popovers.
- **Glass surfaces**: a shared `glass` utility (blurred, saturated, translucent card background with a theme-aware shadow tint).
- **Aurora background**: a fixed, heavily-blurred, animated radial-gradient layer behind all content (respects `prefers-reduced-motion`).
- **Film grain**: a faint animated noise overlay for texture.

### Colour Themes

A floating **palette button** (top-right corner) lets you switch themes at any time — your selection is saved in `localStorage` so it persists across sessions.

| Theme (internal id) | Background | Accent | Description |
|---|---|---|---|
| ☀️ **Light** *(default)* (`light`) | `#f5f5f7` | System blue `#0071e3` | Clean, bright canvas with Apple system-blue accents |
| 🌙 **Midnight** (`midnight`) | `#000000` | Blue `#2997ff` | True-black background with a brighter blue accent |
| 🪨 **Graphite** (`vivid`) | `#161617` | Orange `#ff9f0a` | Dark graphite background with a punchy orange accent |
| 🌊 **Ocean** (`ocean`) | `#0c191f` | Teal `#30b0c7` | Deep slate background with a refreshing teal accent |

The active theme is applied as a `data-theme` attribute on `<html>` (e.g. `data-theme="midnight"`), and all CSS variables are scoped to each theme in `globals.css`.

<p align="center">
  <img src="./assets/theme_switcher_demo.png" alt="Theme Switcher Demo" width="800" />
</p>

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **P2P Networking**: [PeerJS](https://peerjs.com/) (WebRTC), with API-route fallback for votes, Q&A, and emoji reactions
- **Validation**: [Zod](https://zod.dev/) for every network/URL trust boundary (API payloads, P2P messages, join-link data)
- **Icons**: Lucide React
- **Animations**: Framer Motion
- **QR Codes**: `qrcode.react`

## 📁 Project Structure

**`src/app/`**
- `page.tsx` — Home page listing the five session-type cards and a "how it works" panel.
- `layout.tsx` — Root layout: loads fonts, renders the aurora background, conditionally mounts Plausible analytics and the "Buy Me a Coffee" widget, wraps everything in `ClientProviders`.
- `globals.css` — The design system: theme variables, glass utility, aurora/grain effects.
- `create/page.tsx` — Poll-creation form. Supports multiple questions per session, 2–10 choices per question, and switching session type before creating the poll.
- `host/[id]/page.tsx` — Host dashboard: QR code + join link, live attendee/connection status, pause/resume/close/reopen, hide-results toggle, CSV export, multi-question advance, a live emoji-reaction overlay, per-type results rendering, and the HTTP fallback-sync polling loop.
- `join/page.tsx` — Participant view. Decodes the poll from the URL, connects to the host via PeerJS, renders the type-specific input, and submits via P2P *and* the matching API route as a fallback.
- `components/BarResults.tsx` — Shared animated results visualization (percentage bars, animated counters, optional ranked/leaderboard mode).
- `components/ClientProviders.tsx` — Client wrapper that mounts the theme provider and the floating `ThemeSwitcher`.
- `components/Logo.tsx` — The Votify logo mark and wordmark, reused across pages.
- `components/ThemeSwitcher.tsx` — Floating palette button + popover for switching colour schemes.
- `api/vote/route.ts`, `api/qna/route.ts`, `api/emoji/route.ts` — Serverless fallback routes. In-memory (not persisted), rate-limited by IP, validated with `zod`, with size/age caps so memory stays bounded.

**`src/hooks/`**
- `usePeer.ts` — Host-side PeerJS hook: creates the host's `Peer`, validates incoming payloads with a `zod` discriminated union, and broadcasts state changes to connected participants.
- `usePeerConnection.ts` — Participant-side PeerJS hook: connects to the host, exposes connection status, and sends messages (with a workaround for a known PeerJS same-tab connection bug).

**`src/lib/`**
- `store.ts` — Zustand store(s) persisted to `localStorage`: current poll state and mutation actions, plus poll history. Includes a cross-tab `storage` listener for fallback syncing.
- `themeContext.tsx` — Theme context/provider: defines the four themes and persists the active selection.
- `rateLimit.ts` — Shared in-memory sliding-window rate limiter used by the API routes.
- `utils.ts` — Class-name merging, join-link payload encode/decode, ID generation, and per-browser voter-ID helpers.

## 🚀 Getting Started

### Prerequisites

- Node.js (v20+ recommended)
- npm, yarn, pnpm, or bun

### Installation

1. **Clone the repository and navigate to the project directory:**
   ```bash
   git clone https://github.com/RookieZA/Votify
   cd Votify
   ```

2. **Install the dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Start Polling:** Open [http://localhost:3000](http://localhost:3000) with your browser to create a poll.

## 🧠 How it Works

1. 🏠 **Host Setup**: When a host creates a poll, `usePeer` initializes a new `Peer` with a unique ID. The poll data is saved to the local Zustand store.
2. 🔗 **Join Link Generation**: The host dashboard generates a join URL containing the host's Peer ID and a base64-encoded, `zod`-validated payload of the poll question(s) and choices.
3. 👤 **Participant Join**: When a participant opens the join link, the page decodes and validates the URL payload, then `usePeerConnection` attempts to connect to the host's Peer ID.
4. 🗳️ **Voting**: On submit, the participant sends the response over the WebRTC data channel *and* POSTs it to the matching fallback API route (`/api/vote`, `/api/qna`, or `/api/emoji`) at the same time.
5. 🛡️ **Fallback Reconciliation**: The host validates and applies P2P messages as they arrive, and separately polls the fallback API routes on an interval to reconcile any responses that never made it over WebRTC (e.g. restrictive networks, or same-browser-tab testing where PeerJS's `open` event can fail to fire). The fallback routes keep state in server memory only — nothing is written to a persistent database.

---
<div align="center">
  <i>Built with ❤️ for real-time engagement.</i>
</div>
