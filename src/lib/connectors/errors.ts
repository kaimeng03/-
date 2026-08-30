/**
 * Stable error codes for the connector/discovery architecture. These are all
 * *expected* outcomes (a site with no feed, a rate-limited provider, a bot
 * challenge...) — never logged with console.error, since that's reserved for
 * genuinely unexpected programming errors (see AGENTS.md / README "錯誤處理").
 */
export type ConnectorErrorCode =
  | "INVALID_URL"
  | "UNSAFE_URL"
  | "NO_FEED_FOUND"
  | "INVALID_FEED"
  | "ACCESS_BLOCKED"
  | "LOGIN_REQUIRED"
  | "RATE_LIMITED"
  | "FETCH_TIMEOUT"
  | "UNSUPPORTED_SOURCE"
  | "DUPLICATE_SUBSCRIPTION"
  | "PROVIDER_UNAVAILABLE"
  | "NO_RESULTS";

export class ConnectorError extends Error {
  code: ConnectorErrorCode;
  retryAfter?: number;

  constructor(code: ConnectorErrorCode, message: string, retryAfter?: number) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const STATUS_BY_CODE: Record<ConnectorErrorCode, number> = {
  INVALID_URL: 400,
  UNSAFE_URL: 400,
  NO_FEED_FOUND: 404,
  INVALID_FEED: 400,
  ACCESS_BLOCKED: 403,
  LOGIN_REQUIRED: 403,
  RATE_LIMITED: 429,
  FETCH_TIMEOUT: 504,
  UNSUPPORTED_SOURCE: 400,
  DUPLICATE_SUBSCRIPTION: 409,
  PROVIDER_UNAVAILABLE: 502,
  NO_RESULTS: 404,
};

/** Turns a ConnectorError (or an unexpected error) into a stable API response
 *  body — errorCode + a message with no secrets, never a stack trace. Genuine
 *  bugs still get logged (console.error), but expected/handled conditions
 *  (429, no feed, blocked, timeout...) never do — see README "錯誤處理". */
export function connectorErrorResponse(err: unknown): { body: { errorCode: string; message: string; retryAfter?: number }; status: number } {
  if (err instanceof ConnectorError) {
    return {
      body: { errorCode: err.code, message: err.message, ...(err.retryAfter ? { retryAfter: err.retryAfter } : {}) },
      status: STATUS_BY_CODE[err.code],
    };
  }
  console.error("Unexpected connector error:", err instanceof Error ? err.message : err);
  return { body: { errorCode: "PROVIDER_UNAVAILABLE", message: "發生未預期的錯誤，請稍後再試" }, status: 502 };
}
