import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { PullRequestCheck, PullRequestDetail } from "@t3tools/contracts";
import { useRef, useState } from "react";
import * as Dialog from "../../components/ui/Dialog";
import { composerPullRequests } from "../../state/pull-requests";
import { useAtomCommand } from "../../state/use-atom-command";
import { PullRequestPermissionButton } from "./PullRequestPermissionButton";
import { pullRequestTarget, type PullRequestParams } from "./usePullRequestDiff";

export function AzureBuildRequeueButton({
  check,
  pr,
  params,
}: {
  check: PullRequestCheck;
  pr: PullRequestDetail;
  params: PullRequestParams;
}) {
  const target = pullRequestTarget(params);
  const allowed = useAtomValue(
    composerPullRequests.runHostAction.permissionAtom(target.environmentId),
  );
  const run = useAtomCommand(composerPullRequests.runHostAction, { reportFailure: false });
  const pending = useRef(false);
  const [busyAction, setBusyAction] = useState<PullRequestCheck["buildAction"]>();
  const busy = busyAction !== undefined;
  const restart = (busyAction ?? check.buildAction) === "restart";
  const evaluationId = check.requeueEvaluationId;
  const reason = pr.viewerPermissions.deniedActions?.["requeue-policy"];
  if (
    !busy &&
    (!evaluationId || !pr.capabilities.hostActions || !allowed || reason || pr.state !== "open")
  )
    return null;
  return (
    <PullRequestPermissionButton
      tone="primary"
      reason={reason}
      label={restart ? (busy ? "Restarting…" : "Restart build") : busy ? "Requeueing…" : "Requeue"}
      disabled={busy || !allowed || pr.state !== "open"}
      onPress={() => {
        if (!evaluationId || pending.current || busy || !allowed || reason || pr.state !== "open")
          return;
        pending.current = true;
        setBusyAction(check.buildAction ?? "requeue");
        void Promise.resolve()
          .then(() =>
            run({
              ...target,
              input: {
                ...target.input,
                action: {
                  type: "requeue-policy",
                  evaluationId,
                  ...(restart ? { restart: true } : {}),
                },
              },
            }),
          )
          .then((result) => {
            if (result._tag === "Failure") throw squashAtomCommandFailure(result);
            Dialog.alert("Azure DevOps", result.value.message);
          })
          .catch((error: unknown) =>
            Dialog.alert(
              "Could not requeue build validation",
              error instanceof Error ? error.message : "Please try again.",
            ),
          )
          .finally(() => {
            pending.current = false;
            setBusyAction(undefined);
          });
      }}
    />
  );
}
