import { useRef, useState } from "react";

const BASE_URL = `http://${window.location.hostname}:8000/api`;

// ── Classification badge config ───────────────────────────────────────────────
const BADGE = {
  RESALE:   { label: "RESALE",   bg: "bg-[#067d62]", icon: "", sub: "Ready for resale" },
  REFURBISH:{ label: "REFURBISH",bg: "bg-[#1a73e8]", icon: "", sub: "Needs refurbishment" },
  RECYCLE:  { label: "RECYCLE",  bg: "bg-[#c7511f]", icon: "", sub: "Recyclable materials" },
  DISPOSE:  { label: "DISPOSE",  bg: "bg-[#b12704]", icon: "🗑️", sub: "Beyond recovery" },
};

// ── Progress bar helper ────────────────────────────────────────────────────────
function ScoreBar({ value, max = 100, color = "#067d62" }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-[6px] bg-[#e8e8e8] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ── Step Indicator ─────────────────────────────────────────────────────────────
function StepIndicator({ currentStep }) {
  const steps = [
    { num: 1, label: "Upload & Quality Check" },
    { num: 2, label: "Product Verification" },
    { num: 3, label: "AI Assessment" },
  ];

  return (
    <div className="flex items-center justify-between px-2 mb-4">
      {steps.map((step, i) => (
        <div key={step.num} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold transition-colors
              ${currentStep > step.num ? "bg-[#067d62] text-white" :
                currentStep === step.num ? "bg-amazon-orange text-white" :
                "bg-[#e8e8e8] text-amazon-text-secondary"}`}>
              {currentStep > step.num ? "✓" : step.num}
            </div>
            <p className={`text-[9px] mt-1 text-center max-w-[70px] leading-tight
              ${currentStep >= step.num ? "text-amazon-text font-bold" : "text-amazon-text-secondary"}`}>
              {step.label}
            </p>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-12 h-[2px] mx-1 mb-4 ${currentStep > step.num ? "bg-[#067d62]" : "bg-[#e8e8e8]"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Upload Zone ────────────────────────────────────────────────────────────────
function UploadZone({ onFile, preview, qualityStatus }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  const borderColor = qualityStatus === "passed" ? "border-[#067d62]" :
    qualityStatus === "failed" ? "border-[#b12704]" :
    dragging ? "border-amazon-orange" : "border-[#adb1b8]";

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-lg cursor-pointer transition-all duration-200 flex flex-col items-center justify-center text-center
        ${borderColor} ${qualityStatus === "passed" ? "bg-[#f0f9f4]" : qualityStatus === "failed" ? "bg-[#fff5f5]" : "hover:border-amazon-orange hover:bg-[#fffdf9]"}
        ${preview ? "h-[180px]" : "h-[140px] py-6"}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {preview ? (
        <img src={preview} alt="preview" className="h-full w-full object-contain rounded-lg" />
      ) : (
        <>
          <span className="text-[32px] mb-2">📷</span>
          <p className="text-[13px] font-bold text-amazon-text">
            Click to upload or drag & drop
          </p>
          <p className="text-[11px] text-amazon-text-secondary mt-0.5">
            JPEG, PNG, WebP or GIF · max 5 MB
          </p>
        </>
      )}
      {preview && (
        <div className="absolute inset-0 bg-black/0 hover:bg-black/30 rounded-lg flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <span className="text-white text-[12px] font-bold bg-black/50 px-3 py-1 rounded">Change image</span>
        </div>
      )}
    </div>
  );
}

// ── Quality Result Panel ───────────────────────────────────────────────────────
function QualityResultPanel({ status, metadata, issues }) {
  if (status === "checking") {
    return (
      <div className="border border-amazon-border rounded-lg p-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#f0f2f2] flex items-center justify-center">
            <span className="text-[16px]">🔍</span>
          </div>
          <div>
            <p className="text-[13px] font-bold text-amazon-text">Analyzing image quality...</p>
            <p className="text-[11px] text-amazon-text-secondary">Checking resolution, sharpness, brightness & content</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "passed") {
    return (
      <div className="border border-[#d4edda] bg-[#f0f9f4] rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-[#067d62] flex items-center justify-center">
            <span className="text-white text-[14px]">✓</span>
          </div>
          <div>
            <p className="text-[13px] font-bold text-[#067d62]">Quality Check Passed</p>
            <p className="text-[11px] text-amazon-text-secondary">Image meets all requirements for AI analysis</p>
          </div>
        </div>
        {metadata && (
          <div className="grid grid-cols-3 gap-2 text-center bg-white rounded p-2 border border-[#d4edda]">
            <div>
              <p className="text-[14px] font-bold text-amazon-text">{metadata.resolution}</p>
              <p className="text-[9px] text-amazon-text-secondary">Resolution</p>
            </div>
            <div>
              <p className="text-[14px] font-bold text-amazon-text">{metadata.blur_score?.toFixed(0)}</p>
              <p className="text-[9px] text-amazon-text-secondary">Sharpness</p>
            </div>
            <div>
              <p className="text-[14px] font-bold text-amazon-text">{metadata.mean_brightness?.toFixed(0)}</p>
              <p className="text-[9px] text-amazon-text-secondary">Brightness</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="border border-[#ffd0d0] bg-[#fff5f5] rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-[#b12704] flex items-center justify-center">
            <span className="text-white text-[14px]">✕</span>
          </div>
          <div>
            <p className="text-[13px] font-bold text-[#b12704]">Quality Check Failed</p>
            <p className="text-[11px] text-amazon-text-secondary">Please fix the issues below and re-upload</p>
          </div>
        </div>
        {issues && issues.length > 0 && (
          <div className="space-y-2">
            {issues.map((issue, i) => (
              <div key={i} className="bg-white border border-[#ffd0d0] rounded p-3">
                <div className="flex items-start gap-2">
                  <span className="text-[12px] mt-0.5">⚠️</span>
                  <div>
                    <p className="text-[12px] font-bold text-[#b12704]">{issue.message}</p>
                    <p className="text-[11px] text-amazon-text mt-0.5">💡 {issue.suggestion}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {metadata && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center bg-white rounded p-2 border border-[#ffd0d0]">
            <div>
              <p className="text-[12px] font-bold text-amazon-text">{metadata.resolution || "—"}</p>
              <p className="text-[9px] text-amazon-text-secondary">Resolution</p>
            </div>
            <div>
              <p className="text-[12px] font-bold text-amazon-text">{metadata.blur_score?.toFixed(0) || "—"}</p>
              <p className="text-[9px] text-amazon-text-secondary">Sharpness</p>
            </div>
            <div>
              <p className="text-[12px] font-bold text-amazon-text">{metadata.mean_brightness?.toFixed(0) || "—"}</p>
              <p className="text-[9px] text-amazon-text-secondary">Brightness</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ── Result Card ────────────────────────────────────────────────────────────────
function ResultCard({ data }) {
  const badge = BADGE[data.classification] || {
    label: data.classification,
    bg: "bg-amazon-text-secondary",
    icon: "❓",
    sub: "",
  };
  const conditionColor =
    data.condition_score >= 75 ? "#067d62" :
    data.condition_score >= 50 ? "#c7511f" : "#b12704";

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Hero classification badge */}
      <div className={`${badge.bg} rounded-lg px-5 py-4 flex items-center justify-between`}>
        <div>
          <p className="text-white text-[11px] font-bold uppercase tracking-wide opacity-80">
            Disposition Decision
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[28px] leading-none">{badge.icon}</span>
            <span className="text-white text-[24px] font-bold">{badge.label}</span>
          </div>
          <p className="text-white/80 text-[12px] mt-0.5">{badge.sub}</p>
        </div>
        <div className="text-right">
          <p className="text-white/70 text-[11px] uppercase tracking-wide">Confidence</p>
          <p className="text-white text-[28px] font-bold leading-none mt-0.5">
            {data.confidence}<span className="text-[14px]">%</span>
          </p>
        </div>
      </div>

      {/* Scores row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-amazon-border rounded-lg p-3">
          <p className="text-[10px] text-amazon-text-secondary uppercase font-bold mb-1">Condition Score</p>
          <div className="flex items-end gap-1 mb-1.5">
            <span className="text-[22px] font-bold text-amazon-text leading-none">{data.condition_score}</span>
            <span className="text-[11px] text-amazon-text-secondary mb-0.5">/100</span>
          </div>
          <ScoreBar value={data.condition_score} color={conditionColor} />
        </div>
        <div className="border border-amazon-border rounded-lg p-3">
          <p className="text-[10px] text-amazon-text-secondary uppercase font-bold mb-1">Product Type</p>
          <p className="text-[13px] font-bold text-amazon-text leading-snug">{data.product_type || "—"}</p>
          <p className="text-[11px] text-amazon-text-secondary mt-0.5">Est. value: {data.estimated_recovery_value || "—"}</p>
        </div>
      </div>

      {/* Damage & packaging */}
      <div className="border border-amazon-border rounded-lg p-3 space-y-2">
        <div>
          <p className="text-[10px] text-amazon-text-secondary uppercase font-bold mb-0.5">Damage Assessment</p>
          <p className="text-[12px] text-amazon-text">{data.damage_assessment || "—"}</p>
        </div>
        <div className="border-t border-amazon-border pt-2">
          <p className="text-[10px] text-amazon-text-secondary uppercase font-bold mb-0.5">Packaging Condition</p>
          <p className="text-[12px] text-amazon-text">{data.packaging_condition || "—"}</p>
        </div>
      </div>

      {/* Sustainability reasoning */}
      <div className="border-l-4 border-[#067d62] bg-[#f0f9f4] rounded-r-lg p-3">
        <p className="text-[10px] text-[#067d62] uppercase font-bold mb-1">Sustainability Reasoning</p>
        <p className="text-[12px] text-amazon-text leading-relaxed">{data.sustainability_reasoning || "—"}</p>
      </div>
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────
export default function SustainabilityModal({ order, onClose }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);

  // Step 1: Quality check
  const [qualityStatus, setQualityStatus] = useState("idle"); // idle | checking | passed | failed
  const [qualityMeta, setQualityMeta] = useState(null);
  const [qualityIssues, setQualityIssues] = useState([]);

  // Step 2: Product verification + Assessment
  const [step, setStep] = useState(1); // 1 = upload/quality, 2 = verifying, 3 = result
  const [verifyStatus, setVerifyStatus] = useState("idle"); // idle | verifying | passed | failed
  const [verifyReason, setVerifyReason] = useState("");
  const [assessProgress, setAssessProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleFile = async (f) => {
    setFile(f);
    setResult(null);
    setError("");
    setStep(1);
    setQualityStatus("checking");
    setQualityMeta(null);
    setQualityIssues([]);
    setVerifyStatus("idle");
    setVerifyReason("");

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);

    // Run quality check immediately on file selection
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch(`${BASE_URL}/media/validate/image`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();

      if (data.passed) {
        setQualityStatus("passed");
        setQualityMeta(data.metadata);
      } else {
        setQualityStatus("failed");
        setQualityIssues(data.issues || []);
        setQualityMeta(data.metadata);
      }
    } catch (err) {
      // If quality check itself errors out, don't block
      console.warn("Quality check network error:", err);
      setQualityStatus("passed");
    }
  };

  const handleProceed = async () => {
    if (!file || qualityStatus !== "passed") return;

    // Move to Step 2 — product verification + assessment
    setStep(2);
    setVerifyStatus("verifying");
    setAssessProgress(0);
    setError("");

    // Start progress animation
    const ticker = setInterval(() => {
      setAssessProgress((p) => (p < 40 ? p + 3 : p));
    }, 200);

    try {
      // Step 2a: Product verification
      const verifyForm = new FormData();
      verifyForm.append("image", file);
      if (order?.product_name) verifyForm.append("product_name", order.product_name);
      if (order?.product_category) verifyForm.append("product_category", order.product_category);

      const verifyRes = await fetch(`${BASE_URL}/sustainability/verify`, {
        method: "POST",
        body: verifyForm,
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({ detail: verifyRes.statusText }));
        const detail = err.detail;
        if (typeof detail === "object" && detail.type === "product_mismatch") {
          setVerifyStatus("failed");
          setVerifyReason(detail.reason || detail.message);
          clearInterval(ticker);
          return;
        }
        throw new Error(typeof detail === "object" ? detail.message : detail || `Error ${verifyRes.status}`);
      }

      const verifyData = await verifyRes.json();
      setVerifyStatus("passed");
      setVerifyReason(verifyData.reason || "Product verified");
      setAssessProgress(50);

      // Step 2b: Full AI assessment
      const assessTicker = setInterval(() => {
        setAssessProgress((p) => (p < 90 ? p + 3 : p));
      }, 250);

      const assessForm = new FormData();
      assessForm.append("image", file);
      // Don't pass product_name so /assess skips re-verification
      const assessRes = await fetch(`${BASE_URL}/sustainability/assess`, {
        method: "POST",
        body: assessForm,
      });

      clearInterval(assessTicker);

      if (!assessRes.ok) {
        const err = await assessRes.json().catch(() => ({ detail: assessRes.statusText }));
        const detail = err.detail;
        throw new Error(typeof detail === "object" ? detail.message : detail || `Error ${assessRes.status}`);
      }

      const assessData = await assessRes.json();
      clearInterval(ticker);
      setAssessProgress(100);
      setTimeout(() => {
        setResult(assessData);
        setStep(3);
      }, 400);

    } catch (err) {
      clearInterval(ticker);
      setError(err.message);
      setVerifyStatus("failed");
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError("");
    setStep(1);
    setQualityStatus("idle");
    setQualityMeta(null);
    setQualityIssues([]);
    setVerifyStatus("idle");
    setVerifyReason("");
    setAssessProgress(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[540px] max-h-[90vh] overflow-y-auto">
        {/* Modal header */}
        <div className="bg-[#232f3e] px-5 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <span className="text-[24px]"></span>
            <div>
              <p className="text-white font-bold text-[15px]">Sustainability Assessment</p>
              <p className="text-[#adb1b8] text-[11px]">AI-powered reverse logistics · Order #{order.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#adb1b8] hover:text-white text-[20px] leading-none transition-colors" aria-label="Close">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Step indicator */}
          <StepIndicator currentStep={step} />

          {/* ═══ STEP 1: Upload + Quality Check ═══ */}
          {step === 1 && (
            <>
              <div>
                <p className="text-[13px] font-bold text-amazon-text mb-2">
                  📷 Upload a photo of the returned item
                </p>
                <UploadZone onFile={handleFile} preview={preview} qualityStatus={qualityStatus} />
              </div>

              {/* Quality check result */}
              <QualityResultPanel
                status={qualityStatus}
                metadata={qualityMeta}
                issues={qualityIssues}
              />

              {/* Proceed button — only enabled when quality passes */}
              <button
                onClick={handleProceed}
                disabled={qualityStatus !== "passed"}
                className="btn-amazon-primary w-full py-2.5 text-[14px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {qualityStatus === "idle" ? "Upload an image to continue" :
                 qualityStatus === "checking" ? "Checking quality..." :
                 qualityStatus === "failed" ? "Fix issues above and re-upload" :
                 "Proceed to AI Verification →"}
              </button>
            </>
          )}

          {/* ═══ STEP 2: Product Verification + Assessment ═══ */}
          {step === 2 && (
            <>
              {/* Preview thumbnail */}
              {preview && (
                <div className="flex items-center gap-3 p-3 bg-[#fafafa] border border-amazon-border rounded-lg">
                  <img src={preview} alt="uploaded" className="w-14 h-14 object-contain rounded" />
                  <div className="flex-1">
                    <p className="text-[12px] font-bold text-amazon-text">Uploaded Image</p>
                    <p className="text-[10px] text-[#067d62]">✓ Quality verified</p>
                  </div>
                </div>
              )}

              {/* Verification status */}
              <div className="border border-amazon-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-[#fafafa] border-b border-amazon-border">
                  <p className="text-[13px] font-bold text-amazon-text">🤖 AI Processing</p>
                </div>
                <div className="p-4 space-y-3">
                  {/* Product Verification Step */}
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                      ${verifyStatus === "passed" ? "bg-[#067d62] text-white" :
                        verifyStatus === "failed" ? "bg-[#b12704] text-white" :
                        verifyStatus === "verifying" ? "bg-amazon-orange text-white animate-pulse" :
                        "bg-[#e8e8e8] text-amazon-text-secondary"}`}>
                      {verifyStatus === "passed" ? "✓" : verifyStatus === "failed" ? "✕" : "1"}
                    </div>
                    <div className="flex-1">
                      <p className={`text-[12px] font-bold ${verifyStatus === "failed" ? "text-[#b12704]" : "text-amazon-text"}`}>
                        Product Identity Verification
                      </p>
                      {verifyStatus === "verifying" && (
                        <p className="text-[10px] text-amazon-text-secondary">Confirming image matches your order...</p>
                      )}
                      {verifyStatus === "passed" && (
                        <p className="text-[10px] text-[#067d62]">✓ {verifyReason}</p>
                      )}
                      {verifyStatus === "failed" && verifyReason && (
                        <p className="text-[10px] text-[#b12704]">{verifyReason}</p>
                      )}
                    </div>
                  </div>

                  {/* Assessment Step */}
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                      ${assessProgress >= 100 ? "bg-[#067d62] text-white" :
                        verifyStatus === "passed" ? "bg-amazon-orange text-white animate-pulse" :
                        "bg-[#e8e8e8] text-amazon-text-secondary"}`}>
                      {assessProgress >= 100 ? "✓" : "2"}
                    </div>
                    <div className="flex-1">
                      <p className="text-[12px] font-bold text-amazon-text">Sustainability Assessment</p>
                      {verifyStatus === "passed" && assessProgress < 100 && (
                        <p className="text-[10px] text-amazon-text-secondary">Analyzing condition, damage & disposition...</p>
                      )}
                      {assessProgress >= 100 && (
                        <p className="text-[10px] text-[#067d62]">✓ Assessment complete</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                {verifyStatus !== "failed" && assessProgress < 100 && (
                  <div className="px-4 pb-4">
                    <div className="h-[6px] bg-[#e8e8e8] rounded-full overflow-hidden">
                      <div className="h-full bg-amazon-orange rounded-full transition-all duration-300" style={{ width: `${assessProgress}%` }} />
                    </div>
                    <p className="text-[10px] text-amazon-text-secondary mt-1.5 text-center">
                      🤖 Nova Lite is inspecting your product...
                    </p>
                  </div>
                )}
              </div>

              {/* Error state */}
              {verifyStatus === "failed" && (
                <div className="space-y-3">
                  {error && (
                    <div className="bg-[#fff5f5] border border-[#ffd0d0] rounded-lg px-4 py-3">
                      <p className="text-[13px] font-bold text-[#b12704]">Verification Failed</p>
                      <p className="text-[12px] text-amazon-text mt-0.5">{error}</p>
                    </div>
                  )}
                  <button onClick={handleReset} className="btn-amazon w-full py-2.5 text-[13px]">
                    ← Upload a Different Image
                  </button>
                </div>
              )}
            </>
          )}

          {/* ═══ STEP 3: Results ═══ */}
          {step === 3 && result && (
            <>
              <ResultCard data={result} />
              <div className="flex gap-2 pt-1">
                <button onClick={handleReset} className="btn-amazon flex-1 text-[13px] py-2">
                  Analyze Another
                </button>
                <button onClick={onClose} className="btn-amazon-primary flex-1 text-[13px] py-2">
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
