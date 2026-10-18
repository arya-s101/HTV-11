import type { Metadata } from "next";
import { IBM_Plex_Mono, Press_Start_2P } from "next/font/google";
import { NeonBackground, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import "./globals.css";

// display "block": no flash of fallback type changing line breaks mid-animation (audit A9).
const pixel = Press_Start_2P({ subsets: ["latin"], weight: "400", variable: "--font-pixel", display: "block" });
// Body/number font must have unambiguous digits; the pixel font is for headings only.
const body = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-body", display: "block" });

export const metadata: Metadata = {
  // Working title; rename after the core loop works (PRD).
  title: "ToRento",
  description: "An 8-bit life sim about Toronto rental tradeoffs, which public levers shape them, and one sourced question to ask municipal candidates.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${pixel.variable} ${body.variable}`}>
      <body>
        <NeonBackground />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="container">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
