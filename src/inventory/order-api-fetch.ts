type RetryOptions = {
  fetchImpl?: typeof fetch;
  firstTimeoutMs?: number;
  secondTimeoutMs?: number;
  retryDelayMs?: number;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(fetchImpl: typeof fetch, input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function shouldRetry(response: Response) {
  if ([502, 503, 504].includes(response.status)) return true;
  const contentType = response.headers.get("content-type") ?? "";
  return response.ok && !contentType.toLowerCase().includes("application/json");
}

export async function orderApiFetch(input: RequestInfo | URL, init: RequestInit = {}, options: RetryOptions = {}) {
  const method = String(init.method ?? "GET").toUpperCase();
  const fetchImpl = options.fetchImpl ?? fetch;
  // Order-admin PUT routes replace the requested state and are safe to replay.
  // This matters when Render sleeps while a manager is editing: the first PUT
  // wakes the service, then the same payload can be sent once more.
  if (!["GET", "HEAD", "PUT"].includes(method)) return fetchImpl(input, init);

  let firstResponse: Response | null = null;
  try {
    firstResponse = await fetchWithTimeout(fetchImpl, input, init, options.firstTimeoutMs ?? 18_000);
    if (!shouldRetry(firstResponse)) return firstResponse;
  } catch {
    // A sleeping Render instance is woken by this first request. Retry below.
  }

  await wait(options.retryDelayMs ?? 1_500);
  return fetchWithTimeout(fetchImpl, input, init, options.secondTimeoutMs ?? 65_000);
}
