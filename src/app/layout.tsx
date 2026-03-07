import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LivePoll by TeamsVoter",
  description: "Real-time, stateless P2P polling system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {process.env.NEXT_PUBLIC_TRACKING_SCRIPT && (
          <div dangerouslySetInnerHTML={{
            __html: process.env.NEXT_PUBLIC_TRACKING_SCRIPT.startsWith('"') && process.env.NEXT_PUBLIC_TRACKING_SCRIPT.endsWith('"')
              ? JSON.parse(process.env.NEXT_PUBLIC_TRACKING_SCRIPT)
              : process.env.NEXT_PUBLIC_TRACKING_SCRIPT
          }} />
        )}
        {children}
      </body>
    </html>
  );
}
