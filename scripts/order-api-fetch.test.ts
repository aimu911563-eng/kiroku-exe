import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderApiFetch } from "../src/inventory/order-api-fetch";

const options = { firstTimeoutMs: 100, secondTimeoutMs: 100, retryDelayMs: 0 };

describe("order API cold-start retry", () => {
  it("retries a safe GET after an upstream cold-start response", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return calls === 1
        ? Response.json({ error: "starting" }, { status: 503 })
        : Response.json({ ok: true });
    };
    const response = await orderApiFetch("https://example.test/api/order/settings", {}, { ...options, fetchImpl });
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  });

  it("does not retry writes that could be applied twice", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return Response.json({ error: "starting" }, { status: 503 });
    };
    const response = await orderApiFetch("https://example.test/api/order/input", { method: "POST" }, { ...options, fetchImpl });
    assert.equal(response.status, 503);
    assert.equal(calls, 1);
  });

  it("retries an idempotent admin PUT after an upstream cold-start response", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return calls === 1
        ? Response.json({ error: "starting" }, { status: 503 })
        : Response.json({ ok: true });
    };
    const response = await orderApiFetch("https://example.test/api/order/admin/items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [] }),
    }, { ...options, fetchImpl });
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  });

  it("returns authentication failures without retrying", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    };
    const response = await orderApiFetch("https://example.test/api/order/admin/items", {}, { ...options, fetchImpl });
    assert.equal(response.status, 401);
    assert.equal(calls, 1);
  });

  it("retries a Cloudflare HTML challenge and recovers", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return calls === 1
        ? new Response("<html>challenge</html>", { status: 429, headers: { "Content-Type": "text/html" } })
        : Response.json({ ok: true });
    };
    const response = await orderApiFetch("https://example.test/api/order/settings", {}, { ...options, fetchImpl });
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  });

  it("turns a persistent HTML challenge into a readable temporary error", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response("<html>challenge</html>", { status: 429, headers: { "Content-Type": "text/html" } });
    };
    const response = await orderApiFetch("https://example.test/api/order/calc", {}, { ...options, fetchImpl });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: "発注サーバーを起動しています。少し待ってから再読み込みしてください" });
    assert.equal(calls, 2);
  });

  it("does not retry an intentional JSON rate limit", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return Response.json({ ok: false, error: "試行回数が多すぎます" }, { status: 429 });
    };
    const response = await orderApiFetch("https://example.test/api/order/admin/login", {}, { ...options, fetchImpl });
    assert.equal(response.status, 429);
    assert.equal(calls, 1);
  });
});
