// Exercise the Render entry point with a local, read-only database stub.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));
const databaseRequests = [];
const database = createServer((request, response) => {
  databaseRequests.push({ method: request.method, url: request.url });
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "GET") { response.writeHead(405); response.end("{}"); return; }
  response.end("[]");
});
database.listen(0, "127.0.0.1");
await once(database, "listening");
const dbUrl = `http://127.0.0.1:${database.address().port}`;
const env = { ...process.env };
// Reproduce Render with the paused Leave project omitted. Inventory must still boot.
for (const key of Object.keys(env)) if (key.startsWith("LEAVE_") || key.startsWith("ADMIN_")) delete env[key];
const child = spawn("npm", ["start"], {
  cwd: root,
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...env, NODE_ENV: "production", DOTENV_CONFIG_PATH: "/dev/null",
    HOST: "127.0.0.1", PORT: "18887",
    // ShiftFlow's legacy variables deliberately point somewhere unusable. The
    // Inventory request must use only the dedicated Inventory variables.
    SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_ANON_KEY: "test-only",
    SUPABASE_SERVICE_ROLE_KEY: "test-only",
    INVENTORY_SUPABASE_URL: dbUrl,
    INVENTORY_SUPABASE_SERVICE_ROLE_KEY: "test-only", RESEND_API_KEY: "",
  },
});
let output = "";
child.stdout.on("data", (data) => { output += data; });
child.stderr.on("data", (data) => { output += data; });
const exited = once(child, "exit");
const request = (path, init) => fetch(`http://127.0.0.1:18887${path}`, {
  ...init, signal: AbortSignal.timeout(2000),
});
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) throw new Error(output);
    try { if ((await request("/api/health")).ok) { ready = true; break; } } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.ok(ready, output);
  assert.equal((await request("/api/inventory/health")).status, 410);
  assert.equal((await request("/api/inventory/view?store_id=7249")).status, 410);
  assert.equal((await request("/api/public/employees?store_id=7249")).status, 410);
  assert.equal((await request("/api/order/settings?store_id=7249")).status, 200);
  assert.equal((await request("/api/leaves/admin/balances")).status, 410);
  assert.ok(databaseRequests.length > 0);
  assert.ok(databaseRequests.every(({ method }) => method === "GET"));
  console.log("Production start + dedicated Inventory DB read with Leave disabled: PASS (local DB stub only)");
} finally {
  try { process.kill(-child.pid, "SIGTERM"); } catch { /* already exited */ }
  await exited;
  database.close();
  database.closeAllConnections();
}
