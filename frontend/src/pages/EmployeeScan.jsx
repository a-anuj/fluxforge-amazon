import { useState, useEffect, useRef, useCallback } from "react";
import { useUser } from "../context/UserContext";
import { getPendingBaselineOrders, submitBaselineScan } from "../api/client";

/* ─── Scan angle definitions ─────────────────────────────────────────────── */
const ANGLES = [
  { id: "front",   label: "Front Face",    icon: "⬜", hint: "Hold product facing you, centred in frame" },
  { id: "back",    label: "Back Panel",    icon: "🔲", hint: "Flip product — show the back side completely" },
  { id: "left",    label: "Left Side",     icon: "◀",  hint: "Rotate left — show the left edge / profile" },
  { id: "right",   label: "Right Side",    icon: "▶",  hint: "Rotate right — show the right edge / profile" },
  { id: "top",     label: "Top / Ports",   icon: "🔼", hint: "Tilt up — show any ports, buttons or labels on top" },
  { id: "label",   label: "Label / Serial", icon: "🏷", hint: "Closeup of serial number, model tag or brand label" },
];

/* ─── Animated guide overlay (pulsing corner brackets) ───────────────────── */
function ScanGuide({ active, captured }) {
  const color = captured ? "#22c55e" : active ? "#febd69" : "#ffffff55";
  const style = { borderColor: color, transition: "border-color 0.4s" };
  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
      {/* Corner brackets */}
      <div className="relative w-48 h-48">
        {[
          "top-0 left-0 border-t-4 border-l-4 rounded-tl-lg",
          "top-0 right-0 border-t-4 border-r-4 rounded-tr-lg",
          "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg",
          "bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg",
        ].map((cls, i) => (
          <div key={i} className={`absolute w-10 h-10 ${cls}`} style={style} />
        ))}
        {captured && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl animate-bounce">✅</span>
          </div>
        )}
        {active && !captured && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-[#febd69] animate-ping opacity-80" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Live Camera Component ───────────────────────────────────────────────── */
function LiveCamera({ onCapture, captured, currentAngle }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState(null);

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
    } catch (err) {
      setError("Camera access denied. Please allow camera access and refresh.");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    onCapture(dataUrl);
  };

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black text-white text-center p-6">
        <div>
          <div className="text-4xl mb-3">📷</div>
          <p className="text-[14px] text-red-400 font-semibold">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 bg-black overflow-hidden">
      <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />
      <ScanGuide active={cameraReady} captured={captured} />

      {/* Angle label overlay */}
      <div className="absolute top-4 left-0 right-0 flex justify-center z-20">
        <div className="bg-black/70 text-white text-[13px] font-bold px-4 py-2 rounded-full backdrop-blur-sm">
          {currentAngle.icon} {currentAngle.label}
        </div>
      </div>

      {/* Capture button */}
      {!captured && cameraReady && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center z-20">
          <button
            onClick={handleCapture}
            className="w-16 h-16 rounded-full bg-white border-4 border-[#febd69] flex items-center justify-center shadow-xl active:scale-95 transition-transform hover:bg-[#febd69]"
            aria-label="Capture photo"
          >
            <div className="w-10 h-10 rounded-full bg-[#232f3e]" />
          </button>
        </div>
      )}

      {captured && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center z-20">
          <div className="bg-[#22c55e] text-white font-bold px-6 py-3 rounded-full shadow-lg text-[14px]">
            ✓ Captured! Move to next angle ›
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Thumbnail strip ─────────────────────────────────────────────────────── */
function ThumbnailStrip({ angles, captures, currentIdx, onSelect }) {
  return (
    <div className="flex gap-2 px-4 py-3 overflow-x-auto bg-[#1a1f2e]">
      {angles.map((ang, i) => {
        const img = captures[ang.id];
        const isActive = i === currentIdx;
        const isDone = !!img;
        return (
          <button
            key={ang.id}
            onClick={() => onSelect(i)}
            className={`flex-shrink-0 flex flex-col items-center gap-1 transition-all ${
              isActive ? "scale-110" : "opacity-70 hover:opacity-100"
            }`}
          >
            <div
              className={`w-14 h-14 rounded-lg overflow-hidden border-2 flex items-center justify-center text-xl ${
                isDone
                  ? "border-[#22c55e] bg-[#022c22]"
                  : isActive
                  ? "border-[#febd69] bg-[#2d2416]"
                  : "border-[#334155] bg-[#0f172a]"
              }`}
            >
              {img ? (
                <img src={img} alt={ang.label} className="w-full h-full object-cover" />
              ) : (
                <span>{ang.icon}</span>
              )}
            </div>
            <span className={`text-[9px] font-bold ${isDone ? "text-[#22c55e]" : isActive ? "text-[#febd69]" : "text-[#94a3b8]"}`}>
              {isDone ? "✓" : ang.label.split(" ")[0]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Order Picker ───────────────────────────────────────────────────────── */
function OrderPicker({ orders, selectedOrder, onSelect, loading }) {
  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex-shrink-0 w-[180px] h-[90px] rounded-xl bg-[#1e293b] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!orders.length) {
    return (
      <div className="text-center py-8 text-[#94a3b8]">
        <div className="text-3xl mb-2">📦</div>
        <p className="text-[13px]">No pending deliveries in your zone</p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {orders.map((o) => (
        <button
          key={o.order_id}
          onClick={() => onSelect(o)}
          className={`flex-shrink-0 w-[200px] text-left rounded-xl border-2 p-3 transition-all ${
            selectedOrder?.order_id === o.order_id
              ? "border-[#febd69] bg-[#2d2416]"
              : "border-[#334155] bg-[#1e293b] hover:border-[#febd69]/50"
          }`}
        >
          {o.product_image && (
            <img src={o.product_image} alt="" className="w-10 h-10 object-contain mb-2 rounded" />
          )}
          <p className="text-[12px] font-bold text-white truncate">{o.product_name}</p>
          <p className="text-[11px] text-[#94a3b8]">Order #{o.order_id}</p>
          <p className="text-[11px] text-[#94a3b8] truncate">→ {o.customer_name}</p>
          {o.has_no_return_policy ? (
            <span className="inline-block mt-1 text-[9px] bg-red-900 text-red-300 px-1.5 py-0.5 rounded font-bold">NO RETURN</span>
          ) : (
            <span className="inline-block mt-1 text-[9px] bg-[#064e3b] text-[#6ee7b7] px-1.5 py-0.5 rounded font-bold">
              {o.return_period_days}d return
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ─── Success Screen ──────────────────────────────────────────────────────── */
function SuccessScreen({ result, onReset }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-6 bg-[#030712]">
      <div className="text-7xl animate-bounce">✅</div>
      <div>
        <h2 className="text-[22px] font-bold text-white mb-2">Baseline Scan Recorded!</h2>
        <p className="text-[#94a3b8] text-[14px] max-w-sm mx-auto">
          {result?.angles_recorded} angles captured for <strong className="text-white">{result?.product}</strong>.
          The AI will use this as the source of truth during any return inspection.
        </p>
      </div>
      <div className="bg-[#1e293b] rounded-xl p-4 text-left w-full max-w-sm">
        <p className="text-[12px] text-[#94a3b8] font-bold uppercase tracking-wider mb-2">Scan Summary</p>
        <div className="space-y-1 text-[13px]">
          <div className="flex justify-between"><span className="text-[#94a3b8]">Order #</span><span className="text-white font-bold">{result?.order_id}</span></div>
          <div className="flex justify-between"><span className="text-[#94a3b8]">Angles</span><span className="text-[#22c55e] font-bold">{result?.angles_recorded} captured</span></div>
          <div className="flex justify-between"><span className="text-[#94a3b8]">Employee</span><span className="text-white">{result?.employee}</span></div>
          <div className="flex justify-between"><span className="text-[#94a3b8]">Time</span><span className="text-white">{new Date(result?.baseline_scan_at).toLocaleTimeString()}</span></div>
        </div>
      </div>
      <button
        onClick={onReset}
        className="bg-[#febd69] hover:bg-[#f3a847] text-[#0f1111] font-bold px-8 py-3 rounded-lg transition-colors"
      >
        Scan Next Delivery →
      </button>
    </div>
  );
}

/* ─── Main EmployeeScan Page ──────────────────────────────────────────────── */
export default function EmployeeScan() {
  const { currentUser } = useUser();
  const [pendingOrders, setPendingOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [currentAngleIdx, setCurrentAngleIdx] = useState(0);
  const [captures, setCaptures] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState("pick"); // "pick" | "scan" | "review" | "done"

  // Guard — only employees can access this page
  const isEmployee = currentUser?.role === "employee";

  useEffect(() => {
    if (!currentUser || !isEmployee) return;
    setLoadingOrders(true);
    getPendingBaselineOrders(currentUser.id)
      .then(setPendingOrders)
      .catch(() => setPendingOrders([]))
      .finally(() => setLoadingOrders(false));
  }, [currentUser, isEmployee]);

  const capturedCount = Object.keys(captures).length;
  const allCaptured = capturedCount >= ANGLES.length;
  const currentAngle = ANGLES[currentAngleIdx];

  const handleCapture = (dataUrl) => {
    setCaptures((prev) => ({ ...prev, [currentAngle.id]: dataUrl }));
    // Auto-advance to next uncaptured angle
    setTimeout(() => {
      const nextIdx = ANGLES.findIndex((a, i) => i > currentAngleIdx && !captures[a.id]);
      if (nextIdx !== -1) setCurrentAngleIdx(nextIdx);
    }, 600);
  };

  const handleSubmit = async () => {
    if (!selectedOrder || capturedCount < 2) return;
    setSubmitting(true);
    setError(null);
    try {
      const images = ANGLES.map((a) => captures[a.id]).filter(Boolean);
      const res = await submitBaselineScan(selectedOrder.order_id, currentUser.id, images);
      setResult(res);
      setPhase("done");
    } catch (err) {
      setError(err.message || "Failed to submit scan. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedOrder(null);
    setCaptures({});
    setCurrentAngleIdx(0);
    setResult(null);
    setError(null);
    setPhase("pick");
    // Refresh pending orders
    if (currentUser && isEmployee) {
      getPendingBaselineOrders(currentUser.id).then(setPendingOrders).catch(() => {});
    }
  };

  // ── Not an employee ───────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center">
        <p className="text-[#94a3b8]">Loading…</p>
      </div>
    );
  }

  if (!isEmployee) {
    return (
      <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-5xl">🔒</div>
        <h2 className="text-[20px] font-bold text-white">Employee Access Only</h2>
        <p className="text-[#94a3b8] text-[14px] max-w-sm">
          This page is for Amazon delivery employees. Switch to an employee profile
          using the user switcher in the top navigation to access this feature.
        </p>
        <div className="mt-2 bg-[#1e293b] rounded-xl p-4 text-left max-w-sm w-full">
          <p className="text-[11px] text-[#febd69] font-bold uppercase tracking-wider mb-2">Demo Tip</p>
          <p className="text-[12px] text-[#94a3b8]">
            Switch to <strong className="text-white">Ravi Delivery Agent</strong> or{" "}
            <strong className="text-white">Sneha Delivery Agent</strong> in the Accounts dropdown.
          </p>
        </div>
      </div>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div className="min-h-screen bg-[#030712] flex flex-col">
        <SuccessScreen result={result} onReset={handleReset} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712] flex flex-col text-white">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-[#131921] border-b border-[#1e293b] px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#febd69] flex items-center justify-center text-xl flex-shrink-0">
          📦
        </div>
        <div>
          <h1 className="text-[16px] font-bold text-white">Delivery Baseline Scan</h1>
          <p className="text-[11px] text-[#94a3b8]">
            {currentUser.name} · {currentUser.employee_zone || "Delivery Agent"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] bg-[#febd69] text-[#0f1111] font-bold px-2 py-0.5 rounded-full">
            EMPLOYEE
          </span>
        </div>
      </div>

      {/* ── Pick Order Phase ────────────────────────────────────────────────── */}
      {phase === "pick" && (
        <div className="flex-1 flex flex-col gap-0 overflow-y-auto">
          <div className="px-4 pt-5 pb-3">
            <h2 className="text-[15px] font-bold mb-1">Select Delivery to Scan</h2>
            <p className="text-[12px] text-[#94a3b8]">
              Choose the order you are delivering right now. You'll capture {ANGLES.length} angles to
              create the product's condition baseline.
            </p>
          </div>

          <div className="px-4 pb-4">
            <OrderPicker
              orders={pendingOrders}
              selectedOrder={selectedOrder}
              onSelect={setSelectedOrder}
              loading={loadingOrders}
            />
          </div>

          {selectedOrder && (
            <div className="px-4 pb-6">
              <div className="bg-[#1e293b] rounded-xl p-4 mb-4 border border-[#334155]">
                <div className="flex items-start gap-3">
                  {selectedOrder.product_image && (
                    <img src={selectedOrder.product_image} alt="" className="w-14 h-14 object-contain rounded-lg" />
                  )}
                  <div className="flex-1">
                    <p className="font-bold text-[14px] text-white">{selectedOrder.product_name}</p>
                    <p className="text-[12px] text-[#94a3b8]">Order #{selectedOrder.order_id}</p>
                    <p className="text-[12px] text-[#94a3b8]">Customer: {selectedOrder.customer_name} · {selectedOrder.customer_pincode}</p>
                    <div className="mt-1">
                      {selectedOrder.has_no_return_policy ? (
                        <span className="text-[11px] bg-red-900 text-red-300 px-2 py-0.5 rounded font-bold">
                          NO RETURN POLICY
                        </span>
                      ) : (
                        <span className="text-[11px] bg-[#064e3b] text-[#6ee7b7] px-2 py-0.5 rounded font-bold">
                          {selectedOrder.return_period_days}-day return window
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* What we'll capture */}
              <div className="bg-[#0f1a2e] rounded-xl p-4 mb-4 border border-[#1e3a5f]">
                <p className="text-[12px] text-[#60a5fa] font-bold mb-3 uppercase tracking-wider">
                  📸 {ANGLES.length} Angles to Capture
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {ANGLES.map((a) => (
                    <div key={a.id} className="flex items-center gap-1.5 text-[12px]">
                      <span>{a.icon}</span>
                      <span className="text-[#cbd5e1]">{a.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setPhase("scan")}
                className="w-full bg-[#febd69] hover:bg-[#f3a847] text-[#0f1111] font-bold py-4 rounded-xl text-[16px] transition-colors flex items-center justify-center gap-2"
              >
                📸 Start Baseline Scan
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Scan Phase ──────────────────────────────────────────────────────── */}
      {phase === "scan" && (
        <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
          {/* Progress bar */}
          <div className="px-4 py-2 bg-[#0f172a]">
            <div className="flex justify-between text-[11px] text-[#94a3b8] mb-1">
              <span>{capturedCount} / {ANGLES.length} angles captured</span>
              <span>{allCaptured ? "Ready to submit!" : `${ANGLES.length - capturedCount} remaining`}</span>
            </div>
            <div className="h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#febd69] rounded-full transition-all duration-500"
                style={{ width: `${(capturedCount / ANGLES.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Hint bar */}
          <div className="bg-[#0c1a3a] px-4 py-2 text-center">
            <p className="text-[12px] text-[#93c5fd]">
              💡 {currentAngle.hint}
            </p>
          </div>

          {/* Camera feed */}
          <div className="flex-1 relative" style={{ minHeight: "50vh" }}>
            <LiveCamera
              onCapture={handleCapture}
              captured={!!captures[currentAngle.id]}
              currentAngle={currentAngle}
            />
          </div>

          {/* Thumbnail strip */}
          <ThumbnailStrip
            angles={ANGLES}
            captures={captures}
            currentIdx={currentAngleIdx}
            onSelect={setCurrentAngleIdx}
          />

          {/* Actions */}
          <div className="px-4 py-3 bg-[#0f172a] flex gap-3">
            <button
              onClick={() => { setPhase("pick"); setCaptures({}); setCurrentAngleIdx(0); }}
              className="flex-1 py-3 rounded-xl border border-[#334155] text-[#94a3b8] hover:border-[#febd69] hover:text-white text-[13px] font-bold transition-all"
            >
              ← Back
            </button>
            {capturedCount >= 2 && (
              <button
                onClick={() => setPhase("review")}
                className={`flex-[2] py-3 rounded-xl font-bold text-[14px] transition-all ${
                  allCaptured
                    ? "bg-[#22c55e] hover:bg-[#16a34a] text-white"
                    : "bg-[#1e293b] border border-[#22c55e] text-[#22c55e] hover:bg-[#022c22]"
                }`}
              >
                {allCaptured ? "✅ Review & Submit" : `Review (${capturedCount} captured)`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Review Phase ─────────────────────────────────────────────────────── */}
      {phase === "review" && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-5 pb-3">
            <h2 className="text-[15px] font-bold mb-1">Review Baseline Scan</h2>
            <p className="text-[12px] text-[#94a3b8]">
              Verify all angles look clear before submitting. Tap any image to retake.
            </p>
          </div>

          <div className="px-4 grid grid-cols-2 gap-3 pb-4">
            {ANGLES.map((ang) => {
              const img = captures[ang.id];
              return (
                <div key={ang.id} className="rounded-xl overflow-hidden border-2 border-[#334155] bg-[#1e293b]">
                  <div className="relative">
                    {img ? (
                      <img src={img} alt={ang.label} className="w-full aspect-[4/3] object-cover" />
                    ) : (
                      <div className="w-full aspect-[4/3] flex items-center justify-center text-3xl bg-[#0f172a]">
                        {ang.icon}
                      </div>
                    )}
                    {!img && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <span className="text-red-400 text-[11px] font-bold">NOT CAPTURED</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-[11px] font-bold text-[#cbd5e1]">{ang.icon} {ang.label}</span>
                    <button
                      onClick={() => {
                        setCurrentAngleIdx(ANGLES.findIndex((a) => a.id === ang.id));
                        setCaptures((prev) => { const n = { ...prev }; delete n[ang.id]; return n; });
                        setPhase("scan");
                      }}
                      className="text-[10px] text-[#60a5fa] hover:text-[#93c5fd] font-bold"
                    >
                      Retake
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <div className="mx-4 mb-3 bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-[13px]">
              ⚠️ {error}
            </div>
          )}

          <div className="px-4 pb-6 flex gap-3">
            <button
              onClick={() => setPhase("scan")}
              className="flex-1 py-3 rounded-xl border border-[#334155] text-[#94a3b8] hover:border-[#febd69] hover:text-white text-[13px] font-bold transition-all"
            >
              ← Back to Scan
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || capturedCount < 2}
              className="flex-[2] py-3 rounded-xl bg-[#febd69] hover:bg-[#f3a847] text-[#0f1111] font-bold text-[14px] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#0f1111] border-t-transparent rounded-full animate-spin" />
                  Submitting…
                </>
              ) : (
                <>✅ Submit Baseline Scan</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
