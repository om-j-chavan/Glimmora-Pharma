// Thin re-export shim — delegates to the existing Vercel serverless
// handler at /api/auth/login.ts. Source file is NOT moved.
import handler from "../../../api/auth/login";
export default handler;
