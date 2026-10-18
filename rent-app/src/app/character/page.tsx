"use client";

// Character page: one saved character for every game (single-player and multiplayer).
import { useEffect, useState } from "react";
import { CharacterCreator } from "@/components/CharacterCreator";
import { loadCharacter, NEW_CHARACTER, saveCharacter } from "@/game/character-store";
import type { Character } from "@/game/sprite";
import { play } from "@/components/audio";

export default function CharacterPage() {
  const [character, setCharacter] = useState<Character>(NEW_CHARACTER);
  const [loaded, setLoaded] = useState(false);
  const [then, setThen] = useState<string | null>(null);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("then");
    setThen(t === "base" || t === "extended" || t === "party" ? t : null);
    setCharacter(loadCharacter() ?? NEW_CHARACTER);
    setLoaded(true);
  }, []);
  // Saved as you edit, so the home page and multiplayer always use the latest character.
  useEffect(() => {
    if (loaded) saveCharacter({ ...character, name: character.name.trim() });
  }, [character, loaded]);

  return (
    <div className="game" onClickCapture={(e) => (e.target as HTMLElement).closest("button:not(:disabled)") && play("tap")}>
      <CharacterCreator
        character={character}
        setCharacter={setCharacter}
        then={then}
      />
    </div>
  );
}
