import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest as kiroku } from "../functions/api/[[path]]";
import { onRequest as shiftflow } from "../shiftflow/functions/api/[[path]]";

for (const [name, handler, origin] of [
  ["kiroku", kiroku, "https://kiroku-exe.onrender.com"],
  ["shiftflow", shiftflow, "https://shiftflow-api.aimu911563.workers.dev"],
] as const) {
  test(`${name}: proxy preserves request and isolates the upstream`, async (t) => {
    const requests: Request[] = [];
    t.mock.method(globalThis, "fetch", async (request: Request) => {
      requests.push(request);
      return new Response("upstream", { status: 202 });
    });
    const request = () => new Request("https://frontend.example/api/shifts?week_start=2026-10-05&name=a%20b", {
      method: "POST",
      headers: { Authorization: "Bearer test-only", "Content-Type": "application/json" },
      body: JSON.stringify({ test: true }),
    });
    const response = await handler({ request: request() });
    assert.equal(response.status, 202);
    assert.equal(requests[0].url, `${origin}/api/shifts?week_start=2026-10-05&name=a%20b`);
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].headers.get("Authorization"), "Bearer test-only");
    assert.deepEqual(await requests[0].json(), { test: true });
    await handler({ request: request(), env: { API_ORIGIN: "https://staging.example" } });
    assert.equal(new URL(requests[1].url).origin, "https://staging.example");
    const blocked = await handler({ request: request(), env: { API_ORIGIN: "https://frontend.example" } });
    assert.equal(blocked.status, 503);
    for (const API_ORIGIN of ["not a URL", "file:///tmp/api"]) {
      assert.equal((await handler({ request: request(), env: { API_ORIGIN } })).status, 503);
    }
    assert.equal(requests.length, 2);
  });
}
