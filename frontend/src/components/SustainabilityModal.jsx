import { useRef, useState } from "react";

const BASE_URL = "http://localhost:8000/api";

// ── Classification badge config ───────────────────────────────────────────────
const BADGE = {
  RESALE:   { label: "RESALE",   bg: "bg-[#067d62]", icon: "♻️", sub: "Ready for resale" },
  REFURBISH:{ label: "REFURBISH",bg: "bg-[#1a73e8]", icon: "🔧", sub: "Needs refurbishment" },
  RECYCLE:  { label: "RECYCLE",  bg: "bg-[#c7511f]", icon: "🔄", sub: "Recyclable materials" },
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
      {/* Change overlay when already has preview */}
      {preview && (
        <div className="absolute inset-0 bg-black/0 hover:bg-black/30 rounded-lg flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <span className="text-white text-[12px] font-bold bg-black/50 px-3 py-1 rounded">Change image</span>
        </div>
      )}
    </div>
  );
}

// ── Quality Check Badge ────────────────────────────────────────────────────────
function QualityBadge({ status, metadata, issues }) {
  if (status === "checking") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-[#f0f2f2] rounded-lg animate-pulse">
        <span className="text-[14px]">🔍</span>
        <span className="text-[12px] text-amazon-text-secondary">Checking image quality...</span>
      </div>
    );
  }

  if (status === "passed") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-[#f0f9f4] border border-[#d4edda] rounded-lg">
        <span className="text-[14px]">✅</span>
        <div className="flex-1">
          <span className="text-[12px] font-bold text-[#067d62]">Image quality verified</span>
          {metadata && (
            <span className="text-[10px] text-amazon-text-secondary ml-2">
              {metadata.resolution} · Sharpness: {metadata.blur_score?.toFixed(0)}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="px-3 py-2 bg-[#fff5f5] border border-[#ffd0d0] rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-[14px]">❌</span>
          <span className="text-[12px] font-bold text-[#b12704]">Image quality insufficient</span>
        </div>
        {issues && issues.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {issues.map((issue, i) => (
              <div key={i} className="text-[11px] text-amazon-text">
                <span className="font-bold">• {issue.message}</span>
                <br />
                <span className="text-amazon-text-secondary ml-2">💡 {issue.suggestion}</span>
              </div>
            ))}
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
          <p className="text-[10px] text-amazon-text-secondary uppercase font-bold mb-1">
            Condition Score
          </p>
          <div className="flex items-end gap-1 mb-1.5">
            <span className="text-[22px] font-bold text-amazon-text leading-none">
              {data.condition_score}
            </span>
            <span className="text-[11px] text-amazon-text-secondary mb-0.5">/100</span>
          </div>
          <ScoreBar value={data.condition_score} color={conditionColor} />
        </div>
        <div className="border border-amazon-border rounded-lg p-3">
          <p className="text-[10px] text-amazon-text-secondary uppercase font-bold mb-1">
            Product Type
          </p>
          <p className="text-[13px] font-bold text-amazon-text leading-snug">
            {data.product_type || "—"}
          </p>
          <p className="text-[11px] text-amazon-text-secondary mt-0.5">
            Est. value: {data.estimated_recovery_value || "—"}
          </p>
        </div>
      </div>

      {/* Damage & packaging */}
      <div className="border border-amazon-border rounded-lg p-3 space-y-2">
        <div>
          <p className="text-[10px] text-amazon-text-secondary uppercase font-bold mb-0.5">
            Damage Assessment
          </p>
          <p className="text-[12px] text-amazon-text">{data.damage_assessment || "—"}</p>
        </div>
        <div className="border-t border-amazon-border pt-2">
          <p className="text-[10px] text-amazon-text-secondary uppercase font-bold mb-0.5">
            Packaging Condition
          </p>
          <p className="text-[12px] text-amazon-text">{data.packaging_condition || "—"}</p>
        </div>
      </div>

      {/* Sustainability reasoning */}
      <div className="border-l-4 border-[#067d62] bg-[#f0f9f4] rounded-r-lg p-3">
        <p className="text-[10px] text-[#067d62] uppercase font-bold mb-1">
          🌱 Sustainability Reasoning
        </p>
        <p className="text-[12px] text-amazon-text leading-relaxed">
          {data.sustainability_reasoning || "—"}
        </p>
      </div>
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────
export default function SustainabilityModal({ order, onClose }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [qualityStatus, setQualityStatus] = useState("idle"); // idle | checking | passed | failed
  const [qualityMeta, setQualityMeta] = useState(null);
  const [qualityIssues, setQualityIssues] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | uploading | done | error
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleFile = async (f) => {
    setFile(f);
    setResult(null);
    setError("");
    setStatus("idle");
    setQualityStatus("checking");
    setQualityMeta(null);
    setQualityIssues([]);

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);

    // Step 1: Run quality check immediately on file selection
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
      // If quality check fails (network etc), don't block — allow assessment
      console.warn("Quality check failed:", err);
      setQualityStatus("passed");
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setStatus("uploading");
    setProgress(0);
    setError("");
    setResult(null);

    // Fake smooth progress to give a sense of upload + inference time
    const ticker = setInterval(() => {
      setProgress((p) => (p < 85 ? p + 5 : p));
    }, 300);

    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`${BASE_URL}/sustainability/assess`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        // Handle structured error details
        const detail = err.detail;
        if (typeof detail === "object" && detail.message) {
          throw new Error(detail.message);
        }
        throw new Error(detail || `Error ${res.status}`);
      }
      const data = await res.json();
      clearInterval(ticker);
      setProgress(100);
      setTimeout(() => { setResult(data); setStatus("done"); }, 400);
    } catch (err) {
      clearInterval(ticker);
      setError(err.message);
      setStatus("error");
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError("");
    setStatus("idle");
    setProgress(0);
    setQualityStatus("idle");
    setQualityMeta(null);
    setQualityIssues([]);
  };

  const canAnalyze = file && qualityStatus === "passed" && status !== "uploading";

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto">
        {/* Modal header */}
        <div className="bg-[#232f3e] px-5 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <span className="text-[24px]">🔬</span>
            <div>
              <p className="text-white font-bold text-[15px]">Sustainability Assessment</p>
              <p className="text-[#adb1b8] text-[11px]">
                AI-powered reverse logistics · Order #{order.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#adb1b8] hover:text-white text-[20px] leading-none transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Upload zone — always visible unless result is shown */}
          {status !== "done" && (
            <>
              <div>
                <p className="text-[12px] font-bold text-amazon-text mb-2">
                  Step 1: Upload a photo of the returned item
                </p>
                <UploadZone onFile={handleFile} preview={preview} qualityStatus={qualityStatus} />
              </div>

              {/* Quality check result — shown immediately after file selection */}
              <QualityBadge
                status={qualityStatus}
                metadata={qualityMeta}
                issues={qualityIssues}
              />

              {/* Step 2 label — only shown after quality passes */}
              {qualityStatus === "passed" && status === "idle" && (
                <p className="text-[12px] font-bold text-amazon-text">
                  Step 2: Submit for AI analysis
                </p>
              )}

              {/* Progress bar */}
              {status === "uploading" && (
                <div>
                  <div className="flex justify-between text-[11px] text-amazon-text-secondary mb-1">
                    <span>Analyzing with AI…</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-[6px] bg-[#e8e8e8] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amazon-orange rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-amazon-text-secondary mt-1.5">
                    🤖 Nova Lite is inspecting condition, packaging & sustainability…
                  </p>
                </div>
              )}

              {/* Error */}
              {status === "error" && (
                <div className="bg-[#fff5f5] border border-[#ffd0d0] rounded-lg px-4 py-3">
                  <p className="text-[13px] font-bold text-[#b12704]">Assessment failed</p>
                  <p className="text-[12px] text-amazon-text mt-0.5">{error}</p>
                </div>
              )}

              {/* CTA — disabled until quality check passes */}
              <button
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className="btn-amazon-primary w-full py-2.5 text-[14px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {status === "uploading" ? "Analyzing…" :
                 qualityStatus === "checking" ? "Checking quality…" :
                 qualityStatus === "failed" ? "Image quality insufficient — try another photo" :
                 "🔬 Analyze with AI"}
              </button>

              {/* Tip when quality failed */}
              {qualityStatus === "failed" && (
                <p className="text-[11px] text-amazon-text-secondary text-center">
                  Upload a new image that meets the quality requirements above
                </p>
              )}
            </>
          )}

          {/* Result */}
          {status === "done" && result && (
            <>
              <ResultCard data={result} />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleReset}
                  className="btn-amazon flex-1 text-[13px] py-2"
                >
                  Analyze Another Image
                </button>
                <button
                  onClick={onClose}
                  className="btn-amazon-primary flex-1 text-[13px] py-2"
                >
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
