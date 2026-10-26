import { RegistryContext } from "@effect/atom-react";
import {
  EnvironmentId,
  ProjectId,
  SourceControlProviderKind,
  type PullRequestDetail,
  type PullRequestCheck,
  type PullRequestRef,
} from "@t3tools/contracts";
import { Atom, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import "~/index.css";
import { act, render } from "../../../test/render";

const state = vi.hoisted(() => ({
  permission: null as Atom.Writable<boolean> | null,
  run: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  toast: vi.fn(),
}));
vi.mock(import("~/state/pullRequests"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    pullRequestEnvironment: {
      ...actual.pullRequestEnvironment,
      runHostAction: {
        ...actual.pullRequestEnvironment.runHostAction,
        permissionAtom: () => state.permission!,
      },
    },
  };
});
vi.mock(import("~/state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => state.run) as never,
}));
vi.mock(import("../ui/toast"), async (original) => {
  const actual = await original();
  return { ...actual, toastManager: { ...actual.toastManager, add: state.toast } };
});

import { AzureBuildRequeueButton } from "./AzureBuildRequeueButton";
import { PullRequestChecksPopover } from "./PullRequestChecksPopover";

function setup({ allowed = true } = {}) {
  state.permission = Atom.make(allowed);
  state.run.mockReset();
  state.toast.mockReset();
}

it.each([undefined, "requeue", "restart"] as const)(
  "submits one %s action with correct intent and permits retry",
  async (buildAction) => {
    setup();
    const label = buildAction === "restart" ? "Restart build" : "Requeue";
    const busyLabel = buildAction === "restart" ? "Restarting…" : "Requeueing…";
    const registry = AtomRegistry.make();
    using _registry = { [Symbol.dispose]: () => registry.dispose() };
    let reject!: (error: Error) => void;
    state.run.mockReturnValueOnce(new Promise((_, rejectPromise) => (reject = rejectPromise)));
    state.run.mockResolvedValue({ _tag: "Success", value: { message: "Build queued" } });
    const environmentId = EnvironmentId.make("environment");
    const reference: PullRequestRef = {
      projectId: ProjectId.make("project"),
      host: "dev.azure.com",
      repository: "repo",
      number: 12,
    };
    const check: PullRequestCheck = {
      name: "Build validation",
      status: "pending",
      description: null,
      url: null,
      requeueEvaluationId: "evaluation-1",
      ...(buildAction ? { buildAction } : {}),
    };
    await using _screen = await render(
      <RegistryContext.Provider value={registry}>
        <AzureBuildRequeueButton
          check={check}
          environmentId={environmentId}
          reference={reference}
          active
        />
      </RegistryContext.Provider>,
    );
    const button = page
      .getByRole("button", { name: label, exact: true })
      .element() as HTMLButtonElement;
    await act(async () => {
      button.click();
      button.click();
    });
    expect(state.run).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: {
        ...reference,
        action: {
          type: "requeue-policy",
          evaluationId: "evaluation-1",
          ...(buildAction === "restart" ? { restart: true } : {}),
        },
      },
    });
    await expect.element(page.getByRole("button", { name: busyLabel })).toBeDisabled();
    await act(async () => reject(new Error("Build refused")));
    await expect.element(page.getByRole("button", { name: label, exact: true })).toBeEnabled();
    button.click();
    await expect.element(page.getByRole("button", { name: label, exact: true })).toBeEnabled();
    expect(state.run).toHaveBeenCalledTimes(2);
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  },
);

it.each([
  {
    name: "unavailable build",
    evaluationId: undefined,
    active: true,
    allowed: true,
    reason: undefined,
  },
  {
    name: "inactive PR",
    evaluationId: "evaluation",
    active: false,
    allowed: true,
    reason: undefined,
  },
  {
    name: "environment permission denied",
    evaluationId: "evaluation",
    active: true,
    allowed: false,
    reason: undefined,
  },
  {
    name: "Azure permission denied",
    evaluationId: "evaluation",
    active: true,
    allowed: true,
    reason: "Permission denied",
  },
])("hides Requeue for $name", async ({ evaluationId, active, allowed, reason }) => {
  setup({ allowed });
  const registry = AtomRegistry.make();
  using _registry = { [Symbol.dispose]: () => registry.dispose() };
  await using _screen = await render(
    <RegistryContext.Provider value={registry}>
      <AzureBuildRequeueButton
        check={{
          name: "Build",
          status: "pending",
          description: null,
          url: null,
          ...(evaluationId ? { requeueEvaluationId: evaluationId } : {}),
        }}
        environmentId={EnvironmentId.make("environment")}
        reference={{
          projectId: ProjectId.make("project"),
          host: "dev.azure.com",
          repository: "repo",
          number: 12,
        }}
        active={active}
        reason={reason}
      />
    </RegistryContext.Provider>,
  );
  await expect
    .element(page.getByRole("button", { name: "Requeue", exact: true }))
    .not.toBeInTheDocument();
  expect(state.run).not.toHaveBeenCalled();
});

it.each(["requeue", "restart"] as const)(
  "keeps an in-flight %s through popover row reorder, build URL change and availability loss",
  async (buildAction) => {
    setup();
    const label = buildAction === "restart" ? "Restart build" : "Requeue";
    const busyLabel = buildAction === "restart" ? "Restarting…" : "Requeueing…";
    const registry = AtomRegistry.make();
    using _registry = { [Symbol.dispose]: () => registry.dispose() };
    let resolve!: (value: unknown) => void;
    state.run.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    const reference: PullRequestRef = {
      projectId: ProjectId.make("project"),
      host: "dev.azure.com",
      repository: "repo",
      number: 12,
    };
    const detail: PullRequestDetail = {
      ...reference,
      provider: SourceControlProviderKind.make("azure-devops"),
      projectTitle: "Project",
      workspaceRoot: "/workspace",
      title: "Build validation",
      body: "",
      url: "https://dev.azure.com/org/project/_git/repo/pullrequest/12",
      author: null,
      state: "open",
      isDraft: false,
      mergeability: "unknown",
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      headBranch: "feature",
      baseBranch: "main",
      createdAt: "2026-10-26T00:00:00Z",
      updatedAt: "2026-10-26T00:00:00Z",
      mergedAt: null,
      closedAt: null,
      reviewers: [],
      labels: [],
      checks: [],
      mergeCapabilities: { merge: false, squash: false, rebase: false },
      capabilities: {
        diff: true,
        comment: false,
        search: true,
        actions: [],
        mergeMethods: [],
        review: { inlineComment: false, reply: false, resolve: false, verdicts: [] },
        reviewers: { request: false, listCandidates: false },
        hostActions: true,
      },
      viewerPermissions: {
        actions: [],
        comment: false,
        resolve: false,
        verdicts: [],
        requestReviewers: false,
      },
    };
    const check = {
      name: "Build validation",
      kind: "azure-build" as const,
      policyEvaluationId: "evaluation",
      status: "action-required" as const,
      description: null,
      url: "https://dev.azure.com/org/project/_build/results?buildId=1",
      requeueEvaluationId: "evaluation",
      buildAction,
    };
    const element = (refreshed: PullRequestCheck) => (
      <RegistryContext.Provider value={registry}>
        <PullRequestChecksPopover
          checksState="pending"
          checks={[
            { name: "Other check", status: "pending", description: null, url: null },
            refreshed,
          ]}
          detail={detail}
          environmentId={EnvironmentId.make("environment")}
          reference={reference}
        />
      </RegistryContext.Provider>
    );
    await using screen = await render(element(check));
    await page.getByRole("button", { name: "Checks: Some checks haven't completed yet" }).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    const refreshed: PullRequestCheck = {
      ...check,
      status: "pending",
      url: "https://dev.azure.com/org/project/_build/results?buildId=2",
      buildAction: "restart",
    };
    await screen.rerender(element(refreshed));
    await expect.element(page.getByRole("button", { name: busyLabel })).toBeDisabled();
    const button = page.getByRole("button", { name: busyLabel }).element() as HTMLButtonElement;
    await act(async () => button.click());
    expect(state.run).toHaveBeenCalledTimes(1);
    const { requeueEvaluationId: _evaluation, buildAction: _action, ...unavailable } = refreshed;
    await screen.rerender(element({ ...unavailable, url: null }));
    await expect.element(page.getByRole("button", { name: busyLabel })).toBeDisabled();
    await screen.rerender(element(refreshed));
    await expect.element(page.getByRole("button", { name: busyLabel })).toBeDisabled();
    await act(async () => button.click());
    expect(state.run).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ _tag: "Success", value: { message: "Build queued" } }));
    await expect
      .element(page.getByRole("button", { name: "Restart build", exact: true }))
      .toBeEnabled();
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Build queued" }));
  },
);
