import { useState, useEffect, useRef, useCallback } from "react";
import { verifyScanFingerprint, verifyLiveMatch } from "../api/client";
import { captureVideoFrame } from "../utils/videoUtils";

/**
 * Fingerprint-style scan phases.
 * The flow emphasizes slow coverage passes over the product, not raw angle jumping.
 */
export const SCAN_PHASES = [
  {
    id: "front_anchor",
    label: "Front Anchor",
    motion: "Hold steady",
    hint: "Center the product so the scan can lock the item identity.",
    icon: "◉",
    durationSec: 6,
    motionClass: "motion-pulse-center",
  },
  {
    id: "right_sweep",
    label: "Right Sweep",
    motion: "Ease slowly to your right →",
    hint: "Reveal the right side and edge profile without rushing.",
    icon: "▸",
    durationSec: 6,
    motionClass: "motion-slide-right",
  },
  {
    id: "back_anchor",
    label: "Back Anchor",
    motion: "Rotate to the back",
    hint: "Show the back panel, seams, and any visible markings.",
    icon: "▣",
    durationSec: 7,
    motionClass: "motion-flip",
  },
  {
    id: "left_sweep",
    label: "Left Sweep",
    motion: "Ease slowly to your left ←",
    hint: "Capture the left side and full profile in one smooth move.",
    icon: "◂",
    durationSec: 6,
    motionClass: "motion-slide-left",
  },
  {
    id: "top_detail",
    label: "Top / Ports",
    motion: "Tilt slightly upward ↑",
    hint: "Reveal ports, buttons, seams, or the top surface.",
    icon: "▴",
    durationSec: 6,
    motionClass: "motion-tilt-up",
  },
  {
    id: "detail_mark",
    label: "Detail Mark",
    motion: "Move closer 🔍",
    hint: "Capture a close-up of branding, serial number, or unique mark.",
    icon: "⌁",
    durationSec: 6,
    motionClass: "motion-zoom-in",
  },
];

function MotionGuide({ phase, phaseProgress, capturedCount, totalCount, isRecording }) {
  const pct = Math.round(phaseProgress * 100);
  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[26rem] rounded-[28px] border border-white/10 bg-black/20 backdrop-blur-md p-4 sm:p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#febd69]/90 font-bold">Scan focus</p>
            <p className="text-[16px] sm:text-[18px] font-semibold text-white">{phase.label}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/50">Coverage</p>
            <p className="text-[14px] font-bold text-white">{capturedCount}/{totalCount}</p>
          </div>
        </div>

        <div className="relative h-52 sm:h-64 rounded-[24px] border border-white/10 bg-gradient-to-br from-white/6 to-white/0 overflow-hidden flex items-center justify-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(254,189,105,0.16),transparent_60%)]" />
          <div className="absolute inset-4 rounded-[22px] border border-dashed border-white/12" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`text-7xl sm:text-8xl select-none ${phase.motionClass}`}
              style={{
                filter: isRecording ? "drop-shadow(0 0 18px rgba(254,189,105,0.65))" : "none",
                opacity: isRecording ? 1 : 0.45,
              }}
            >
              {phase.icon}
            </div>
          </div>

          {isRecording && (
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="3" />
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="#febd69"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${pct * 2.89} 289`}
                style={{ transition: "stroke-dasharray 0.15s linear" }}
              />
            </svg>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex-1">
            <p className="text-[12px] text-white/70">{phase.hint}</p>
          </div>
          {isRecording && (
            <div className="shrink-0 inline-flex items-center gap-2 bg-black/50 border border-white/10 px-3 py-2 rounded-full">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff4d4d] rec-dot" />
              <span className="text-[12px] font-semibold text-white/90">Recording</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FingerprintHint({ status, prompt, missingViews, confidence }) {
  if (!prompt && !missingViews.length && confidence == null) return null;

  const toneClass =
    status === "matched"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-50"
      : status === "mismatch"
      ? "border-rose-500/20 bg-rose-500/10 text-rose-50"
      : "border-amber-400/20 bg-amber-400/10 text-amber-50";

  return (
    <div className={`rounded-3xl border p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)] ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.28em] font-bold">Fingerprint guidance</p>
        {typeof confidence === "number" && <span className="text-[11px] font-semibold">{confidence}% confidence</span>}
      </div>
      {prompt && <p className="mt-2 text-[12px] leading-6">{prompt}</p>}
      {missingViews.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {missingViews.map((view) => (
            <span key={view} className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-[11px] text-inherit">
              {view}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DebugPanel({ data }) {
  if (!data) return null;

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0b1220] p-4 text-[12px] text-[#d5deeb]">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[#febd69] font-bold">AI response debug</p>
      </div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-[#d5deeb]">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function PhaseStrip({ phases, currentIdx, capturedFrames }) {
  return (
    <div className="flex gap-2 px-4 py-3 overflow-x-auto bg-[#09111f] border-b border-white/6">
      {phases.map((p, i) => {
        const done = !!capturedFrames[p.id];
        const active = i === currentIdx;
        return (
          <div
            key={p.id}
            className={`flex-shrink-0 flex flex-col items-center gap-1 transition-all ${active ? "scale-105" : "opacity-70"}`}
          >
            <div
              className={`w-12 h-12 rounded-2xl overflow-hidden border flex items-center justify-center text-sm shadow-sm ${
                done
                  ? "border-[#22c55e] bg-[#05261d]"
                  : active
                  ? "border-[#febd69] bg-[#2d2416]"
                  : "border-[#223049] bg-[#121c2d]"
              }`}
            >
              {done && capturedFrames[p.id] ? (
                <img src={capturedFrames[p.id]} alt={p.label} className="w-full h-full object-cover" />
              ) : (
                <span>{done ? "✓" : p.icon}</span>
              )}
            </div>
            <span
              className={`text-[8px] font-bold tracking-wide truncate max-w-[60px] ${
                done ? "text-[#22c55e]" : active ? "text-[#febd69]" : "text-[#7890b0]"
              }`}
            >
              {p.label}
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
  subtitle = "A slower, guided coverage pass that fingerprints the product from every visible side",
  accentColor = "#febd69",
  orderId = null,
  productName = "",
  productCategory = "",
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const phaseTimerRef = useRef(null);
  const phaseIdxRef = useRef(0);
  const abortedRef = useRef(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [phase, setPhase] = useState("intro");
  const [currentPhaseIdx, setCurrentPhaseIdx] = useState(0);
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [capturedFrames, setCapturedFrames] = useState({});
  const [videoBlob, setVideoBlob] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [fingerprintStatus, setFingerprintStatus] = useState("pending");
  const [fingerprintPrompt, setFingerprintPrompt] = useState("");
  const [fingerprintMissingViews, setFingerprintMissingViews] = useState([]);
  const [fingerprintConfidence, setFingerprintConfidence] = useState(null);
  const [fingerprintDebugResponse, setFingerprintDebugResponse] = useState(null);
  const fingerprintRequestSeq = useRef(0);

  const currentPhase = SCAN_PHASES[currentPhaseIdx];
  const capturedCount = Object.keys(capturedFrames).length;

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
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

  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [videoPreviewUrl]);

  useEffect(() => {
    if (phase !== "recording") return;

    const frames = [];
    frames.push(...SCAN_PHASES.map((p) => capturedFrames[p.id]).filter(Boolean));
    if (!frames.length) return;

    const requestSeq = ++fingerprintRequestSeq.current;
    const timeout = setTimeout(() => {
      verifyScanFingerprint({
        order_id: orderId,
        product_name: productName,
        product_category: productCategory,
        scan_context: "live_capture",
        frames,
      })
        .then((result) => {
          if (requestSeq !== fingerprintRequestSeq.current) return;
          
          if (!result.matched && result.confidence >= 50) {
            abortedRef.current = true;
            if (recorderRef.current && recorderRef.current.state === "recording") {
               recorderRef.current.stop();
            }
            if (timerRef.current) clearInterval(timerRef.current);
            if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);
            
            setFingerprintStatus("mismatch");
            setFingerprintPrompt(result.recommended_next_prompt || `Wrong product: Detected ${result.observed_product_type}`);
            setFingerprintMissingViews(Array.isArray(result.missing_views) ? result.missing_views : []);
            setFingerprintConfidence(result.confidence);
            setFingerprintDebugResponse(result);
            setPhase("aborted");
            return;
          }

          setFingerprintStatus(result.matched ? "matched" : "mismatch");
          setFingerprintPrompt(result.recommended_next_prompt || "");
          setFingerprintMissingViews(Array.isArray(result.missing_views) ? result.missing_views : []);
          setFingerprintConfidence(typeof result.confidence === "number" ? result.confidence : null);
          setFingerprintDebugResponse(result);
        })
        .catch((error) => {
          if (requestSeq !== fingerprintRequestSeq.current) return;
          const detail = error?.detail || {};
          setFingerprintStatus("mismatch");
          setFingerprintPrompt(detail.recommended_next_prompt || detail.message || error?.message || "The scan does not match the intended product.");
          setFingerprintMissingViews(Array.isArray(detail.missing_views) ? detail.missing_views : []);
          setFingerprintConfidence(typeof detail.confidence === "number" ? detail.confidence : null);
          setFingerprintDebugResponse({
            error: true,
            status: error?.status || 409,
            message: error?.message || "Fingerprint verification failed",
            detail,
          });
        });
    }, 250);

    return () => clearTimeout(timeout);
  }, [phase, capturedFrames, orderId, productName, productCategory]);

  useEffect(() => {
    if (phase !== "review" || !videoBlob || fingerprintStatus !== "pending") return;

    let cancelled = false;
    const frames = SCAN_PHASES.map((p) => capturedFrames[p.id]).filter(Boolean);

    verifyScanFingerprint({
      order_id: orderId,
      product_name: productName,
      product_category: productCategory,
      scan_context: "product_identity",
      frames,
    })
      .then((result) => {
        if (cancelled) return;
        setFingerprintStatus(result.matched ? "matched" : "mismatch");
        setFingerprintPrompt(result.recommended_next_prompt || "");
        setFingerprintMissingViews(Array.isArray(result.missing_views) ? result.missing_views : []);
        setFingerprintConfidence(typeof result.confidence === "number" ? result.confidence : null);
        setFingerprintDebugResponse(result);
      })
      .catch((error) => {
        if (cancelled) return;
        const detail = error?.detail || {};
        setFingerprintStatus("mismatch");
        setFingerprintPrompt(detail.recommended_next_prompt || detail.message || error?.message || "The scan does not match the intended product.");
        setFingerprintMissingViews(Array.isArray(detail.missing_views) ? detail.missing_views : []);
        setFingerprintConfidence(typeof detail.confidence === "number" ? detail.confidence : null);
        setFingerprintDebugResponse({
          error: true,
          status: error?.status || 409,
          message: error?.message || "Fingerprint verification failed",
          detail,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [phase, videoBlob, fingerprintStatus, capturedFrames, orderId, productName, productCategory]);

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
          setTimeout(() => runPhaseTimer(), 220);
        }
      }
    }, tickMs);
  }, []);

  const startRecording = () => {
    if (!streamRef.current || !cameraReady) return;

    chunksRef.current = [];
    abortedRef.current = false;
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
      // If the stop was triggered by a mismatch abort, stay on "aborted" phase.
      if (!abortedRef.current) {
        // Cancel any in-flight recording-phase fingerprint requests so they
        // cannot overwrite the review-phase result after we transition.
        fingerprintRequestSeq.current += 1;
        // Reset to "pending" so the review-phase effect always runs a fresh
        // definitive check on all captured frames, rather than inheriting a
        // stale advisory mismatch from an early mid-scan frame.
        setFingerprintStatus("pending");
        setFingerprintPrompt("");
        setFingerprintMissingViews([]);
        setFingerprintConfidence(null);
        setFingerprintDebugResponse(null);
        setPhase("review");
      }
    };

    recorder.start(200);
    setPhase("recording");

    timerRef.current = setInterval(() => {
      setRecordingElapsed((e) => e + 0.1);
    }, 100);

    // Capture 10 fast frames to verify immediately
    let initialFramesCount = 0;
    const initialFrames = [];
    const initialCaptureInterval = setInterval(() => {
      if (videoRef.current && videoRef.current.videoWidth) {
        const frame = captureVideoFrame(videoRef.current);
        initialFrames.push(frame);
      }
      initialFramesCount++;

      if (initialFramesCount >= 10) {
        clearInterval(initialCaptureInterval);
        if (initialFrames.length > 0) {
          verifyLiveMatch({
            order_id: orderId,
            product_name: productName,
            product_category: productCategory,
            scan_context: "live_capture",
            frames: initialFrames,
          }).then((result) => {
            if (!result.matched) {
              abortedRef.current = true;
              if (recorderRef.current && recorderRef.current.state === "recording") {
                recorderRef.current.stop();
              }
              if (timerRef.current) clearInterval(timerRef.current);
              if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);

              setFingerprintStatus("mismatch");
              setFingerprintPrompt(result.recommended_next_prompt || `Wrong product: Detected ${result.observed_product_type}`);
              setFingerprintMissingViews(Array.isArray(result.missing_views) ? result.missing_views : []);
              setFingerprintConfidence(result.confidence);
              setFingerprintDebugResponse(result);
              setPhase("aborted");
            }
          }).catch(console.error);
        }
      }
    }, 100);

    setTimeout(() => runPhaseTimer(), 320);
  };

  const handleRetake = () => {
    setPhase("intro");
    setCapturedFrames({});
    phaseIdxRef.current = 0;
    setCurrentPhaseIdx(0);
    setPhaseProgress(0);
    setVideoBlob(null);
    setFingerprintStatus("pending");
    setFingerprintPrompt("");
    setFingerprintMissingViews([]);
    setFingerprintConfidence(null);
    setFingerprintDebugResponse(null);
    fingerprintRequestSeq.current += 1;
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
      fingerprint: {
        status: fingerprintStatus,
        prompt: fingerprintPrompt,
        missingViews: fingerprintMissingViews,
        confidence: fingerprintConfidence,
        debugResponse: fingerprintDebugResponse,
      },
    });
  };

  if (cameraError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black text-white text-center p-6 min-h-[60vh]">
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
        <div className="px-4 sm:px-6 pt-4 pb-2 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-bold">Review Scan</h2>
            <p className="text-[12px] text-[#94a3b8]">
              {capturedCount} coverage frames extracted from {recordingElapsed.toFixed(1)}s recording
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-white/80">
            <span className="w-2 h-2 rounded-full bg-[#febd69]" />
            Slower fingerprint-style pass
          </div>
        </div>

        {videoPreviewUrl && (
          <div className="px-4 sm:px-6 mb-3">
            <video
              src={videoPreviewUrl}
              controls
              className="w-full rounded-3xl border border-[#334155] max-h-[40vh] sm:max-h-[45vh] object-cover bg-black shadow-[0_20px_70px_rgba(0,0,0,0.45)]"
            />
          </div>
        )}

        <div className="px-4 sm:px-6 grid grid-cols-3 sm:grid-cols-6 gap-2 pb-4">
          {SCAN_PHASES.map((p) => {
            const frame = capturedFrames[p.id];
            return (
              <div key={p.id} className="rounded-2xl overflow-hidden border border-[#334155] bg-[#111827] shadow-sm">
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

        <div className="px-4 sm:px-6 pb-4 flex gap-3 mt-auto sticky bottom-0 bg-[#030712]/95 backdrop-blur-md pt-2">
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
    <div className="flex-1 flex flex-col bg-[#030712] text-white" style={{ minHeight: 0 }}>
      <style>{`
        @keyframes scanPulseCenter {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.06); opacity: 1; }
        }
        @keyframes scanSlideRight {
          0%, 100% { transform: translateX(-10px); }
          50% { transform: translateX(14px); }
        }
        @keyframes scanSlideLeft {
          0%, 100% { transform: translateX(10px); }
          50% { transform: translateX(-14px); }
        }
        @keyframes scanFlip {
          0%, 100% { transform: rotateY(0deg); }
          50% { transform: rotateY(180deg); }
        }
        @keyframes scanTiltUp {
          0%, 100% { transform: translateY(4px) rotate(-4deg); }
          50% { transform: translateY(-10px) rotate(4deg); }
        }
        @keyframes scanZoomIn {
          0%, 100% { transform: scale(0.88); }
          50% { transform: scale(1.12); }
        }
        .motion-pulse-center { animation: scanPulseCenter 2.4s ease-in-out infinite; }
        .motion-slide-right  { animation: scanSlideRight 2.6s ease-in-out infinite; }
        .motion-slide-left   { animation: scanSlideLeft 2.6s ease-in-out infinite; }
        .motion-flip         { animation: scanFlip 3.2s ease-in-out infinite; }
        .motion-tilt-up      { animation: scanTiltUp 2.8s ease-in-out infinite; }
        .motion-zoom-in      { animation: scanZoomIn 2.8s ease-in-out infinite; }
        @keyframes recDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .rec-dot { animation: recDot 1s ease-in-out infinite; }
      `}</style>

      <div className="px-4 sm:px-6 py-3 bg-[#09111f] border-b border-white/6 flex items-start sm:items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-white">{title}</p>
          <p className="text-[10px] sm:text-[11px] text-[#7890b0] max-w-2xl">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm px-3 py-2 rounded-full border border-white/10 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff4d4d] rec-dot" />
          <span className="text-[11px] font-bold text-red-200">REC {recordingElapsed.toFixed(0)}s</span>
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-3">
        <div className="rounded-[28px] border border-white/8 bg-gradient-to-b from-[#0c1220] to-[#070b14] p-3 sm:p-4 shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
          <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <div className="order-2 lg:order-1 flex flex-col gap-4">
              <div className="rounded-[24px] border border-white/8 bg-white/4 p-4 sm:p-5">
                {phase === "intro" ? (
                  <>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-[#febd69] font-bold mb-2">Before you begin</p>
                    <h3 className="text-[18px] sm:text-[20px] font-semibold text-white leading-tight">A slower fingerprint-style scan</h3>
                    <p className="text-[13px] text-[#b7c4d9] mt-2 leading-relaxed">
                      Hold the product steady, then let the scan guide you through each side at a calm pace.
                      The AI records coverage frames automatically.
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-[#dbe7f7]">
                      <div className="rounded-2xl border border-white/8 bg-black/20 p-3">Use good lighting</div>
                      <div className="rounded-2xl border border-white/8 bg-black/20 p-3">Keep the item centered</div>
                      <div className="rounded-2xl border border-white/8 bg-black/20 p-3">Move slowly</div>
                      <div className="rounded-2xl border border-white/8 bg-black/20 p-3">Follow the cue</div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-[#febd69] font-bold mb-2">Current pass</p>
                    <h3 className="text-[18px] sm:text-[20px] font-semibold text-white leading-tight">{currentPhase.label}</h3>
                    <p className="text-[13px] text-[#b7c4d9] mt-2 leading-relaxed">{currentPhase.hint}</p>
                    <div className="mt-4 rounded-2xl bg-black/25 border border-white/8 p-3">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-white/50 mb-1">What to do now</p>
                      <p className="text-[15px] font-semibold text-white">{currentPhase.motion}</p>
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-[24px] border border-white/8 bg-[#09111f] p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] uppercase tracking-[0.26em] text-white/45 font-bold">Coverage path</p>
                  <p className="text-[12px] font-semibold text-white">{capturedCount}/{SCAN_PHASES.length}</p>
                </div>
                <div className="space-y-2.5">
                  {SCAN_PHASES.map((p, index) => {
                    const done = !!capturedFrames[p.id];
                    const active = index === currentPhaseIdx;
                    return (
                      <div key={p.id} className={`flex items-center gap-3 rounded-2xl px-3 py-2 border ${done ? "border-[#22c55e]/30 bg-[#05261d]" : active ? "border-[#febd69]/40 bg-[#2d2416]" : "border-white/6 bg-white/[0.03]"}`}>
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${done ? "bg-[#22c55e]/15 text-[#67e8a4]" : active ? "bg-[#febd69]/15 text-[#febd69]" : "bg-white/5 text-[#7b8ca8]"}`}>
                          {done ? "✓" : p.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-[12px] font-semibold truncate ${done ? "text-[#67e8a4]" : active ? "text-[#febd69]" : "text-white"}`}>{p.label}</p>
                          <p className="text-[11px] text-[#88a0c0] truncate">{p.motion}</p>
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">
                          {done ? "done" : active ? "now" : "next"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="hidden lg:block rounded-[24px] border border-white/8 bg-white/[0.03] p-4 sm:p-5 text-[12px] text-[#afbdd2] leading-relaxed">
                A clean coverage pass is more reliable than fast angle hops. The scan stays slow enough for the camera to lock the object, while still feeling guided.
              </div>
            </div>

            <div className="order-1 lg:order-2 min-w-0">
              <div className="relative overflow-hidden rounded-[28px] border border-white/8 bg-black shadow-[0_24px_80px_rgba(0,0,0,0.45)] min-h-[52vh] sm:min-h-[60vh] lg:min-h-[78vh]">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
                <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />
                {phase === "recording" && (
                  <MotionGuide phase={currentPhase} phaseProgress={phaseProgress} capturedCount={capturedCount} totalCount={SCAN_PHASES.length} isRecording={true} />
                )}
                {phase === "recording" && (
                  <div className="absolute inset-x-4 bottom-4 z-10">
                    <FingerprintHint
                      status={fingerprintStatus}
                      prompt={fingerprintPrompt}
                      missingViews={fingerprintMissingViews}
                      confidence={fingerprintConfidence}
                    />
                  </div>
                )}
                {phase === "review" && (
                  <div className="absolute inset-x-4 bottom-4 z-10 rounded-3xl border border-white/10 bg-black/70 backdrop-blur-md p-4 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.28em] text-[#febd69] font-bold">Identity check</p>
                        <p className="text-[14px] font-semibold text-white">
                          {fingerprintStatus === "matched"
                            ? "Intended product confirmed"
                            : fingerprintStatus === "mismatch"
                            ? "This does not look like the intended product"
                            : "Waiting for identity review"}
                        </p>
                      </div>
                      <div className={`rounded-full px-3 py-1 text-[11px] font-bold ${fingerprintStatus === "matched" ? "bg-[#05261d] text-[#67e8a4]" : fingerprintStatus === "mismatch" ? "bg-[#3a0f16] text-[#ff9aa9]" : "bg-white/10 text-white/70"}`}>
                        {fingerprintStatus === "matched" ? "Matched" : fingerprintStatus === "mismatch" ? "Mismatch" : "Pending"}
                      </div>
                    </div>
                    {fingerprintPrompt && <p className="mt-2 text-[12px] leading-6 text-[#d5deeb]">{fingerprintPrompt}</p>}
                    {fingerprintMissingViews.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {fingerprintMissingViews.map((view) => (
                          <span key={view} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/80">
                            {view}
                          </span>
                        ))}
                      </div>
                    )}
                    {typeof fingerprintConfidence === "number" && (
                      <p className="mt-2 text-[11px] text-white/50">Confidence {fingerprintConfidence}%</p>
                    )}
                    <div className="mt-3">
                      <DebugPanel data={fingerprintDebugResponse} />
                    </div>
                  </div>
                )}
                {phase === "aborted" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10 p-4 sm:p-6">
                    <div className="max-w-md w-full rounded-[28px] border border-red-500/30 bg-black/60 backdrop-blur-md p-6 text-center shadow-[0_18px_60px_rgba(220,38,38,0.2)]">
                      <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-3xl mb-4">🚫</div>
                      <p className="text-[20px] font-bold text-white mb-2">Wrong Product</p>
                      <p className="text-[14px] text-red-200 mb-6">
                        {fingerprintPrompt || "The scanned product does not match the expected order."}
                      </p>
                      <div className="mt-3 text-left bg-black/40 p-4 rounded-xl mb-6 text-[12px] text-white/70 overflow-auto max-h-32">
                         <p><strong>Expected:</strong> {productName}</p>
                         <p className="mt-1"><strong>Detected:</strong> {fingerprintDebugResponse?.observed_product_type || "Unknown"}</p>
                         {fingerprintDebugResponse?.reason && (
                           <p className="mt-1 leading-relaxed"><strong>Reason:</strong> {fingerprintDebugResponse.reason}</p>
                         )}
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={onCancel}
                          className="flex-1 py-3 rounded-xl font-bold bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleRetake}
                          className="flex-1 py-3 rounded-xl font-bold bg-red-500 hover:bg-red-600 text-white transition-colors shadow-lg"
                        >
                          Scan Again
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {phase === "intro" && cameraReady && (
                  <div className="absolute inset-0 flex items-end sm:items-center justify-center bg-black/28 z-10 p-4 sm:p-6">
                    <div className="max-w-md w-full rounded-[28px] border border-white/10 bg-black/45 backdrop-blur-md p-5 sm:p-6 text-center shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
                      <div className="mx-auto w-16 h-16 rounded-full bg-[#febd69]/15 border border-[#febd69]/20 flex items-center justify-center text-2xl mb-3">🎥</div>
                      <p className="text-[17px] font-semibold mb-1">Ready to begin</p>
                      <p className="text-[12px] sm:text-[13px] text-[#b7c4d9] leading-relaxed">
                        The scan will walk you through each side slowly so the object can be captured like a fingerprint.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-[24px] border border-white/8 bg-[#09111f] p-3 sm:p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div className="text-[12px] text-[#9fb1cb]">
                  {phase === "intro" ? (
                    <span>6 passes · slower motion · full-screen capture</span>
                  ) : (
                    <span>Phase {currentPhaseIdx + 1}/{SCAN_PHASES.length} · {currentPhase.motion}</span>
                  )}
                </div>
                <div className="flex gap-3">
                  {onCancel && (
                    <button onClick={onCancel} className="px-4 py-3 rounded-xl border border-white/10 text-[#c7d3e6] text-[13px] font-semibold hover:bg-white/5 transition-colors">
                      Cancel
                    </button>
                  )}
                  {phase === "intro" && (
                    <button
                      onClick={startRecording}
                      disabled={!cameraReady}
                      className="px-5 py-3 rounded-xl font-semibold text-[14px] text-[#0f1111] disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                      style={{ backgroundColor: accentColor }}
                    >
                      <span className="w-3 h-3 rounded-full bg-red-600 inline-block" />
                      Start scan
                    </button>
                  )}
                  {phase === "recording" && (
                    <div className="px-5 py-3 rounded-xl bg-[#111827] text-center text-[13px] text-white font-semibold border border-white/8 min-w-[12rem]">
                      {currentPhase.label}
                    </div>
                  )}
                  {phase === "review" && (
                    <button
                      onClick={handleSubmit}
                      disabled={fingerprintStatus !== "matched" || capturedCount < 2}
                      className="px-5 py-3 rounded-xl font-semibold text-[14px] text-[#0f1111] disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                      style={{ backgroundColor: accentColor }}
                    >
                      {fingerprintStatus === "pending"
                        ? "Verifying identity…"
                        : fingerprintStatus === "mismatch"
                        ? "Retake required"
                        : `Submit scan (${capturedCount} frames)`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
