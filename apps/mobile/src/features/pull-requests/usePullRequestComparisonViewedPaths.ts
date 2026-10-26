import { useState } from "react";
import { pullRequestReviewKey } from "./pullRequestReviewDrafts";
import type { PullRequestDiffParams } from "./usePullRequestDiff";

export function usePullRequestComparisonViewedPaths(params: PullRequestDiffParams) {
  const key = JSON.stringify([
    pullRequestReviewKey(params),
    params.commit ?? null,
    params.iterationRange?.from ?? null,
    params.iterationRange?.to ?? null,
  ]);
  const [state, setState] = useState<{ key: string; paths: ReadonlySet<string> }>(() => ({
    key,
    paths: new Set(),
  }));
  if (state.key !== key) setState({ key, paths: new Set() });
  const paths = state.key === key ? state.paths : new Set<string>();
  return {
    isViewed: (path: string) => paths.has(path),
    toggle: (path: string) =>
      setState((current) => {
        const next = new Set(current.key === key ? current.paths : []);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return { key, paths: next };
      }),
  };
}
