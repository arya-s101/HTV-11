// Site-wide navbar, footer and neon background. Server components (no client JS).
import Link from "next/link";
import { ELECTION_HUB } from "@/game/data";

const NAV = [
  { href: "/", label: "Play" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/sources", label: "Data & sources" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container nav">
        <Link href="/" className="brand">
          <span>
            Toronto Rent Decisions
            <small>working title</small>
          </span>
        </Link>
        <nav aria-label="Main">
          <ul>
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href}>{n.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <a className="election-pill" href={ELECTION_HUB.url} target="_blank" rel="noreferrer">
          <span className="dot" /> Election day · Oct 26
        </a>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <h4>About</h4>
          <p>
            An 8-bit life sim about Toronto rental tradeoffs and which public levers shape them. Nonpartisan: it doesn&apos;t endorse candidates or predict
            policy outcomes.
          </p>
        </div>
        <div>
          <h4>Data</h4>
          <p>
            Offers, people and incomes are fictional and labelled illustrative. Real data: City of Toronto Open Data (Open Government Licence – Toronto),
            CMHC Rental Market Survey (adapted; not endorsed by CMHC), TTC, Province of Ontario.
          </p>
          <Link href="/sources">All sources →</Link>
        </div>
        <div>
          <h4>Vote</h4>
          <ul>
            <li>
              <a href={ELECTION_HUB.url} target="_blank" rel="noreferrer">
                City of Toronto election hub
              </a>
            </li>
            <li>
              <a href="https://myvote.toronto.ca/home" target="_blank" rel="noreferrer">
                MyVote: check where to vote
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="container footer-base">
        <span>Built for Hack the Valley 11 · School of Cities challenge</span>
        <span>AI use: Gemini may voice the landlord and write custom job paths; game code decides every number.</span>
      </div>
    </footer>
  );
}

export function NeonBackground() {
  return (
    <div className="neon-bg" aria-hidden="true">
      <div className="stars" />
      <div className="sun" />
      <div className="horizon" />
      <div className="floor">
        <div className="grid" />
      </div>
    </div>
  );
}
