<!-- SEED CONTENT (Phase 2). Real detail lands in Phase 8. -->
# FlowJob — technical layer

Rafal built the Bedrock-backed reasoning pieces and the serverless
plumbing around them.

Shape of it:

- **Reasoning on Amazon Bedrock (Claude).** Prompt assembly, structured
  output handling, and retries/fallbacks for when the model returns
  something malformed or the service throttles.
- **Serverless, scale-to-zero.** Lambda for compute, a managed queue for
  decoupling ingestion from processing, DynamoDB for state — nothing
  that bills by the hour while idle.
- **Cost-aware from the start.** Token usage per request was a tracked
  number, not an afterthought, because the model call is the expensive
  line.
- **Failure handling.** The model is treated as an unreliable dependency:
  timeouts, malformed responses, and throttling all have defined
  behaviour rather than crashing the flow.

The specific model IDs, prompt structure, queue/store choices, and the
human-in-the-loop hand-off are to be filled in for Phase 8.
