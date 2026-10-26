import { changeRequestReferenceAutolinker } from "@t3tools/client-runtime/pull-request-markdown";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vite-plus/test";

import { linkReferenceAutolinks } from "./pullRequestAutolinks";

const github = changeRequestReferenceAutolinker({
  provider: "github",
  url: "https://github.com/team/repo/pull/8",
});

describe("linkReferenceAutolinks", () => {
  it("links the host's references in prose", () => {
    expect(linkReferenceAutolinks("Closes #123, see @julius", github)).toBe(
      "Closes [#123](https://github.com/team/repo/issues/123), see [@julius](https://github.com/julius)",
    );
  });

  it("links Azure work items and named review mentions", () => {
    const id = "01234567-89ab-cdef-0123-456789abcdef";
    const azure = changeRequestReferenceAutolinker(
      {
        provider: "azure-devops",
        url: "https://dev.azure.com/acme/platform/_git/t3code/pullrequest/17",
      },
      { [id]: "Alice" },
    );
    expect(linkReferenceAutolinks(`See #12 and @<${id}>`, azure)).toBe(
      `See [#12](https://dev.azure.com/acme/platform/_workitems/edit/12) and [@Alice](https://dev.azure.com/acme/platform/_settings/people?userId=${id})`,
    );
  });

  it("leaves code, links, images, escapes and definitions alone", () => {
    const text =
      "`#123 @person abc1234`\n\n```\n#123\n```\n\n[#123](https://example.com) ![#123](image.png) https://example.com/#123 user@example.com \\#123 1234567\n\n[ref]: https://example.com/#123";
    expect(linkReferenceAutolinks(text, github)).toBe(text);
  });

  it("does not nest links inside HTML anchors or code", () => {
    const text = 'See <a href="https://example.com">#12</a> and <code>#13</code>, then #14.';
    expect(linkReferenceAutolinks(text, github)).toBe(
      'See <a href="https://example.com">#12</a> and <code>#13</code>, then [#14](https://github.com/team/repo/issues/14).',
    );
  });

  it("leaves markdown unchanged for a host that links nothing", () => {
    const gitlab = changeRequestReferenceAutolinker({
      provider: "gitlab",
      url: "https://gitlab.com/group/project/-/merge_requests/7",
    });
    expect(linkReferenceAutolinks("Closes #123", gitlab)).toBe("Closes #123");
  });
});

describe.each(["abcdef01-2345-6789-abcd-ef0123456789", "01234567-89ab-cdef-0123-456789abcdef"])(
  "Azure mention %s",
  (id) => {
    const label = "@Alice [team] \\ [ *em* _x_ ~x~ <code> &copy; ![x]";
    const azure = changeRequestReferenceAutolinker(
      {
        provider: "azure-devops",
        url: "https://dev.azure.com/acme/platform/_git/t3code/pullrequest/17",
      },
      { [id]: label.slice(1) },
    );
    const mention = `@<${id}>`;
    it("serializes parsed mentions with a literal label", () => {
      const linked = linkReferenceAutolinks(`Thanks ${mention}, then ${mention}.`, azure);
      const tree = unified().use(remarkParse).parse(linked);
      expect(tree).toMatchObject({
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", value: "Thanks " },
              {
                type: "link",
                url: `https://dev.azure.com/acme/platform/_settings/people?userId=${id}`,
                children: [{ type: "text", value: label }],
              },
              { type: "text", value: ", then " },
              {
                type: "link",
                url: `https://dev.azure.com/acme/platform/_settings/people?userId=${id}`,
                children: [{ type: "text", value: label }],
              },
              { type: "text", value: "." },
            ],
          },
        ],
      });
    });

    it("preserves excluded contexts", () => {
      const markdown = [
        `\`${mention}\``,
        `\`\`\`\n${mention}\n\`\`\``,
        `[${mention}](https://example.com)`,
        `![${mention}](image.png)`,
        `[ref]: https://example.com "${mention}"`,
        `[${mention}][ref]`,
        `\\${mention} and \\${mention}`,
        ...["a", "code", "pre", "script", "style"].map(
          (tag) => `See <${tag}>${mention} #12</${tag}>`,
        ),
      ].join("\n\n");
      expect(linkReferenceAutolinks(markdown, azure)).toBe(markdown);
    });
  },
);
