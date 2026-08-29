// Detects when a fetched page is a login wall / paywall / bot-challenge page rather
// than the actual article — so we can fall back to RSS-provided content instead of
// treating login-form text as the article body. This never attempts to bypass any
// of these barriers; it only recognizes them so the UI can be honest about it.

const CHALLENGE_TITLE_PATTERNS = [
  /just a moment/i,
  /attention required/i,
  /verify you are human/i,
  /checking your browser/i,
  /驗證您是人類/,
  /請稍候/,
];

const LOGIN_TITLE_PATTERNS = [
  /^sign in/i,
  /^log ?in/i,
  /access denied/i,
  /subscribe to (continue|read)/i,
  /please subscribe/i,
  /members? only/i,
  /登入/,
  /訂閱.*(閱讀|繼續|才能)/,
];

const CHALLENGE_BODY_MARKERS = [
  "cf-browser-verification",
  "cf-challenge-running",
  "id=\"challenge-running\"",
  "challenges.cloudflare.com",
  "checking your browser before accessing",
];

const LOGIN_BODY_MARKERS = [
  "type=\"password\"",
  "name=\"password\"",
  "please log in to continue",
  "please sign in to continue",
];

export type GateResult = "ok" | "login-wall" | "challenge" | "too-short";

const MIN_ARTICLE_TEXT_LENGTH = 200;

export interface GateCheckInput {
  status: number;
  /** First ~5000 characters of the raw HTML is enough — these markers appear early. */
  rawHtmlSample: string;
  readabilityTitle: string | null;
  readabilityTextLength: number;
}

export function detectContentGate(input: GateCheckInput): GateResult {
  if (input.status === 401 || input.status === 403) return "login-wall";
  if (input.status === 429 || input.status === 503) return "challenge";

  const title = (input.readabilityTitle || "").trim();
  const html = input.rawHtmlSample.toLowerCase();

  if (CHALLENGE_TITLE_PATTERNS.some((re) => re.test(title)) || CHALLENGE_BODY_MARKERS.some((m) => html.includes(m))) {
    return "challenge";
  }
  if (LOGIN_TITLE_PATTERNS.some((re) => re.test(title)) || LOGIN_BODY_MARKERS.some((m) => html.includes(m))) {
    return "login-wall";
  }
  if (input.readabilityTextLength < MIN_ARTICLE_TEXT_LENGTH) {
    return "too-short";
  }
  return "ok";
}
