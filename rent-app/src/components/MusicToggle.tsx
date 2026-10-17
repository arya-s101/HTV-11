"use client";

import { useEffect, useRef, useState } from "react";

// Looks for public/music/theme.* (see public/music/README.md). Hidden when no file is present.
const CANDIDATES = ["/music/theme.mp3", "/music/theme.ogg", "/music/theme.m4a", "/music/theme.wav"];
const PREF_KEY = "trd.music";
const VOLUME = 0.3;

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "on";
  } catch {
    return false;
  }
}

function writePref(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    // storage unavailable: the choice just isn't remembered
  }
}

export function MusicToggle() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [available, setAvailable] = useState(false);
  const [on, setOn] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setOn(readPref());
    (async () => {
      for (const src of CANDIDATES) {
        const res = await fetch(src, { method: "HEAD" }).catch(() => null);
        if (cancelled) return;
        if (res?.ok && (res.headers.get("content-type") ?? "").startsWith("audio")) {
          const a = new Audio(src);
          a.loop = true;
          a.volume = VOLUME;
          a.onplay = () => setPlaying(true);
          a.onpause = () => setPlaying(false);
          audio.current = a;
          setAvailable(true);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
      audio.current?.pause();
    };
  }, []);

  // Autoplay is blocked until the player interacts, so start on the first click or key press.
  useEffect(() => {
    if (!available || !on) return;
    const start = () => audio.current?.play().catch(() => {});
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, [available, on]);

  if (!available) return null;

  function toggle() {
    const next = !(on && playing);
    setOn(next);
    writePref(next);
    if (next) audio.current?.play().catch(() => {});
    else audio.current?.pause();
  }

  return (
    <button className="music-toggle" onClick={toggle} aria-pressed={on && playing} title={on && playing ? "Turn music off" : "Turn music on"}>
      ♪ {on && playing ? "On" : "Off"}
    </button>
  );
}
