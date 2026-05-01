/**
 * File storage abstraction.
 *
 * Single interface so the production deployment can swap the implementation
 * (Vercel Blob, S3, Azure, Cloudflare R2) by changing one file rather than
 * every server action that touches a file.
 *
 * v1 default: local filesystem under ./uploads/. Suitable for SQLite + dev
 * + self-hosted servers with persistent disks. NOT suitable for Vercel
 * deployments (serverless functions have an ephemeral writable area; files
 * vanish on cold start). The vercel-blob backend is stubbed for now and
 * throws "not implemented" — when the production move forces it, swapping
 * is a 30-line file, not a refactor.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export interface FileStorage {
  /** Persist content under `key`. Returns a URL/identifier the caller can store. */
  save(key: string, content: Buffer, mimeType: string): Promise<{ url: string }>;
  /** Read previously-saved content. Throws if key is missing. */
  read(key: string): Promise<Buffer>;
  /** Storage-level delete (no-op for local fs since soft-delete is metadata-only at DB level). */
  delete(key: string): Promise<void>;
  /** Cheap existence check. */
  exists(key: string): Promise<boolean>;
}

/** Local filesystem backend. Creates ./uploads/<key> next to the project root. */
function createLocalStorage(): FileStorage {
  // process.cwd() is the project root when Next.js runs server actions.
  const baseDir = path.join(process.cwd(), "uploads");

  // Resolve a key to an absolute filesystem path AND defend against any
  // attempt to escape baseDir via "..", absolute paths, etc. This is a
  // belt-and-braces guard — sanitizeFilename should already prevent it
  // upstream, but re-checking at the storage boundary is the right place
  // for a defense-in-depth check.
  function resolveKey(key: string): string {
    const resolved = path.resolve(baseDir, key);
    if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
      throw new Error(`fileStorage: key escapes base directory: ${key}`);
    }
    return resolved;
  }

  return {
    async save(key, content) {
      const target = resolveKey(key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content);
      // The "URL" we return for local fs is the storage key — the download
      // API route at /api/evidence/files/[id] resolves it to bytes.
      return { url: key };
    },
    async read(key) {
      return fs.readFile(resolveKey(key));
    },
    async delete(key) {
      // Soft-delete is metadata-only per Part 11 ALCOA+ Enduring. The file
      // stays on disk so it can be re-attached on a future audit. No-op.
      void key;
    },
    async exists(key) {
      try {
        await fs.access(resolveKey(key));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Stub. Swap to a real Vercel Blob implementation when production demands it. */
function createVercelBlobStorage(): FileStorage {
  const notImplemented = (op: string) => {
    throw new Error(
      `fileStorage(vercel-blob): ${op} not implemented yet. ` +
        `Set FILE_STORAGE_BACKEND=local for now, or wire up @vercel/blob.`,
    );
  };
  return {
    save: () => notImplemented("save"),
    read: () => notImplemented("read"),
    delete: () => notImplemented("delete"),
    exists: () => notImplemented("exists"),
  };
}

export const fileStorage: FileStorage =
  process.env.FILE_STORAGE_BACKEND === "vercel-blob"
    ? createVercelBlobStorage()
    : createLocalStorage();
