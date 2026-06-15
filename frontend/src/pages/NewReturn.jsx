import { useRef, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getOrders, createReturn, getProduct } from "../api/client";
import { useUser } from "../context/UserContext";

const BASE_URL = `http://${window.location.hostname}:8000/api`;

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

// ── Image upload zone ─────────────────────────────────────────────────────────
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
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
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

  const [verifyingImage, setVerifyingImage] = useState(false);
  const [verifiedImage, setVerifiedImage] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    getOrders(currentUser.id)
      .then(async (data) => {
        const returnable = data.filter((o) => o.status !== "returned");
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
    if (!selectedOrder || !orders.length) { setSelectedProduct(null); return; }
    const order = orders.find((o) => String(o.id) === String(selectedOrder));
    if (!order) { setSelectedProduct(null); return; }
    getProduct(order.product_id).then(setSelectedProduct).catch(() => setSelectedProduct(null));
  }, [selectedOrder, orders]);

  // Immediate image verification when image or product changes
  useEffect(() => {
    if (!imageFile || !selectedProduct) {
      setVerifiedImage(null);
      setMismatchError(null);
      return;
    }

    let active = true;
    setVerifyingImage(true);
    setVerifiedImage(null);
    setMismatchError(null);

    const form = new FormData();
    form.append("image", imageFile);
    form.append("product_name", selectedProduct.name || "");
    form.append("product_category", selectedProduct.category || "");

    fetch(`${BASE_URL}/sustainability/verify`, { method: "POST", body: form })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ detail: res.statusText }));
          const detail = errBody.detail;
          if (typeof detail === "object" && detail?.type === "product_mismatch") {
            setMismatchError(detail);
          } else {
            throw new Error(typeof detail === "string" ? detail : detail?.message || `Error ${res.status}`);
          }
        } else {
          setVerifiedImage(imageFile);
        }
      })
      .catch((err) => {
        if (!active) return;
        setMismatchError({
          message: "Could not complete image verification.",
          reason: err.message,
        });
      })
      .finally(() => {
        if (active) {
          setVerifyingImage(false);
        }
      });

    return () => {
      active = false;
    };
  }, [imageFile, selectedProduct]);

  const handleFileSelect = (f) => {
    setImageFile(f);
    setMismatchError(null);
    setVerifiedImage(null);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setSubmitting(true);
    setSustainError("");
    setMismatchError(null);

    if (!imageFile) {
      // Standard return without AI assessment. Create return immediately.
      setProgress(20);
      setProgressLabel("Submitting return request\u2026");
      try {
        const res = await createReturn(Number(selectedOrder), []);
        setReturnResult(res);
        refreshUser();
        setProgress(100);
        setProgressLabel("Done!");
        setSubmitting(false);
        setConfirmed(true);
        setShowResults(true);
      } catch (err) {
        alert(`Failed to complete return: ${err.message}`);
        setSubmitting(false);
      }
      return;
    }

    setProgress(10);
    setProgressLabel("Initializing AI scanner\u2026");

    const form = new FormData();
    form.append("image", imageFile);
    form.append("order_id", selectedOrder);
    if (selectedProduct) {
      form.append("product_name", selectedProduct.name || "");
      form.append("product_category", selectedProduct.category || "");
    }

    setProgressLabel("Running AI sustainability assessment\u2026");
    setProgress(40);
    const ticker = setInterval(() => setProgress((p) => (p < 92 ? p + 2 : p)), 250);
    try {
      const res = await fetch(`${BASE_URL}/sustainability/assess`, { method: "POST", body: form });
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
        [],
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
                      setImageFile(null);
                      setImagePreview("");
                    }} 
                    className="btn-amazon-primary text-[13px] px-5 py-2"
                  >
                    Go Back &amp; Upload Different Photo
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

                {s && (
                  <div className="border border-[#d0d4d9] rounded-xl overflow-hidden">
                    <div className="bg-[#f5f6f8] px-5 py-2.5 border-b border-[#d0d4d9]">
                      <span className="text-[10px] font-semibold text-[#6c7480] uppercase tracking-widest">Raw Bedrock Response &middot; Debug</span>
                    </div>
                    <pre className="p-5 text-[11px] text-[#2d3748] font-mono bg-[#fafbfc] overflow-x-auto whitespace-pre-wrap leading-relaxed">{JSON.stringify(s, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {!mismatchError && (
            <div className="mt-6 border border-[#d0d4d9] rounded-xl overflow-hidden shadow-sm">
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
                      onClick={() => {
                        setShowResults(false);
                        setSustainResult(null);
                        setImageFile(null);
                        setImagePreview("");
                      }}
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
          )}
        </div>
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
          Our AI assesses the product and recommends the best circular action.{" "}
          <span className="text-[#067d62] font-semibold">Earn Green Credits for every return.</span>
        </p>
        {loading ? (
          <div className="border border-[#e3e6ea] rounded-xl p-8 animate-pulse bg-[#fafbfc]" />
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
                  <p className="text-[13px] font-semibold text-[#0f1923]">Step 2 &mdash; Upload product photo for AI assessment</p>
                  <p className="text-[11px] text-[#6c7480] mt-0.5">Upload an image to get a disposition: RESALE, REFURBISH, RECYCLE, or DISPOSE.</p>
                  {selectedProduct && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="text-[10px] text-[#6c7480] uppercase font-semibold tracking-wider">Verifying against:</span>
                      <span className="text-[11px] font-semibold text-[#067d62] bg-[#f2fbf7] border border-[#067d62]/25 px-2 py-0.5 rounded">{selectedProduct.name}</span>
                    </div>
                  )}
                </div>
                
                <UploadZone file={imageFile} preview={imagePreview} onFile={handleFileSelect} />
                
                {imageFile && (
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[11px] text-[#6c7480] truncate max-w-[80%] font-medium">{imageFile.name}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(null);
                        setVerifiedImage(null);
                        setMismatchError(null);
                      }}
                      className="text-[11px] text-[#b12704] hover:underline"
                    >
                      Remove photo
                    </button>
                  </div>
                )}

                {/* Verification states */}
                {/* Full screen overlay is rendered at the bottom */}

                {verifiedImage && imageFile && !verifyingImage && (
                  <div className="mt-3 bg-[#f2fbf7] border border-[#067d62]/30 rounded-lg px-4 py-2.5 flex items-center gap-3">
                    <svg className="w-4 h-4 text-[#067d62] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <div>
                      <p className="text-[12px] font-semibold text-[#067d62]">Product Identity Verified</p>
                      <p className="text-[11px] text-[#067d62]/80 mt-0.5">The uploaded photo matches your ordered {selectedProduct?.name}. Ready for return scan.</p>
                    </div>
                  </div>
                )}

                {mismatchError && imageFile && !verifyingImage && (
                  <div className="mt-3 bg-[#fdf3e7] border border-[#c45500]/30 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="w-4.5 h-4.5 text-[#c45500] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <p className="text-[12px] font-semibold text-[#c45500]">Photo Verification Failed</p>
                    </div>
                    <p className="text-[12px] text-[#1a1f27]">{mismatchError.message}</p>
                    {mismatchError.reason && (
                      <p className="text-[11px] text-[#c45500]/80 mt-1 italic">Reason: {mismatchError.reason}</p>
                    )}
                    <p className="text-[11px] text-[#6c7480] mt-2">Please upload a clear photo of the actual item you ordered to proceed with the AI assessment.</p>
                  </div>
                )}

                {!imageFile && <p className="text-[11px] text-[#9aa0aa] mt-1.5">Image upload is optional &mdash; skip to submit without AI assessment.</p>}
              </div>
              {submitting && (
                <div>
                  <div className="flex justify-between text-[11px] text-[#6c7480] mb-1"><span>{progressLabel}</span><span>{progress}%</span></div>
                  <div className="h-[5px] bg-[#eaecef] rounded-full overflow-hidden"><div className="h-full bg-[#0f1923] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} /></div>
                </div>
              )}
              <button
                type="submit"
                disabled={submitting || !selectedOrder || verifyingImage || (imageFile && !verifiedImage)}
                className="btn-amazon-primary w-full py-2.5 text-[14px] font-semibold disabled:opacity-50"
              >
                {submitting
                  ? "Processing\u2026"
                  : verifyingImage
                  ? "Verifying product photo\u2026"
                  : imageFile && !verifiedImage
                  ? "Verification required to submit"
                  : imageFile
                  ? "Submit & Get AI Assessment"
                  : "Submit Return"}
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
            Analyzing your product photo with Bedrock AI...
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
