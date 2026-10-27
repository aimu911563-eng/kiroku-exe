// Starts isolated local servers with dummy credentials. Never queries a database.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const child = spawn(process.execPath, ["scripts/dev.mjs", "all"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    DOTENV_CONFIG_PATH: "/dev/null",
    DEV_KIROKU_WEB_PORT: "18773",
    DEV_KIROKU_API_PORT: "18787",
    DEV_SHIFTFLOW_WEB_PORT: "18774",
    DEV_SHIFTFLOW_API_PORT: "18788",
    SUPABASE_URL: "http://127.0.0.1:9",
    SUPABASE_SERVICE_ROLE_KEY: "smoke-test-only",
    LEAVE_SUPABASE_URL: "http://127.0.0.1:9",
    LEAVE_SUPABASE_SERVICE_ROLE_KEY: "smoke-test-only",
    RESEND_API_KEY: "",
    ADMIN_TOKEN_SECRET: "smoke-test-only",
    EMPLOYEE_TOKEN_SECRET: "smoke-test-only",
  },
});
let output = "";
child.stdout.on("data", (data) => { output += data; });
child.stderr.on("data", (data) => { output += data; });
const exited = new Promise((resolve) => child.once("exit", resolve));
const get = (port, path) => fetch(`http://127.0.0.1:${port}${path}`, {
  signal: AbortSignal.timeout(1000),
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(`Startup failed: ${output}`);
    try {
      const results = await Promise.all([18773, 18774].map((port) => get(port, "/api/health")));
      if (results.every((response) => response.ok)) { ready = true; break; }
    } catch { /* Wait for listeners. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, `Servers did not become ready: ${output}`);
  for (const [web, api, service, pages] of [
    [18773, 18787, "kiroku-api", ["/", "/admin.html", "/inventory.html", "/inventory-admin.html", "/inventory-date.html", "/order.html", "/insight.html"]],
    [18774, 18788, "shiftflow-api", ["/", "/admin.html", "/worktime.html", "/worktime-admin.html"]],
  ]) {
    for (const port of [web, api]) {
      assert.deepEqual(await (await get(port, "/api/health")).json(), { ok: true, service });
    }
    for (const page of pages) assert.equal((await get(web, page)).status, 200, `${web}${page}`);
    console.log(`${service}: correct proxy, direct health and ${pages.length} HTML pages`);
  }
  assert.equal((await get(18773, "/api/shifts")).status, 404);
  assert.equal((await get(18774, "/api/inventory/health")).status, 404);
  assert.equal((await get(18773, "/api/inventory/view?store_id=7249")).status, 410);
  console.log("App routes are isolated; no database requests were made.");
} finally {
  child.kill("SIGTERM");
  await exited;
}
