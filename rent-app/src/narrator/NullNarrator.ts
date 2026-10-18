import type { Narrator } from "./Narrator";

/** Used when speech is unsupported, no English voice exists, or read-aloud is off: the game plays silently. */
export class NullNarrator implements Narrator {
  isSupported() {
    return false;
  }
  async speakLines() {}
  async speakOptions() {}
  cancel() {}
  setSettings() {}
  voices() {
    return [];
  }
  async sample() {}
}
