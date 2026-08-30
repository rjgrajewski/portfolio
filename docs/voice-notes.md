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
