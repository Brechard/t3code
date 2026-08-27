/**
 * ClaudeSkills — filesystem discovery of Claude Code skills for the `$` picker.
 *
 * Claude Code loads skills from `<config dir>/skills` (user scope), then
 * `<cwd>/.agents/skills` and `<cwd>/.claude/skills` (project scope), one
 * directory per skill with a `SKILL.md` carrying YAML frontmatter. Later roots
 * win on name collisions, so precedence is user, `.agents`, then `.claude`.
 * The Agent SDK init handshake surfaces skills only as slash commands without
 * their filesystem paths, so the provider snapshot scans the same locations
 * directly, mirroring how the Codex app-server reports its skills.
 *
 * @module provider/Drivers/ClaudeSkills
 */
import * as NodeOS from "node:os";

import type { ClaudeSettings, ServerProviderSkill } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { fromLenientJson } from "@t3tools/shared/schemaJson";
import { parse as parseYamlDocument } from "yaml";

import { expandHomePath } from "../../pathExpansion.ts";

type ClaudeSkillScope = "user" | "project";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

type SkillFrontmatter =
  | { readonly kind: "missing" }
  | { readonly kind: "malformed" }
  | {
      readonly kind: "parsed";
      readonly name?: string;
      readonly description?: string;
      readonly userInvocationOnly?: boolean;
      readonly userInvocable?: boolean;
    };

function parseSkillFrontmatter(contents: string): SkillFrontmatter {
  const match = FRONTMATTER_PATTERN.exec(contents);
  if (!match) {
    return { kind: "missing" };
  }

  let parsed: unknown;
  try {
    parsed = parseYamlDocument(match[1] ?? "");
  } catch {
    return { kind: "malformed" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { kind: "malformed" };
  }

  const record = parsed as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : "";
  return {
    kind: "parsed",
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(record["disable-model-invocation"] === true ? { userInvocationOnly: true } : {}),
    ...(record["user-invocable"] === false ? { userInvocable: false } : {}),
  };
}

/**
 * Where an administrator installs the policy file whose settings outrank every
 * user and project one. Absent on almost every machine, which is why a missing
 * file is the normal case rather than an error.
 */
export function claudeManagedSettingsPath(
  path: Path.Path,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): string | undefined {
  if (platform === "darwin") {
    return "/Library/Application Support/ClaudeCode/managed-settings.json";
  }
  if (platform === "win32") {
    const programData = environment.PROGRAMDATA?.trim();
    return programData ? path.join(programData, "ClaudeCode", "managed-settings.json") : undefined;
  }
  return "/etc/claude-code/managed-settings.json";
}

/**
 * Settings files Claude Code merges for `skillOverrides`, in increasing
 * precedence: user, project, project-local, then the administrator's managed
 * policy, which wins outright. A skill the user switched off is reported
 * disabled rather than dropped, so the picker can grey it out instead of
 * silently losing it.
 */
export function skillOverrideSettingsPaths(
  path: Path.Path,
  configDirPath: string,
  cwd: string | undefined,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): ReadonlyArray<string> {
  const managedPath = claudeManagedSettingsPath(path, platform, environment);
  return [
    path.join(configDirPath, "settings.json"),
    ...(cwd
      ? [
          path.join(cwd, ".claude", "settings.json"),
          path.join(cwd, ".claude", "settings.local.json"),
        ]
      : []),
    ...(managedPath ? [managedPath] : []),
  ];
}

// Lenient because these settings files are hand-edited and Claude Code itself
// tolerates comments and trailing commas in them.
const SkillOverrideSettings = fromLenientJson(
  Schema.Struct({
    skillOverrides: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  }),
);
const decodeSkillOverrideSettings = Schema.decodeUnknownEffect(SkillOverrideSettings);

/**
 * What a `skillOverrides` entry says about one skill. `"user-invocable-only"`
 * hides it from the agent exactly as `disable-model-invocation` does, so it is
 * kept apart from a plain on/off decision rather than collapsed into one.
 */
type SkillOverride = {
  readonly enabled: boolean;
  readonly userInvocationOnly: boolean;
};

function parseSkillOverride(value: unknown): SkillOverride {
  if (value === "off" || value === false) {
    return { enabled: false, userInvocationOnly: false };
  }
  if (value === "user-invocable-only") {
    return { enabled: true, userInvocationOnly: true };
  }
  // An unknown value means a newer Claude Code grew a mode we do not model
  // yet — leave the skill visible rather than guessing at it.
  return { enabled: true, userInvocationOnly: false };
}

const readSkillOverrides = Effect.fn("readSkillOverrides")(function* (
  configDirPath: string,
  cwd: string | undefined,
  environment: NodeJS.ProcessEnv,
): Effect.fn.Return<ReadonlyMap<string, SkillOverride>, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const platform = yield* HostProcessPlatform;
  const overridesByName = new Map<string, SkillOverride>();

  for (const settingsPath of skillOverrideSettingsPaths(
    path,
    configDirPath,
    cwd,
    platform,
    environment,
  )) {
    const contents = yield* fileSystem
      .readFileString(settingsPath)
      .pipe(Effect.orElseSucceed(() => undefined));
    if (contents === undefined) {
      continue;
    }

    const parsed = yield* decodeSkillOverrideSettings(contents).pipe(
      Effect.tapError((cause) =>
        Effect.logDebug("claude settings file is unreadable; ignoring skillOverrides", {
          path: settingsPath,
          cause,
        }),
      ),
      Effect.orElseSucceed(() => undefined),
    );
    const overrides = parsed?.skillOverrides;
    if (!overrides) {
      continue;
    }

    for (const [name, value] of Object.entries(overrides)) {
      overridesByName.set(name, parseSkillOverride(value));
    }
  }

  return overridesByName;
});

/**
 * Resolve the Claude config directory the CLI would use, matching the
 * precedence the spawned CLI sees: the instance's `homePath` (exported as
 * `CLAUDE_CONFIG_DIR` by `makeClaudeEnvironment`), then a `CLAUDE_CONFIG_DIR`
 * already present in the process environment, then `~/.claude`.
 */
const resolveClaudeConfigDirPath = Effect.fn("resolveClaudeConfigDirPath")(function* (
  config: Pick<ClaudeSettings, "homePath">,
  environment: NodeJS.ProcessEnv,
  cwd?: string,
): Effect.fn.Return<string, never, Path.Path> {
  const path = yield* Path.Path;
  const homePath = config.homePath.trim();
  if (homePath.length > 0) {
    return path.resolve(expandHomePath(homePath));
  }
  // No tilde expansion here: the spawned CLI receives this env var verbatim
  // (env vars are never shell-expanded), so a literal `~` must stay literal
  // for discovery to scan the same directory the runtime would. A relative
  // value is resolved against the workspace cwd — the subprocess's own cwd —
  // for the same reason.
  const environmentConfigDir = environment.CLAUDE_CONFIG_DIR?.trim() ?? "";
  if (environmentConfigDir.length > 0) {
    return cwd ? path.resolve(cwd, environmentConfigDir) : path.resolve(environmentConfigDir);
  }
  return path.join(NodeOS.homedir(), ".claude");
});

/**
 * Enumerate Claude Code skills from the user config dir, workspace
 * `.agents/skills`, and workspace `.claude/skills`, in that order. Discovery
 * is best-effort: unreadable roots and malformed skill entries are skipped so
 * a broken skill never degrades the provider snapshot. On name collisions,
 * later roots win: `.agents` beats user and `.claude` beats `.agents`, matching
 * Claude Code's resolution.
 */
export const discoverClaudeSkills = Effect.fn("discoverClaudeSkills")(function* (
  config: Pick<ClaudeSettings, "homePath">,
  cwd?: string,
  environment?: NodeJS.ProcessEnv,
): Effect.fn.Return<ReadonlyArray<ServerProviderSkill>, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const configDirPath = yield* resolveClaudeConfigDirPath(config, environment ?? process.env, cwd);
  const skillOverrides = yield* readSkillOverrides(configDirPath, cwd, environment ?? process.env);

  const roots: ReadonlyArray<{ directory: string; scope: ClaudeSkillScope }> = [
    { directory: path.join(configDirPath, "skills"), scope: "user" },
    ...(cwd
      ? [
          { directory: path.join(cwd, ".agents", "skills"), scope: "project" as const },
          { directory: path.join(cwd, ".claude", "skills"), scope: "project" as const },
        ]
      : []),
  ];

  const skillsByName = new Map<string, ServerProviderSkill>();
  for (const root of roots) {
    const entries = yield* fileSystem
      .readDirectory(root.directory)
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));

    for (const entry of [...entries].sort()) {
      const skillPath = path.join(root.directory, entry, "SKILL.md");
      const contents = yield* fileSystem
        .readFileString(skillPath)
        .pipe(Effect.orElseSucceed(() => undefined));
      if (contents === undefined) {
        continue;
      }

      const frontmatter = parseSkillFrontmatter(contents);
      // Malformed frontmatter means the skill won't load in Claude Code
      // either — skip it rather than surfacing a broken entry under its
      // directory name.
      if (frontmatter.kind === "malformed") {
        continue;
      }

      const name = (frontmatter.kind === "parsed" ? frontmatter.name : undefined) ?? entry.trim();
      if (!name) {
        continue;
      }

      const override = skillOverrides.get(name);
      const userInvocationOnly =
        (frontmatter.kind === "parsed" && frontmatter.userInvocationOnly === true) ||
        override?.userInvocationOnly === true;
      skillsByName.set(name, {
        name,
        path: skillPath,
        enabled: override?.enabled ?? true,
        scope: root.scope,
        ...(frontmatter.kind === "parsed" && frontmatter.description
          ? { description: frontmatter.description }
          : {}),
        ...(userInvocationOnly ? { userInvocationOnly: true } : {}),
        ...(frontmatter.kind === "parsed" && frontmatter.userInvocable === false
          ? { userInvocable: false }
          : {}),
      });
    }
  }

  return [...skillsByName.values()].sort((left, right) => left.name.localeCompare(right.name));
});
