"use client";

// Firebase for multiplayer (PRD v4 Change 5): anonymous auth + Firestore. Behind a feature flag: when the flag or
// config is missing, multiplayer is hidden and single-player is untouched. Web config is public by design;
// access is enforced by firestore.rules.
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { browserLocalPersistence, getAuth, inMemoryPersistence, initializeAuth, signInAnonymously, type Auth, type User } from "firebase/auth";
import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const multiplayerEnabled = () => process.env.NEXT_PUBLIC_MULTIPLAYER === "1" && !!config.apiKey && !!config.projectId && !!config.appId;

let app: FirebaseApp | null = null;
function firebase(): FirebaseApp {
  app ??= getApps().length ? getApp() : initializeApp(config);
  return app;
}
let store: Firestore | null = null;
/**
 * Long-polling instead of the streaming channel: ad blockers, browser shields and some venue networks block the
 * stream, and the SDK then retries forever instead of failing.
 */
export function db(): Firestore {
  if (store) return store;
  try {
    // ignoreUndefinedProperties: optional fields (e.g. a listing with no red flag) are simply left out.
    store = initializeFirestore(firebase(), { experimentalForceLongPolling: true, ignoreUndefinedProperties: true });
  } catch {
    store = getFirestore(firebase()); // already initialised (e.g. after a hot reload)
  }
  return store;
}
/** Public config, shown in error messages to help spot a mismatched project. */
export const firebaseProjectId = () => config.projectId ?? "(not set)";

let authInstance: Auth | null = null;
/**
 * Auth without the popup/redirect resolver and with plain localStorage persistence: getAuth()'s defaults load an
 * auth iframe and IndexedDB, which can stall in some browsers and extensions. Anonymous sign-in needs neither.
 */
function auth(): Auth {
  if (authInstance) return authInstance;
  try {
    authInstance = initializeAuth(firebase(), { persistence: [browserLocalPersistence, inMemoryPersistence] });
  } catch {
    authInstance = getAuth(firebase()); // already initialised (e.g. after a hot reload)
  }
  return authInstance;
}

/** Signs in anonymously (the UID persists on this device, so a player can rejoin their room). */
export async function signIn(): Promise<User> {
  const a = auth();
  await a.authStateReady();
  if (a.currentUser) return a.currentUser;
  const cred = await signInAnonymously(a);
  return cred.user;
}
