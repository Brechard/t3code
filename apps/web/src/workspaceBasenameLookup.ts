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

/**
 * Sequence for in-flight lookups. Two clicks on bare filenames can be resolving
 * at once, and nothing guarantees the index answers them in order — so an older
 * answer landing last would move the panel off the file the user asked for.
 *
 * One counter covers every caller on purpose: they all open the same visible
 * panel, so "newest click wins" is the behaviour regardless of which one
 * started the lookup.
 */
let latestLookupSequence = 0;

/**
 * Claims the newest lookup. Call the returned predicate once the search
 * settles: false means a later click has superseded this one and its result
 * must be dropped.
 */
export function claimWorkspaceBasenameLookup(): () => boolean {
  latestLookupSequence += 1;
  const claimed = latestLookupSequence;
  return () => claimed === latestLookupSequence;
}

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
  const target = basename.trim();
  if (!target) return null;
  const files = entries.filter((entry) => entry.kind === "file");
  // Exact first: a workspace holding both `Foo.ts` and `foo.ts` must not open
  // whichever the index happened to rank higher. The case-insensitive pass
  // then covers a reference whose casing drifted from the file on disk, which
  // is the common shape on macOS and Windows.
  const exact = files.find((entry) => basenameOfPath(entry.path) === target);
  if (exact) return exact.path;
  // Only when it is unambiguous: `FOO.ts` against both `Foo.ts` and `foo.ts`
  // has no right answer, and picking by index rank would open one of them
  // without saying so.
  const folded = target.toLowerCase();
  const foldedMatches = files.filter(
    (entry) => basenameOfPath(entry.path).toLowerCase() === folded,
  );
  return foldedMatches.length === 1 ? (foldedMatches[0]?.path ?? null) : null;
}
