import { PlaceholderNote } from "../../ui/PlaceholderNote";

export function PortfolioItself() {
  return (
    <>
      <p>
        This site is itself a project: an AI agent on Amazon Bedrock
        (Claude Haiku 4.5) that answers questions about my work and opens
        the matching section as it talks — Polly for speech, Transcribe for
        listening, all AWS-native, built to a hard ~$25/month cost ceiling.
      </p>
      <PlaceholderNote>
        Full architecture write-up lands in Phase 8 — until then, see
        docs/ARCHITECTURE.md in the repo.
      </PlaceholderNote>
    </>
  );
}
