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
});
