import { decodeHTMLStrict } from "entities";
import type { ReferenceAutolink } from "@t3tools/client-runtime/source-control-clients";

export {
  splitPullRequestBody,
  type PullRequestBodySegment,
} from "@t3tools/client-runtime/pull-request-markdown";

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  url?: string;
  data?: unknown;
  position?: { start: { offset?: number }; end: { offset?: number } };
};

const AUTOLINK_IGNORED_TYPES = new Set([
  "link",
  "linkReference",
  "image",
  "imageReference",
  "code",
  "inlineCode",
  "definition",
]);

const MARKDOWN_TEXT_ESCAPE = /\\([!-/:-@[-`{-~])|&(?:#\d{1,7}|#x[\da-f]{1,6}|[a-z][\da-z]*);/giu;

function authoredLinks(
  value: string,
  source: string | undefined,
  links: ReadonlyArray<ReferenceAutolink>,
) {
  if (source === undefined || links.length === 0) return links;
  const excluded: { start: number; end: number }[] = [];
  let delta = 0;
  const decodedSource = source.replace(
    MARKDOWN_TEXT_ESCAPE,
    (match, escaped: string | undefined, offset: number) => {
      const decoded = escaped ?? decodeHTMLStrict(match);
      if (decoded !== match) {
        const start = offset + delta;
        excluded.push({ start, end: start + decoded.length });
        delta += decoded.length - match.length;
      }
      return decoded;
    },
  );
  if (excluded.length === 0) return links;
  let valueOffset = 0;
  let sourceOffset = 0;
  let rangeIndex = 0;
  return links.filter((link) => {
    // Container prefixes and trimmed whitespace shift offsets, but preserve reference occurrences.
    const occurrences = value.slice(valueOffset, link.index).split(link.text).length;
    let start = sourceOffset;
    for (let index = 0; index < occurrences; index++) {
      start = decodedSource.indexOf(link.text, sourceOffset);
      if (start === -1) return false;
      sourceOffset = start + link.text.length;
    }
    valueOffset = link.index + link.text.length;
    while (excluded[rangeIndex] !== undefined && excluded[rangeIndex]!.end <= start) rangeIndex++;
    return excluded[rangeIndex] === undefined || excluded[rangeIndex]!.start >= sourceOffset;
  });
}

export function remarkPullRequestAutolinks(options: {
  readonly autolinks: (text: string) => ReadonlyArray<ReferenceAutolink>;
}) {
  return (tree: MarkdownNode, file?: { value: unknown }) => {
    const source = typeof file?.value === "string" ? file.value : undefined;
    const sourceOf = (node: MarkdownNode) => {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      return source !== undefined && start !== undefined && end !== undefined
        ? source.slice(start, end)
        : undefined;
    };
    const visit = (node: MarkdownNode): void => {
      const children = node.children;
      if (children === undefined) return;
      let protectedHtmlDepth = 0;
      for (let index = 0; index < children.length; index += 1) {
        const child = children[index]!;
        if (child.type === "html") {
          for (const match of (child.value ?? "").matchAll(
            /<!--[\s\S]*?-->|<(\/)?([a-z][\w:-]*)(?=[\s/>])(?:[^"'<>]|"[^"]*"|'[^']*')*>/giu,
          )) {
            if (/^(?:a|code|pre|script|style)$/iu.test(match[2] ?? "")) {
              protectedHtmlDepth = Math.max(0, protectedHtmlDepth + (match[1] ? -1 : 1));
            }
          }
          continue;
        }
        if (protectedHtmlDepth > 0) continue;
        if (AUTOLINK_IGNORED_TYPES.has(child.type)) continue;
        if (child.type !== "text" || child.value === undefined) {
          visit(child);
          continue;
        }
        let value = child.value;
        let raw = sourceOf(child);
        let consumed = 1;
        const next = children[index + 1];
        if (next?.type === "html") {
          const combined = value + (next.value ?? "");
          const followingSource = sourceOf(next);
          const combinedSource =
            raw !== undefined && followingSource !== undefined ? raw + followingSource : undefined;
          if (
            authoredLinks(combined, combinedSource, options.autolinks(combined)).some(
              (link) =>
                link.index < value.length && link.index + link.text.length === combined.length,
            )
          ) {
            value = combined;
            raw = combinedSource;
            consumed = 2;
          }
        }
        const links = authoredLinks(value, raw, options.autolinks(value));
        if (links.length === 0) continue;
        const replacements: MarkdownNode[] = [];
        let start = 0;
        for (const link of links) {
          if (start < link.index) {
            replacements.push({ type: "text", value: value.slice(start, link.index) });
          }
          replacements.push({
            type: "link",
            url: link.url,
            data: { hProperties: { dataPullRequestAutolink: link.kind } },
            children: [{ type: "text", value: link.label }],
          });
          start = link.index + link.text.length;
        }
        if (start < value.length) replacements.push({ type: "text", value: value.slice(start) });
        children.splice(index, consumed, ...replacements);
        index += replacements.length - 1;
      }
    };
    visit(tree);
  };
}
