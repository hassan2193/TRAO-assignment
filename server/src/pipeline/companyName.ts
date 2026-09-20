const TITLE_SUFFIX_PATTERN = /\s*[|\-–—:]\s*(home|careers?|jobs?|about( us)?|welcome).*$/i;

/**
 * Best-effort company display name: prefer the homepage's <title>, stripped
 * of common "| Careers" / "- Home" boilerplate, falling back to the
 * hostname if the title is empty or unusable.
 */
export function deriveCompanyName(homepageTitle: string, companyUrl: string): string {
  const cleanedTitle = homepageTitle.replace(TITLE_SUFFIX_PATTERN, "").trim();
  if (cleanedTitle.length >= 2 && cleanedTitle.length <= 60) return cleanedTitle;

  try {
    const host = new URL(companyUrl).hostname.replace(/^www\./, "");
    const base = host.split(".")[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return "The company";
  }
}
