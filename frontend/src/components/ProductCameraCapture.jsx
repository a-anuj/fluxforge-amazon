/**
 * ProductCameraCapture
 *
 * Full-screen guided camera that captures FRONT and BACK photos of a product.
 *
 * Props:
 *   onCapture(files)   called with { front: File, back: File } when both shots done
 *   onClose()          called when user taps ✕
 *   title              optional override for the header title
 *
 * Detection logic (canvas-based, no ML):
 *   Every 300 ms the component samples brightness-variance of pixels inside the
 *   guide frame. High variance (textured product surface) → green border + 2-second
 *   auto-capture countdown. Medium variance → orange. Low variance (empty / white
 *   background) → red. The user can also tap "Capture" at any time.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { checkIdentity } from "../api/client";

// Variance thresholds — tune if needed
const VARIANCE_GREEN  = 1200;   // product clearly in frame
const VARIANCE_ORANGE =  400;   // partial / background-heavy

// Auto-capture countdown (ms after green is reached)
const AUTO_CAPTURE_DELAY = 2000;

function useCameraStream() {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    async function start() {
      try {
        const constraints = [
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
          { video: true },
        ];
        let stream = null;
        for (const c of constraints) {
          try { stream = await navigator.mediaDevices.getUserMedia(c); break; }
          catch { /* try next */ }
        }
        if (!stream) throw new Error("Camera not available.");
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        
        const checkRef = setInterval(() => {
            if (videoRef.current && videoRef.current.srcObject !== stream) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => { if (active) setReady(true); };
            }
        }, 100);
        
        return () => {
          clearInterval(checkRef);
          active = false;
          streamRef.current?.getTracks().forEach(t => t.stop());
        };
      } catch (e) {
        if (active) setError(e.message || "Could not access camera.");
      }
    }

    start();
  }, []);

  return { videoRef, ready, error };
}

/** Sample brightness variance of pixels inside a rect on a canvas */
function sampleVariance(ctx, x, y, w, h) {
  try {
    const data = ctx.getImageData(x, y, w, h).data;
    let sum = 0, sum2 = 0, n = 0;
    for (let i = 0; i < data.length; i += 16) { // stride=4 for perf
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += lum; sum2 += lum * lum; n++;
    }
    if (n === 0) return 0;
    const mean = sum / n;
    return sum2 / n - mean * mean;
  } catch { return 0; }
}

function frameColor(variance) {
  if (variance >= VARIANCE_GREEN)  return "green";
  if (variance >= VARIANCE_ORANGE) return "orange";
  return "red";
}

const FRAME_COLOR_STYLES = {
  green:  { border: "#22c55e", shadow: "rgba(34,197,94,0.45)",  glow: "rgba(34,197,94,0.2)" },
  orange: { border: "#f97316", shadow: "rgba(249,115,22,0.4)",  glow: "rgba(249,115,22,0.1)" },
  red:    { border: "#ef4444", shadow: "rgba(239,68,68,0.35)",  glow: "rgba(239,68,68,0.05)" },
};

const SHOT_META = [
  { key: "front", label: "Front",  hint: "Place the front of the product inside the frame" },
  { key: "back",  label: "Back",   hint: "Now flip the product and show the back" },
];

export default function ProductCameraCapture({ onCapture, onClose, title = "Capture Product Photos", orderId, reason }) {
  const { videoRef, ready, error } = useCameraStream();
  const canvasRef     = useRef(null);   // hidden canvas for sampling + capture
  const samplerRef    = useRef(null);   // interval handle
  const countdownRef  = useRef(null);   // timeout handle for auto-capture

  const [shotIndex,    setShotIndex]    = useState(0);   // 0 = front, 1 = back
  const [shots,        setShots]        = useState({});  // { front: {file,url}, back: {file,url} }
  const [frameState,   setFrameState]   = useState("red");
  const [countdown,    setCountdown]    = useState(null); // 2,1 or null
  const [capturing,    setCapturing]    = useState(false);
  const [showPreview,  setShowPreview]  = useState(false); // between shots
  
  const [isCheckingIdentity, setIsCheckingIdentity] = useState(false);
  const [identityError, setIdentityError] = useState(null);

  const meta = SHOT_META[shotIndex];

  // ── Capture a frame from the video ──────────────────────────────────────
  const captureFrame = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !ready) return null;

    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise(resolve => {
      canvas.toBlob(blob => {
        if (!blob) { resolve(null); return; }
        const file = new File([blob], `${meta.key}-product.jpg`, { type: "image/jpeg" });
        const url  = URL.createObjectURL(blob);
        resolve({ file, url });
      }, "image/jpeg", 0.92);
    });
  }, [ready, meta.key, videoRef]);

  // ── Auto-detect loop ──────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || showPreview) return;

    samplerRef.current = setInterval(() => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      // Draw a small version for sampling only
      const W = 320, H = 240;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, W, H);

      // Guide frame occupies ~55% of width / ~65% of height, centered
      const fw = Math.round(W * 0.55);
      const fh = Math.round(H * 0.65);
      const fx = Math.round((W - fw) / 2);
      const fy = Math.round((H - fh) / 2);
      const variance = sampleVariance(ctx, fx, fy, fw, fh);
      const color = frameColor(variance);
      setFrameState(color);
    }, 300);

    return () => clearInterval(samplerRef.current);
  }, [ready, showPreview]);

  // ── Auto-capture countdown on green ──────────────────────────────────
  useEffect(() => {
    if (frameState !== "green" || showPreview || capturing) {
      clearTimeout(countdownRef.current);
      setCountdown(null);
      return;
    }

    // Start 2-second countdown
    setCountdown(2);
    const t1 = setTimeout(() => setCountdown(1), 1000);
    countdownRef.current = setTimeout(async () => {
      setCountdown(null);
      await doCapture();
    }, AUTO_CAPTURE_DELAY);

    return () => { clearTimeout(t1); clearTimeout(countdownRef.current); };
  }, [frameState, showPreview]);

  // ── Manual / auto capture ─────────────────────────────────────────────
  const doCapture = useCallback(async () => {
    if (capturing) return;
    setCapturing(true);
    clearTimeout(countdownRef.current);
    setCountdown(null);
    clearInterval(samplerRef.current);

    const shot = await captureFrame();
    if (!shot) { setCapturing(false); return; }

    setShots(prev => ({ ...prev, [meta.key]: shot }));
    setCapturing(false);
    setShowPreview(true);
  }, [capturing, captureFrame, meta.key]);

  // ── Advance after approving a shot ───────────────────────────────────
  const confirmShot = async () => {
    if (shotIndex === 0) {
      if (reason !== "wrong_item" && orderId) {
        setIsCheckingIdentity(true);
        setIdentityError(null);
        try {
          const res = await checkIdentity(orderId, shots.front.file);
          if (!res.matches) {
            setIdentityError(res.note || "Product does not match order.");
            setIsCheckingIdentity(false);
            return; // block advancing to back shot
          }
        } catch (e) {
          console.warn("Identity check error:", e);
          // fall through if network fails, or we can choose to block
        }
        setIsCheckingIdentity(false);
      }
      
      setShowPreview(false);
      setShotIndex(1);
      setFrameState("red");
    } else {
      // Both shots done → deliver to parent
      const front = shots.front?.file;
      const back  = shots.back?.file  || shots.front?.file; // fallback if somehow missing
      if (front && back) onCapture({ front, back });
    }
  };

  const retakeShot = () => {
    setShots(prev => { const n = { ...prev }; delete n[meta.key]; return n; });
    setShowPreview(false);
    setFrameState("red");
  };

  const colorStyle = FRAME_COLOR_STYLES[frameState];

  // ── Error screen ─────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0f1923] flex flex-col items-center justify-center p-6 text-center">
        <div className="text-[48px] mb-4">📷</div>
        <p className="text-white text-[18px] font-bold mb-2">Camera unavailable</p>
        <p className="text-[#8a9bb0] text-[14px] mb-6 max-w-xs">{error}</p>
        <p className="text-[#8a9bb0] text-[12px] mb-8">Allow camera access in your browser settings and try again.</p>
        <button onClick={onClose}
          className="bg-white text-[#0f1923] font-bold px-6 py-3 rounded-xl text-[14px] hover:bg-[#f0f2f2] transition-colors">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Hidden canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Header ── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-safe-top py-3 bg-gradient-to-b from-black/70 to-transparent">
        <div>
          <p className="text-white font-bold text-[16px] leading-tight">{title}</p>
          <p className="text-white/60 text-[12px]">
            Shot {shotIndex + 1} of 2 — <span className="text-white/90 font-semibold">{meta.label} view</span>
          </p>
        </div>
        <button onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          style={{ WebkitTapHighlightColor: "transparent" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5 text-white">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Shot progress dots ── */}
      <div className="absolute top-16 left-0 right-0 z-20 flex justify-center gap-2">
        {SHOT_META.map((s, i) => (
          <div key={s.key} className={`h-1.5 rounded-full transition-all duration-300 ${
            i < shotIndex ? "w-6 bg-[#22c55e]"
            : i === shotIndex ? "w-6 bg-white"
            : "w-3 bg-white/30"
          }`} />
        ))}
      </div>

      {/* ── Live viewfinder ── */}
      {!showPreview && (
        <>
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: "scaleX(1)" }}
          />

          {/* Frame border glow */}
          <div
            className="absolute z-10 pointer-events-none transition-all duration-300"
            style={getFramePos()}
          >
            {/* Animated border */}
            <div
              className="w-full h-full rounded-2xl transition-all duration-300"
              style={{
                border: `3px solid ${colorStyle.border}`,
                boxShadow: `0 0 0 3px ${colorStyle.glow}, 0 0 24px 4px ${colorStyle.shadow}`,
              }}
            />
            {/* Corner brackets */}
            <CornerBrackets color={colorStyle.border} />
          </div>

          {/* ── Bottom controls ── */}
          <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center pb-safe-bottom pb-8 gap-4">
            {/* Status pill */}
            <StatusPill frameState={frameState} countdown={countdown} />

            {/* Hint text */}
            <p className="text-white/70 text-[13px] text-center px-8 leading-snug">
              {meta.hint}
            </p>

            {/* Capture button */}
            <button
              onClick={doCapture}
              disabled={capturing || !ready}
              className="w-[72px] h-[72px] rounded-full bg-white disabled:opacity-50 flex items-center justify-center shadow-2xl active:scale-[0.94] transition-transform"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <div
                className="w-[60px] h-[60px] rounded-full border-4 transition-colors duration-300"
                style={{ borderColor: colorStyle.border, backgroundColor: capturing ? colorStyle.border : "transparent" }}
              />
            </button>
            <p className="text-white/40 text-[11px]">
              {ready ? (frameState === "green" ? "Auto-capturing…" : "Tap to capture manually") : "Starting camera…"}
            </p>
          </div>
        </>
      )}

      {/* ── Between-shot preview ── */}
      {showPreview && shots[meta.key] && (
        <div className="flex flex-col items-center justify-center h-full px-6 text-center z-20 relative">
          {/* Thumbnail */}
          <div className="relative mb-6">
            <img
              src={shots[meta.key].url}
              alt={meta.label}
              className="w-[200px] h-[200px] sm:w-[260px] sm:h-[260px] object-cover rounded-2xl border-4 border-[#22c55e] shadow-2xl"
            />
            <div className="absolute -top-3 -right-3 w-9 h-9 bg-[#22c55e] rounded-full flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          </div>

          <p className="text-white text-[20px] font-bold mb-1">
            {meta.label} photo captured!
          </p>
          <p className="text-white/60 text-[14px] mb-8">
            {shotIndex === 0
              ? "Looks good. Now capture the back of the product."
              : "Both photos captured. Ready to submit."}
          </p>

          <div className="flex gap-3 w-full max-w-[320px]">
            <button
              onClick={retakeShot}
              disabled={isCheckingIdentity}
              className="flex-1 py-3 rounded-xl border-2 border-white/30 text-white font-semibold text-[14px] hover:bg-white/10 active:bg-white/20 transition-colors disabled:opacity-50"
            >
              Retake
            </button>
            <button
              onClick={confirmShot}
              disabled={isCheckingIdentity}
              className="flex-[2] py-3 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-white font-bold text-[14px] shadow-lg active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isCheckingIdentity ? "Checking..." : (shotIndex === 0 ? "Next: Back →" : "Use these photos ✓")}
            </button>
          </div>
          
          {identityError && (
            <div className="mt-6 bg-red-500/20 text-red-100 border border-red-500/50 p-4 rounded-xl text-[14px] max-w-[320px]">
              <p className="font-bold mb-1">Identity Check Failed</p>
              <p>{identityError}</p>
              <p className="mt-2 text-[12px] opacity-80">Please tap Retake and ensure you are capturing the correct product.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helper: frame position (same proportions as guide mask) ───────────────
function getFramePos() {
  // 62vw wide, 72vh tall, centered — matches the SVG cutout below
  return {
    top: "14vh",
    left: "19vw",
    width: "62vw",
    height: "72vh",
  };
}



// ── Corner brackets ───────────────────────────────────────────────────────
function CornerBrackets({ color }) {
  const len = "20px", thick = "3px";
  const corners = [
    { top: -1, left: -1,  borderTop: thick, borderLeft: thick,  borderRadius: "6px 0 0 0" },
    { top: -1, right: -1, borderTop: thick, borderRight: thick, borderRadius: "0 6px 0 0" },
    { bottom: -1, left: -1,  borderBottom: thick, borderLeft: thick,  borderRadius: "0 0 0 6px" },
    { bottom: -1, right: -1, borderBottom: thick, borderRight: thick, borderRadius: "0 0 6px 0" },
  ];
  return (
    <>
      {corners.map((style, i) => (
        <div
          key={i}
          className="absolute transition-colors duration-300"
          style={{
            ...style,
            width: len,
            height: len,
            borderColor: color,
          }}
        />
      ))}
    </>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────
function StatusPill({ frameState, countdown }) {
  const cfg = {
    green:  { bg: "bg-[#22c55e]", text: countdown ? `Auto-capturing in ${countdown}…` : "Product detected — hold still" },
    orange: { bg: "bg-[#f97316]", text: "Move closer — centre the product" },
    red:    { bg: "bg-[#ef4444]", text: "Place product inside the frame" },
  }[frameState];

  return (
    <div className={`${cfg.bg} px-4 py-1.5 rounded-full shadow-lg transition-colors duration-300`}>
      <p className="text-white text-[13px] font-semibold">{cfg.text}</p>
    </div>
  );
}
