import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isAgentConfigured, isVoiceConfigured } from "../../config/runtime";
import { useConversation } from "../../agent/useConversation";
import { deriveDegradation } from "../../agent/degradation";
import { useActiveSection } from "../../hooks/useActiveSection";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useReducedMotion } from "../../hooks/useReducedMotion";
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

  // One-time transient hint that a tap on the orb LEAVES voice mode — shown
  // the first time voice mode starts in a visit, then never again. No
  // permanent text; it fades on its own or when voice mode ends.
  const [showExitHint, setShowExitHint] = useState(false);
  useEffect(() => {
    if (!voiceMode) {
      setShowExitHint(false);
      return;
    }
    let seen = false;
    try {
      seen = sessionStorage.getItem("portfolio.voiceExitHint") === "1";
    } catch {
      /* private mode — treat as unseen */
    }
    if (seen) return;
    try {
      sessionStorage.setItem("portfolio.voiceExitHint", "1");
    } catch {
      /* ignore */
    }
    setShowExitHint(true);
    const t = window.setTimeout(() => setShowExitHint(false), 4500);
    return () => window.clearTimeout(t);
  }, [voiceMode]);

  const busy = status === "thinking" || status === "streaming";
  const inputEnabled = canSend && degradation.canRetry;

  // Drive the AI-mode glow's opacity per frame: a slow always-on breathe
  // (proves a conversation is live) plus a lift with mic/playback amplitude
  // (so the screen edge and the orb move on the same signal — one system).
  const frameRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const loopInputs = useRef({ listening, speaking, micLevel, playbackLevel, reducedMotion });
  loopInputs.current = { listening, speaking, micLevel, playbackLevel, reducedMotion };
  useEffect(() => {
    if (!voiceMode) return;
    let raf = 0;
    let lvl = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      const el = frameRef.current;
      if (!el || document.hidden) return;
      const i = loopInputs.current;
      if (i.reducedMotion) {
        el.style.setProperty("--ai-glow", "0.92"); // strong + static
        return;
      }
      const raw = i.listening
        ? i.micLevel()
        : i.speaking
          ? i.playbackLevel()
          : 0;
      lvl += (raw - lvl) * 0.25;
      const breathe =
        0.09 * (0.5 + 0.5 * Math.sin(((now - start) / 1000) * 0.9));
      el.style.setProperty(
        "--ai-glow",
        String(Math.min(1, 0.78 + breathe + lvl * 0.28)),
      );
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [voiceMode]);

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

  // Rendered into <body>, not into the app tree — so the fixed positioning
  // can never be re-based by an ancestor that becomes a containing block
  // (transform / filter / contain / backdrop-filter), and the z-index sits
  // cleanly above the section takeover. `translateZ(0)` keeps iOS Safari
  // compositing the dock as its own layer so it doesn't drift on momentum
  // scroll.
  return createPortal(
    <>
      {voiceMode ? (
        <div
          ref={frameRef}
          className="ai-frame"
          data-viz={vizState}
          aria-hidden="true"
        />
      ) : null}

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 flex flex-col items-center bg-gradient-to-t from-neutral-950 via-neutral-950/85 to-transparent pt-10"
        style={{
          zIndex: "var(--z-agent-dock)",
          transform: "translateZ(0)",
          paddingBottom: "max(0.6rem, env(safe-area-inset-bottom))",
        }}
      >
        {showTranscriptBar ? (
          <div className="pointer-events-auto mb-2 w-full">
            <TranscriptBar
              messages={messages}
              status={status}
              speaking={speaking}
              listening={listening}
              voiceMode={voiceMode}
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
          </div>
        ) : null}

        <div className="pointer-events-auto flex flex-col items-center">
          {showExitHint ? (
            <p className="mb-1.5 text-small text-neutral-500 transition-opacity duration-500">
              Tap the orb again to leave
            </p>
          ) : null}
          <AgentVisualization
            state={vizState}
            active={voiceMode}
            disabled={!isAgentConfigured}
            size={96}
            getMicLevel={micLevel}
            getPlaybackLevel={playbackLevel}
            onActivate={handleActivate}
          />
        </div>
      </div>
    </>,
    document.body,
  );
}
