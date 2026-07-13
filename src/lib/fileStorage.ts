/**
 * File storage abstraction.
 *
 * Swap the backend by setting FILE_STORAGE_BACKEND:
 *   local      — local filesystem ./uploads/ (dev + self-hosted with persistent disk)
 *   do-spaces  — DigitalOcean Spaces (S3-compatible); required on App Platform
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export interface FileStorage {
  save(key: string, content: Buffer, mimeType: string): Promise<{ url: string }>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// ── Local filesystem ─────────────────────────────────────────────────────────

function createLocalStorage(): FileStorage {
  const baseDir = path.join(process.cwd(), "uploads");

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
      return { url: key };
    },
    async read(key) {
      return fs.readFile(resolveKey(key));
    },
    async delete(key) {
      // Soft-delete is metadata-only per Part 11 ALCOA+ Enduring.
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

// ── DigitalOcean Spaces (S3-compatible) ──────────────────────────────────────
// Required env vars:
//   DO_SPACES_ENDPOINT  — e.g. https://nyc3.digitaloceanspaces.com
//   DO_SPACES_REGION    — e.g. nyc3
//   DO_SPACES_KEY       — Spaces access key
//   DO_SPACES_SECRET    — Spaces secret key
//   DO_SPACES_BUCKET    — bucket name

function createSpacesStorage(): FileStorage {
  // Lazy-load so the SDK is only imported in production; keeps dev cold-start fast.
  async function getClient() {
    const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } =
      await import("@aws-sdk/client-s3");

    const endpoint = process.env.DO_SPACES_ENDPOINT;
    const region = process.env.DO_SPACES_REGION ?? "nyc3";
    const accessKeyId = process.env.DO_SPACES_KEY;
    const secretAccessKey = process.env.DO_SPACES_SECRET;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "fileStorage(do-spaces): DO_SPACES_ENDPOINT, DO_SPACES_KEY, and DO_SPACES_SECRET must be set",
      );
    }

    const client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: false,
    });

    return { client, S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand };
  }

  function bucket(): string {
    const b = process.env.DO_SPACES_BUCKET;
    if (!b) throw new Error("fileStorage(do-spaces): DO_SPACES_BUCKET must be set");
    return b;
  }

  return {
    async save(key, content, mimeType) {
      const { client, PutObjectCommand } = await getClient();
      await client.send(
        new PutObjectCommand({
          Bucket: bucket(),
          Key: key,
          Body: content,
          ContentType: mimeType,
          // Private — files are served through the Next.js download API, never directly.
          ACL: "private",
        }),
      );
      return { url: key };
    },

    async read(key) {
      const { client, GetObjectCommand } = await getClient();
      const res = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
      if (!res.Body) throw new Error(`fileStorage(do-spaces): empty body for key ${key}`);
      // transformToByteArray is available on the Spaces/S3 SDK response Body (readable stream).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bytes = await (res.Body as any).transformToByteArray();
      return Buffer.from(bytes);
    },

    async delete(key) {
      // Soft-delete is metadata-only per Part 11 ALCOA+ Enduring. Object stays in Spaces.
      void key;
    },

    async exists(key) {
      try {
        const { client, HeadObjectCommand } = await getClient();
        await client.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
        return true;
      } catch {
        return false;
      }
    },
  };
}

// ── Export ───────────────────────────────────────────────────────────────────

const backend = process.env.FILE_STORAGE_BACKEND ?? "local";

export const fileStorage: FileStorage =
  backend === "do-spaces" ? createSpacesStorage() : createLocalStorage();
