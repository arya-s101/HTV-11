import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a verification build run beside `npm run dev` without clobbering its .next folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The dev badge sits on top of the game's bottom lock-in bar.
  devIndicators: false,
};

export default nextConfig;
