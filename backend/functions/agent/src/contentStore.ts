/**
 * Knowledge corpus access (docs/ARCHITECTURE.md § Knowledge / content
 * retrieval — "Decision: Option C, hybrid tool-fetch. No vector store.").
 *
 * Phase 2 default: the `content/` tree is COPIED INTO the Lambda bundle
 * (backend/infra/lib/api-stack.ts `commandHooks.afterBundling`) and read
 * from the local filesystem. That is the "bundled with the Lambda for the
 * earliest MVP" path.
 *
 * The S3 seam is real, not a stub: set `CONTENT_BUCKET` (and optionally
 * `CONTENT_PREFIX`, e.g. `dev/`) and every read switches to S3 GetObject —
 * the same bucket scripts/sync-content.ts pushes to. Nothing else changes.
 *
 * Reads are memoised for the life of the container, so a warm invocation
 * touches neither the filesystem nor S3.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Manifest } from "./types";

const CONTENT_ROOT = process.env.CONTENT_ROOT ?? join(__dirname, "content");
const BUCKET = process.env.CONTENT_BUCKET;
const PREFIX = process.env.CONTENT_PREFIX ?? "";

const cache = new Map<string, string>();
let s3: S3Client | undefined;

async function read(relPath: string): Promise<string> {
  const hit = cache.get(relPath);
  if (hit !== undefined) return hit;

  let text: string;
  if (BUCKET) {
    s3 ??= new S3Client({});
    const res = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: `${PREFIX}${relPath}` }),
    );
    text = await res.Body!.transformToString();
  } else {
    text = await readFile(join(CONTENT_ROOT, relPath), "utf8");
  }

  cache.set(relPath, text);
  return text;
}

export async function getCore(): Promise<string> {
  return read("core/core.md");
}

export async function getManifest(): Promise<Manifest> {
  return JSON.parse(await read("manifest.json")) as Manifest;
}

export class ContentNotFoundError extends Error {}

/**
 * Fetch one depth file. `topic`/`layer` are already validated against the
 * tool schema by the caller; a miss here (file genuinely absent) throws
 * ContentNotFoundError so the handler can return a `status: "error"` tool
 * result rather than failing the turn.
 */
export async function getTopicContent(
  topic: string,
  layer: string,
): Promise<string> {
  try {
    return await read(`topics/${topic}.${layer}.md`);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT" || e.name === "NoSuchKey") {
      throw new ContentNotFoundError(`no content for ${topic}.${layer}`);
    }
    throw err;
  }
}
