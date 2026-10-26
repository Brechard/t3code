import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, PullRequestCheck, PullRequestRef } from "@t3tools/contracts";
import { useRef, useState } from "react";
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
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const evaluationId = check.requeueEvaluationId;
  if (!evaluationId) return null;
  return (
    <PullRequestPermissionButton
      reason={reason}
      size="xs"
      variant="default"
      disabled={!active || !allowed || busy}
      onClick={() => {
        if (pending.current || busy || !active || !allowed || reason) return;
        pending.current = true;
        setBusy(true);
        void Promise.resolve()
          .then(() =>
            run({
              environmentId,
              input: {
                ...reference,
                action: { type: "requeue-policy", evaluationId },
              },
            }),
          )
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
          .finally(() => {
            pending.current = false;
            setBusy(false);
          });
      }}
    >
      {busy ? "Requeueing…" : "Requeue"}
    </PullRequestPermissionButton>
  );
}
