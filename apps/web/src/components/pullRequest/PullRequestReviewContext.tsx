import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { EnvironmentId, PullRequestRef } from "@t3tools/contracts";

export type PullRequestReviewContextValue = {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  azure: boolean;
  previousVisit: string | null;
  deniedActions?: Readonly<Record<string, string>>;
};
export const PullRequestReviewContext = createContext<PullRequestReviewContextValue | null>(null);

const VISIT_KEY_PREFIX = "t3:pr-last-visit:";

function readVisit(key: string) {
  try {
    return localStorage.getItem(`${VISIT_KEY_PREFIX}${key}`);
  } catch {
    return null;
  }
}

function recordVisit(key: string) {
  try {
    localStorage.setItem(`${VISIT_KEY_PREFIX}${key}`, new Date().toISOString());
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => key?.startsWith(VISIT_KEY_PREFIX) === true)
      .sort((a, b) => (localStorage.getItem(b) ?? "").localeCompare(localStorage.getItem(a) ?? ""));
    for (const key of keys.slice(256)) localStorage.removeItem(key);
  } catch {
    /* Storage may be unavailable in private browsing. */
  }
}

/**
 * The visit before this one, held for as long as the pull request stays open. Once its activity
 * shows, the visit is recorded, and again when the reader leaves or hides the page.
 */
export function usePullRequestPreviousVisit(key: string, activityLoaded: boolean) {
  const [visit, setVisit] = useState(() => ({ key, at: readVisit(key) }));
  const seenKey = useRef<string | null>(null);
  if (visit.key !== key) setVisit({ key, at: readVisit(key) });
  // Record the visit once its activity has loaded, after the previous visit was read.
  // oxlint-disable-next-line t3code/react-effect-budget -- Synchronizes the visit with browser storage.
  useEffect(() => {
    if (!activityLoaded || seenKey.current === key) return;
    seenKey.current = key;
    recordVisit(key);
  }, [activityLoaded, key]);
  // Persist the visit when the page is hidden or the reader leaves.
  // oxlint-disable-next-line t3code/react-effect-budget -- Browser lifecycle listeners need setup and cleanup.
  useEffect(() => {
    const leave = () => {
      if (seenKey.current === key) recordVisit(key);
    };
    if (typeof document === "undefined") return leave;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") leave();
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      leave();
    };
  }, [key]);
  return visit.key === key ? visit.at : null;
}

export function usePullRequestDeniedActions() {
  return useContext(PullRequestReviewContext)?.deniedActions ?? {};
}
