import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2];
if (!["kiroku", "shiftflow", "all"].includes(mode)) {
  console.error("Usage: node scripts/dev.mjs kiroku|shiftflow|all");
  process.exit(1);
}

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.exitCode === null) {
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* already exited */ }
    }
  }
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

function start(cwd, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    detached: true,
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on("error", (error) => { console.error(error.message); stop(1); });
  child.on("exit", (code) => { if (!stopping) stop(code || 1); });
}

const envPath = process.env.DOTENV_CONFIG_PATH
  ? resolve(process.cwd(), process.env.DOTENV_CONFIG_PATH)
  : resolve(root, ".env");

for (const app of mode === "all" ? ["kiroku", "shiftflow"] : [mode]) {
  const shift = app === "shiftflow";
  const cwd = shift ? resolve(root, "shiftflow") : root;
  const webPort = Number(shift ? process.env.DEV_SHIFTFLOW_WEB_PORT ?? 5174 : process.env.DEV_KIROKU_WEB_PORT ?? 5173);
  const apiPort = Number(shift ? process.env.DEV_SHIFTFLOW_API_PORT ?? 8788 : process.env.DEV_KIROKU_API_PORT ?? 8787);
  console.log(`${app}: http://localhost:${webPort} -> /api -> localhost:${apiPort}`);
  start(cwd, resolve(cwd, "node_modules/.bin/vite"), []);
  start(cwd, resolve(root, "node_modules/.bin/tsx"), [
    "watch", shift ? "src/local.ts" : "server/index.ts",
  ], {
    DOTENV_CONFIG_PATH: envPath,
    PORT: String(apiPort),
    HOST: "127.0.0.1",
    NODE_ENV: "development",
  });
}
