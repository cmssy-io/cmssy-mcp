const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const ATTEMPTS = 3;
const BASE_DELAY_MS = 300;

function causeOf(error: unknown): string {
  const cause = (error as { cause?: unknown }).cause;
  const message = (error as { message?: string }).message ?? String(error);
  if (!cause) return message;
  const detail =
    (cause as { code?: string }).code ??
    (cause as { message?: string }).message ??
    String(cause);
  return `${message} (${detail})`;
}

async function describe(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  const trimmed = body.trim().slice(0, 400);
  const status = `${response.status} ${response.statusText}`.trim();
  return trimmed ? `${status} - ${trimmed}` : status;
}

export async function putObject(
  url: string,
  bytes: Uint8Array,
  contentType: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  let last = "";

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: bytes,
      });
    } catch (error) {
      last = causeOf(error);
      if (attempt === ATTEMPTS) break;
      await new Promise((r) =>
        setTimeout(r, BASE_DELAY_MS * 2 ** (attempt - 1)),
      );
      continue;
    }

    if (response.ok) return;

    last = await describe(response);
    if (!RETRYABLE_STATUS.has(response.status) || attempt === ATTEMPTS) break;
    await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** (attempt - 1)));
  }

  throw new Error(`Upload failed: ${last}`);
}
