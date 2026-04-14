// Thin re-export shim — delegates to the existing Vercel serverless
// handler at /api/tenants.ts. Source file is NOT moved.
import handler from "../../api/tenants";
export default handler;
