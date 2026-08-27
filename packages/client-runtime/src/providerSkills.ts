import type { ServerProviderSkill, ServerProviderSlashCommand } from "@t3tools/contracts";
import type { ComposerTrigger } from "@t3tools/shared/composerTrigger";

export type ProviderSkillSourceKind = "app" | "repo" | "project" | "personal" | "system" | "other";

function titleCaseWords(value: string): string {
  const words: string[] = [];
  for (const segment of value.split(/[\s:_-]+/)) {
    if (segment.length === 0) continue;
    words.push(segment.charAt(0).toUpperCase() + segment.slice(1));
  }
  return words.join(" ");
}

function normalizePathSeparators(pathValue: string): string {
  return pathValue.replaceAll("\\", "/");
}

export function formatProviderSkillDisplayName(
  skill: Pick<ServerProviderSkill, "name" | "displayName">,
): string {
  const displayName = skill.displayName?.trim();
  if (displayName) {
    return displayName;
  }
  return titleCaseWords(skill.name);
}

/**
 * How the composer should spell a picked skill. `/name` is the only syntax that
 * starts a skill the agent may not invoke itself, but the provider CLI expands
 * it only when it opens the message; anywhere else `$name` is what actually
 * reaches the agent. So the syntax follows the trigger and its position, not
 * the menu the user happened to open.
 */
export type ProviderSkillInsertionSigil = "/" | "$";

/**
 * Which syntax a picked skill should be spelled with. `$name` is the portable
 * form: every provider forwards it verbatim and the agent starts the skill from
 * its own tool, and it is the only form the composer renders as a skill chip.
 * `/name` depends on the CLI expanding it, which it does only at the start of a
 * message — so it is reserved for the skills a mention provably cannot reach.
 */
export function resolveProviderSkillInsertionSigil(
  skill: Pick<ServerProviderSkill, "userInvocationOnly">,
  trigger: Pick<ComposerTrigger, "kind" | "rangeStart"> | null,
): ProviderSkillInsertionSigil {
  const opensMessage = trigger?.kind === "slash-command" && trigger.rangeStart === 0;
  return opensMessage && skill.userInvocationOnly === true ? "/" : "$";
}

export function formatProviderSkillInsertion(
  skillName: string,
  sigil: ProviderSkillInsertionSigil,
): string {
  return `${sigil}${skillName} `;
}

/**
 * Whether a `$` mention can actually start this skill. A skill the user
 * switched off is gone, and a user-invocation-only skill is hidden from the
 * agent's skill tool — naming it in prose only invites the agent to guess at a
 * neighbour, so it belongs in the slash-command menu instead.
 */
export function isProviderSkillMentionable(
  skill: Pick<ServerProviderSkill, "enabled" | "userInvocationOnly">,
): boolean {
  return skill.enabled && skill.userInvocationOnly !== true;
}

/**
 * Skills the `/` menu may offer. A trigger that opens the message can start any
 * enabled skill. Further in, the pick becomes a `$` mention, so only skills a
 * mention can actually reach are worth offering — listing a user-invocation-only
 * skill there would promise something neither syntax delivers.
 */
export function getProviderSkillsForSlashMenu(
  skills: ReadonlyArray<ServerProviderSkill>,
  showSkillsInSlashMenu: boolean,
  triggerRangeStart: number,
): ServerProviderSkill[] {
  if (!showSkillsInSlashMenu) return [];
  return triggerRangeStart === 0
    ? skills.filter((skill) => skill.enabled)
    : skills.filter(isProviderSkillMentionable);
}

export function getProviderSlashCommandsForSlashMenu(
  slashCommands: ReadonlyArray<ServerProviderSlashCommand>,
  visibleSkills: ReadonlyArray<ServerProviderSkill>,
): ServerProviderSlashCommand[] {
  const skillNames = new Set(visibleSkills.map((skill) => skill.name.trim().toLowerCase()));
  return slashCommands.filter((command) => !skillNames.has(command.name.trim().toLowerCase()));
}

export function resolveProviderSkillSourceKind(
  skill: Pick<ServerProviderSkill, "path" | "scope">,
): ProviderSkillSourceKind {
  const normalizedPath = normalizePathSeparators(skill.path);
  if (normalizedPath.includes("/.codex/plugins/") || normalizedPath.includes("/.agents/plugins/")) {
    return "app";
  }

  const normalizedScope = skill.scope?.trim().toLowerCase();
  switch (normalizedScope) {
    case "repo":
    case "repository":
      return "repo";
    case "project":
    case "workspace":
    case "local":
      return "project";
    case "user":
    case "personal":
      return "personal";
    case "system":
      return "system";
    case undefined:
    case "":
      return "other";
    default:
      return "other";
  }
}
