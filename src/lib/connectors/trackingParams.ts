// Strips known ad/analytics tracking parameters a user might paste in along
// with a URL, without touching query params a site actually needs to function
// (pagination, ?id=, search terms, etc).
const TRACKING_PARAM_PATTERNS = [/^utm_/i, /^gclid$/i, /^fbclid$/i, /^gad_source$/i, /^gad_campaignid$/i, /^gbraid$/i, /^wbraid$/i];

function isTrackingParam(name: string): boolean {
  return TRACKING_PARAM_PATTERNS.some((re) => re.test(name));
}

/** Removes tracking query params from a URL string, preserving everything else
 *  (including param order for the params that remain). Returns the input
 *  unchanged if it isn't a parseable URL. */
export function stripTrackingParams(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  const toDelete: string[] = [];
  for (const key of url.searchParams.keys()) {
    if (isTrackingParam(key)) toDelete.push(key);
  }
  for (const key of toDelete) url.searchParams.delete(key);
  return url.toString();
}
