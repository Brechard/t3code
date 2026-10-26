import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, PullRequestCheck, PullRequestRef } from "@t3tools/contracts";
import { useState } from "react";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { useAtomCommand } from "~/state/use-atom-command";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { PullRequestPermissionButton } from "./PullRequestPermissionButton";
import { readableFailure } from "./pullRequestDetail.logic";
import { toastManager } from "../ui/toast";

export function AzureBuildRequeueButton({
  check,
  environmentId,
  reference,
  active,
  reason,
}: {
  check: PullRequestCheck;
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  active: boolean;
  reason?: string | undefined;
}) {
  const allowed = useAtomValue(pullRequestEnvironment.runHostAction.permissionAtom(environmentId));
  const run = useAtomCommand(pullRequestEnvironment.runHostAction, { reportFailure: false });
  const [busy, setBusy] = useState(false);
  if (!check.requeueEvaluationId) return null;
  return (
    <PullRequestPermissionButton
      reason={reason}
      size="xs"
      variant="ghost-muted"
      disabled={!active || !allowed || busy}
      onClick={() => {
        if (busy || !active || !allowed || reason || !check.requeueEvaluationId) return;
        setBusy(true);
        void run({
          environmentId,
          input: {
            ...reference,
            action: { type: "requeue-policy", evaluationId: check.requeueEvaluationId },
          },
        })
          .then((result) => {
            if (result._tag === "Failure") throw squashAtomCommandFailure(result);
            toastManager.add({ type: "info", title: result.value.message });
          })
          .catch((error: unknown) =>
            toastManager.add({
              type: "error",
              title: readableFailure(error, "Could not requeue build validation."),
            }),
          )
          .finally(() => setBusy(false));
      }}
    >
      {busy ? "Requeueing…" : "Requeue"}
    </PullRequestPermissionButton>
  );
}
