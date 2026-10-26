import { RegistryContext } from "@effect/atom-react";
import {
  EnvironmentId,
  ProjectId,
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

it("submits one requeue for synchronous activations and permits retry after failure", async () => {
  state.permission = Atom.make(true);
  const registry = AtomRegistry.make();
  using _registry = { [Symbol.dispose]: () => registry.dispose() };
  state.run.mockReset();
  state.toast.mockReset();
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
    .getByRole("button", { name: "Requeue", exact: true })
    .element() as HTMLButtonElement;
  await act(async () => {
    button.click();
    button.click();
  });
  expect(state.run).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { ...reference, action: { type: "requeue-policy", evaluationId: "evaluation-1" } },
  });
  await expect.element(page.getByRole("button", { name: "Requeueing…" })).toBeDisabled();
  await act(async () => reject(new Error("Build refused")));
  await expect.element(page.getByRole("button", { name: "Requeue", exact: true })).toBeEnabled();
  button.click();
  await expect.element(page.getByRole("button", { name: "Requeue", exact: true })).toBeEnabled();
  expect(state.run).toHaveBeenCalledTimes(2);
  expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
});
