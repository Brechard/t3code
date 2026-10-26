import type { ReferenceAutolink } from "@t3tools/client-runtime/source-control-clients";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

type MarkdownNode = {
  readonly type: string;
  readonly position?:
    | {
        readonly start: { readonly offset?: number | undefined };
        readonly end: { readonly offset?: number | undefined };
      }
    | undefined;
  readonly children?: readonly MarkdownNode[] | undefined;
};

const parser = unified().use(remarkParse).use(remarkGfm);
const UNLINKED_TYPES = new Set([
  "link",
  "linkReference",
  "image",
  "imageReference",
  "code",
  "inlineCode",
  "html",
  "definition",
]);

/**
 * Rewrites the references `autolinks` finds in the markdown's prose as markdown links, because the
 * native renderer takes markdown text. Text is searched as written, escapes included.
 */
export function linkReferenceAutolinks(
  markdown: string,
  autolinks: ((text: string) => ReadonlyArray<ReferenceAutolink>) | null,
): string {
  if (autolinks === null) return markdown;
  const edits: { start: number; end: number; value: string }[] = [];
  const visit = (node: MarkdownNode, following?: MarkdownNode) => {
    if (UNLINKED_TYPES.has(node.type)) return;
    if (node.type === "text") {
      const start = node.position?.start.offset;
      let end = node.position?.end.offset;
      if (start === undefined || end === undefined) return;
      const textLength = end - start;
      const followingEnd = following?.position?.end.offset;
      if (following?.type === "html" && followingEnd !== undefined) {
        const combined = markdown.slice(start, followingEnd);
        if (
          autolinks(combined).some(
            (link) => link.index < textLength && link.index + link.text.length === combined.length,
          )
        ) {
          end = followingEnd;
        }
      }
      for (const link of autolinks(markdown.slice(start, end))) {
        edits.push({
          start: start + link.index,
          end: start + link.index + link.text.length,
          value: `[${link.label.replace(/[\\[\]`*_<>!&~]/gu, "\\$&")}](${link.url})`,
        });
      }
    } else if (node.children !== undefined) {
      let protectedHtmlDepth = 0;
      for (let index = 0; index < node.children.length; index++) {
        const child = node.children[index]!;
        if (child.type === "html") {
          const start = child.position?.start.offset;
          const end = child.position?.end.offset;
          const tag = start === undefined || end === undefined ? "" : markdown.slice(start, end);
          for (const match of tag.matchAll(/<(\/)?(?:a|code|pre|script|style)(?=[\s>])[^>]*>/giu)) {
            protectedHtmlDepth = Math.max(0, protectedHtmlDepth + (match[1] ? -1 : 1));
          }
        } else if (protectedHtmlDepth === 0) visit(child, node.children[index + 1]);
      }
    }
  };
  visit(parser.parse(markdown));
  let linked = markdown;
  for (let index = edits.length - 1; index >= 0; index--) {
    const edit = edits[index]!;
    linked = linked.slice(0, edit.start) + edit.value + linked.slice(edit.end);
  }
  return linked;
}
