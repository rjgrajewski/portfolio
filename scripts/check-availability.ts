/**
 * scripts/check-availability.ts
 *
 * Repeatable regression check for the three AWS services this project
 * depends on, in eu-central-1, using the exact identifiers Phase 0's manual
 * verification already confirmed (see docs/ARCHITECTURE.md § Region and
 * § Reasoning). This script does not re-discover anything — it re-asserts
 * that what was confirmed by hand still works, so a later config change or
 * account issue is caught before it's discovered live.
 *
 * Usage:
 *   AWS_PROFILE=portfolio npm run check-availability
 *
 * Exits non-zero if any check fails.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from "@aws-sdk/client-transcribe-streaming";

const REGION = "eu-central-1";

// Confirmed working form (docs/ARCHITECTURE.md § Reasoning) — the direct
// in-region ID does NOT work for this model. Don't "simplify" this back to
// the in-region form; that was tried and fails with ValidationException.
const BEDROCK_MODEL_ID = "eu.anthropic.claude-haiku-4-5-20251001-v1:0";

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

async function checkBedrock(): Promise<CheckResult> {
  const name = "Bedrock — Claude Haiku 4.5 (eu.* inference profile)";
  const client = new BedrockRuntimeClient({ region: REGION });
  try {
    const res = await client.send(
      new ConverseCommand({
        modelId: BEDROCK_MODEL_ID,
        messages: [
          { role: "user", content: [{ text: "Reply with exactly: OK" }] },
        ],
        inferenceConfig: { maxTokens: 10 },
      }),
    );
    const content = res.output?.message?.content ?? [];
    const text = content.find((c) => "text" in c)?.text ?? "";
    return {
      name,
      ok: text.length > 0,
      detail: text ? `model responded: "${text.trim()}"` : "empty response",
    };
  } catch (err) {
    return { name, ok: false, detail: errMessage(err) };
  }
}

async function checkPolly(voiceId: string, label: string): Promise<CheckResult> {
  const name = `Polly generative — ${label} (${voiceId})`;
  const client = new PollyClient({ region: REGION });
  try {
    const res = await client.send(
      new SynthesizeSpeechCommand({
        Engine: "generative",
        VoiceId: voiceId,
        OutputFormat: "mp3",
        Text: "Test.",
      }),
    );
    const bytes = await res.AudioStream?.transformToByteArray();
    const ok = Boolean(bytes && bytes.length > 0);
    return {
      name,
      ok,
      detail: ok
        ? `${bytes!.length} bytes of audio synthesized`
        : "no audio returned",
    };
  } catch (err) {
    return { name, ok: false, detail: errMessage(err) };
  }
}

/**
 * ~0.5s of silence, 16-bit PCM mono @ 16kHz — enough to open and cleanly
 * complete a streaming session without needing real speech or any audio
 * decoding tooling. This is a reachability/permissions/language-code check,
 * not a transcription-quality check (that was already covered by Phase 0's
 * manual Polly→Transcribe round trip).
 */
function silenceChunks(): Uint8Array[] {
  const bytesPerSample = 2;
  const sampleRateHz = 16000;
  const seconds = 0.5;
  const totalBytes = sampleRateHz * seconds * bytesPerSample;
  const chunkSize = 4000;
  const chunks: Uint8Array[] = [];
  for (let sent = 0; sent < totalBytes; sent += chunkSize) {
    chunks.push(new Uint8Array(Math.min(chunkSize, totalBytes - sent)));
  }
  return chunks;
}

async function* silenceAudioStream() {
  for (const chunk of silenceChunks()) {
    yield { AudioEvent: { AudioChunk: chunk } };
  }
}

async function checkTranscribe(
  languageCode: "en-US" | "en-GB" | "pl-PL",
  label: string,
): Promise<CheckResult> {
  const name = `Transcribe streaming — ${label}`;
  const client = new TranscribeStreamingClient({ region: REGION });
  try {
    const res = await client.send(
      new StartStreamTranscriptionCommand({
        LanguageCode: languageCode,
        MediaEncoding: "pcm",
        MediaSampleRateHertz: 16000,
        AudioStream: silenceAudioStream(),
      }),
    );

    let sawEvent = false;
    if (res.TranscriptResultStream) {
      for await (const event of res.TranscriptResultStream) {
        sawEvent = true;
        if (event.TranscriptEvent) break; // session responded — enough
      }
    }
    return {
      name,
      ok: sawEvent,
      detail: sawEvent
        ? "streaming session established and responded"
        : "no events received before the stream closed",
    };
  } catch (err) {
    return { name, ok: false, detail: errMessage(err) };
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function main() {
  const profile = process.env.AWS_PROFILE ?? "(default credential chain)";
  console.log(`Checking AWS service availability in ${REGION} (profile: ${profile})\n`);

  const results: CheckResult[] = [];
  results.push(await checkBedrock());
  results.push(await checkPolly("Ola", "Polish"));
  results.push(await checkPolly("Danielle", "English (en-US)"));
  results.push(await checkTranscribe("en-US", "en-US"));
  results.push(await checkTranscribe("en-GB", "en-GB"));
  results.push(await checkTranscribe("pl-PL", "pl-PL"));

  for (const r of results) {
    console.log(`${r.ok ? "✅ PASS" : "❌ FAIL"}  ${r.name} — ${r.detail}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
