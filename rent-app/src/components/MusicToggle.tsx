"use client";

// Navbar sound toggle (PRD v4 Change 1). Sound is on by default and starts on the first tap; this mutes everything.
import { Icon } from "@/components/icons";
import { setAudioPrefs, useAudioPrefs } from "./audio";

export function MusicToggle() {
  const { muted } = useAudioPrefs();
  return (
    <button className="music-toggle" onClick={() => setAudioPrefs({ muted: !muted })} aria-pressed={!muted} title={muted ? "Turn sound on" : "Mute sound"}>
      <Icon name={muted ? "volume-x" : "volume-3"} /> {muted ? "Off" : "On"}
    </button>
  );
}
