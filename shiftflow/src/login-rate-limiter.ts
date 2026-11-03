type LoginRateLimitRecord = { count: number; resetAt: number };

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

export class LoginRateLimiter {
  private readonly state: { storage: any };

  constructor(state: { storage: any }) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    if (url.pathname === "/reset") {
      await this.state.storage.delete("attempts");
      return Response.json({ ok: true });
    }

    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 1));
    const windowMs = Math.max(1_000, Math.min(24 * 60 * 60 * 1000, Number(url.searchParams.get("window_ms")) || DEFAULT_WINDOW_MS));
    const now = Date.now();

    if (url.pathname === "/release") {
      await this.state.storage.transaction(async (txn: any) => {
        const current = await txn.get("attempts") as LoginRateLimitRecord | undefined;
        if (!current || current.resetAt <= now || current.count <= 1) await txn.delete("attempts");
        else await txn.put("attempts", { ...current, count: current.count - 1 });
      });
      return Response.json({ ok: true });
    }

    if (url.pathname !== "/consume") return new Response("Not Found", { status: 404 });

    return this.state.storage.transaction(async (txn: any) => {
      const stored = await txn.get("attempts") as LoginRateLimitRecord | undefined;
      const current = !stored || stored.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : stored;
      if (current.count >= limit) {
        return Response.json({ allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) });
      }
      await txn.put("attempts", { ...current, count: current.count + 1 });
      return Response.json({ allowed: true, retryAfter: 0 });
    });
  }
}
