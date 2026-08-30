# Voice notes

EN/PL voice-identity findings for the Polly generative path. Companion to
[ARCHITECTURE.md § Text-to-speech](ARCHITECTURE.md#text-to-speech--amazon-polly-generative-tier)
and [ROADMAP Phase 4 / Phase 5](ROADMAP.md). Short decisions also land in
[DECISIONS.md](DECISIONS.md).

---

## English voice — `Ruth` (en-US, generative). Chosen 2026-08-30 (Phase 4).

Picked from the **confirmed** Frankfurt generative roster (Phase 0 real-synthesis
check, ARCHITECTURE.md § Region):

- **en-US:** Danielle, Joanna, Matthew, Ruth, Salli, Stephen, Tiffany
- **en-GB:** Amy, Brian

This is Phase 4, which is **English only** — so this choice resolves the
English half of **OQ-7** now; the tonal pairing with the Polish voice is
confirmed in Phase 5 when `Ola`/`Ewa` are actually wired.

### Why `Ruth`

- **Register fits the product.** The agent speaks *about* Rafal to a recruiter —
  measured, credible, a little warm. `Ruth` is Polly's calm
  newsreader/narration generative voice: even pace, low affect, reads long
  clauses without getting sing-song. `Joanna` and `Salli` skew brighter /
  more "assistant"; `Danielle` is closer but slightly breathier; `Matthew`
  and `Stephen` are the male options (kept as alternates, not chosen — the
  agent isn't Rafal in the first person, so a "his voice" reading would be
  wrong anyway).
- **Sentence-chunked playback tolerates it.** Because TTS is sentence-by-sentence
  `SynthesizeSpeech` (OQ-4 below), a voice that stays even across short
  independent chunks matters more than one with big expressive range. `Ruth`
  concatenates cleanly chunk-to-chunk; the brighter voices expose the seams.
- **Pairs forward to Polish.** `Ola` and `Ewa` (the confirmed PL generative
  voices) are both calm mid-pitch female voices. A same-family EN choice
  (`Ruth`) keeps the agent sounding like one persona across a Phase-5
  language switch. If Phase 5 testing disagrees, `Amy` (en-GB) is the first
  fallback — also calm, slightly more formal.

### How it's wired

`frontend/src/agent/tts.ts` — `VOICE_ID = "Ruth"`, `Engine: "generative"`,
`OutputFormat: "mp3"`. Region `eu-central-1`. One constant to change if the
listening test later prefers another name.

### Verified

`Ruth` generative synthesised in `eu-central-1` on 2026-08-30, both `mp3`
(browser playback path) and `pcm` 16 kHz, using the **scoped guest
credentials** from the vending Lambda (not an admin profile) — and round-
tripped through Transcribe (`"The quick brown fox jumps over the lazy dog."`
back verbatim). So the exact browser-direct call path is proven.

---

## STT sample-rate fix (2026-08-30)

First staging test: Transcribe accepted the WebSocket handshake (101) then
killed the session with a non-retryable error — "the audio doesn't match the
parameters you provided". Cause: the request declares `sample-rate=16000`,
but the first `stt.ts` captured at the `AudioContext`'s native rate
(44100/48000 on Safari — the `getUserMedia` `{sampleRate:16000}` constraint
is advisory and Safari ignores it) and only did a crude per-`ScriptProcessorNode`-
block decimation with no state across blocks. Approximately-16 kHz with
boundary discontinuities ≠ the declared contract.

Fix (`frontend/src/agent/pcmChunker.ts` + rewritten `stt.ts`):

- `new AudioContext({ sampleRate: 16000 })` — the reliable request (still not
  guaranteed), and the actual `audioContext.sampleRate` is logged to the
  console at capture start so a future staging run shows what the browser
  did.
- An **AudioWorklet** resamples continuously to exactly 16 kHz — linear
  interpolation with the fractional read position and the unconsumed input
  tail carried across every 128-frame quantum, so there is no block-boundary
  artifact; pass-through when the context is already 16 kHz. Chosen over
  `OfflineAudioContext` (which renders fixed-length buffers → one instance
  per block, async in the hot path, and no resampler state between blocks —
  the artifact returns) and over keeping `ScriptProcessorNode` (deprecated,
  main-thread, unreliable on Safari 26).
- Output is signed 16-bit little-endian mono PCM, batched to 100 ms / 3200-
  byte chunks (Transcribe streaming's preferred size).
- `scripts/verify-resampler.ts` (`npm run verify-resampler`) proves it in
  Node against 48k/44.1k/16k inputs: duration preserved to <0.5%, 440 Hz
  tone stays 440 Hz, valid s16le, and the generated worklet string parses.
  11/11.

Still needs the live mic pass on staging (Safari 26 desktop + phone).

## STT IAM action (2026-08-30)

Second staging test, after the sample-rate fix: audio was correct (logs
confirmed `sampleRate = 16000 Hz … pass-through` and `first PCM chunk: 3200
bytes … s16le`) but Transcribe returned, post-handshake,
`AccessDeniedException … not authorized to perform:
transcribe:StartStreamTranscriptionWebSocket`. The browser SDK reaches
Transcribe streaming over a **presigned WebSocket**, which is a *separate
IAM action* from the HTTP/2 `transcribe:StartStreamTranscription` the Node
SDK (and `scripts/check-availability.ts`) uses. The guest role had only the
HTTP/2 form.

Fix: `portfolio-media-guest-<env>` now grants
`transcribe:StartStreamTranscriptionWebSocket` and **not** the HTTP/2 form
(these creds are browser-only). `polly:SynthesizeSpeech` was checked for the
same trap — Polly synth has no WebSocket/streaming action variant, so it was
already correct. Regression guard: `npm run verify-oq8`.

## TTS never ran — the stop latch (2026-08-30)

Third staging test: input voice worked, the agent answered, but **zero
Polly traffic** and no error. `createSpeechPlayer`'s `stop()` set a
`stopped` flag that nothing ever cleared, and `useConversation.runTurn`
called `player.stop()` at the top of every turn — so by the first text
frame the synth path was latched off. The mic-less pane never exercised it
(`runTurn({speak:true})` is only reached after a real transcript).

Fix: a spoken answer is now an explicit **utterance** — `begin()` halts
prior playback and re-arms the player; `runTurn` calls `begin()` (not
`stop()`) for a spoken turn; an epoch counter drops late Polly/decode
results from a superseded utterance. `[tts] …` / `[voice] …` console logging
was added so the next regression is visible, not inferred. Verified from a
real browser end to end (begin → chunk → Polly → decode → schedule →
onStart/onIdle) — see DECISIONS.md.

## Barge-in — hands-free session + echo defence (2026-08-30)

Voice worked end to end on staging, but the mic went dead while the agent
spoke. `stt.ts` is now `createVoiceSession`: one persistent mic + 16 kHz
AudioContext + worklet, `monitoring` ↔ `capturing`, a 500 ms pre-roll ring
so barge-in doesn't clip the first word. Speak any time — including over the
agent — and it stops instantly and listens; the partial answer stays in the
transcript flagged `interrupted`.

Echo (mic hears the agent, phone, no headphones):

| layer | value | job |
|---|---|---|
| `echoCancellation` + `noiseSuppression` | on | device AEC removes most echo |
| adaptive trigger | `max(0.014, echoFloor × 3.0)` | tracks *this* device's residual echo, measured live |
| sustain | 3 chunks (~300 ms) | rejects taps / clicks / one loud syllable |
| **guard window** | **700 ms after every playback start** | **loop protection** — disarmed while AEC converges + echo floor is seeded |

Echo-floor tracker: seeded fast during the guard window, then a
lower-envelope follower (steady echo pulls it up, a user-speech burst does
not). A first attempt that only learned from sub-threshold samples
self-triggered on any echo above the starting threshold — caught by
`npm run verify-vad` (11/11; pure logic in `vad.ts`).

Tuning from a cabled console: `[voice] levels rms=… thr=… echoFloor=…
armed=…` prints every ~900 ms *while the agent speaks*. If the agent
self-interrupts, `echoMargin` / `guardMs` / `sustainChunks` in
`DEFAULT_VAD` are the knobs.

**Not verified without hardware:** the real acoustic loop (does a given
phone's post-AEC echo actually stay under 3× floor, does user speech land
where the thresholds expect), `createVoiceSession` mic→onset→capture
assembly, and a live barge during a real answer. The decision logic, the
resampler, the Transcribe IAM path and `player.stop()` epoch-cancel are each
verified separately.

## OQ-4 — Polly bidirectional streaming. Resolved 2026-08-30: not browser-reachable → sentence chunking.

**Finding.** Amazon Polly shipped a real bidirectional streaming API,
`StartSpeechSynthesisStream` (announced 2026-03), generative engine only,
over HTTP/2 event streams, and it *is* in the AWS SDK for JavaScript v3.
**But** the request-side event stream needs Node's HTTP/2 handler — a browser
can't open raw HTTP/2 from JS, `fetch` request-body streaming isn't
full-duplex, and there is **no WebSocket fallback for Polly** (unlike
Transcribe streaming, which the browser SDK reaches over WebSocket). So the
bidirectional API is **not usable browser-direct**, which is the constraint
that matters here (Bedrock is never called from the browser, so there's no
server in the media loop to run the Node handler).

**Decision.** Use the sentence-chunked `SynthesizeSpeech` fallback the
architecture already anticipated:

- As the reasoning stream produces text, `tts.ts` cuts complete sentences
  off the buffer and synthesises them one at a time.
- Sentence *n+1* is synthesised while sentence *n* plays (pipeline depth ~1),
  scheduled back-to-back on the Web Audio clock.
- The **first** sentence is dispatched the moment it's complete — while the
  answer is still streaming — so audio starts early and lands with the
  section reveal, not after it.
- A long clause with no terminator is broken on the last space past ~180
  chars so playback never stalls waiting for a period.

**Revisit** only if a browser-reachable streaming TTS path appears (a Polly
WebSocket variant, or moving media behind the plan-B WebSocket proxy). Until
then this is settled, and OQ-4 is retired from ARCHITECTURE.md.

---

## Open for Phase 5 (bilingual)

- **PL voice:** `Ola` or `Ewa` (both female, confirmed). No confirmed PL
  **male** generative voice — OQ-6.
- **Language toggle** drives Transcribe `LanguageCode`, the Polly `VoiceId`,
  and the response-language instruction from one control (ARCHITECTURE.md
  § Bilingual). `tts.ts` / `stt.ts` currently hard-code `en-US` / `Ruth`;
  Phase 5 lifts those to the toggle.
- **Transcribe auto language-ID for `pl-PL` streaming** — still unconfirmed
  (OQ-5); the explicit toggle stays regardless.
