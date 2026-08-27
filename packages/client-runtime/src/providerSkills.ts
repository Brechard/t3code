import type { ServerProviderSkill, ServerProviderSlashCommand } from "@t3tools/contracts";
import type { ComposerTriggerKind } from "@t3tools/shared/composerTrigger";

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
 * How the composer should spell a picked skill. The `/` menu and the `$`
 * mention menu offer the same skills, but only `/name` starts a skill the
 * agent is not allowed to invoke itself, so the syntax has to follow the
 * trigger the user actually typed.
 */
export function formatProviderSkillInsertion(
  skillName: string,
  triggerKind: ComposerTriggerKind,
): string {
  return `${triggerKind === "slash-command" ? "/" : "$"}${skillName} `;
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
 * Skills the `/` menu may offer. Like a provider slash command, `/name` only
 * starts a skill when it opens the message, so a trigger further in offers
 * nothing rather than an insertion that would arrive as literal text.
 */
export function getProviderSkillsForSlashMenu(
  skills: ReadonlyArray<ServerProviderSkill>,
  showSkillsInSlashMenu: boolean,
  triggerRangeStart: number,
): ServerProviderSkill[] {
  if (!showSkillsInSlashMenu || triggerRangeStart !== 0) return [];
  return skills.filter((skill) => skill.enabled);
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
