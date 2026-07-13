/**
 * Cross-platform uvicorn launcher for the FastAPI backend.
 * Windows can't run `. .venv/bin/activate && uvicorn …` (bash-only).
 *
 * Usage: node scripts/dev-api.mjs
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const isWin = process.platform === "win32";
const uvicorn = resolve(
  "backend",
  ".venv",
  isWin ? "Scripts" : "bin",
  isWin ? "uvicorn.exe" : "uvicorn",
);

// Note: --reload is intentionally omitted on Windows — WatchFiles + multiprocess
// hangs reliably. Restart the process to pick up changes.
const args = ["app.main:app", "--port", "8000"];
if (!isWin) args.push("--reload");

const child = spawn(uvicorn, args, { cwd: "backend", stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
