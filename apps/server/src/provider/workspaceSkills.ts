/**
 * workspaceSkills — per-workspace caching for driver skill discovery.
 *
 * `ProviderInstance.listWorkspaceSkills` is answered on demand, one call per
 * skill-picker open, and the Codex implementation spawns a `codex app-server`
 * child process to answer it. Re-running discovery on every keystroke-triggered
 * picker open would be unacceptably slow, so each instance wraps its lookup in
 * a short-lived cache keyed by the workspace directory. The cache lives on the
 * instance, which makes the effective key `(instanceId, cwd)` — two Codex
 * instances with different `CODEX_HOME`s never share an answer.
 *
 * The TTL is deliberately short: a user who just created a `SKILL.md` should
 * see it in the picker without restarting the server.
 *
 * @module provider/workspaceSkills
 */
import type { ServerProviderSkill } from "@t3tools/contracts";
import * as Cache from "effect/Cache";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

const WORKSPACE_SKILLS_TTL = Duration.seconds(30);
/**
 * Enough room for the handful of projects a user switches between in one
 * sitting; the cache evicts by capacity so a long-lived server that visited
 * many worktrees does not retain every one of them.
 */
const WORKSPACE_SKILLS_CAPACITY = 32;

/**
 * Wrap a driver's workspace skill discovery in the shared cache policy.
 *
 * `discover` must already be best-effort (error channel `never`) — a cache
 * stores failures too, so a driver that let a transient error through would
 * keep serving that failure for the whole TTL.
 */
export const makeWorkspaceSkillsCache = Effect.fn("makeWorkspaceSkillsCache")(function* (
  discover: (cwd: string) => Effect.Effect<ReadonlyArray<ServerProviderSkill>>,
) {
  const cache = yield* Cache.make({
    capacity: WORKSPACE_SKILLS_CAPACITY,
    timeToLive: WORKSPACE_SKILLS_TTL,
    lookup: discover,
  });
  return (cwd: string) => Cache.get(cache, cwd);
});
