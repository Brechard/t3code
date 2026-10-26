import { describe, expect, it } from "vite-plus/test";
import {
  pullRequestFileJumpScope,
  requestPullRequestFileJump,
  subscribePullRequestFileJump,
} from "./pullRequestFileJump";

describe("pull request file jumps", () => {
  it("keeps picks within their Azure update comparison", () => {
    const params = { environmentId: "local", projectId: "project", repository: "repo", number: 1 };
    const all = pullRequestFileJumpScope(params);
    const first = pullRequestFileJumpScope({ ...params, iterationRange: { from: 0, to: 1 } });
    const second = pullRequestFileJumpScope({ ...params, iterationRange: { from: 1, to: 2 } });
    const seen: string[] = [];
    const stop = subscribePullRequestFileJump(first, (path) => seen.push(path));
    try {
      requestPullRequestFileJump(all, "all.ts");
      requestPullRequestFileJump(second, "second.ts");
      requestPullRequestFileJump(first, "first.ts");
      expect(seen).toEqual(["first.ts"]);
    } finally {
      stop();
    }
  });
  it("delivers a pick to the screens of its scope, every time it is made", () => {
    const seen: string[] = [];
    const other: string[] = [];
    const stop = subscribePullRequestFileJump("a", (path) => seen.push(path));
    const stopOther = subscribePullRequestFileJump("b", (path) => other.push(path));
    requestPullRequestFileJump("a", "src/x.ts");
    requestPullRequestFileJump("a", "src/x.ts");
    stop();
    requestPullRequestFileJump("a", "src/y.ts");
    stopOther();
    expect(seen).toEqual(["src/x.ts", "src/x.ts"]);
    expect(other).toEqual([]);
  });
});
