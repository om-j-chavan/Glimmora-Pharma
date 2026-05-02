import axios from "axios";
import { store } from "@/store";
import { logout } from "@/store/auth.slice";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api",
  timeout: 15000,
});

type ApiMeta = { startedAt: number; optional?: boolean };

api.interceptors.request.use((config) => {
  const token = store.getState().auth.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Stamp the start time so the response interceptor can compute elapsed ms.
  // Callers can pass `{ optional: true }` in the config to mark this as a
  // best-effort call (e.g. the audit endpoint when no backend is wired);
  // failures will be logged at warn level instead of error.
  const existing = (config as { metadata?: ApiMeta }).metadata ?? {};
  (config as { metadata?: ApiMeta }).metadata = { ...existing, startedAt: performance.now() };
  console.info(`[api] ${(config.method ?? "GET").toUpperCase()} ${config.url} → sending`);
  return config;
});

api.interceptors.response.use(
  (res) => {
    const meta = (res.config as { metadata?: ApiMeta }).metadata;
    const ms = meta ? Math.round(performance.now() - meta.startedAt) : 0;
    console.info(
      `[api] ${(res.config.method ?? "GET").toUpperCase()} ${res.config.url} ✓ ${res.status} (${ms}ms)`,
      res.data,
    );
    return res;
  },
  (err) => {
    const cfg = err.config ?? {};
    const meta = (cfg as { metadata?: ApiMeta }).metadata;
    const ms = meta ? Math.round(performance.now() - meta.startedAt) : 0;
    const status = err.response?.status ?? "network";
    const line = `[api] ${(cfg.method ?? "GET").toUpperCase?.() ?? "?"} ${cfg.url ?? "?"} ✗ ${status} (${ms}ms)`;
    const detail = err.response?.data ?? err.message;
    if (meta?.optional) {
      console.warn(line, detail);
    } else {
      console.error(line, detail);
    }
    if (err.response?.status === 401) {
      store.dispatch(logout());
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);
