import type { ReferenceAutolink } from "@t3tools/source-control-core/shared/definition";

const REFERENCE =
  /(?<![\w/\\])(?:@<([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>|([#!])([1-9]\d*)|\b([0-9a-f]{40})\b)/giu;

export function azureDevOpsReferenceAutolinks(
  text: string,
  repositoryUrl: string,
): ReadonlyArray<ReferenceAutolink> {
  let url: URL;
  try {
    url = new URL(repositoryUrl);
  } catch {
    return [];
  }
  if (!/^https?:$/u.test(url.protocol) || !url.pathname.includes("/_git/")) return [];
  const project = `${url.origin}${url.pathname.split("/_git/")[0]}`;
  const repository = `${project}/_git/${url.pathname.split("/_git/")[1]!.split("/")[0]}`;
  const links: ReferenceAutolink[] = [];
  for (const match of text.matchAll(REFERENCE)) {
    const [original, identity, marker, number, commit] = match;
    links.push({
      index: match.index,
      text: original,
      label: commit ? commit.slice(0, 7) : original,
      url: identity
        ? `${project}/_settings/people?userId=${identity}`
        : commit
          ? `${repository}/commit/${commit}`
          : marker === "!"
            ? `${repository}/pullrequest/${number}`
            : `${project}/_workitems/edit/${number}`,
      kind: identity ? "mention" : commit ? "commit" : "reference",
    });
  }
  return links;
}
