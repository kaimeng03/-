/**
 * A small, reviewed registry for publishers whose official feed lives on a
 * different host and therefore cannot be found by standard HTML RSS
 * autodiscovery or same-origin path probing.
 *
 * Keep matching strict: a rule must validate the exact publisher hostname and
 * path before returning an official feed candidate. The returned URL is still
 * fetched and verified as RSS/Atom by feedDiscovery; this registry never makes
 * a feed valid merely because it is listed here.
 */

interface OfficialFeedRule {
  hosts: ReadonlySet<string>;
  pathPattern: RegExp;
  feedUrl: string;
}

const OFFICIAL_FEED_RULES: readonly OfficialFeedRule[] = [
  {
    hosts: new Set(["bbc.com", "www.bbc.com", "bbc.co.uk", "www.bbc.co.uk"]),
    pathPattern: /^\/zhongwen\/trad(?:\/|$)/i,
    feedUrl: "https://feeds.bbci.co.uk/zhongwen/trad/rss.xml",
  },
];

export function officialFeedCandidates(pageUrl: URL): string[] {
  const hostname = pageUrl.hostname.toLowerCase().replace(/\.$/, "");
  return OFFICIAL_FEED_RULES.filter(
    (rule) => rule.hosts.has(hostname) && rule.pathPattern.test(pageUrl.pathname),
  ).map((rule) => rule.feedUrl);
}
