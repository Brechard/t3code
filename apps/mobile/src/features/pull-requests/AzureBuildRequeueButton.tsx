import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { PullRequestCheck, PullRequestDetail } from "@t3tools/contracts";
import { useState } from "react";
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
  const [busy, setBusy] = useState(false);
  if (!check.requeueEvaluationId || !pr.capabilities.hostActions) return null;
  const reason = pr.viewerPermissions.deniedActions?.["requeue-policy"];
  return (
    <PullRequestPermissionButton
      tone="primary"
      reason={reason}
      label={busy ? "Requeueing…" : "Requeue"}
      disabled={busy || !allowed || pr.state !== "open"}
      onPress={() => {
        if (busy || !allowed || reason || !check.requeueEvaluationId) return;
        setBusy(true);
        void run({
          ...target,
          input: {
            ...target.input,
            action: { type: "requeue-policy", evaluationId: check.requeueEvaluationId },
          },
        })
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
          .finally(() => setBusy(false));
      }}
    />
  );
}
