import { resolvePathLinkTarget, splitPathAndPosition } from "./terminal-links";

export interface ComposerMentionFileTarget {
  readonly relativePath: string;
  readonly line?: number;
}

function toPosixPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  // Windows drive paths pick up a leading slash on the way through URL-ish
  // plumbing (`/C:/repo`); the workspace root never carries one.
  return /^\/[A-Za-z]:\//.test(normalized) ? normalized.slice(1) : normalized;
}

const WINDOWS_DRIVE_ROOT_PATTERN = /^[A-Za-z]:\//;

function collapseDotSegments(path: string): string {
  const isAbsolute = path.startsWith("/");
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..") {
        segments.pop();
        continue;
      }
      // `/..` is `/`: an absolute path cannot climb above the root, and a
      // surviving leading `..` would reach the file surface as a relative path
      // that walks out of the workspace.
      if (isAbsolute) continue;
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

  const { path, line } = splitPathAndPosition(trimmed);
  if (!path) return null;

  const absolute = collapseDotSegments(toPosixPath(resolvePathLinkTarget(path, workspaceRoot)));
  const normalizedRoot = collapseDotSegments(toPosixPath(workspaceRoot));
  // A workspace rooted at `/` strips to nothing, which would leave every
  // mention inert; the empty prefix is what makes the check below read `/x`
  // as the relative `x`.
  const root = normalizedRoot === "/" ? "" : normalizedRoot.replace(/\/+$/, "");
  if (!root && normalizedRoot !== "/") return null;
  // Matched the way the filesystem behind the root would: a POSIX root is
  // case-sensitive, so folding case there would accept `/users/dev/repo/x.ts`
  // against a `/Users/dev/repo` root and hand the panel a path from outside
  // the workspace. A Windows drive root is case-insensitive, so comparing
  // exactly there would reject `C:/Repo/src/x.ts` against `C:/repo`.
  const rootIsCaseInsensitive = WINDOWS_DRIVE_ROOT_PATTERN.test(normalizedRoot);
  const comparableAbsolute = rootIsCaseInsensitive ? absolute.toLowerCase() : absolute;
  const comparableRoot = rootIsCaseInsensitive ? root.toLowerCase() : root;
  if (!comparableAbsolute.startsWith(`${comparableRoot}/`)) return null;

  const relativePath = absolute.slice(root.length + 1);
  if (!relativePath) return null;

  const parsedLine = line ? Number.parseInt(line, 10) : Number.NaN;
  return Number.isFinite(parsedLine) ? { relativePath, line: parsedLine } : { relativePath };
}
