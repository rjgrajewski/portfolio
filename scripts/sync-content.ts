/**
 * scripts/sync-content.ts
 *
 * Push the local `content/` corpus to the S3 content bucket under the env
 * prefix (`dev/` or `prod/`) — docs/ARCHITECTURE.md § Data stores. The
 * Phase 2 Lambda reads the bundled copy of `content/`, not S3; this script
 * exists so the S3 path is ready the moment `CONTENT_BUCKET` is set on the
 * function (contentStore.ts), and so Phase 8's authoring pass has a
 * one-command publish.
 *
 * Usage:
 *   AWS_PROFILE=portfolio npm run content:sync -- --env dev
 *   AWS_PROFILE=portfolio npm run content:sync -- --env prod --dry-run
 *
 * Bucket name is derived (not looked up) from backend/infra/lib/config.ts,
 * so this stays in lockstep with what api-stack.ts creates.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import {
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { contentBucketName, type EnvName } from "../backend/infra/lib/config";

const REGION = "eu-central-1";
const CONTENT_DIR = fileURLToPath(new URL("../content", import.meta.url));

function parseArgs(argv: string[]): { env: EnvName; dryRun: boolean } {
  let env: EnvName = "dev";
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--env") {
      const v = argv[++i];
      if (v !== "dev" && v !== "prod") {
        throw new Error(`--env must be "dev" or "prod" (got "${v ?? ""}")`);
      }
      env = v;
    } else if (a === "--dry-run") {
      dryRun = true;
    }
  }
  return { env, dryRun };
}

function contentType(file: string): string {
  if (file.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (file.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir)) {
    // Skip macOS junk and other dotfiles; README.md is the authoring
    // guide, not corpus the agent reads.
    if (entry.startsWith(".") || entry === "README.md") continue;
    const full = path.join(dir, entry);
    if ((await stat(full)).isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

async function main() {
  const { env, dryRun } = parseArgs(process.argv.slice(2));
  const bucket = contentBucketName(env);
  const prefix = `${env}/`;
  const s3 = new S3Client({ region: REGION });

  console.log(
    `${dryRun ? "[dry run] " : ""}syncing content/ -> s3://${bucket}/${prefix}\n`,
  );

  let count = 0;
  for await (const file of walk(CONTENT_DIR)) {
    const rel = path
      .relative(CONTENT_DIR, file)
      .split(path.sep)
      .join("/");
    const key = `${prefix}${rel}`;
    if (dryRun) {
      console.log(`  would put  ${key}`);
    } else {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: await readFile(file),
          ContentType: contentType(file),
        }),
      );
      console.log(`  put  ${key}`);
    }
    count++;
  }

  console.log(`\n${dryRun ? "would sync" : "synced"} ${count} file(s).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
