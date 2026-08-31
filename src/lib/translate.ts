// Translation providers, tried in order:
// 1. Azure Translator (if AZURE_TRANSLATOR_KEY is set) — reliable, generous free tier (2M chars/month),
//    supports true batch requests (dozens of texts in one call).
// 2. MyMemory's free public API (no signup) — best-effort fallback. It has a very tight anonymous
//    rate limit, so under real load (100+ article titles) most calls will fail; on failure we always
//    fall back to showing the original English text rather than breaking the page.

const AZURE_ENDPOINT = "https://api.cognitive.microsofttranslator.com/translate";
const AZURE_BATCH_SIZE = 90;

const MYMEMORY_ENDPOINT = "https://api.mymemory.translated.net/get";
const MYMEMORY_MAX_CHUNK_LENGTH = 450;
const TRANSLATE_CACHE_SECONDS = 60 * 60 * 24 * 14;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toAzureLang(targetLang: string): string {
  return targetLang === "zh-TW" ? "zh-Hant" : targetLang;
}

async function translateBatchAzure(texts: string[], targetLang: string): Promise<string[]> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  if (!key) throw new Error("Azure Translator not configured");

  const url = `${AZURE_ENDPOINT}?api-version=3.0&to=${toAzureLang(targetLang)}`;
  const region = process.env.AZURE_TRANSLATOR_REGION;

  const results: string[] = new Array(texts.length);
  for (let start = 0; start < texts.length; start += AZURE_BATCH_SIZE) {
    const batch = texts.slice(start, start + AZURE_BATCH_SIZE);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        ...(region ? { "Ocp-Apim-Subscription-Region": region } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batch.map((text) => ({ Text: text }))),
    });
    if (!res.ok) {
      throw new Error(`Azure Translate HTTP ${res.status}`);
    }
    const data = (await res.json()) as { translations: { text: string }[] }[];
    data.forEach((item, i) => {
      results[start + i] = item.translations[0]?.text ?? batch[i];
    });
  }
  return results;
}

function splitIntoChunks(text: string): string[] {
  if (text.length <= MYMEMORY_MAX_CHUNK_LENGTH) return [text];

  const sentences = text.split(/(?<=[.!?。!?])\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && (current + " " + sentence).length > MYMEMORY_MAX_CHUNK_LENGTH) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text.slice(0, MYMEMORY_MAX_CHUNK_LENGTH)];
}

interface MyMemoryResponse {
  responseData?: { translatedText?: string };
  responseStatus?: number | string;
}

async function translateChunkMyMemory(text: string, targetLang: string): Promise<string> {
  const url = `${MYMEMORY_ENDPOINT}?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ArchNewsReader/1.0)" },
    next: { revalidate: TRANSLATE_CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`Translate HTTP ${res.status}`);
  const data = (await res.json()) as MyMemoryResponse;
  if (data.responseStatus && Number(data.responseStatus) !== 200) {
    throw new Error(`Translate status ${data.responseStatus}`);
  }
  const translated = data.responseData?.translatedText;
  if (!translated) throw new Error("Empty translation");
  return translated;
}

async function translateOneMyMemory(text: string, targetLang: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const chunks = splitIntoChunks(trimmed);
  const translatedChunks = await Promise.all(chunks.map((c) => translateChunkMyMemory(c, targetLang)));
  return translatedChunks.join(" ");
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export interface TranslateManyOptions {
  /** Limits requests to the slow public fallback. Azure batch translation, when
   * configured, still translates the complete input. Untranslated entries
   * retain their original text. */
  maxFallbackItems?: number;
}

/** Translates each string; falls back to the original text on failure. Empty strings pass through. */
export async function translateMany(
  texts: string[],
  targetLang = "zh-TW",
  options: TranslateManyOptions = {},
): Promise<string[]> {
  const nonEmptyIndexes = texts
    .map((t, i) => (t.trim() ? i : -1))
    .filter((i) => i !== -1);
  if (nonEmptyIndexes.length === 0) return texts;

  if (process.env.AZURE_TRANSLATOR_KEY) {
    try {
      const toTranslate = nonEmptyIndexes.map((i) => texts[i]);
      const translated = await translateBatchAzure(toTranslate, targetLang);
      const result = [...texts];
      nonEmptyIndexes.forEach((idx, i) => {
        result[idx] = translated[i] || texts[idx];
      });
      return result;
    } catch (err) {
      // Translation is an enhancement, not a requirement for rendering the
      // news page. In Next.js development mode console.error opens a red error
      // overlay even though the fallback below succeeds, so keep this as a
      // concise warning without an error stack.
      console.warn(`Azure translation unavailable; using MyMemory: ${errorMessage(err)}`);
    }
  }

  const fallbackIndexes = nonEmptyIndexes.slice(0, options.maxFallbackItems ?? nonEmptyIndexes.length);
  if (fallbackIndexes.length === 0) return texts;

  let failureCount = 0;
  let firstFailure: unknown = null;
  const translatedFallback = await mapWithConcurrency(fallbackIndexes, 4, async (index) => {
    try {
      return await translateOneMyMemory(texts[index], targetLang);
    } catch (err) {
      failureCount++;
      firstFailure ??= err;
      return texts[index];
    }
  });
  const result = [...texts];
  fallbackIndexes.forEach((index, i) => {
    result[index] = translatedFallback[i] || texts[index];
  });

  // One summary line instead of one stack trace per failed chunk — MyMemory's free
  // tier rate-limits hard under real load, so a batch of 100+ articles can otherwise
  // print hundreds of near-identical errors for what is really a single condition.
  if (failureCount > 0) {
    console.warn(
      `Translation unavailable for ${failureCount}/${fallbackIndexes.length} attempted item(s); showing original text. ` +
        `First failure: ${errorMessage(firstFailure)}`,
    );
  }

  return result;
}

export async function translateText(text: string, targetLang = "zh-TW"): Promise<string> {
  const [result] = await translateMany([text], targetLang);
  return result;
}
