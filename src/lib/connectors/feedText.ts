/** Some publisher feeds incorrectly serialize a CDATA wrapper as literal
 * text. rss-parser cannot unwrap that because it is no longer real XML CDATA,
 * so normalize it before displaying or sanitizing article fields. */
export function unwrapFeedCdata(value: string | null | undefined): string {
  const text = value || "";
  const match = /^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/.exec(text);
  return (match ? match[1] : text).trim();
}
