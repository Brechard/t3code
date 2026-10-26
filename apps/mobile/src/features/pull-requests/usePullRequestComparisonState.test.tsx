import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vite-plus/test";
import type { PullRequestDiffParams } from "./usePullRequestDiff";
import { usePullRequestComparisonState } from "./usePullRequestComparisonState";

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
    const comparison = usePullRequestComparisonState(params);
    return (
      <>
        <button type="button" onClick={() => comparison.toggle("notes.txt")}>
          {comparison.isViewed("notes.txt") ? "Viewed" : "Unviewed"}
        </button>
        <button
          type="button"
          onClick={() =>
            comparison.setCollapsedIds((ids) =>
              ids.includes("notes.txt")
                ? ids.filter((id) => id !== "notes.txt")
                : [...ids, "notes.txt"],
            )
          }
        >
          Toggle file
        </button>
        {!comparison.collapsedIds.includes("notes.txt") ? <p>File contents</p> : null}
      </>
    );
  }
  const render = (params: PullRequestDiffParams) =>
    act(() => root.render(<Probe params={params} />));
  return {
    render,
    isViewed: () => container.querySelector("button")?.textContent === "Viewed",
    fileVisible: () => container.querySelector("p")?.textContent === "File contents",
    toggleFile: () => act(() => container.querySelectorAll("button")[1]?.click()),
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

it("retains file collapse within a comparison and clears it across A → B → A without toggling B", () => {
  using screen = setup();
  const first = { ...pr, iterationRange: { from: 1, to: 2 } };
  screen.render(first);
  screen.toggleFile();
  expect(screen.fileVisible()).toBe(false);
  screen.render({ ...first });
  expect(screen.fileVisible()).toBe(false);

  screen.render({ ...pr, iterationRange: { from: 2, to: 3 } });
  expect(screen.fileVisible()).toBe(true);
  screen.render(first);
  expect(screen.fileVisible()).toBe(true);
  screen.toggleFile();
  expect(screen.fileVisible()).toBe(false);
  screen.toggleFile();
  expect(screen.fileVisible()).toBe(true);
});

it.each([
  { commit: "def" },
  { commit: undefined },
  { iterationRange: { from: 1, to: 2 } },
  { environmentId: "other-environment" },
  { projectId: "other-project" },
  { host: "other-host" },
  { repository: "other-repo" },
  { number: 2 },
])("clears collapsed files when the comparison identity changes by %j", (change) => {
  using screen = setup();
  const first = { ...pr, commit: "abc" };
  screen.render(first);
  screen.toggleFile();
  screen.render({ ...first, ...change });
  expect(screen.fileVisible()).toBe(true);
  screen.render(first);
  expect(screen.fileVisible()).toBe(true);
});

it("preserves viewed paths when collapse changes and collapsed files when viewed paths change", () => {
  using screen = setup();
  screen.render({ ...pr, iterationRange: { from: 1, to: 2 } });
  screen.toggleFile();
  screen.toggle();
  expect(screen.fileVisible()).toBe(false);
  expect(screen.isViewed()).toBe(true);
  screen.toggleFile();
  expect(screen.fileVisible()).toBe(true);
  expect(screen.isViewed()).toBe(true);
});
