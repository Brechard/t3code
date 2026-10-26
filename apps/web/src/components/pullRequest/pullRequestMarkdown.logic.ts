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

function decodeText(text: string) {
  // Text-node source contains only Markdown escapes and character references to decode.
  return text.replace(
    MARKDOWN_TEXT_ESCAPE,
    (match, escaped: string | undefined) => escaped ?? decodeHTMLStrict(match),
  );
}

export function remarkPullRequestAutolinks(options: {
  readonly autolinks: (text: string) => ReadonlyArray<ReferenceAutolink>;
}) {
  return (tree: MarkdownNode, file?: { value: unknown }) => {
    const source = typeof file?.value === "string" ? file.value : undefined;
    const textOf = (node: MarkdownNode) => {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (source === undefined || start === undefined || end === undefined) return node.value ?? "";
      const raw = source.slice(start, end);
      if (node.type !== "text") return raw;
      const lines = node.value!.split("\n");
      let lineIndex = 0;
      // Positions span container prefixes; the parser's text identifies each line's actual content.
      return raw
        .split(/\r\n?|\n/u)
        .map((line) => {
          const decoded = decodeText(line);
          const lineCount = decoded.split("\n").length;
          const content = lines.slice(lineIndex, lineIndex + lineCount).join("\n");
          lineIndex += lineCount;
          return decoded.endsWith(content) ? line.slice(decoded.length - content.length) : line;
        })
        .join("\n");
    };
    const visit = (node: MarkdownNode): void => {
      const children = node.children;
      if (children === undefined) return;
      let protectedHtmlDepth = 0;
      for (let index = 0; index < children.length; index += 1) {
        const child = children[index]!;
        if (child.type === "html") {
          for (const match of textOf(child).matchAll(
            /<(\/)?(?:a|code|pre|script|style)(?=[\s>])[^>]*>/giu,
          )) {
            protectedHtmlDepth = Math.max(0, protectedHtmlDepth + (match[1] ? -1 : 1));
          }
          continue;
        }
        if (protectedHtmlDepth > 0) continue;
        if (AUTOLINK_IGNORED_TYPES.has(child.type)) continue;
        if (child.type !== "text" || child.value === undefined) {
          visit(child);
          continue;
        }
        let value = textOf(child);
        let consumed = 1;
        const next = children[index + 1];
        if (next?.type === "html") {
          const combined = value + textOf(next);
          if (
            options
              .autolinks(combined)
              .some(
                (link) =>
                  link.index < value.length && link.index + link.text.length === combined.length,
              )
          ) {
            value = combined;
            consumed = 2;
          }
        }
        // Keep source offsets while hiding character references from the provider matcher.
        const searchable =
          source === undefined
            ? value
            : value.replace(MARKDOWN_TEXT_ESCAPE, (match, escaped: string | undefined) =>
                escaped === undefined && decodeHTMLStrict(match) !== match
                  ? " ".repeat(match.length)
                  : match,
              );
        const links = options.autolinks(searchable);
        const plainText = (text: string) => (source === undefined ? text : decodeText(text));
        if (links.length === 0) continue;
        const replacements: MarkdownNode[] = [];
        let start = 0;
        for (const link of links) {
          if (start < link.index) {
            replacements.push({ type: "text", value: plainText(value.slice(start, link.index)) });
          }
          replacements.push({
            type: "link",
            url: link.url,
            data: { hProperties: { dataPullRequestAutolink: link.kind } },
            children: [{ type: "text", value: link.label }],
          });
          start = link.index + link.text.length;
        }
        if (start < value.length)
          replacements.push({ type: "text", value: plainText(value.slice(start)) });
        children.splice(index, consumed, ...replacements);
        index += replacements.length - 1;
      }
    };
    visit(tree);
  };
}
