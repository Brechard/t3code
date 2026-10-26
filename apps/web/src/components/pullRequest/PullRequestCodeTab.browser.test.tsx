import {
  EnvironmentId,
  ProjectId,
  SourceControlProviderKind,
  type PullRequestDetailView,
  type PullRequestDiffResult,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { useState } from "react";

import "~/index.css";

const { diffAtom } = await vi.hoisted(async () => {
  const { AsyncResult, Atom } = await import("effect/reactivity");
  const firstPage: PullRequestDiffResult = {
    patch: [
      "diff --git a/a.ts b/a.ts",
      "index 1111111..2222222 100644",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1 +1 @@",
      "-before()",
      "+after()",
      "",
    ].join("\n"),
    truncated: false,
    nextCursor: null,
  };
  // An environment query whose refetch returns equal content hands back the previous value
  // itself, so a refresh publishes a new result around the very same page.
  return { diffAtom: Atom.make(() => AsyncResult.success(firstPage)) };
});

vi.mock(import("~/state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => vi.fn()) as never,
}));
vi.mock(import("~/state/pullRequests"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    pullRequestEnvironment: {
      ...actual.pullRequestEnvironment,
      diff: (() => diffAtom) as never,
    },
  };
});

import { render } from "../../../test/render";
import PullRequestCodeTab from "./PullRequestCodeTab";

const detail: PullRequestDetailView = {
  provider: SourceControlProviderKind.make("github"),
  projectId: ProjectId.make("project"),
  projectTitle: "Project",
  workspaceRoot: "/workspace",
  repository: "owner/repo",
  number: 1,
  title: "Test pull request",
  body: "",
  url: "https://github.com/owner/repo/pull/1",
  author: { login: "author", name: null, avatarUrl: null },
  viewer: "author",
  state: "open",
  isDraft: false,
  mergeability: "mergeable",
  additions: 1,
  deletions: 1,
  changedFiles: 1,
  headBranch: "feature",
  baseBranch: "main",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  mergedAt: null,
  closedAt: null,
  reviewers: [],
  labels: [],
  checks: [],
  comments: [],
  commentCount: 0,
  commentsTruncated: false,
  reviewThreads: [],
  commits: [],
  mergeCapabilities: { merge: false, squash: false, rebase: false },
  capabilities: {
    diff: true,
    comment: false,
    search: true,
    actions: [],
    mergeMethods: [],
    review: { inlineComment: false, reply: false, resolve: false, verdicts: [] },
    reviewers: { request: false, listCandidates: false },
    edit: { changeRequest: false, comment: false },
  },
  viewerPermissions: {
    actions: [],
    comment: false,
    resolve: false,
    verdicts: [],
    requestReviewers: false,
  },
};

const tab = (refreshToken: number) => (
  <PullRequestCodeTab
    scrollerRef={() => {}}
    environmentId={EnvironmentId.make("environment")}
    reference={detail}
    detail={detail}
    selectedCommitOid={null}
    onSelectedCommitChange={() => {}}
    onRefresh={() => {}}
    refreshToken={refreshToken}
  />
);

it("keeps the diff after a refresh that brings back the same page", async () => {
  const container = document.createElement("div");
  container.className = "flex h-[700px] w-[900px]";
  await using screen = await render(tab(0), { container });
  await expect.element(screen.getByText("1 file", { exact: true })).toBeVisible();

  await screen.rerender(tab(1));

  await expect
    .element(screen.getByText("This pull request has no file changes."))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("1 file", { exact: true })).toBeVisible();
});

it("hides update comparisons for a commit and restores them for All commits", async () => {
  const azureDetail: PullRequestDetailView = {
    ...detail,
    provider: SourceControlProviderKind.make("azure-devops"),
    commits: [
      {
        oid: "abcdef123456",
        messageHeadline: "Fix the handler",
        committedDate: "2026-09-01T00:00:00Z",
      },
    ],
    updates: [1, 2].map((id) => ({ id, createdAt: null, author: null, description: "" })),
  };
  function ScopedTab() {
    const [commit, setCommit] = useState<string | null>(null);
    return (
      <PullRequestCodeTab
        scrollerRef={() => {}}
        environmentId={EnvironmentId.make("environment")}
        reference={azureDetail}
        detail={azureDetail}
        selectedCommitOid={commit}
        onSelectedCommitChange={setCommit}
        onRefresh={() => {}}
        refreshToken={0}
      />
    );
  }
  await using screen = await render(<ScopedTab />);
  await expect.element(screen.getByRole("combobox", { name: "Compare from update" })).toBeVisible();
  await expect.element(screen.getByRole("combobox", { name: "Compare to update" })).toBeVisible();

  await screen.getByRole("button", { name: "Diff scope: All commits" }).click();
  await page.getByRole("menuitemradio", { name: /Fix the handler/ }).click();
  await expect
    .element(screen.getByRole("button", { name: "Diff scope: Fix the handler" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("combobox", { name: "Compare from update" }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("combobox", { name: "Compare to update" }))
    .not.toBeInTheDocument();

  await screen.getByRole("button", { name: "Diff scope: Fix the handler" }).click();
  await page.getByRole("menuitemradio", { name: "All commits", exact: true }).click();
  await expect.element(screen.getByRole("combobox", { name: "Compare from update" })).toBeVisible();
  await expect.element(screen.getByRole("combobox", { name: "Compare to update" })).toBeVisible();
  await screen.getByRole("combobox", { name: "Compare from update" }).click();
  await page.getByRole("option", { name: "Update 1", exact: true }).click();
  await expect
    .element(screen.getByRole("combobox", { name: "Compare from update" }))
    .toHaveTextContent("Update 1");
});
