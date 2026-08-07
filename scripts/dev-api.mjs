/**
 * Cross-platform uvicorn launcher for the FastAPI backend.
 * Points to the separate pharma_glimmora_ai_backend repo.
 *
 * Usage: node scripts/dev-api.mjs
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === "win32";

// Use system uvicorn (globally installed)
const uvicorn = "uvicorn";

// Backend is in the sibling pharma_glimmora_ai_backend repo
const backendPath = resolve(__dirname, "../../pharma_glimmora_ai_backend");

// Note: --reload is intentionally omitted on Windows — WatchFiles + multiprocess
// hangs reliably. Restart the process to pick up changes.
const args = ["app.main:app", "--port", "8000"];
if (!isWin) args.push("--reload");

const child = spawn(uvicorn, args, { cwd: backendPath, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
