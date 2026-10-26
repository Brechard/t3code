import { changeRequestReferenceAutolinker } from "@t3tools/client-runtime/pull-request-markdown";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vite-plus/test";

import { remarkPullRequestAutolinks } from "./pullRequestMarkdown.logic";

type Node = {
  type: string;
  value?: string;
  url?: string;
  data?: { hProperties?: Record<string, unknown> };
  children?: Node[];
};

function links(
  markdown: string,
  autolinks = changeRequestReferenceAutolinker({
    provider: "github",
    url: "https://github.com/team/repo/pull/8",
  })!,
) {
  const tree = unified().use(remarkParse).parse(markdown) as Node;
  remarkPullRequestAutolinks({ autolinks })(tree as never, { value: markdown });
  const found: Array<[string | undefined, string | undefined, unknown]> = [];
  const visit = (node: Node) => {
    if (node.type === "link") {
      found.push([
        node.children?.[0]?.value,
        node.url,
        node.data?.hProperties?.["dataPullRequestAutolink"],
      ]);
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  return found;
}

describe("remarkPullRequestAutolinks", () => {
  it("links the host's references in prose and leaves links and code alone", () => {
    expect(links("Fixes #12 in **abcdef1**. [#13](https://example.com) `#14`")).toEqual([
      ["#12", "https://github.com/team/repo/issues/12", "reference"],
      ["abcdef1", "https://github.com/team/repo/commit/abcdef1", "commit"],
      ["#13", "https://example.com", undefined],
    ]);
  });
});

const azureIds = ["abcdef01-2345-6789-abcd-ef0123456789", "01234567-89ab-cdef-0123-456789abcdef"];

describe.each(azureIds)("Azure mention %s", (id) => {
  const label = "@Alice [team] \\ [ *em* _x_ ~x~ <code> &copy; ![x]";
  const azure = changeRequestReferenceAutolinker(
    {
      provider: "azure-devops",
      url: "https://dev.azure.com/acme/platform/_git/t3code/pullrequest/17",
    },
    { [id]: label.slice(1) },
  )!;
  const mention = `@<${id}>`;
  it("links parsed mentions with a plain-text label", () => {
    expect(links(`Thanks ${mention}, then ${mention}.`, azure)).toEqual([
      [label, `https://dev.azure.com/acme/platform/_settings/people?userId=${id}`, "mention"],
      [label, `https://dev.azure.com/acme/platform/_settings/people?userId=${id}`, "mention"],
    ]);
  });

  it("preserves excluded contexts", () => {
    const authored = `https://example.com`;
    const markdown = [
      `\`${mention}\``,
      `\`\`\`\n${mention}\n\`\`\``,
      `[${mention}](${authored})`,
      `![${mention}](image.png)`,
      `[ref]: ${authored} "${mention}"`,
      `[${mention}][ref]`,
      `\\${mention} and \\${mention}`,
      ...["a", "code", "pre", "script", "style"].map(
        (tag) => `See <${tag}>${mention} #12</${tag}>`,
      ),
    ].join("\n\n");
    const tree = unified().use(remarkParse).parse(markdown);
    const original = structuredClone(tree);
    remarkPullRequestAutolinks({ autolinks: azure })(tree as never, { value: markdown });
    expect(tree).toEqual(original);
  });
});

it("preserves escaped text and entities around linked references", () => {
  expect(links(String.raw`\#12 &amp; \*literal\* #12 \#12 #13`)).toEqual([
    ["#12", "https://github.com/team/repo/issues/12", "reference"],
    ["#13", "https://github.com/team/repo/issues/13", "reference"],
  ]);
  const markdown = String.raw`\*literal\* &amp; #12 \&amp;`;
  const tree = unified().use(remarkParse).parse(markdown);
  const autolinks = changeRequestReferenceAutolinker({
    provider: "github",
    url: "https://github.com/team/repo/pull/8",
  })!;
  remarkPullRequestAutolinks({ autolinks })(tree as never, { value: markdown });
  expect(tree).toMatchObject({
    children: [
      {
        children: [
          { type: "text", value: "*literal* & " },
          { type: "link", children: [{ type: "text", value: "#12" }] },
          { type: "text", value: " &amp;" },
        ],
      },
    ],
  });
});

describe.each([
  ["Copyright &#169; and #12", "Copyright © and "],
  ["Copyright &#xA9; and #12", "Copyright © and "],
  ["Copyright &copy; and #12", "Copyright © and "],
  ["&#35;12 and #12", "#12 and "],
  ["&num;12 and #12", "#12 and "],
  ["&#10; and #12", "\n and "],
])("source character references: %s", (markdown, prose) => {
  it("preserves decoded prose and links only the authored reference", () => {
    const tree = unified().use(remarkParse).parse(markdown);
    const autolinks = changeRequestReferenceAutolinker({
      provider: "azure-devops",
      url: "https://dev.azure.com/acme/platform/_git/t3code/pullrequest/17",
    })!;
    remarkPullRequestAutolinks({ autolinks })(tree as never, { value: markdown });
    expect(tree).toMatchObject({
      children: [
        {
          children: [
            { type: "text", value: prose },
            {
              type: "link",
              url: "https://dev.azure.com/acme/platform/_workitems/edit/12",
              children: [{ type: "text", value: "#12" }],
            },
          ],
        },
      ],
    });
    expect(links(markdown, autolinks)).toEqual([
      ["#12", "https://dev.azure.com/acme/platform/_workitems/edit/12", "reference"],
    ]);
  });
});

describe.each([
  ["> first\n> then #12", "first\nthen "],
  ["> first\n> second \n> then #12", "first\nsecond\nthen "],
  ["a\u0000 #12", "a\uFFFD "],
  ["> &#10;\n> then #12", "\n\nthen "],
  ["> first\n> > then #12", "then "],
  ["- first\n  then #12", "first\nthen "],
  ["first\r\nthen #12", "first\r\nthen "],
  ["> &amp; \\*first\\*\n> then #12", "& *first*\nthen "],
])("source positions: %s", (markdown, prose) => {
  it("retains parsed display text around the linked reference", () => {
    const tree = unified().use(remarkParse).parse(markdown);
    const paragraphs: Node[] = [];
    const visit = (node: Node) => {
      if (node.type === "paragraph") paragraphs.push(node);
      node.children?.forEach(visit);
    };
    visit(tree as Node);
    const autolinks = changeRequestReferenceAutolinker({
      provider: "github",
      url: "https://github.com/team/repo/pull/8",
    })!;
    remarkPullRequestAutolinks({ autolinks })(tree as never, { value: markdown });
    expect(paragraphs.at(-1)).toMatchObject({
      children: [
        { type: "text", value: prose },
        { type: "link", children: [{ type: "text", value: "#12" }] },
      ],
    });
  });
});

describe.each(["hello&#65;@user", "#12&#65;"])("entity boundary: %s", (markdown) => {
  it("does not introduce a reference boundary", () => {
    expect(links(markdown)).toEqual([]);
  });
});

it("ignores tag-like strings inside HTML attributes", () => {
  expect(links('See <span title="<a>">literal</span> then #12')).toEqual([
    ["#12", "https://github.com/team/repo/issues/12", "reference"],
  ]);
});

describe.each([String.raw`\@`, "&#64;"])("unauthored split mention: %s", (prefix) => {
  it("preserves the HTML node when an earlier reference is linked", () => {
    const id = azureIds[0]!;
    const markdown = `#12 ${prefix}<${id}>`;
    const tree = unified().use(remarkParse).parse(markdown);
    const paragraph = tree.children[0] as Node;
    const originalHtml = structuredClone(paragraph.children?.at(-1));
    const autolinks = changeRequestReferenceAutolinker({
      provider: "azure-devops",
      url: "https://dev.azure.com/acme/platform/_git/t3code/pullrequest/17",
    })!;
    remarkPullRequestAutolinks({ autolinks })(tree as never, { value: markdown });
    expect(paragraph.children?.at(-1)).toEqual(originalHtml);
    expect(links(markdown, autolinks)).toEqual([
      ["#12", "https://dev.azure.com/acme/platform/_workitems/edit/12", "reference"],
    ]);
  });
});

it("distinguishes repeated authored, escaped and entity-generated references in a container", () => {
  expect(links("> &num;12 #12 \\#12 \n> then #12 &copy;")).toEqual([
    ["#12", "https://github.com/team/repo/issues/12", "reference"],
    ["#12", "https://github.com/team/repo/issues/12", "reference"],
  ]);
});
