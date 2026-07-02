import { useState, useEffect, useRef, useCallback } from "react";
import { captureVideoFrame } from "../utils/videoUtils";

/** Guided scan phases — motion prompts replace static angle photos. */
export const SCAN_PHASES = [
  {
    id: "front",
    label: "Front View",
    motion: "Hold steady",
    hint: "Center the product facing the camera",
    icon: "⬜",
    durationSec: 3,
    motionClass: "motion-pulse-center",
  },
  {
    id: "rotate_right",
    label: "Rotate Right",
    motion: "Slowly turn right →",
    hint: "Reveal the right side and edge profile",
    icon: "▶",
    durationSec: 3,
    motionClass: "motion-slide-right",
  },
  {
    id: "back",
    label: "Back View",
    motion: "Flip to back",
    hint: "Show the entire back panel clearly",
    icon: "🔲",
    durationSec: 3,
    motionClass: "motion-flip",
  },
  {
    id: "rotate_left",
    label: "Rotate Left",
    motion: "← Turn left",
    hint: "Show the left side and profile",
    icon: "◀",
    durationSec: 3,
    motionClass: "motion-slide-left",
  },
  {
    id: "top",
    label: "Top & Ports",
    motion: "Tilt upward ↑",
    hint: "Reveal ports, buttons, or top surface",
    icon: "🔼",
    durationSec: 3,
    motionClass: "motion-tilt-up",
  },
  {
    id: "label",
    label: "Label Detail",
    motion: "Move closer 🔍",
    hint: "Zoom in on serial number or brand label",
    icon: "🏷",
    durationSec: 3,
    motionClass: "motion-zoom-in",
  },
];

function MotionGuide({ phase, phaseProgress, isRecording }) {
  const pct = Math.round(phaseProgress * 100);
  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center">
      <div className="relative w-56 h-56">
        {[
          "top-0 left-0 border-t-4 border-l-4 rounded-tl-xl",
          "top-0 right-0 border-t-4 border-r-4 rounded-tr-xl",
          "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl",
          "bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl",
        ].map((cls, i) => (
          <div
            key={i}
            className={`absolute w-12 h-12 ${cls}`}
            style={{
              borderColor: isRecording ? "#febd69" : "#ffffff55",
              transition: "border-color 0.3s",
            }}
          />
        ))}

        <div className={`absolute inset-0 flex items-center justify-center ${phase.motionClass}`}>
          <div
            className="text-5xl select-none"
            style={{
              filter: isRecording ? "drop-shadow(0 0 12px #febd69)" : "none",
              opacity: isRecording ? 1 : 0.4,
            }}
          >
            {phase.icon}
          </div>
        </div>

        {isRecording && (
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="none" stroke="#ffffff22" strokeWidth="3" />
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="#febd69"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${pct * 2.89} 289`}
              style={{ transition: "stroke-dasharray 0.1s linear" }}
            />
          </svg>
        )}
      </div>

      {isRecording && (
        <div className="mt-4 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full">
          <span className="text-[#febd69] text-lg animate-bounce">{phase.motion}</span>
        </div>
      )}
    </div>
  );
}

function PhaseStrip({ phases, currentIdx, capturedFrames }) {
  return (
    <div className="flex gap-1.5 px-3 py-2 overflow-x-auto bg-[#0f172a]">
      {phases.map((p, i) => {
        const done = !!capturedFrames[p.id];
        const active = i === currentIdx;
        return (
          <div
            key={p.id}
            className={`flex-shrink-0 flex flex-col items-center gap-0.5 transition-all ${
              active ? "scale-105" : "opacity-60"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-lg overflow-hidden border-2 flex items-center justify-center text-sm ${
                done
                  ? "border-[#22c55e] bg-[#022c22]"
                  : active
                  ? "border-[#febd69] bg-[#2d2416]"
                  : "border-[#334155] bg-[#1e293b]"
              }`}
            >
              {done && capturedFrames[p.id] ? (
                <img src={capturedFrames[p.id]} alt={p.label} className="w-full h-full object-cover" />
              ) : (
                <span>{done ? "✓" : p.icon}</span>
              )}
            </div>
            <span
              className={`text-[8px] font-bold truncate max-w-[48px] ${
                done ? "text-[#22c55e]" : active ? "text-[#febd69]" : "text-[#64748b]"
              }`}
            >
              {p.label.split(" ")[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function LiveVideoScanner({
  onComplete,
  onCancel,
  title = "Live Product Scan",
  subtitle = "Follow the on-screen motion guides",
  accentColor = "#febd69",
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const phaseTimerRef = useRef(null);
  const phaseIdxRef = useRef(0);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [phase, setPhase] = useState("intro");
  const [currentPhaseIdx, setCurrentPhaseIdx] = useState(0);
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [capturedFrames, setCapturedFrames] = useState({});
  const [videoBlob, setVideoBlob] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  const currentPhase = SCAN_PHASES[currentPhaseIdx];
  const capturedCount = Object.keys(capturedFrames).length;

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCameraReady(true);
        };
      }
    } catch {
      setCameraError("Camera access denied. Please allow camera access and refresh.");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);
    };
  }, [startCamera]);

  const runPhaseTimer = useCallback(() => {
    const idx = phaseIdxRef.current;
    const phaseDef = SCAN_PHASES[idx];
    const durationMs = phaseDef.durationSec * 1000;
    const tickMs = 50;
    let elapsed = 0;

    if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);

    phaseTimerRef.current = setInterval(() => {
      elapsed += tickMs;
      const progress = Math.min(1, elapsed / durationMs);
      setPhaseProgress(progress);

      if (elapsed >= durationMs) {
        clearInterval(phaseTimerRef.current);

        if (videoRef.current && videoRef.current.videoWidth) {
          const frame = captureVideoFrame(videoRef.current);
          const phaseId = SCAN_PHASES[idx].id;
          setCapturedFrames((prev) => ({ ...prev, [phaseId]: frame }));
        }

        const nextIdx = idx + 1;
        if (nextIdx >= SCAN_PHASES.length) {
          if (recorderRef.current && recorderRef.current.state === "recording") {
            recorderRef.current.stop();
          }
          if (timerRef.current) clearInterval(timerRef.current);
        } else {
          phaseIdxRef.current = nextIdx;
          setCurrentPhaseIdx(nextIdx);
          setPhaseProgress(0);
          setTimeout(() => runPhaseTimer(), 150);
        }
      }
    }, tickMs);
  }, []);

  const startRecording = () => {
    if (!streamRef.current || !cameraReady) return;

    chunksRef.current = [];
    setCapturedFrames({});
    phaseIdxRef.current = 0;
    setCurrentPhaseIdx(0);
    setPhaseProgress(0);
    setRecordingElapsed(0);

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "video/mp4";

    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setVideoBlob(blob);
      setVideoPreviewUrl(URL.createObjectURL(blob));
      setPhase("review");
    };

    recorder.start(200);
    setPhase("recording");

    timerRef.current = setInterval(() => {
      setRecordingElapsed((e) => e + 0.1);
    }, 100);

    setTimeout(() => runPhaseTimer(), 300);
  };

  const handleRetake = () => {
    setPhase("intro");
    setCapturedFrames({});
    phaseIdxRef.current = 0;
    setCurrentPhaseIdx(0);
    setPhaseProgress(0);
    setVideoBlob(null);
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl(null);
    }
  };

  const handleSubmit = () => {
    const frames = SCAN_PHASES.map((p) => capturedFrames[p.id]).filter(Boolean);
    onComplete({
      videoBlob,
      frames,
      durationSec: recordingElapsed,
      phases: SCAN_PHASES.map((p) => ({ id: p.id, label: p.label, frame: capturedFrames[p.id] })),
    });
  };

  if (cameraError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black text-white text-center p-6 min-h-[50vh]">
        <div>
          <div className="text-4xl mb-3">📷</div>
          <p className="text-[14px] text-red-400 font-semibold">{cameraError}</p>
          {onCancel && (
            <button onClick={onCancel} className="mt-4 text-[#94a3b8] text-[13px] hover:text-white underline">
              Go back
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === "review") {
    return (
      <div className="flex-1 flex flex-col bg-[#030712] text-white overflow-y-auto">
        <div className="px-4 pt-4 pb-2">
          <h2 className="text-[16px] font-bold">Review Scan</h2>
          <p className="text-[12px] text-[#94a3b8]">
            {capturedCount} frames extracted from {recordingElapsed.toFixed(1)}s recording
          </p>
        </div>

        {videoPreviewUrl && (
          <div className="px-4 mb-3">
            <video
              src={videoPreviewUrl}
              controls
              className="w-full rounded-xl border border-[#334155] max-h-[180px] object-cover bg-black"
            />
          </div>
        )}

        <div className="px-4 grid grid-cols-3 gap-2 pb-4">
          {SCAN_PHASES.map((p) => {
            const frame = capturedFrames[p.id];
            return (
              <div key={p.id} className="rounded-lg overflow-hidden border border-[#334155] bg-[#1e293b]">
                {frame ? (
                  <img src={frame} alt={p.label} className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center text-2xl opacity-40">
                    {p.icon}
                  </div>
                )}
                <p className="text-[9px] text-center py-1 text-[#94a3b8] font-bold">{p.label}</p>
              </div>
            );
          })}
        </div>

        <div className="px-4 pb-4 flex gap-3 mt-auto">
          <button
            onClick={handleRetake}
            className="flex-1 py-3 rounded-xl border border-[#334155] text-[#94a3b8] hover:text-white text-[13px] font-bold"
          >
            ↺ Retake
          </button>
          <button
            onClick={handleSubmit}
            disabled={capturedCount < 2}
            className="flex-[2] py-3 rounded-xl font-bold text-[14px] text-[#0f1111] disabled:opacity-50"
            style={{ backgroundColor: accentColor }}
          >
            ✅ Submit Scan ({capturedCount} frames)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-black text-white" style={{ minHeight: 0 }}>
      <style>{`
        @keyframes scanPulseCenter {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes scanSlideRight {
          0%, 100% { transform: translateX(-8px); }
          50% { transform: translateX(12px); }
        }
        @keyframes scanSlideLeft {
          0%, 100% { transform: translateX(8px); }
          50% { transform: translateX(-12px); }
        }
        @keyframes scanFlip {
          0%, 100% { transform: rotateY(0deg); }
          50% { transform: rotateY(180deg); }
        }
        @keyframes scanTiltUp {
          0%, 100% { transform: translateY(4px) rotate(-5deg); }
          50% { transform: translateY(-10px) rotate(5deg); }
        }
        @keyframes scanZoomIn {
          0%, 100% { transform: scale(0.85); }
          50% { transform: scale(1.15); }
        }
        .motion-pulse-center { animation: scanPulseCenter 2s ease-in-out infinite; }
        .motion-slide-right  { animation: scanSlideRight 2s ease-in-out infinite; }
        .motion-slide-left   { animation: scanSlideLeft 2s ease-in-out infinite; }
        .motion-flip         { animation: scanFlip 2.5s ease-in-out infinite; }
        .motion-tilt-up      { animation: scanTiltUp 2s ease-in-out infinite; }
        .motion-zoom-in      { animation: scanZoomIn 2s ease-in-out infinite; }
        @keyframes recDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .rec-dot { animation: recDot 1s ease-in-out infinite; }
      `}</style>

      <div className="px-4 py-2 bg-[#0f172a] flex items-center justify-between z-20">
        <div>
          <p className="text-[13px] font-bold">{title}</p>
          <p className="text-[10px] text-[#64748b]">{subtitle}</p>
        </div>
        {phase === "recording" && (
          <div className="flex items-center gap-1.5 bg-red-900/60 px-2.5 py-1 rounded-full">
            <div className="w-2 h-2 rounded-full bg-red-500 rec-dot" />
            <span className="text-[11px] font-bold text-red-300">REC {recordingElapsed.toFixed(0)}s</span>
          </div>
        )}
      </div>

      {phase === "recording" && (
        <PhaseStrip phases={SCAN_PHASES} currentIdx={currentPhaseIdx} capturedFrames={capturedFrames} />
      )}

      <div className="bg-[#0c1a3a] px-4 py-2 text-center z-20">
        {phase === "intro" ? (
          <p className="text-[12px] text-[#93c5fd]">
            🎬 You'll be guided through {SCAN_PHASES.length} motions — keep the product in frame throughout
          </p>
        ) : (
          <div>
            <p className="text-[13px] font-bold text-white">
              {currentPhase.icon} {currentPhase.label}
            </p>
            <p className="text-[11px] text-[#93c5fd] mt-0.5">{currentPhase.hint}</p>
          </div>
        )}
      </div>

      <div className="flex-1 relative overflow-hidden" style={{ minHeight: "45vh" }}>
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
        {phase === "recording" && (
          <MotionGuide phase={currentPhase} phaseProgress={phaseProgress} isRecording={true} />
        )}
        {phase === "intro" && cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
            <div className="text-center px-6">
              <div className="text-5xl mb-3">🎥</div>
              <p className="text-[15px] font-bold mb-1">Ready for Live Scan</p>
              <p className="text-[12px] text-[#94a3b8] max-w-xs">
                Follow the motion prompts as you slowly move around the product. AI extracts key frames automatically.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 bg-[#0f172a] flex gap-3 z-20">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-[#334155] text-[#94a3b8] hover:text-white text-[13px] font-bold"
          >
            ← Cancel
          </button>
        )}
        {phase === "intro" && (
          <button
            onClick={startRecording}
            disabled={!cameraReady}
            className="flex-[2] py-3 rounded-xl font-bold text-[14px] text-[#0f1111] disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ backgroundColor: accentColor }}
          >
            <span className="w-3 h-3 rounded-full bg-red-600 inline-block" />
            Start Live Scan
          </button>
        )}
        {phase === "recording" && (
          <div className="flex-[2] py-3 rounded-xl bg-[#1e293b] text-center text-[12px] text-[#94a3b8] font-bold">
            Phase {currentPhaseIdx + 1}/{SCAN_PHASES.length} — {currentPhase.motion}
          </div>
        )}
      </div>
    </div>
  );
}
