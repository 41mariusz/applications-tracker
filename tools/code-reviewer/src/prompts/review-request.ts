// The user message of a review: PR title, description and diff, each in its own tagged block.
export interface ReviewRequestParts {
  diff: string;
  title?: string;
  body?: string;
}

export function buildReviewRequest({ diff, title, body }: ReviewRequestParts): string {
  const blocks: string[] = [];
  if (title?.trim()) blocks.push(`<pr_title>\n${title.trim()}\n</pr_title>`);
  if (body?.trim()) blocks.push(`<pr_description>\n${body.trim()}\n</pr_description>`);
  blocks.push(`<diff>\n${diff}\n</diff>`);
  return `Oceń poniższy pull request.\n\n${blocks.join("\n\n")}`;
}
