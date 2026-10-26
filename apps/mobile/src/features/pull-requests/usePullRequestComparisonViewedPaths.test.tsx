import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vite-plus/test";
import type { PullRequestDiffParams } from "./usePullRequestDiff";
import { usePullRequestComparisonViewedPaths } from "./usePullRequestComparisonViewedPaths";

const pr: PullRequestDiffParams = {
  environmentId: "environment",
  projectId: "project",
  host: "dev.azure.com",
  repository: "repo",
  number: 1,
};

function setup() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  function Probe({ params }: { params: PullRequestDiffParams }) {
    const viewed = usePullRequestComparisonViewedPaths(params);
    return (
      <button type="button" onClick={() => viewed.toggle("notes.txt")}>
        {viewed.isViewed("notes.txt") ? "Viewed" : "Unviewed"}
      </button>
    );
  }
  const render = (params: PullRequestDiffParams) =>
    act(() => root.render(<Probe params={params} />));
  return {
    render,
    isViewed: () => container.textContent === "Viewed",
    toggle: () => act(() => container.querySelector("button")?.click()),
    [Symbol.dispose]: () => act(() => root.unmount()),
  };
}

it("keeps a viewed path within one comparison but clears it when the comparison changes", () => {
  using screen = setup();
  const first = { ...pr, iterationRange: { from: 1, to: 2 } };
  screen.render(first);
  screen.toggle();
  screen.render({ ...first });
  expect(screen.isViewed()).toBe(true);

  screen.render({ ...pr, iterationRange: { from: 2, to: 3 } });
  expect(screen.isViewed()).toBe(false);
  screen.toggle();
  expect(screen.isViewed()).toBe(true);

  screen.render(first);
  expect(screen.isViewed()).toBe(false);
});

it("keeps historical viewed paths separate from latest and from other pull requests", () => {
  using screen = setup();
  screen.render({ ...pr, commit: "abc" });
  screen.toggle();
  screen.render(pr);
  expect(screen.isViewed()).toBe(false);
  screen.render({ ...pr, commit: "abc", number: 2 });
  expect(screen.isViewed()).toBe(false);
});

it("clears a comparison's viewed paths even when the next comparison is not toggled", () => {
  using screen = setup();
  const first = { ...pr, iterationRange: { from: 1, to: 2 } };
  screen.render(first);
  screen.toggle();
  screen.render({ ...pr, iterationRange: { from: 2, to: 3 } });
  expect(screen.isViewed()).toBe(false);
  screen.render(first);
  expect(screen.isViewed()).toBe(false);
});
