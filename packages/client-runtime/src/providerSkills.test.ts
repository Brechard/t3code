import { describe, expect, it } from "vite-plus/test";

import { detectComposerTrigger } from "@t3tools/shared/composerTrigger";

import {
  formatProviderSkillDisplayName,
  formatProviderSkillInsertion,
  resolveProviderSkillInsertionSigil,
  getProviderSlashCommandsForSlashMenu,
  getProviderSkillsForSlashMenu,
  resolveProviderSkillSourceKind,
} from "./providerSkills.ts";

const MENTIONABLE = { name: "ask-matt" };
const USER_ONLY = { name: "re-release-version", userInvocationOnly: true };

const insertionFor = (skill: { name: string; userInvocationOnly?: boolean }, text: string) => {
  const trigger = detectComposerTrigger(text, text.length);
  if (!trigger) throw new Error(`no trigger for ${JSON.stringify(text)}`);
  const sigil = resolveProviderSkillInsertionSigil(skill, trigger);
  return formatProviderSkillInsertion(skill.name, sigil);
};

describe("resolveProviderSkillInsertionSigil", () => {
  it("uses a slash only where a mention provably cannot start the skill", () => {
    expect(insertionFor(USER_ONLY, "/re-release-version")).toBe("/re-release-version ");
  });

  it("keeps the portable mention for a skill the agent may start itself", () => {
    expect(insertionFor(MENTIONABLE, "/ask-matt")).toBe("$ask-matt ");
    expect(insertionFor(MENTIONABLE, "$ask-matt")).toBe("$ask-matt ");
  });

  it("falls back to a mention past the start, where no CLI expands a slash", () => {
    expect(insertionFor(USER_ONLY, "ship it\n/re-release-version")).toBe("$re-release-version ");
  });
});

describe("formatProviderSkillDisplayName", () => {
  it("prefers the provider display name", () => {
    expect(
      formatProviderSkillDisplayName({
        name: "review-follow-up",
        displayName: "Review Follow-up",
      }),
    ).toBe("Review Follow-up");
  });

  it("falls back to a title-cased skill name", () => {
    expect(
      formatProviderSkillDisplayName({
        name: "review-follow-up",
      }),
    ).toBe("Review Follow Up");
  });
});

describe("getProviderSkillsForSlashMenu", () => {
  it("keeps the skill alias when the provider also exposes it as a slash command", () => {
    const askMatt = {
      name: "ask-matt",
      path: "/Users/matt/.agents/skills/ask-matt/SKILL.md",
      enabled: true,
    };
    expect(getProviderSkillsForSlashMenu([askMatt], true, 0).map((skill) => skill.name)).toEqual([
      "ask-matt",
    ]);
  });

  it("drops a skill the provider keeps out of its own slash commands", () => {
    const agentOnly = {
      name: "agent-only",
      path: "/Users/matt/.agents/skills/agent-only/SKILL.md",
      enabled: true,
      userInvocable: false,
    };
    expect(getProviderSkillsForSlashMenu([agentOnly], true, 0)).toEqual([]);
  });

  it("keeps offering mentionable skills once the trigger no longer opens the message", () => {
    const askMatt = {
      name: "ask-matt",
      path: "/Users/matt/.agents/skills/ask-matt/SKILL.md",
      enabled: true,
    };
    const userOnly = {
      name: "re-release-version",
      path: "/Users/matt/.agents/skills/re-release-version/SKILL.md",
      enabled: true,
      userInvocationOnly: true,
    };

    expect(getProviderSkillsForSlashMenu([askMatt, userOnly], true, 0).map((s) => s.name)).toEqual([
      "ask-matt",
      "re-release-version",
    ]);
    expect(getProviderSkillsForSlashMenu([askMatt, userOnly], true, 6).map((s) => s.name)).toEqual([
      "ask-matt",
    ]);
  });
});

describe("getProviderSlashCommandsForSlashMenu", () => {
  const commands = [
    { name: "ask-matt", description: "Ask which skill fits your situation." },
    { name: "compact", description: "Compact the conversation." },
  ];
  const skills = [
    {
      name: "ask-matt",
      path: "/Users/matt/.agents/skills/ask-matt/SKILL.md",
      enabled: true,
    },
  ];

  it("lets the skill alias win when a provider command has the same name", () => {
    expect(
      getProviderSlashCommandsForSlashMenu(commands, skills).map((command) => command.name),
    ).toEqual(["compact"]);
  });

  it("keeps the provider command when the matching skill alias is hidden", () => {
    const visibleSkills = getProviderSkillsForSlashMenu(skills, false, 0);

    expect(
      getProviderSlashCommandsForSlashMenu(commands, visibleSkills).map((command) => command.name),
    ).toEqual(["ask-matt", "compact"]);
  });
});

describe("resolveProviderSkillSourceKind", () => {
  it("marks plugin-backed skills as app installs", () => {
    expect(
      resolveProviderSkillSourceKind({
        path: "/Users/julius/.codex/plugins/cache/openai-curated/github/skills/gh-fix-ci/SKILL.md",
        scope: "user",
      }),
    ).toBe("app");
  });

  it("maps standard scopes to source kinds", () => {
    expect(
      resolveProviderSkillSourceKind({
        path: "/workspace/.codex/skills/review-follow-up/SKILL.md",
        scope: "repo",
      }),
    ).toBe("repo");
    expect(
      resolveProviderSkillSourceKind({
        path: "/workspace/.codex/skills/review-follow-up/SKILL.md",
        scope: "project",
      }),
    ).toBe("project");
    expect(
      resolveProviderSkillSourceKind({
        path: "/Users/julius/.agents/skills/agent-browser/SKILL.md",
        scope: "user",
      }),
    ).toBe("personal");
    expect(
      resolveProviderSkillSourceKind({
        path: "/usr/local/share/codex/skills/imagegen/SKILL.md",
        scope: "system",
      }),
    ).toBe("system");
  });

  it("keeps unknown and missing scopes usable", () => {
    expect(
      resolveProviderSkillSourceKind({
        path: "/opt/skills/team-review/SKILL.md",
        scope: "team_shared",
      }),
    ).toBe("other");
    expect(
      resolveProviderSkillSourceKind({
        path: "/opt/skills/team-review/SKILL.md",
      }),
    ).toBe("other");
  });
});
