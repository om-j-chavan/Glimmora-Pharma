// Thin re-export shim — delegates to the existing Vercel serverless
// handler at /api/debug-env.ts. Source file is NOT moved.
import handler from "../../api/debug-env";
export default handler;
