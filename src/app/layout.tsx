import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ClientProviders } from "./components/ClientProviders";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Votify — Live audience polls, instantly",
  description:
    "Create real-time, peer-to-peer polls, word clouds, and Q&A sessions in seconds. No database, no sign-up.",
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
        <div className="aurora" aria-hidden="true" />
        {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && process.env.NEXT_PUBLIC_PLAUSIBLE_URL && (
          <Script
            defer
            data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
            src={process.env.NEXT_PUBLIC_PLAUSIBLE_URL}
            strategy="afterInteractive"
          />
        )}
        {process.env.NEXT_PUBLIC_BUYMEACOFFEE_SLUG && (
          <div className="fixed bottom-4 left-4 z-50">
            <a
              href={`https://www.buymeacoffee.com/${process.env.NEXT_PUBLIC_BUYMEACOFFEE_SLUG}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block transition-transform hover:scale-105"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=${process.env.NEXT_PUBLIC_BUYMEACOFFEE_SLUG}&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff`}
                alt="Buy me a coffee"
                style={{ height: "60px" }}
              />
            </a>
          </div>
        )}
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
