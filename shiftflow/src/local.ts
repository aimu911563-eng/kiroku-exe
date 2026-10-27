// Node-only entry point. Workers imports server.ts without starting a listener.
import "dotenv/config";
import { serve } from "@hono/node-server";
import app from "./server";

const port = Number(process.env.PORT ?? 8788);
const hostname = process.env.HOST ?? "127.0.0.1";
serve({
  fetch: (request) => app.fetch(request, process.env as any),
  port,
  hostname,
});
console.log(`ShiftFlow API: http://${hostname}:${port}`);
