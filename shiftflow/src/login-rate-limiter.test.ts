import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LoginRateLimiter } from "./login-rate-limiter";

function limiter() {
  const values = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => values.get(key),
    put: async (key: string, value: unknown) => { values.set(key, value); },
    delete: async (key: string) => values.delete(key),
    transaction: async (callback: (txn: any) => Promise<Response>) => callback(storage),
  };
  return new LoginRateLimiter({ storage });
}

async function consume(subject: LoginRateLimiter, limit = 2) {
  const response = await subject.fetch(new Request(`https://rate-limit.internal/consume?limit=${limit}&window_ms=900000`, { method: "POST" }));
  return response.json() as Promise<{ allowed: boolean; retryAfter: number }>;
}

describe("persistent login rate limiter", () => {
  it("blocks attempts after the configured limit", async () => {
    const subject = limiter();
    assert.equal((await consume(subject)).allowed, true);
    assert.equal((await consume(subject)).allowed, true);
    const blocked = await consume(subject);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfter > 0);
  });

  it("resets after a successful login", async () => {
    const subject = limiter();
    await consume(subject, 1);
    await subject.fetch(new Request("https://rate-limit.internal/reset", { method: "POST" }));
    assert.equal((await consume(subject, 1)).allowed, true);
  });

  it("releases attempts consumed by server failures", async () => {
    const subject = limiter();
    await consume(subject, 1);
    await subject.fetch(new Request("https://rate-limit.internal/release", { method: "POST" }));
    assert.equal((await consume(subject, 1)).allowed, true);
  });
});
