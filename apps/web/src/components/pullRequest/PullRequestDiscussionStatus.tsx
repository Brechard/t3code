import { PullRequestPermissionHint } from "./PullRequestPermissionButton";
import { usePullRequestDeniedActions } from "./PullRequestReviewContext";
import { pullRequestThreadStatusLabels as labels } from "@t3tools/client-runtime/pull-request-comment-replies";
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, PullRequestRef, PullRequestThreadStatus } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { useAtomCommand } from "~/state/use-atom-command";

export function PullRequestDiscussionStatus({
  environmentId,
  reference,
  threadId,
  status,
  statuses,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  threadId: string;
  status: PullRequestThreadStatus;
  statuses: ReadonlyArray<PullRequestThreadStatus>;
}) {
  const reason = usePullRequestDeniedActions().resolve;
  const allowed = useAtomValue(
    pullRequestEnvironment.setThreadResolution.permissionAtom(environmentId),
  );
  const command = useAtomCommand(pullRequestEnvironment.setThreadResolution, {
    reportFailure: false,
  });
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  // The chosen status stands until the server's refreshed activity reports any change.
  const key = JSON.stringify([
    environmentId,
    reference.projectId,
    reference.host,
    reference.repository,
    reference.number,
    threadId,
  ]);
  const [chosen, setChosen] = useState<{
    key: string;
    from: PullRequestThreadStatus;
    to: PullRequestThreadStatus;
  } | null>(null);
  const current = chosen?.key === key && chosen.from === status ? chosen : null;
  if (chosen !== current) setChosen(current);
  const shown = current?.to ?? status;
  const change = async (next: PullRequestThreadStatus) => {
    if (!allowed || reason || pending.current || next === shown) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    const choice = { key, from: status, to: next };
    setChosen(choice);
    try {
      const result = await command({
        environmentId,
        input: {
          ...reference,
          threadId,
          status: next,
          resolved: next !== "active" && next !== "pending",
        },
      });
      if (result._tag === "Failure") {
        setChosen((latest) => (latest === choice ? current : latest));
        setError(true);
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2 text-xs">
      <label className="flex items-center gap-2 text-muted-foreground">
        Status
        <PullRequestPermissionHint reason={reason}>
          <select
            aria-label="Discussion status"
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
            value={shown}
            disabled={!allowed || busy || Boolean(reason)}
            onChange={(event) => {
              const next = statuses.find((value) => value === event.target.value);
              if (next) void change(next);
            }}
          >
            {statuses.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </select>
        </PullRequestPermissionHint>
      </label>
      {error ? (
        <span role="alert" className="text-destructive">
          Could not update discussion status.
        </span>
      ) : null}
    </div>
  );
}
