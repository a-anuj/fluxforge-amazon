import { useRef, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getOrders, createReturn, getProduct, getBaselineScan, createCommunityListing, getApiBaseUrl } from "../api/client";
import { useUser } from "../context/UserContext";
import LiveVideoScanner from "../components/LiveVideoScanner";
import { dataUrlToBlob } from "../utils/videoUtils";

// ── Classification badge config ───────────────────────────────────────────────
const SUSTAINABILITY_BADGE = {
  RESALE:    { bg: "bg-[#067d62]", label: "RESALE",    sub: "Ready for resale" },
  REFURBISH: { bg: "bg-[#1a6bb5]", label: "REFURBISH", sub: "Requires refurbishment" },
  RECYCLE:   { bg: "bg-[#8d4a15]", label: "RECYCLE",   sub: "Recyclable materials" },
  DISPOSE:   { bg: "bg-[#7a1a0a]", label: "DISPOSE",   sub: "Beyond economic recovery" },
};

// ── Inline score bar ──────────────────────────────────────────────────────────
function ScoreBar({ value, color }) {
  return (
    <div className="h-[5px] bg-[#e8e8e8] rounded-full overflow-hidden mt-1.5">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ── Image upload zone (legacy fallback) ───────────────────────────────────────
function UploadZone({ file, preview, onFile }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-lg cursor-pointer transition-all duration-200 flex flex-col items-center justify-center text-center
        ${dragging ? "border-amazon-orange bg-[#fff8f0]" : "border-[#adb1b8] hover:border-amazon-orange hover:bg-[#fffdf9]"}
        ${preview ? "h-[160px]" : "h-[110px]"}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {preview ? (
        <>
          <img src={preview} alt="preview" className="h-full w-full object-contain rounded-lg p-1" />
          <div className="absolute inset-0 bg-black/0 hover:bg-black/40 rounded-lg flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <span className="text-white text-[11px] font-semibold tracking-wide bg-black/60 px-3 py-1.5 rounded">
              Change image
            </span>
          </div>
        </>
      ) : (
        <>
          <svg className="w-7 h-7 text-[#adb1b8] mb-2" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
          </svg>
          <p className="text-[12px] font-semibold text-amazon-text">Click or drag to upload</p>
          <p className="text-[11px] text-[#6c7480] mt-0.5">JPEG · PNG · WebP &nbsp;·&nbsp; max 5 MB</p>
        </>
      )}
    </div>
  );
}


// ── Main page ─────────────────────────────────────────────────────────────────
export default function NewReturn() {
  const { currentUser, refreshUser } = useUser();
  const [searchParams] = useSearchParams();
  const preselectedOrderId = searchParams.get("orderId") || "";

  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState({});
  const [selectedOrder, setSelectedOrder] = useState(preselectedOrderId);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [reason, setReason] = useState("size_mismatch");
  const [scanFrames, setScanFrames] = useState([]);
  const [scanPhases, setScanPhases] = useState([]);
  const [scanPreview, setScanPreview] = useState(null);
  const [scanPhase, setScanPhase] = useState("form"); // "form" | "scan"
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [returnResult, setReturnResult] = useState(null);
  const [sustainResult, setSustainResult] = useState(null);
  const [sustainError, setSustainError] = useState("");
  const [mismatchError, setMismatchError] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [listingCreated, setListingCreated] = useState(false);
  const [listingCreating, setListingCreating] = useState(false);

  const [verifyingImage, setVerifyingImage] = useState(false);
  const [verifiedImage, setVerifiedImage] = useState(null);
  const [baselineScan, setBaselineScan] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    getOrders(currentUser.id)
      .then(async (data) => {
        // Only delivered orders are eligible for return (delivery agent must verify first)
        const returnable = data.filter((o) => o.status === "delivered");
        setOrders(returnable);
        if (preselectedOrderId && !returnable.find((o) => String(o.id) === preselectedOrderId))
          setSelectedOrder("");
          
        const prods = {};
        const uniqueProductIds = [...new Set(returnable.map(o => o.product_id))];
        await Promise.all(
          uniqueProductIds.map(async (pid) => {
            try { prods[pid] = await getProduct(pid); } catch {}
          })
        );
        setProducts(prods);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentUser]);

  useEffect(() => {
    if (!selectedOrder || !orders.length) { setSelectedProduct(null); setBaselineScan(null); return; }
    const order = orders.find((o) => String(o.id) === String(selectedOrder));
    if (!order) { setSelectedProduct(null); setBaselineScan(null); return; }
    getProduct(order.product_id).then(setSelectedProduct).catch(() => setSelectedProduct(null));
    // Fetch baseline scan info for this order
    getBaselineScan(order.id).then(setBaselineScan).catch(() => setBaselineScan(null));
  }, [selectedOrder, orders]);

  // Image verification on the fly is removed as we assess the video natively later.

  const handleScanComplete = ({ frames, phases }) => {
    setScanFrames(frames);
    setScanPhases(phases || []);
    setScanPreview(frames[0] || null);
    setScanPhase("form");
    setMismatchError(null);
  };

  const clearScan = () => {
    setScanFrames([]);
    setScanPhases([]);
    setScanPreview(null);
    setMismatchError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setSubmitting(true);
    setSustainError("");
    setMismatchError(null);

    if (!scanFrames.length) {
      alert("Please complete the live product scan before submitting a return.");
      setSubmitting(false);
      return;
    }

    setProgress(10);
    setProgressLabel("Initializing AI scanner\u2026");

    const form = new FormData();
    form.append("frames_json", JSON.stringify(scanPhases));
    form.append("order_id", selectedOrder);
    if (selectedProduct) {
      form.append("product_name", selectedProduct.name || "");
      form.append("product_category", selectedProduct.category || "");
    }

    setProgressLabel("Running AI sustainability assessment\u2026");
    setProgress(40);
    const ticker = setInterval(() => setProgress((p) => (p < 92 ? p + 2 : p)), 250);
    try {
      const res = await fetch(`${getApiBaseUrl()}/sustainability/assess`, { method: "POST", body: form });
      clearInterval(ticker);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ detail: res.statusText }));
        const detail = errBody.detail;
        if (typeof detail === "object" && detail?.type === "product_mismatch") {
          setMismatchError(detail);
          setProgress(100); setProgressLabel("Done!"); setSubmitting(false);
          setShowResults(true);
          return;
        }
        if (typeof detail === "object" && detail?.type === "delivery_not_verified") {
          alert(detail.message);
          setSubmitting(false);
          return;
        }
        throw new Error(typeof detail === "string" ? detail : detail?.message || `Error ${res.status}`);
      }
      const data = await res.json();
      setSustainResult(data);
      setProgress(100);
      setProgressLabel("Assessment Complete!");
      setSubmitting(false);
      setShowResults(true);
    } catch (err) {
      clearInterval(ticker);
      setSustainError(err.message);
      setProgress(100);
      setProgressLabel("Error running assessment");
      setSubmitting(false);
    }
  };

  const handleConfirmReturn = async () => {
    if (!selectedOrder || !sustainResult) return;
    setConfirming(true);
    try {
      const res = await createReturn(
        Number(selectedOrder),
        scanFrames.slice(0, 3),
        sustainResult.condition_score,
        sustainResult.classification,
        sustainResult.remaining_life_pct
      );
      setReturnResult(res);
      refreshUser();
      setConfirmed(true);
    } catch (err) {
      alert(`Failed to complete return: ${err.message}`);
    } finally {
      setConfirming(false);
    }
  };

  // Results screen
  if (showResults && (sustainResult || mismatchError)) {
    const s = sustainResult;
    const impact = s?.environmental_impact || returnResult?.environmental_impact;
    const advice = s?.sustainability_advice || returnResult?.sustainability_advice;
    const badge = s ? (SUSTAINABILITY_BADGE[s.classification] || { bg: "bg-[#6c7480]", label: s.classification, sub: "" }) : null;
    const condColor = (v) => v >= 75 ? "#067d62" : v >= 50 ? "#c7511f" : "#b12704";
    const conditionScore = s?.condition_score ?? returnResult?.condition_score ?? 85;
    const remainingLife = s?.remaining_life_pct ?? returnResult?.remaining_life_pct ?? Math.round(conditionScore * 0.9);
    const defects = s?.damage_assessment || returnResult?.defects || "No defects detected";
    const greenCredits = s?.green_credits_earned ?? returnResult?.green_credits_earned ?? 0;

    return (
      <div className="bg-white min-h-screen animate-fade-in">
        <div className="max-w-[800px] mx-auto px-4 py-6">
          <div className="text-[12px] text-amazon-text-secondary mb-3">
            <Link to="/orders" className="text-amazon-link hover:underline">Your Orders</Link>
            <span className="mx-1">&rsaquo;</span><span>Return Assessment</span>
          </div>
          <h1 className="text-[28px] text-amazon-text font-normal mb-4">Return Assessment</h1>

          {mismatchError && (
            <div className="mb-4 border border-[#c45500]/30 rounded-xl overflow-hidden">
              <div className="bg-[#fdf3e7] px-5 py-3 border-b border-[#c45500]/20 flex items-center gap-3">
                <svg className="w-4 h-4 text-[#c45500] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="text-[13px] font-semibold text-[#c45500]">Photo Verification Failed</p>
                  <p className="text-[11px] text-[#c45500]/70">The uploaded image does not match your ordered item</p>
                </div>
              </div>
              <div className="p-4 bg-white space-y-4">
                <p className="text-[13px] text-[#1a1f27]">{mismatchError.message}</p>
                {mismatchError.reason && (
                  <div className="bg-[#fafbfc] border border-[#e3e6ea] rounded-lg px-4 py-3">
                    <p className="text-[10px] text-[#6c7480] uppercase font-semibold tracking-wider mb-1">AI Reasoning</p>
                    <p className="text-[13px] text-[#1a1f27] italic">{mismatchError.reason}</p>
                  </div>
                )}
                <div className="pt-2">
                  <button 
                    onClick={() => {
                      setShowResults(false);
                      setMismatchError(null);
                      clearScan();
                    }} 
                    className="btn-amazon-primary text-[13px] px-5 py-2"
                  >
                    Go Back &amp; Re-scan Product
                  </button>
                </div>
              </div>
            </div>
          )}

          {sustainError && (
            <div className="mb-4 bg-[#fff5f5] border border-[#ffd0d0] rounded-xl px-4 py-3">
              <p className="text-[13px] font-semibold text-[#b12704]">AI assessment failed</p>
              <p className="text-[12px] text-[#6c7480] mt-0.5">{sustainError}</p>
            </div>
          )}

          {!mismatchError && (
            <div className="border border-[#d0d4d9] rounded-xl overflow-hidden shadow-sm">
              <div className="bg-[#0f1923] px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold text-[15px] tracking-tight">AI Return Assessment</p>
                  <p className="text-[#8a9bb0] text-[11px] mt-0.5 uppercase tracking-wide">
                    {returnResult ? `Return #${returnResult.id}` : "Return Preview"} &middot; Circular Intelligence
                  </p>
                </div>
                {badge && <div className={`${badge.bg} px-3 py-1.5 rounded-md`}><p className="text-white text-[11px] font-bold tracking-widest">{badge.label}</p></div>}
              </div>
              <div className="p-5 space-y-4">
                {s && (
                  <div className={`${badge.bg} rounded-xl px-5 py-4 flex items-center justify-between`}>
                    <div>
                      <p className="text-white/60 text-[10px] uppercase tracking-widest font-semibold mb-1">Disposition</p>
                      <p className="text-white text-[24px] font-bold tracking-tight leading-none">{s.classification}</p>
                      <p className="text-white/70 text-[12px] mt-1">{badge.sub}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white/50 text-[10px] uppercase tracking-widest">Confidence</p>
                      <p className="text-white text-[32px] font-bold leading-none mt-0.5">{s.confidence}<span className="text-[16px] font-normal opacity-70">%</span></p>
                    </div>
                  </div>
                )}

                <div className={`grid gap-3 ${s ? "grid-cols-3" : "grid-cols-2"}`}>
                  <div className="border border-[#e3e6ea] rounded-xl p-4 bg-[#fafbfc]">
                    <p className="text-[10px] text-[#6c7480] uppercase font-semibold tracking-wider">Condition Score</p>
                    <div className="flex items-end gap-1 mt-1"><span className="text-[28px] font-bold text-[#0f1923] leading-none">{conditionScore}</span><span className="text-[12px] text-[#9aa0aa] mb-0.5">/100</span></div>
                    <ScoreBar value={conditionScore} color={condColor(conditionScore)} />
                  </div>
                  <div className="border border-[#e3e6ea] rounded-xl p-4 bg-[#fafbfc]">
                    <p className="text-[10px] text-[#6c7480] uppercase font-semibold tracking-wider">Remaining Life</p>
                    <div className="flex items-end gap-1 mt-1"><span className="text-[28px] font-bold text-[#0f1923] leading-none">{remainingLife}</span><span className="text-[12px] text-[#9aa0aa] mb-0.5">%</span></div>
                    <ScoreBar value={remainingLife} color="#1a6bb5" />
                  </div>
                  {s && (
                    <div className="border border-[#e3e6ea] rounded-xl p-4 bg-[#fafbfc]">
                      <p className="text-[10px] text-[#6c7480] uppercase font-semibold tracking-wider">Product Type</p>
                      <p className="text-[13px] font-semibold text-[#0f1923] mt-1 leading-snug">{s.product_type || "\u2014"}</p>
                      <p className="text-[11px] text-[#9aa0aa] mt-1">Est. recovery: {s.estimated_recovery_value || "\u2014"}</p>
                    </div>
                  )}
                </div>

                <div className="border border-[#e3e6ea] rounded-xl p-4 space-y-3 bg-[#fafbfc]">
                  <div>
                    <p className="text-[10px] text-[#6c7480] uppercase font-semibold tracking-wider mb-1">Defects Found</p>
                    <p className="text-[13px] text-[#1a1f27] leading-relaxed">{defects}</p>
                  </div>
                  {s?.damage_assessment && (<div className="border-t border-[#eaecef] pt-3"><p className="text-[10px] text-[#6c7480] uppercase font-semibold tracking-wider mb-1">Damage Assessment</p><p className="text-[13px] text-[#1a1f27] leading-relaxed">{s.damage_assessment}</p></div>)}
                  {s?.packaging_condition && (<div className="border-t border-[#eaecef] pt-3"><p className="text-[10px] text-[#6c7480] uppercase font-semibold tracking-wider mb-1">Packaging</p><p className="text-[13px] text-[#1a1f27] leading-relaxed">{s.packaging_condition}</p></div>)}
                </div>

                {greenCredits > 0 && (
                  <div className="border border-[#067d62]/30 rounded-xl p-4 bg-[#f2fbf7] flex items-center justify-between">
                    <div><p className="text-[10px] text-[#067d62] uppercase font-semibold tracking-wider">Green Credits Potential</p><p className="text-[13px] text-[#1a4a35] mt-0.5">Awarded for choosing the sustainable option</p></div>
                    <span className="text-[28px] font-bold text-[#067d62]">+{greenCredits}</span>
                  </div>
                )}

                {impact && (
                  <div className="border border-[#e3e6ea] rounded-xl p-4 bg-[#fafbfc]">
                    <p className="text-[10px] text-[#6c7480] uppercase font-semibold tracking-wider mb-3">Environmental Impact</p>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div><p className="text-[20px] font-bold text-[#067d62]">{impact.co2_saved}</p><p className="text-[10px] text-[#6c7480] mt-0.5">kg CO\u2082 saved</p></div>
                      <div><p className="text-[20px] font-bold text-[#1a6bb5]">{impact.ewaste_prevented}</p><p className="text-[10px] text-[#6c7480] mt-0.5">kg e-waste prevented</p></div>
                      <div><p className="text-[20px] font-bold text-[#0097a7]">{impact.water_saved}</p><p className="text-[10px] text-[#6c7480] mt-0.5">L water saved</p></div>
                    </div>
                  </div>
                )}

                {s?.sustainability_reasoning && (
                  <div className="border-l-[3px] border-[#067d62] bg-[#f2fbf7] rounded-r-xl px-4 py-3">
                    <p className="text-[10px] text-[#067d62] uppercase font-semibold tracking-wider mb-1">Sustainability Reasoning</p>
                    <p className="text-[13px] text-[#1a1f27] leading-relaxed">{s.sustainability_reasoning}</p>
                  </div>
                )}

                {advice?.suggestions?.length > 0 && (
                  <div className="border border-[#e3e6ea] rounded-xl overflow-hidden">
                    <div className="p-4 bg-[#fafbfc] border-b border-[#e3e6ea] flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-[#0f1923]">Second Chance Options</p>
                      <span className="text-[10px] font-semibold text-[#1a6bb5] bg-[#ebf2fb] px-1.5 py-0.5 rounded tracking-wide">AI</span>
                    </div>
                    <div className="divide-y divide-[#eaecef]">
                      {advice.suggestions.map((sug, i) => (
                        <div key={i} className="px-4 py-3 flex items-center justify-between">
                          <div><p className="text-[13px] font-semibold text-[#0f1923]">{sug.title}</p><p className="text-[11px] text-[#6c7480] mt-0.5">{sug.message}</p></div>
                          <span className="text-[13px] font-bold text-[#067d62] ml-4">+{sug.credits}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {s?.frame_analyses && Object.keys(s.frame_analyses).length > 0 && (
                  <div className="border border-[#e3e6ea] rounded-xl overflow-hidden mt-4">
                    <div className="p-4 bg-[#fafbfc] border-b border-[#e3e6ea] flex items-center gap-2">
                      <span className="text-[16px]">📸</span>
                      <p className="text-[13px] font-semibold text-[#0f1923]">Frame-by-Frame Analysis</p>
                    </div>
                    <div className="divide-y divide-[#eaecef] bg-white">
                      {Object.entries(s.frame_analyses).map(([key, analysis]) => {
                        const baselineUrl = baselineScan?.baseline_frame_urls?.[key];
                        const returnFrame = scanPhases.find(p => p.id === key)?.frame;
                        
                        return (
                          <div key={key} className="px-4 py-4">
                            <p className="text-[11px] text-[#1a6bb5] uppercase font-bold tracking-wider mb-3">
                              {key.replace(/_/g, " ")}
                            </p>
                            
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] text-[#6c7480] font-semibold uppercase tracking-wider">Before (Delivery)</span>
                                {baselineUrl ? (
                                  <img src={baselineUrl} alt="Baseline" className="w-full h-32 object-cover rounded-md border border-[#e3e6ea] bg-gray-50 shadow-sm" />
                                ) : (
                                  <div className="w-full h-32 flex items-center justify-center bg-gray-100 rounded-md border border-[#e3e6ea] shadow-sm">
                                    <span className="text-[11px] text-gray-400 font-medium">Not Available</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] text-[#6c7480] font-semibold uppercase tracking-wider">After (Return)</span>
                                {returnFrame ? (
                                  <img src={returnFrame} alt="Return" className="w-full h-32 object-cover rounded-md border border-[#e3e6ea] bg-gray-50 shadow-sm" />
                                ) : (
                                  <div className="w-full h-32 flex items-center justify-center bg-gray-100 rounded-md border border-[#e3e6ea] shadow-sm">
                                    <span className="text-[11px] text-gray-400 font-medium">Not Available</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="bg-[#f8f9fa] p-3 rounded-lg border border-[#eaecef] mt-2">
                              <p className="text-[13px] text-[#1a1f27] leading-relaxed">
                                {analysis}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Action Footer: branches on damage_origin ───────────────────── */}
          {!mismatchError && (() => {
            const origin = s?.damage_origin; // "none" | "manufacturing_defect" | "user_caused"
            const isUserCaused = origin === "user_caused";
            const damagedAngles = s?.damaged_angles || [];

            // ── USER-CAUSED: return blocked, community option offered ──────
            if (isUserCaused && s) {
              return (
                <div className="mt-6 space-y-3">
                  {/* Neutral block banner */}
                  <div className="border border-[#d0d4d9] rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-[#f5f6f8] px-5 py-3 border-b border-[#e3e6ea] flex items-center gap-2">
                      <span className="text-[18px]">🔍</span>
                      <p className="text-[13px] font-semibold text-[#0f1923]">Return Eligibility Assessment</p>
                    </div>
                    <div className="p-5 space-y-3">
                      <p className="text-[14px] text-[#1a1f27] leading-relaxed">
                        Based on the angle-by-angle comparison with the delivery baseline, the AI has identified
                        physical differences on <strong>{damagedAngles.length > 0 ? damagedAngles.map(a => a.replace(/_/g, " ")).join(", ") : "one or more panels"}</strong> that
                        were not present at the time of delivery.
                      </p>
                      <p className="text-[13px] text-[#6c7480] leading-relaxed">
                        As per our return policy, items with post-delivery physical changes are not eligible for a standard refund.
                        We understand this can be frustrating, and we appreciate your understanding.
                      </p>
                      {damagedAngles.length > 0 && (
                        <div className="bg-[#fafbfc] border border-[#e3e6ea] rounded-lg px-4 py-3">
                          <p className="text-[10px] text-[#6c7480] uppercase font-semibold tracking-wider mb-2">Angles with differences detected</p>
                          <div className="flex flex-wrap gap-1.5">
                            {damagedAngles.map((a) => (
                              <span key={a} className="text-[11px] font-semibold bg-[#fef3c7] text-[#92400e] border border-[#fde68a] px-2 py-0.5 rounded">
                                {a.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Community listing CTA */}
                  {!listingCreated ? (
                    <div className="border border-[#1a6bb5]/30 rounded-xl overflow-hidden shadow-sm">
                      <div className="bg-[#ebf2fb] px-5 py-3 border-b border-[#1a6bb5]/20 flex items-center gap-2">
                        <span className="text-[18px]">♻️</span>
                        <div>
                          <p className="text-[13px] font-semibold text-[#1a3a5c]">Give It a Second Life</p>
                          <p className="text-[11px] text-[#1a3a5c]/70 mt-0.5">List it on the Community Marketplace — someone nearby may want it</p>
                        </div>
                      </div>
                      <div className="p-5 space-y-3">
                        <p className="text-[13px] text-[#1a1f27] leading-relaxed">
                          Instead of it sitting unused, you can list this product on our Community Marketplace.
                          After a quick refurbish, it could find a new owner and you'll earn <strong className="text-[#1a6bb5]">Green Credits</strong> for the circular action.
                        </p>
                        <div className="grid grid-cols-2 gap-3 text-[12px]">
                          <div className="bg-[#f2fbf7] border border-[#067d62]/20 rounded-lg px-3 py-2 text-center">
                            <p className="font-bold text-[#067d62] text-[16px]">+{s.green_credits_earned ?? 30}</p>
                            <p className="text-[#067d62]/80">Green Credits earned</p>
                          </div>
                          <div className="bg-[#f0f9ff] border border-[#1a6bb5]/20 rounded-lg px-3 py-2 text-center">
                            <p className="font-bold text-[#1a6bb5] text-[16px]">{conditionScore}%</p>
                            <p className="text-[#1a6bb5]/80">Current condition score</p>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            disabled={listingCreating}
                            onClick={async () => {
                              if (!currentUser || !selectedProduct) return;
                              setListingCreating(true);
                              try {
                                const suggestedPrice = selectedProduct.price
                                  ? Math.round(selectedProduct.price * (conditionScore / 100) * 0.75)
                                  : 999;
                                await createCommunityListing({
                                  seller_id: currentUser.id,
                                  title: `${selectedProduct.name} — Post-Return`,
                                  description: `${s.damage_assessment || "Pre-owned item"}. Condition: ${s.classification}.`,
                                  category: selectedProduct.category || "electronics",
                                  brand: selectedProduct.brand || "",
                                  asking_price: suggestedPrice,
                                  suggested_price: suggestedPrice,
                                  condition: conditionScore >= 75 ? "good" : conditionScore >= 50 ? "fair" : "poor",
                                  ai_condition_summary: s.damage_assessment || "",
                                  city: currentUser.city || "",
                                  pincode: currentUser.pincode || "",
                                });
                                setListingCreated(true);
                                refreshUser();
                              } catch (err) {
                                alert(`Could not create listing: ${err.message}`);
                              } finally {
                                setListingCreating(false);
                              }
                            }}
                            className="flex-1 bg-[#1a6bb5] hover:bg-[#155a9c] disabled:opacity-50 text-white font-semibold text-[13px] px-5 py-2.5 rounded-lg shadow-sm transition-colors"
                          >
                            {listingCreating ? "Creating listing…" : "📦 List on Community Marketplace"}
                          </button>
                          <button
                            onClick={() => { setShowResults(false); setSustainResult(null); clearScan(); }}
                            className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-semibold text-[13px] px-4 py-2.5 rounded-lg"
                          >
                            Not now
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-[#067d62]/30 rounded-xl bg-[#f2fbf7] px-5 py-5 flex flex-col items-center text-center gap-2 animate-fade-in">
                      <div className="w-12 h-12 rounded-full bg-[#e6f4ea] flex items-center justify-center text-[#137333] mb-1">
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </div>
                      <p className="text-[18px] font-bold text-[#137333]">Listing Created!</p>
                      <p className="text-[13px] text-[#137333]/90 max-w-[480px] leading-relaxed">
                        Your product has been listed on the Community Marketplace. A buyer near you will be notified.
                        Once sold, your <strong>Green Credits</strong> will be credited.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Link to="/feed" className="bg-[#1a6bb5] hover:bg-[#155a9c] text-white font-semibold text-[13px] px-5 py-2.5 rounded-lg shadow-sm">
                          View in Marketplace
                        </Link>
                        <Link to="/orders" className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-semibold text-[13px] px-5 py-2.5 rounded-lg">
                          Back to Orders
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // ── DEFAULT (none / manufacturing_defect): normal confirm flow ─
            return (
              <div className="mt-6 border border-[#d0d4d9] rounded-xl overflow-hidden shadow-sm">
                {origin === "manufacturing_defect" && (
                  <div className="bg-[#f0fdf4] px-5 py-3 border-b border-[#22c55e]/30 flex items-center gap-2">
                    <span className="text-[16px]">🏭</span>
                    <p className="text-[13px] font-semibold text-[#15803d]">
                      Manufacturing defect confirmed — full return approved
                    </p>
                  </div>
                )}
                {!confirmed ? (
                  <div className="bg-[#fffcf3] px-5 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#fcf8e3] flex items-center justify-center text-[#c09853] flex-shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold text-[#8a6d3b]">Are you sure you want to return this item?</p>
                        <p className="text-[12px] text-[#8a6d3b]/90">Please confirm if you accept the circular intelligence disposition strategy and the credits to be rewarded.</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleConfirmReturn}
                        disabled={confirming}
                        className="bg-[#e47911] hover:bg-[#d56e0c] disabled:opacity-50 text-white font-semibold text-[13px] px-5 py-2 rounded-lg shadow-sm"
                      >
                        {confirming ? "Confirming..." : "Confirm Return"}
                      </button>
                      <button
                        onClick={() => { setShowResults(false); setSustainResult(null); clearScan(); }}
                        className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-semibold text-[13px] px-5 py-2 rounded-lg"
                      >
                        Keep Item &amp; Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#f2fbf7] px-5 py-5 flex flex-col items-center text-center gap-2 animate-fade-in">
                    <div className="w-12 h-12 rounded-full bg-[#e6f4ea] flex items-center justify-center text-[#137333] mb-1">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <p className="text-[18px] font-bold text-[#137333]">Return Successfully Confirmed!</p>
                    <p className="text-[13px] text-[#137333]/90 max-w-[550px] leading-relaxed">
                      Your return request has been submitted. The AI circularity classification has been registered, and your <b>+{greenCredits} Green Credits</b> have been added to your account balance.
                    </p>
                    <div className="flex gap-2 mt-4">
                      <Link to="/orders" className="bg-[#0f1923] hover:bg-[#1a2b3c] text-white font-semibold text-[13px] px-5 py-2.5 rounded-lg shadow-sm">
                        Go to Your Orders
                      </Link>
                      <Link to="/feed" className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-semibold text-[13px] px-5 py-2.5 rounded-lg">
                        Browse Second Life
                      </Link>
                      <Link to="/profile" className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-semibold text-[13px] px-5 py-2.5 rounded-lg">
                        View Green Dashboard
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // Live scan full-screen phase
  if (scanPhase === "scan") {
    return (
      <div className="fixed inset-0 z-50 bg-[#030712] flex flex-col">
        <LiveVideoScanner
          title="Return Product Scan"
          subtitle="A slower fingerprint-style pass compared against the recorded baseline"
          accentColor="#067d62"
          onComplete={handleScanComplete}
          onCancel={() => setScanPhase("form")}
          orderId={selectedOrder ? Number(selectedOrder) : null}
          productName={selectedProduct?.name || ""}
          productCategory={selectedProduct?.category || ""}
        />
      </div>
    );
  }

  // Return form
  return (
    <div className="bg-white min-h-screen animate-fade-in">
      <div className="max-w-[800px] mx-auto px-4 py-6">
        <div className="text-[12px] text-amazon-text-secondary mb-3">
          <Link to="/orders" className="text-amazon-link hover:underline">Your Orders</Link>
          <span className="mx-1">&rsaquo;</span><span>Return an Item</span>
        </div>
        <h1 className="text-[28px] text-amazon-text font-normal mb-1">Return an Item</h1>
        <p className="text-[14px] text-amazon-text-secondary mb-5">
          Record a guided live scan of your product. Our AI compares it against the delivery baseline and recommends the best circular action.{" "}
          <span className="text-[#067d62] font-semibold">Earn Green Credits for every return.</span>
        </p>
        {loading ? (
          <div className="border border-[#e3e6ea] rounded-xl p-8 animate-pulse bg-[#fafbfc]" />
        ) : orders.length === 0 ? (
          <div className="border border-[#d0d4d9] rounded-xl p-8 text-center">
            <div className="text-4xl mb-3">🚚</div>
            <p className="text-[16px] font-semibold text-amazon-text mb-2">No orders ready for return</p>
            <p className="text-[13px] text-amazon-text-secondary mb-4">
              Returns are available only after your delivery agent completes the verification scan.
              Orders still awaiting verification won't appear here.
            </p>
            <Link to="/orders" className="text-amazon-link text-[14px] hover:underline">View your orders</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="border border-[#d0d4d9] rounded-xl overflow-hidden shadow-sm">
            <div className="bg-[#f5f6f8] px-5 py-3 border-b border-[#e3e6ea]">
              <p className="text-[13px] font-semibold text-[#0f1923]">Step 1 &mdash; Select order &amp; provide details</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[12px] font-semibold text-[#0f1923] block mb-1">Which order are you returning?</label>
                <select value={selectedOrder} onChange={(e) => setSelectedOrder(e.target.value)} required className="w-full px-3 py-2 border border-[#c8cdd3] rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#0f1923] bg-white">
                  <option value="">Select an order</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      Order #{o.id} &mdash; {products[o.product_id]?.name || `Product #${o.product_id}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Baseline scan indicator */}
              {selectedOrder && baselineScan && (
                <div className={`rounded-lg px-4 py-3 flex items-start gap-3 border ${
                  baselineScan.has_baseline_scan
                    ? "bg-[#f0fdf4] border-[#22c55e]/40"
                    : "bg-[#fffbeb] border-[#f59e0b]/40"
                }`}>
                  <span className="text-[18px] flex-shrink-0 mt-0.5">
                    {baselineScan.has_baseline_scan ? "🛡️" : "⚠️"}
                  </span>
                  <div className="flex-1">
                    {baselineScan.has_baseline_scan ? (
                      <>
                        <p className="text-[12px] font-bold text-[#15803d]">Delivery Baseline Scan Available</p>
                        <p className="text-[11px] text-[#166534] mt-0.5">
                          {baselineScan.angles_count} angles captured by{" "}
                          <strong>{baselineScan.employee?.name || "delivery agent"}</strong> on{" "}
                          {baselineScan.baseline_scan_at
                            ? new Date(baselineScan.baseline_scan_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                            : "delivery day"}.
                          The AI will compare your return photo <strong>against this baseline</strong> for accurate assessment.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[12px] font-bold text-[#92400e]">No Baseline Scan on Record</p>
                        <p className="text-[11px] text-[#78350f] mt-0.5">
                          No delivery-time baseline scan was captured for this order. The AI will assess
                          the return photo independently without a comparison reference.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[12px] font-semibold text-[#0f1923] block mb-1">Reason for return</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-3 py-2 border border-[#c8cdd3] rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#0f1923] bg-white">
                  <option value="size_mismatch">Size doesn't fit</option>
                  <option value="quality">Quality not as expected</option>
                  <option value="wrong_item">Wrong item received</option>
                  <option value="changed_mind">Changed my mind</option>
                  <option value="defective">Product is defective</option>
                </select>
              </div>
              <div>
                <div className="bg-[#f5f6f8] -mx-5 px-5 py-3 border-y border-[#e3e6ea] mb-4">
                  <p className="text-[13px] font-semibold text-[#0f1923]">Step 2 &mdash; Live product scan for AI assessment</p>
                  <p className="text-[11px] text-[#6c7480] mt-0.5">
                    Record a guided video scan — motion prompts walk you through all angles. AI extracts key frames and compares against the delivery baseline.
                  </p>
                  {selectedProduct && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="text-[10px] text-[#6c7480] uppercase font-semibold tracking-wider">Verifying against:</span>
                      <span className="text-[11px] font-semibold text-[#067d62] bg-[#f2fbf7] border border-[#067d62]/25 px-2 py-0.5 rounded">{selectedProduct.name}</span>
                    </div>
                  )}
                </div>

                {scanPreview ? (
                  <div className="border border-[#067d62]/30 rounded-xl overflow-hidden mb-3">
                    <div className="grid grid-cols-3 gap-0.5 bg-[#e3e6ea]">
                      {scanFrames.slice(0, 6).map((frame, i) => (
                        <img key={i} src={frame} alt={`Scan frame ${i + 1}`} className="w-full aspect-square object-cover" />
                      ))}
                    </div>
                    <div className="px-4 py-3 bg-[#f2fbf7] flex items-center justify-between">
                      <div>
                        <p className="text-[12px] font-semibold text-[#067d62]">✓ Live scan complete</p>
                        <p className="text-[11px] text-[#067d62]/80">{scanFrames.length} frames captured</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setScanPhase("scan")}
                        className="text-[11px] text-[#1a6bb5] hover:underline font-semibold"
                      >
                        Re-scan
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setScanPhase("scan")}
                    disabled={!selectedOrder}
                    className="w-full border-2 border-dashed border-[#067d62]/40 rounded-xl py-8 flex flex-col items-center gap-2 hover:border-[#067d62] hover:bg-[#f2fbf7] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-14 h-14 rounded-full bg-[#067d62]/10 flex items-center justify-center text-2xl">🎥</div>
                    <p className="text-[14px] font-semibold text-[#067d62]">Start Live Product Scan</p>
                    <p className="text-[11px] text-[#6c7480]">Guided motion recording · ~18 seconds</p>
                  </button>
                )}

                {scanFrames.length > 0 && !submitting && (
                  <div className="mt-3 bg-[#f2fbf7] border border-[#067d62]/30 rounded-lg px-4 py-2.5 flex items-center gap-3">
                    <svg className="w-4 h-4 text-[#067d62] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <div>
                      <p className="text-[12px] font-semibold text-[#067d62]">Video Recorded</p>
                      <p className="text-[11px] text-[#067d62]/80 mt-0.5">Ready for AI assessment.</p>
                    </div>
                  </div>
                )}

                {mismatchError && scanFrames.length > 0 && !verifyingImage && (
                  <div className="mt-3 bg-[#fdf3e7] border border-[#c45500]/30 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="w-4.5 h-4.5 text-[#c45500] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <p className="text-[12px] font-semibold text-[#c45500]">Scan Verification Failed</p>
                    </div>
                    <p className="text-[12px] text-[#1a1f27]">{mismatchError.message}</p>
                    {mismatchError.reason && (
                      <p className="text-[11px] text-[#c45500]/80 mt-1 italic">Reason: {mismatchError.reason}</p>
                    )}
                    <p className="text-[11px] text-[#6c7480] mt-2">Please re-scan the actual item you ordered.</p>
                  </div>
                )}
              </div>
              {submitting && (
                <div>
                  <div className="flex justify-between text-[11px] text-[#6c7480] mb-1"><span>{progressLabel}</span><span>{progress}%</span></div>
                  <div className="h-[5px] bg-[#eaecef] rounded-full overflow-hidden"><div className="h-full bg-[#0f1923] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} /></div>
                </div>
              )}
              <button
                type="submit"
                disabled={submitting || !selectedOrder || scanPhases.length === 0}
                className="btn-amazon-primary w-full py-2.5 text-[14px] font-semibold disabled:opacity-50"
              >
                {submitting
                  ? "Processing\u2026"
                  : scanPhases.length === 0
                  ? "Complete live scan to continue"
                  : "Submit & Get AI Assessment"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* AI Verification Full Screen Overlay */}
      {verifyingImage && (
        <div className="fixed inset-0 bg-[#0f1923]/95 z-[100] flex flex-col items-center justify-center p-4 animate-fade-in backdrop-blur-sm">
          <div className="relative w-32 h-32 mb-8">
            <div className="absolute inset-0 border-[6px] border-[#00a86b]/20 rounded-full"></div>
            <div className="absolute inset-0 border-[6px] border-[#00a86b] rounded-full border-t-transparent animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-12 h-12 text-[#00a86b] animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            
            {/* Scanning beam effect */}
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <div className="w-full h-1 bg-[#00a86b] absolute top-0 left-0 shadow-[0_0_15px_#00a86b] animate-[scan_2s_ease-in-out_infinite]"></div>
            </div>
          </div>
          
          <h2 className="text-3xl font-extrabold text-white mb-3 tracking-tight">Amazon <span className="text-[#00a86b]">Circular Intelligence</span></h2>
          <p className="text-[#8a9bb0] text-lg mb-10 max-w-md text-center">
            Analyzing your live product scan with Bedrock AI...
          </p>
          
          <div className="w-72 space-y-4 bg-white/5 rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-4 text-[15px]">
              <div className="w-2.5 h-2.5 bg-[#00a86b] rounded-full animate-ping shadow-[0_0_8px_#00a86b]"></div>
              <span className="text-white font-medium">Verifying product identity</span>
            </div>
            <div className="flex items-center gap-4 text-[15px] opacity-60">
              <div className="w-2.5 h-2.5 bg-gray-500 rounded-full"></div>
              <span className="text-gray-300">Checking physical condition</span>
            </div>
            <div className="flex items-center gap-4 text-[15px] opacity-60">
              <div className="w-2.5 h-2.5 bg-gray-500 rounded-full"></div>
              <span className="text-gray-300">Evaluating resale potential</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}