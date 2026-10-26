import { SourceControlProviderKind } from "@t3tools/contracts";
import { EnvironmentId, ProjectId, type PullRequestDetailView } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

vi.mock(import("~/state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => vi.fn()) as never,
}));

import { act, render as renderUi, type Screen } from "../../../test/render";
import { PullRequestSummaryTab } from "./PullRequestSummaryTab";
import { PullRequestReviewContext } from "./PullRequestReviewContext";

const detail: PullRequestDetailView = {
  provider: SourceControlProviderKind.make("github"),
  projectId: ProjectId.make("project"),
  projectTitle: "Project",
  workspaceRoot: "/workspace",
  repository: "owner/repo",
  number: 1,
  title: "Test pull request",
  body: "Original description",
  url: "https://github.com/owner/repo/pull/1",
  author: { login: "author", name: null, avatarUrl: null },
  viewer: "author",
  state: "open",
  isDraft: false,
  mergeability: "mergeable",
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  headBranch: "feature",
  baseBranch: "main",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  mergedAt: null,
  closedAt: null,
  reviewers: [],
  labels: [],
  checks: [{ name: "Unit tests", status: "success", description: null, url: null }],
  comments: [],
  commentCount: 0,
  commentsTruncated: false,
  reviewThreads: [],
  commits: [],
  mergeCapabilities: { merge: false, squash: false, rebase: false },
  capabilities: {
    diff: true,
    comment: true,
    search: true,
    actions: [],
    mergeMethods: [],
    review: { inlineComment: false, reply: false, resolve: false, verdicts: [] },
    reviewers: { request: false, listCandidates: false },
    edit: { changeRequest: true, comment: true },
  },
  viewerPermissions: {
    actions: [],
    comment: true,
    resolve: false,
    verdicts: [],
    requestReviewers: false,
  },
};

// The comment filter persists to localStorage, so tests that touch it start and end empty.

// The comment filter persists across mounts, so each fixture owns its stored state.
function emptyLocalStorage(): Disposable {
  localStorage.clear();
  return { [Symbol.dispose]: () => localStorage.clear() };
}

const tab = (value = detail) => (
  <PullRequestSummaryTab
    scrollerRef={() => {}}
    environmentId={EnvironmentId.make("environment")}
    threadRef={null}
    reference={value}
    detail={value}
    activityPending={false}
    activityError={null}
    onRefresh={() => {}}
  />
);

async function render(value = detail) {
  const screen = await renderUi(tab(value));
  const { container } = screen;
  const heading = (title: string) => {
    const section = container.querySelector(`section[aria-label="${title}"]`);
    expect(section, `section ${title}`).not.toBeNull();
    return [...section!.querySelectorAll("button")].find(
      (button) => button.querySelector("span")?.textContent === title,
    )!;
  };
  return Object.assign(screen, {
    click: (title: string) => act(async () => heading(title).click()),
    expanded: (title: string) => heading(title).getAttribute("aria-expanded"),
    visibleText: () => container.innerText,
  });
}

it("keeps an unsaved description when collapsed and reopened", async () => {
  await using screen = await render();
  await act(async () =>
    screen.container.querySelector<HTMLButtonElement>('[aria-label="Edit description"]')!.click(),
  );
  const textarea = screen.container.querySelector("textarea")!;
  await userEvent.clear(textarea);
  await userEvent.type(textarea, "Unsaved description");
  await screen.click("Description");
  expect(screen.expanded("Description")).toBe("false");
  await screen.click("Description");
  expect(screen.container.querySelector("textarea")!.value).toBe("Unsaved description");
});

it("offers the last-visit filter only after a visit and filters old comments", async () => {
  using _storage = emptyLocalStorage();
  const withComment: PullRequestDetailView = {
    ...detail,
    comments: [
      {
        id: "old",
        kind: "issue-comment",
        author: detail.author,
        body: "Earlier feedback",
        createdAt: "2026-09-01T00:00:00Z",
        url: null,
        path: null,
        reviewState: null,
      },
    ],
    commentCount: 1,
  };
  const context = (previousVisit: string | null) => (
    <PullRequestReviewContext.Provider
      value={{
        environmentId: EnvironmentId.make("environment"),
        reference: withComment,
        azure: false,
        previousVisit,
      }}
    >
      {tab(withComment)}
    </PullRequestReviewContext.Provider>
  );
  await using screen = await renderUi(context(null));
  await userEvent.click(filterButton(screen));
  await expect
    .element(page.getByRole("menuitemcheckbox", { name: "What's new since your last visit" }))
    .not.toBeInTheDocument();
  await screen.rerender(context("2026-09-02T00:00:00Z"));
  await expect.element(screen.getByText("Earlier feedback")).toBeInTheDocument();
  await page.getByRole("menuitemcheckbox", { name: "What's new since your last visit" }).click();
  await expect.element(screen.getByText("Earlier feedback")).not.toBeInTheDocument();
});

const filterButton = ({ container }: Screen) =>
  container.querySelector<HTMLButtonElement>('[aria-label="Filter comments"]')!;

it("keeps readable system activity separate from the comments filter", async () => {
  using _storage = emptyLocalStorage();
  const azure: PullRequestDetailView = {
    ...detail,
    provider: SourceControlProviderKind.make("azure-devops"),
    events: [
      {
        id: "vote",
        kind: "approved",
        actor: { login: "reviewer@example.com", name: "Reviewer", avatarUrl: null },
        body: "Reviewer approved the pull request with suggestions",
        createdAt: detail.createdAt,
      },
    ],
  };
  await using screen = await render(azure);
  await expect
    .element(
      screen.getByText("Reviewer approved the pull request with suggestions", { exact: true }),
    )
    .toBeVisible();
  await expect
    .element(screen.getByText("reviewer@example.com", { exact: true }))
    .not.toBeInTheDocument();
  await userEvent.click(filterButton(screen));
  await page.getByRole("menuitemradio", { name: "All comments (0)", exact: true }).click();
  await expect
    .element(
      screen.getByText("Reviewer approved the pull request with suggestions", { exact: true }),
    )
    .not.toBeInTheDocument();
  await userEvent.click(filterButton(screen));
  await page.getByRole("menuitemradio", { name: "Show everything (1)", exact: true }).click();
  await expect
    .element(
      screen.getByText("Reviewer approved the pull request with suggestions", { exact: true }),
    )
    .toBeVisible();
});

it("shows a current Azure approval without review comments and removes it after reset", async () => {
  using _storage = emptyLocalStorage();
  const azure: PullRequestDetailView = {
    ...detail,
    provider: SourceControlProviderKind.make("azure-devops"),
    reviewers: [{ login: "reviewer", name: "Reviewer", avatarUrl: null, reviewState: "approved" }],
  };
  await using screen = await render(azure);
  await expect.element(page.getByText("Approved", { exact: true })).toBeInTheDocument();
  await screen.rerender(
    tab({ ...azure, reviewers: [{ ...azure.reviewers[0]!, reviewState: "none" }] }),
  );
  await expect.element(page.getByText("Approved", { exact: true })).not.toBeInTheDocument();
});

it("switches Azure discussion filters without losing the parent of a matching reply", async () => {
  using _storage = emptyLocalStorage();
  const base = {
    kind: "issue-comment" as const,
    path: null,
    url: null,
    reviewState: null,
    createdAt: "2026-09-01T00:00:00Z",
  };
  const azure: PullRequestDetailView = {
    ...detail,
    provider: SourceControlProviderKind.make("azure-devops"),
    commentCount: 3,
    comments: [
      {
        ...base,
        id: "root",
        threadId: "a",
        threadStatus: "active",
        author: { login: "reviewer", name: null, avatarUrl: null },
        body: "Original question",
      },
      {
        ...base,
        id: "reply",
        threadId: "a",
        replyToCommentId: "root",
        threadStatus: "active",
        author: detail.author,
        body: "My answer",
      },
      {
        ...base,
        id: "resolved",
        threadId: "r",
        threadStatus: "fixed",
        author: detail.author,
        body: "Finished question",
      },
    ],
    events: [
      { id: "event", actor: detail.author, createdAt: base.createdAt, body: "Pushed an update" },
    ],
  };
  await using screen = await render(azure);
  const select = async (label: string) => {
    await userEvent.click(filterButton(screen));
    await page.getByRole("menuitemradio", { name: new RegExp(`^${label} `) }).click();
  };
  await expect.element(screen.getByText("Pushed an update")).toBeInTheDocument();
  await select("All comments");
  await expect.element(screen.getByText("Pushed an update")).not.toBeInTheDocument();
  await select("Active comments");
  await expect.element(screen.getByText("Original question")).toBeInTheDocument();
  await expect.element(screen.getByText("My answer")).toBeInTheDocument();
  await expect.element(screen.getByText("Finished question")).not.toBeInTheDocument();
  await select("Resolved comments");
  await expect.element(screen.getByText("Finished question")).toBeInTheDocument();
  await expect.element(screen.getByText("Original question")).not.toBeInTheDocument();
  await select("My comments/replies");
  await expect.element(screen.getByText("Original question")).toBeInTheDocument();
  await expect.element(screen.getByText("My answer")).toBeInTheDocument();
});

it("offers Azure What's new only after a visit and shows only later activity", async () => {
  using _storage = emptyLocalStorage();
  const azure: PullRequestDetailView = {
    ...detail,
    provider: SourceControlProviderKind.make("azure-devops"),
    comments: [
      {
        id: "old",
        kind: "issue-comment",
        author: detail.author,
        body: "Earlier Azure feedback",
        createdAt: "2026-09-01T00:00:00Z",
        url: null,
        path: null,
        reviewState: null,
      },
      {
        id: "new",
        kind: "issue-comment",
        author: detail.author,
        body: "Later Azure feedback",
        createdAt: "2026-09-03T00:00:00Z",
        url: null,
        path: null,
        reviewState: null,
      },
    ],
    commentCount: 2,
  };
  const context = (previousVisit: string | null) => (
    <PullRequestReviewContext.Provider
      value={{
        environmentId: EnvironmentId.make("environment"),
        reference: azure,
        azure: true,
        previousVisit,
      }}
    >
      {tab(azure)}
    </PullRequestReviewContext.Provider>
  );
  await using screen = await renderUi(context(null));
  await userEvent.click(filterButton(screen));
  await expect
    .element(page.getByRole("menuitemradio", { name: "What's new (2)" }))
    .not.toBeInTheDocument();
  await screen.rerender(context("2026-09-02T00:00:00Z"));
  await page.getByRole("menuitemradio", { name: "What's new (1)" }).click();
  await expect.element(screen.getByText("Later Azure feedback")).toBeInTheDocument();
  await expect.element(screen.getByText("Earlier Azure feedback")).not.toBeInTheDocument();
});

it("keeps an Azure discussion together with the original before its replies", async () => {
  using _storage = emptyLocalStorage();
  const original = {
    id: "17:1",
    kind: "issue-comment" as const,
    author: { login: "reviewer", name: "Reviewer", avatarUrl: null },
    body: "Could you cover the empty state?",
    createdAt: "2026-09-01T00:00:00Z",
    url: null,
    path: null,
    reviewState: null,
  };
  const value: PullRequestDetailView = {
    ...detail,
    provider: SourceControlProviderKind.make("azure-devops"),
    comments: [
      original,
      {
        ...original,
        id: "17:2",
        replyToCommentId: "17:1",
        author: detail.author,
        body: "Added coverage.",
        createdAt: "2026-09-01T00:01:00Z",
      },
    ],
    commentCount: 2,
  };
  await using screen = await render(value);
  const assertDiscussionOrder = async () => {
    await expect.element(screen.getByText("Reply to Reviewer")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Could you cover the empty state?")).toBeInTheDocument();
    await expect.element(screen.getByText("Added coverage.")).toBeInTheDocument();
    await vi.waitFor(() => {
      const visibleText = screen.visibleText();
      expect(visibleText.indexOf("Could you cover the empty state?")).toBeLessThan(
        visibleText.indexOf("Added coverage."),
      );
    });
  };
  await assertDiscussionOrder();
  await page.getByRole("button", { name: "Show oldest comments first" }).click();
  await assertDiscussionOrder();

  await screen.rerender(
    tab({ ...value, comments: value.comments.slice(1), commentsTruncated: true }),
  );
  await expect.element(screen.getByText("Reply to earlier comment")).toBeInTheDocument();
  await expect.element(screen.getByText("Original comment isn’t loaded.")).toBeInTheDocument();
});
