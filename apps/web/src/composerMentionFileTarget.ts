import { resolvePathLinkTarget, splitPathAndPosition } from "./terminal-links";

export interface ComposerMentionFileTarget {
  readonly relativePath: string;
  readonly line?: number;
  /** Present when the mention names a span of lines (`@Foo.ts:20-40`). */
  readonly endLine?: number;
}

function toPosixPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  // Windows drive paths pick up a leading slash on the way through URL-ish
  // plumbing (`/C:/repo`); the workspace root never carries one.
  return /^\/[A-Za-z]:\//.test(normalized) ? normalized.slice(1) : normalized;
}

function collapseDotSegments(path: string): string {
  const isAbsolute = path.startsWith("/");
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === ".." && segments.length > 0 && segments[segments.length - 1] !== "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  const joined = segments.join("/");
  return isAbsolute ? `/${joined}` : joined;
}

/**
 * Resolve the file a composer mention chip points at, in the form the right
 * panel wants: a path relative to the workspace root the file preview reads.
 *
 * Autocomplete, drag-and-drop, and the file browser all insert
 * workspace-relative paths, but a hand-typed mention can be absolute, use
 * `~/`, or carry a `:line` suffix. Anything that lands outside the workspace
 * has no preview surface, so it resolves to `null` and the chip stays inert.
 */
export function resolveComposerMentionFileTarget(
  mentionPath: string,
  workspaceRoot: string | undefined,
): ComposerMentionFileTarget | null {
  const trimmed = mentionPath.trim();
  if (!trimmed || !workspaceRoot) return null;

  const { path, line, endLine } = splitPathAndPosition(trimmed);
  if (!path) return null;

  const absolute = collapseDotSegments(toPosixPath(resolvePathLinkTarget(path, workspaceRoot)));
  const root = collapseDotSegments(toPosixPath(workspaceRoot)).replace(/\/+$/, "");
  if (!root) return null;
  if (!absolute.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return null;

  const relativePath = absolute.slice(root.length + 1);
  if (!relativePath) return null;

  const parsedLine = line ? Number.parseInt(line, 10) : Number.NaN;
  if (!Number.isFinite(parsedLine)) return { relativePath };
  const parsedEndLine = endLine ? Number.parseInt(endLine, 10) : Number.NaN;
  return Number.isFinite(parsedEndLine) && parsedEndLine > parsedLine
    ? { relativePath, line: parsedLine, endLine: parsedEndLine }
    : { relativePath, line: parsedLine };
}
