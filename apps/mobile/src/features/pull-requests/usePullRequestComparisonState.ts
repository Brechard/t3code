import { useCallback, useState, type SetStateAction } from "react";
import { pullRequestReviewKey } from "./pullRequestReviewDrafts";
import type { PullRequestDiffParams } from "./usePullRequestDiff";

const EMPTY_IDS: readonly string[] = [];

export function usePullRequestComparisonState(params: PullRequestDiffParams) {
  const key = JSON.stringify([
    pullRequestReviewKey(params),
    params.commit ?? null,
    params.iterationRange?.from ?? null,
    params.iterationRange?.to ?? null,
  ]);
  const [state, setState] = useState<{
    key: string;
    paths: ReadonlySet<string>;
    collapsedIds: readonly string[];
  }>(() => ({ key, paths: new Set(), collapsedIds: EMPTY_IDS }));
  if (state.key !== key) setState({ key, paths: new Set(), collapsedIds: EMPTY_IDS });
  const paths = state.key === key ? state.paths : new Set<string>();
  const collapsedIds = state.key === key ? state.collapsedIds : EMPTY_IDS;
  const setCollapsedIds = useCallback(
    (next: SetStateAction<readonly string[]>) =>
      setState((current) => ({
        key,
        paths: current.key === key ? current.paths : new Set(),
        collapsedIds:
          typeof next === "function"
            ? next(current.key === key ? current.collapsedIds : EMPTY_IDS)
            : next,
      })),
    [key],
  );
  return {
    collapsedIds,
    setCollapsedIds,
    isViewed: (path: string) => paths.has(path),
    toggle: (path: string) =>
      setState((current) => {
        const next = new Set(current.key === key ? current.paths : []);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return {
          key,
          paths: next,
          collapsedIds: current.key === key ? current.collapsedIds : EMPTY_IDS,
        };
      }),
  };
}
