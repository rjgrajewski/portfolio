import { useEffect, useState } from "react";
import { isAgentConfigured, isVoiceConfigured } from "../../config/runtime";
import { useConversation } from "../../agent/useConversation";
import { deriveDegradation } from "../../agent/degradation";
import { useActiveSection } from "../../hooks/useActiveSection";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { AgentVisualization, type VizState } from "./AgentVisualization";
import { TranscriptBar } from "./TranscriptBar";

/**
 * The agent's entire on-screen presence (docs/ARCHITECTURE.md § Product
 * shape / § Agentic UI pattern, rewritten). Not a column — a fixed dock at
 * the bottom (the organic visualization + a hidden-by-default transcript),
 * plus the AI-mode frame while active. The rest of the screen is the
 * portfolio.
 *
 * Section reveal is untouched: it still runs through `revealSection` /
 * `activeSectionStore` and the desktop accordion / mobile takeover — this
 * component only READS `useActiveSection` to keep the expanded transcript
 * out of the way of an open section.
 */
export function AgentOverlay() {
  const conv = useConversation();
  const {
    messages,
    status,
    errorCode,
    voiceErrorCode,
    canSend,
    voiceMode,
    listening,
    partialTranscript,
    speaking,
    micLevel,
    playbackLevel,
    send,
    toggleVoice,
    stop,
  } = conv;

  const degradation = deriveDegradation({
    configured: isAgentConfigured,
    errorCode,
    voice: { configured: isVoiceConfigured, errorCode: voiceErrorCode },
  });

  const activeSection = useActiveSection();
  const isDesktop = useIsDesktop();
  const [expanded, setExpanded] = useState(false);
  const [textOpen, setTextOpen] = useState(false);

  // Keep the expanded transcript from burying a section the agent just
  // opened — collapse it whenever a section is revealed.
  useEffect(() => {
    if (activeSection) setExpanded(false);
  }, [activeSection]);

  const busy = status === "thinking" || status === "streaming";
  const inputEnabled = canSend && degradation.canRetry;

  const vizState: VizState =
    degradation.mode === "unconfigured"
      ? "rest"
      : status === "error"
        ? "error"
        : listening
          ? "listening"
          : speaking
            ? "speaking"
            : busy
              ? "thinking"
              : "rest";

  function handleActivate() {
    if (degradation.mode === "unconfigured") return;
    if (isVoiceConfigured) toggleVoice();
    else setTextOpen(true);
  }

  const hasConversation = messages.length > 0;
  const showTranscriptBar =
    isAgentConfigured &&
    (hasConversation ||
      voiceMode ||
      textOpen ||
      !!degradation.notice ||
      !!degradation.voice.notice);
  // On mobile a full-screen section takeover owns the screen — don't let the
  // dock's expanded panel compete.
  const allowExpand = isDesktop || !activeSection;

  return (
    <>
      {voiceMode ? (
        <div className="ai-frame" data-viz={vizState} aria-hidden="true" />
      ) : null}

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center bg-gradient-to-t from-neutral-950 via-neutral-950/85 to-transparent pt-10">
        <div className="pointer-events-auto mb-2 flex flex-col items-center gap-1">
          <AgentVisualization
            state={vizState}
            active={voiceMode}
            disabled={!isAgentConfigured}
            size={76}
            getMicLevel={micLevel}
            getPlaybackLevel={playbackLevel}
            onActivate={handleActivate}
            restCaption={isVoiceConfigured ? "Tap to talk" : "Tap to type"}
          />
          {voiceMode ? (
            <button
              type="button"
              onClick={toggleVoice}
              className="rounded px-2 py-0.5 text-small text-neutral-500 hover:text-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Leave voice
            </button>
          ) : null}
        </div>

        {showTranscriptBar ? (
          <TranscriptBar
            messages={messages}
            status={status}
            speaking={speaking}
            listening={listening}
            partialTranscript={partialTranscript}
            textNotice={degradation.notice}
            voiceNotice={degradation.voice.notice}
            expanded={expanded && allowExpand}
            onToggleExpanded={() => setExpanded((v) => !v)}
            showExpandControl={allowExpand}
            textOpen={textOpen}
            onToggleText={() => setTextOpen((v) => !v)}
            canSend={inputEnabled}
            busy={busy}
            onSend={(t) => {
              send(t);
              setTextOpen(true);
            }}
            onStop={stop}
          />
        ) : null}
      </div>
    </>
  );
}
