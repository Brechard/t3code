import { EditorId, EnvironmentId, type ScopedThreadRef } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ClientSettings } from "@t3tools/contracts/settings";
import {
  mapAtomCommandResult,
  type AtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import { AsyncResult } from "effect/unstable/reactivity";
import { getLocalStorageItem, removeLocalStorageItem } from "./hooks/useLocalStorage";
import { useCallback, useMemo } from "react";
import {
  editorProjectKey,
  nextProjectEditorOverrides,
  resolveEditorForProject,
  type EditorPreferences,
} from "./editorPreferences.logic";
import { getClientSettings, useClientSettings, useUpdateClientSettings } from "./hooks/useSettings";
import { appAtomRegistry } from "./rpc/atomRegistry";
import { environmentProjects } from "./state/projects";
import { environmentThreadShells } from "./state/threads";
import { shellEnvironment } from "./state/shell";
import { useAtomCommand } from "./state/use-atom-command";

export {
  editorProjectKey,
  resolveEditorForProject,
  type EditorPreferences,
} from "./editorPreferences.logic";

/**
 * Pre-override sticky editor, kept only so an existing install does not lose
 * the editor it was already opening. Read as the fallback for an unset
 * `defaultEditor` and dropped the first time the user picks a new default.
 */
const LEGACY_LAST_EDITOR_KEY = "t3code:last-editor";

let legacyDefaultEditorRead = false;
let legacyDefaultEditor: EditorId | null = null;

function readLegacyDefaultEditor(): EditorId | null {
  if (!legacyDefaultEditorRead) {
    legacyDefaultEditor = getLocalStorageItem(LEGACY_LAST_EDITOR_KEY, EditorId);
    legacyDefaultEditorRead = true;
  }
  return legacyDefaultEditor;
}

function forgetLegacyDefaultEditor(): void {
  legacyDefaultEditor = null;
  legacyDefaultEditorRead = true;
  removeLocalStorageItem(LEGACY_LAST_EDITOR_KEY);
}

export function selectEditorPreferences(settings: ClientSettings): EditorPreferences {
  return {
    defaultEditor: settings.defaultEditor ?? readLegacyDefaultEditor(),
    projectEditorOverrides: settings.projectEditorOverrides,
  };
}

export function useEditorPreferences(): EditorPreferences {
  return useClientSettings(selectEditorPreferences);
}

/**
 * Project key for whichever project owns a thread, read at call time rather
 * than subscribed to: thread shells churn on every turn update, and the
 * open-in call sites live in components that render per message.
 */
export function readEditorProjectKeyForThread(threadRef: ScopedThreadRef | null): string | null {
  if (!threadRef) return null;
  const shell = appAtomRegistry.get(environmentThreadShells.threadShellAtom(threadRef));
  if (!shell) return null;
  const project = appAtomRegistry.get(
    environmentProjects.projectAtom(scopeProjectRef(threadRef.environmentId, shell.projectId)),
  );
  return editorProjectKey(project);
}

/**
 * Where an open-in target lives: either a project key already in hand, or the
 * thread that owns it.
 */
export type EditorScope = string | ScopedThreadRef | null;

function resolveEditorScope(scope: EditorScope): string | null {
  if (scope === null || typeof scope === "string") return scope;
  return readEditorProjectKeyForThread(scope);
}

export function useSetDefaultEditor(): (editor: EditorId | null) => void {
  const updateSettings = useUpdateClientSettings();
  return useCallback(
    (editor) => {
      forgetLegacyDefaultEditor();
      updateSettings({ defaultEditor: editor });
    },
    [updateSettings],
  );
}

export function useSetProjectEditorOverride(): (
  projectKey: string,
  editor: EditorId | null,
) => void {
  const { projectEditorOverrides } = useEditorPreferences();
  const updateSettings = useUpdateClientSettings();
  return useCallback(
    (projectKey, editor) => {
      updateSettings({
        projectEditorOverrides: nextProjectEditorOverrides({
          overrides: projectEditorOverrides,
          projectKey,
          editor,
        }),
      });
    },
    [projectEditorOverrides, updateSettings],
  );
}

/**
 * Editor a target opens in, plus the setter the picker uses. Picking an editor
 * with a project in scope sets that project's override; without one it moves
 * the global default.
 */
export function usePreferredEditor(
  availableEditors: ReadonlyArray<EditorId>,
  projectKey: string | null,
) {
  const preferences = useEditorPreferences();
  const setDefaultEditor = useSetDefaultEditor();
  const setProjectEditorOverride = useSetProjectEditorOverride();

  const effectiveEditor = useMemo(
    () => resolveEditorForProject({ preferences, projectKey, availableEditors }),
    [availableEditors, preferences, projectKey],
  );

  const setPreferredEditor = useCallback(
    (editor: EditorId | null) => {
      if (projectKey) {
        setProjectEditorOverride(projectKey, editor);
        return;
      }
      if (editor !== null) setDefaultEditor(editor);
    },
    [projectKey, setDefaultEditor, setProjectEditorOverride],
  );

  return [effectiveEditor, setPreferredEditor] as const;
}

/** Non-hook resolution for callbacks that cannot read the hook snapshot. */
export function resolvePreferredEditor(
  availableEditors: ReadonlyArray<EditorId>,
  projectKey: string | null = null,
): EditorId | null {
  return resolveEditorForProject({
    preferences: selectEditorPreferences(getClientSettings()),
    projectKey,
    availableEditors,
  });
}

export class PreferredEditorEnvironmentRequiredError extends Schema.TaggedErrorClass<PreferredEditorEnvironmentRequiredError>()(
  "PreferredEditorEnvironmentRequiredError",
  {
    targetPath: Schema.String,
  },
) {
  override get message(): string {
    return `Cannot open ${this.targetPath} because no environment is selected.`;
  }
}

export class PreferredEditorUnavailableError extends Schema.TaggedErrorClass<PreferredEditorUnavailableError>()(
  "PreferredEditorUnavailableError",
  {
    environmentId: EnvironmentId,
    targetPath: Schema.String,
    availableEditorIds: Schema.Array(EditorId),
  },
) {
  override get message(): string {
    return `No available editor can open ${this.targetPath} in environment ${this.environmentId}.`;
  }
}

export function useOpenInPreferredEditor(
  environmentId: EnvironmentId | null,
  availableEditors: readonly EditorId[],
  scope: EditorScope = null,
) {
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, {
    reportFailure: false,
  });
  type OpenInEditorError = AtomCommandFailure<Awaited<ReturnType<typeof openInEditor>>>;

  return useCallback(
    async (
      targetPath: string,
    ): Promise<
      AtomCommandResult<
        EditorId,
        | OpenInEditorError
        | PreferredEditorEnvironmentRequiredError
        | PreferredEditorUnavailableError
      >
    > => {
      if (environmentId === null) {
        return AsyncResult.failure(
          Cause.fail(
            new PreferredEditorEnvironmentRequiredError({
              targetPath,
            }),
          ),
        );
      }
      const editor = resolvePreferredEditor(availableEditors, resolveEditorScope(scope));
      if (!editor) {
        return AsyncResult.failure(
          Cause.fail(
            new PreferredEditorUnavailableError({
              environmentId,
              targetPath,
              availableEditorIds: availableEditors,
            }),
          ),
        );
      }
      const result = await openInEditor({
        environmentId,
        input: {
          cwd: targetPath,
          editor,
        },
      });
      return mapAtomCommandResult(result, () => editor);
    },
    [availableEditors, environmentId, openInEditor, scope],
  );
}
