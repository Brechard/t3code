/**
 * Agent output refers to files by name and line — `ChatView.tsx:3301` — far
 * more often than by full path. The `:line` suffix is what marks the span as a
 * file reference, but the name alone says nothing about where the file lives,
 * so the link resolver can only place it at the workspace root, where it
 * almost never is. Opening one of those links then fails with
 * "Failed to read workspace file 'ChatView.tsx' in '<workspace>'".
 *
 * These helpers let the click path ask the workspace index where that basename
 * actually lives before opening the file surface.
 */

/**
 * Enough index hits to look past same-named neighbours (`ChatView.test.tsx`)
 * without asking the environment for a full listing on a single click.
 */
export const WORKSPACE_BASENAME_LOOKUP_LIMIT = 25;

export interface WorkspaceEntryCandidate {
  readonly path: string;
  readonly kind: "file" | "directory";
}

function basenameOfPath(path: string): string {
  const separatorIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
}

/**
 * True when a workspace-relative path is a bare filename, which is the only
 * shape that can have come from a reference with no directory in it. Anything
 * carrying a separator was already resolved against a real location.
 */
export function needsWorkspaceBasenameLookup(relativePath: string): boolean {
  const trimmed = relativePath.trim();
  return trimmed.length > 0 && !trimmed.includes("/") && !trimmed.includes("\\");
}

/**
 * The best index entry for a basename, or null to leave the path alone. Search
 * results arrive ranked, so the first exact filename match wins; a fuzzy match
 * on some other file is worse than the honest "not found" error.
 */
export function pickWorkspaceBasenameMatch(
  basename: string,
  entries: ReadonlyArray<WorkspaceEntryCandidate>,
): string | null {
  const target = basename.trim().toLowerCase();
  if (!target) return null;
  for (const entry of entries) {
    if (entry.kind !== "file") continue;
    if (basenameOfPath(entry.path).toLowerCase() === target) return entry.path;
  }
  return null;
}
