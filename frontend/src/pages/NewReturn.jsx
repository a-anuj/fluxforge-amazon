import { useRef, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getOrders, getProduct, createReturnWithPhoto, checkHubInventory, requestReplacement } from "../api/client";
import { useUser } from "../context/UserContext";
import ProductCameraCapture from "../components/ProductCameraCapture";

const RETURN_REASONS = [
  { value: "size_mismatch", label: "Doesn't fit / wrong size",  icon: "👔", requiresPhoto: true },
  { value: "quality",       label: "Quality not as expected",   icon: "⚠️", requiresPhoto: true },
  { value: "wrong_item",    label: "Wrong item received",       icon: "📦", requiresPhoto: true },
];

const REASON_HINTS = {
  size_mismatch: "📸 We'll check the photo for any damage. If the item is undamaged, a hub manager will decide whether to resell or exchange it — and we'll also check NearDrop for nearby buyers!",
  quality:       "📸 Our AI will assess the quality issue. Based on refurbishment viability it may be relisted as Certified Second Life, donated, or recycled.",
  wrong_item:    "📸 We'll verify the photo against your order. If it's a different product, it goes to the hub and we'll also check NearDrop for nearby buyers who want it.",
};

function Steps({ current }) {
  const labels = ["Select Item", "Reason & Photo", "Choose Action", "Done"];
  return (
    <div className="flex items-center gap-0 mb-8">
      {labels.map((label, i) => {
        const idx = i + 1;
        const active = current === idx;
        const done = current > idx;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold transition-all
                ${done ? "bg-[#067d62] text-white" : active ? "bg-[#0f1923] text-white" : "bg-[#e3e6ea] text-[#6c7480]"}`}>
                {done ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : idx}
              </div>
              <span className={`text-[10px] mt-1 font-semibold tracking-wide whitespace-nowrap
                ${active ? "text-[#0f1923]" : done ? "text-[#067d62]" : "text-[#9aa0aa]"}`}>{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div className={`flex-1 h-[2px] mx-2 mt-[-12px] rounded ${done ? "bg-[#067d62]" : "bg-[#e3e6ea]"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const ACTION_INFO = {
  "Restocked":             { icon: "📦", text: "Your item is in good shape — it will be restocked into inventory for future replacements." },
  "Certified Refurbish":   { icon: "🔧", text: "Your item will be refurbished by our team and relisted as Amazon Certified Refurbished." },
  "Exchange":              { icon: "🔄", text: "Your item will be exchanged for the correct product." },
  "Donate":                { icon: "🤝", text: "Your item will be donated to a partner NGO for good use." },
  "Recycle":               { icon: "♻️", text: "Your item will be responsibly recycled to recover raw materials." },
  "Under Review":          { icon: "🔍", text: "A hub manager will inspect your item and assign the best circular outcome." },
};

function ReplacementSuccess({ result, productName }) {
  const fromHub = result?.source === "hub";
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-[440px] w-full text-center">
        <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm" style={{background: fromHub ? "#e6f4ea" : "#e8f0fe"}}>
          <span className="text-5xl">{fromHub ? "♻️" : "📦"}</span>
        </div>
        <h1 className="text-[28px] font-bold text-[#0f1923] mb-2">Replacement Confirmed!</h1>
        <p className="text-[15px] text-[#6c7480] leading-relaxed mb-6">
          A replacement for <strong className="text-[#0f1923]">{productName || "your item"}</strong> has been placed.
        </p>
        <div className="rounded-2xl border px-5 py-5 mb-6 text-left space-y-3" style={{borderColor: fromHub ? "#c3e6cb" : "#c6d9f7", background: fromHub ? "#f2fbf7" : "#f0f5ff"}}>
          <p className="text-[11px] font-bold uppercase tracking-widest" style={{color: fromHub ? "#067d62" : "#1a6bb5"}}>
            {fromHub ? "🏭 Fulfilled from Hub Inventory" : "📦 Ordered from Amazon"}
          </p>
          <p className="text-[13px] text-[#1a1f27] leading-relaxed">{result?.message}</p>
          {fromHub && result?.green_credits_earned > 0 && (
            <div className="flex items-center gap-2 mt-2 bg-white rounded-xl px-3 py-2 border border-[#c3e6cb]">
              <span className="text-lg">💚</span>
              <span className="text-[13px] font-bold text-[#067d62]">+{result.green_credits_earned} Green Credits earned!</span>
            </div>
          )}
          {!fromHub && (
            <p className="text-[12px] text-[#6c7480] mt-1">No hub stock was available in your area — we've placed a fresh order for you.</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Link to="/orders" className="w-full bg-[#0f1923] hover:bg-[#1a2b3c] text-white font-semibold text-[14px] py-3 rounded-xl text-center transition-colors">View Orders</Link>
          <Link to="/profile" className="w-full border border-[#d0d4d9] hover:bg-[#fafbfc] text-[#0f1923] font-semibold text-[14px] py-3 rounded-xl text-center transition-colors">View Profile</Link>
        </div>
      </div>
    </div>
  );
}

function SuccessScreen({ productName, actionLabel }) {
  const info = ACTION_INFO[actionLabel] || ACTION_INFO["Under Review"];
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-[440px] w-full text-center">
        {/* Checkmark */}
        <div className="w-24 h-24 rounded-full bg-[#e6f4ea] flex items-center justify-center mx-auto mb-6 shadow-sm">
          <svg className="w-14 h-14 text-[#067d62]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>

        <h1 className="text-[28px] font-bold text-[#0f1923] mb-2">Return Confirmed!</h1>
        <p className="text-[15px] text-[#6c7480] leading-relaxed mb-6">
          Your return for <strong className="text-[#0f1923]">{productName || "your item"}</strong> has been submitted.
          Pickup will be arranged within <strong className="text-[#0f1923]">2â€“3 business days</strong>.
        </p>

        {/* What happens to this product */}
        <div className="bg-[#f5f6f8] border border-[#e3e6ea] rounded-2xl px-5 py-5 mb-6 text-left">
          <p className="text-[11px] text-[#6c7480] uppercase font-bold tracking-widest mb-3">What happens to your product</p>
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none">{info.icon}</span>
            <div>
              <p className="text-[13px] font-bold text-[#0f1923] mb-0.5">{actionLabel}</p>
              <p className="text-[13px] text-[#6c7480] leading-relaxed">{info.text}</p>
            </div>
          </div>
        </div>

        {/* Next steps */}
        <div className="border border-[#e3e6ea] rounded-2xl px-5 py-5 mb-6 text-left space-y-4">
          <p className="text-[11px] text-[#6c7480] uppercase font-bold tracking-widest">What happens next</p>
          {[
            { icon: "🚚", text: "Our delivery partner will schedule a pickup from your address." },
            { icon: "💚", text: "Any applicable Green Credits will be added to your account after pickup." },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-start gap-3">
              <span className="text-lg leading-none mt-0.5">{icon}</span>
              <p className="text-[13px] text-[#1a1f27] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <Link to="/orders" className="w-full bg-[#0f1923] hover:bg-[#1a2b3c] text-white font-semibold text-[14px] py-3 rounded-xl text-center transition-colors">
            Back to Orders
          </Link>
          <Link to="/profile" className="w-full border border-[#d0d4d9] hover:bg-[#fafbfc] text-[#0f1923] font-semibold text-[14px] py-3 rounded-xl text-center transition-colors">
            View My Profile
          </Link>
        </div>
      </div>
    </div>
  );
}



export default function NewReturn() {
  const { currentUser, refreshUser } = useUser();
  const [searchParams] = useSearchParams();
  const preselectedOrderId = searchParams.get("orderId") || "";

  const [orders, setOrders]               = useState([]);
  const [products, setProducts]           = useState({});
  const [loading, setLoading]             = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(preselectedOrderId);
  const [reason, setReason]               = useState("size_mismatch");
  const [photos, setPhotos]               = useState(null);  // { front: File, back: File }
  const [showCamera, setShowCamera]       = useState(false);
  const [step, setStep]                   = useState(1);
  const [submitting, setSubmitting]       = useState(false);
  const [result, setResult]               = useState(null);
  const [error, setError]                 = useState("");
  // Replacement flow state
  const [disposition, setDisposition]     = useState(null); // "refund" | "replacement"
  const [inventoryAvailable, setInventoryAvailable] = useState(null); // null = not checked yet
  const [checkingInventory, setCheckingInventory]   = useState(false);
  const [replacementResult, setReplacementResult]   = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    getOrders(currentUser.id).then(async (data) => {
      const returnable = data.filter(o => !["returned","return_pending","return_verified"].includes(o.status));
      setOrders(returnable);
      const found = returnable.find(o => String(o.id) === preselectedOrderId);
      if (preselectedOrderId && found) { setSelectedOrder(String(preselectedOrderId)); setStep(2); }
      else if (preselectedOrderId && !found) setSelectedOrder("");
      const prods = {};
      await Promise.all([...new Set(returnable.map(o => o.product_id))].map(async pid => {
        try { prods[pid] = await getProduct(pid); } catch {}
      }));
      setProducts(prods);
    }).catch(console.error).finally(() => setLoading(false));
  }, [currentUser]);

  const selectedProductObj = selectedOrder
    ? products[orders.find(o => String(o.id) === String(selectedOrder))?.product_id]
    : null;

  const reasonMeta = RETURN_REASONS.find(r => r.value === reason) || RETURN_REASONS[0];
  const photoRequired = reasonMeta.requiresPhoto;

  // Device detection: mobile = has touch + small screen or explicit mobile UA
  const isMobile = typeof window !== "undefined" &&
    (navigator.maxTouchPoints > 1 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
  const fileInputRef  = useRef(null);
  const dropZoneRef   = useRef(null);
  const [pastedFlash, setPastedFlash] = useState(false); // brief green flash on paste
  const [dragOver,    setDragOver]    = useState(false);

  // Global paste listener — only active on desktop step 2
  useEffect(() => {
    if (isMobile || step !== 2 || photos) return;
    const handlePaste = (e) => {
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            setPhotos({ front: file, back: file });
            setPastedFlash(true);
            setTimeout(() => setPastedFlash(false), 1200);
          }
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isMobile, step, photos]);

  // Resolve the active photo: use front shot from guided camera
  const activePhoto = photos?.front || null;

  // Step 2 → 3: check inventory then show disposition choice
  const handleContinueToChoice = async () => {
    if (photoRequired && !activePhoto) { setError("A photo is required for this return reason."); return; }
    setError("");
    setCheckingInventory(true);
    try {
      const order = orders.find(o => String(o.id) === String(selectedOrder));
      const prod = products[order?.product_id];
      if (prod && currentUser?.city) {
        const inv = await checkHubInventory(prod.id, currentUser.city);
        setInventoryAvailable(inv.available);
      } else {
        setInventoryAvailable(false);
      }
    } catch { setInventoryAvailable(false); }
    finally { setCheckingInventory(false); }
    setStep(3);
  };

  // Step 3: customer picks refund or replacement
  const handleDispositionSubmit = async () => {
    if (!disposition) return;
    setSubmitting(true);
    setError("");
    try {
      if (disposition === "replacement") {
        const res = await requestReplacement(Number(selectedOrder), "replacement", reason, photos);
        setReplacementResult(res);
        refreshUser();
        setStep("replacement_done");
      } else {
        // Refund: proceed with normal photo return
        const res = await createReturnWithPhoto(Number(selectedOrder), photos, reason);
        setResult(res);
        refreshUser();
        setStep("done");
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "replacement_done") return <ReplacementSuccess result={replacementResult} productName={selectedProductObj?.name} />;
  if (step === "done") return <SuccessScreen productName={selectedProductObj?.name} actionLabel={result?.action_label} />;

  return (
    <div className="bg-white min-h-screen">
      {/* Camera overlay — shown when user taps Open Camera on mobile */}
      {showCamera && (
        <ProductCameraCapture
          title="Capture Product Photos"
          onCapture={(files) => { setPhotos(files); setShowCamera(false); }}
          onClose={() => setShowCamera(false)}
        />
      )}
      <div className="max-w-[520px] mx-auto px-4 py-8">
        <div className="text-[12px] text-[#6c7480] mb-5">
          <Link to="/orders" className="text-[#1a6bb5] hover:underline">Your Orders</Link>
          <span className="mx-1.5">›</span><span>Return an Item</span>
        </div>
        <h1 className="text-[26px] font-bold text-[#0f1923] mb-1">Return an Item</h1>
        <p className="text-[14px] text-[#6c7480] mb-7">Quick and simple. We'll take care of the rest.</p>
        <Steps current={step === "done" ? 3 : step} />

        {/* Step 1: Select order */}
        {step === 1 && (
          <div className="space-y-5 animate-fade-in">
            {loading ? (
              <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 rounded-2xl bg-[#f0f2f5] animate-pulse" />)}</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-12 border border-[#e3e6ea] rounded-2xl">
                <div className="text-4xl mb-3">🚚</div>
                <p className="text-[15px] font-semibold text-[#0f1923] mb-1">No orders ready for return</p>
                <p className="text-[13px] text-[#6c7480]">Only delivered orders can be returned.</p>
                <Link to="/orders" className="mt-4 inline-block text-[#1a6bb5] text-[13px] font-semibold hover:underline">View your orders â†’</Link>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {orders.map(order => {
                    const prod = products[order.product_id];
                    const isSel = String(selectedOrder) === String(order.id);
                    return (
                      <button key={order.id} type="button" onClick={() => setSelectedOrder(String(order.id))}
                        className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl border-2 text-left transition-all
                          ${isSel ? "border-[#0f1923] bg-[#f5f6f8]" : "border-[#e3e6ea] hover:border-[#c8cdd3] bg-white"}`}>
                        <div className="w-12 h-12 rounded-xl bg-[#f0f2f5] flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {prod?.image_url ? <img src={prod.image_url} alt="" className="w-full h-full object-contain mix-blend-multiply" /> : <span className="text-xl">📦</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-[#0f1923] truncate">{prod?.name || `Order #${order.id}`}</p>
                          <p className="text-[11px] text-[#6c7480] mt-0.5">Order #{order.id}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${isSel ? "border-[#0f1923] bg-[#0f1923]" : "border-[#c8cdd3]"}`}>
                          {isSel && <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button type="button" disabled={!selectedOrder} onClick={() => setStep(2)}
                  className="w-full bg-[#e47911] hover:bg-[#d56e0c] disabled:opacity-40 text-white font-bold text-[15px] py-3.5 rounded-xl transition-colors shadow-sm">
                  Continue â†’
                </button>
              </>
            )}
          </div>
        )}

        {/* Step 2: Reason + Photo */}
        {step === 2 && (
          <div className="space-y-5 animate-fade-in">
            {/* Product recap */}
            {selectedProductObj && (
              <div className="flex items-center gap-3 bg-[#f5f6f8] rounded-2xl px-4 py-3">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 border border-[#e3e6ea] overflow-hidden">
                  {selectedProductObj.image_url ? <img src={selectedProductObj.image_url} alt="" className="w-full h-full object-contain mix-blend-multiply" /> : <span className="text-lg">📦</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#0f1923] truncate">{selectedProductObj.name}</p>
                  <p className="text-[11px] text-[#6c7480]">Order #{selectedOrder}</p>
                </div>
                <button type="button" onClick={() => setStep(1)} className="text-[11px] text-[#1a6bb5] font-semibold hover:underline flex-shrink-0">Change</button>
              </div>
            )}

            {/* Reason selector */}
            <div>
              <label className="block text-[12px] font-semibold text-[#0f1923] mb-2">Why are you returning?</label>
              <div className="grid grid-cols-1 gap-2">
                {RETURN_REASONS.map(r => (
                  <button key={r.value} type="button" onClick={() => { setReason(r.value); setPhotos(null); }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all text-[12px] font-semibold
                      ${reason === r.value ? "border-[#0f1923] bg-[#f5f6f8] text-[#0f1923]" : "border-[#e3e6ea] text-[#6c7480] hover:border-[#c8cdd3]"}`}>
                    <span className="text-base">{r.icon}</span>
                    <span className="leading-tight">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Contextual hint */}
            {REASON_HINTS[reason] && (
              <div className="bg-[#f0f7ff] border border-[#1a6bb5]/20 rounded-xl px-4 py-3">
                <p className="text-[12px] text-[#1a4a70] leading-relaxed">{REASON_HINTS[reason]}</p>
              </div>
            )}

            {/* Photo upload / camera */}
            <div>
              <p className="text-[13px] font-semibold text-[#0f1923] mb-1.5">
                Product photo {photoRequired ? <span className="text-[#b12704]">*</span> : <span className="text-[#9aa0aa] font-normal">(optional but recommended)</span>}
              </p>

              {photos ? (
                /* Photo captured — show thumbnail + retake */
                <div className="border border-[#067d62]/30 rounded-2xl bg-[#f2fbf7] p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-[#067d62]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <p className="text-[13px] font-bold text-[#067d62]">Photo captured</p>
                  </div>
                  <img
                    src={URL.createObjectURL(photos.front)}
                    alt="Product"
                    className="w-full max-h-48 object-cover rounded-xl border border-[#067d62]/20 shadow-sm"
                  />
                  <button type="button" onClick={() => setPhotos(null)}
                    className="w-full text-[12px] font-semibold text-[#6c7480] hover:text-[#b12704] transition-colors py-1">
                    {isMobile ? "Retake photo" : "Remove & re-upload"}
                  </button>
                </div>
              ) : isMobile ? (
                /* Mobile: open guided camera */
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="w-full border-2 border-dashed border-[#c8cdd3] hover:border-[#0f1923] rounded-2xl py-7 flex flex-col items-center gap-2 transition-colors active:scale-[0.99]"
                >
                  <div className="w-14 h-14 rounded-full bg-[#0f1923] flex items-center justify-center shadow-md">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                    </svg>
                  </div>
                  <p className="text-[14px] font-bold text-[#0f1923]">Open Guided Camera</p>
                  <p className="text-[12px] text-[#6c7480]">Frame guide · Auto-detect · 2 guided shots</p>
                </button>
              ) : (
                /* Desktop: upload / paste / drag-drop */
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setPhotos({ front: file, back: file });
                    }}
                  />
                  <div
                    ref={dropZoneRef}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith("image/")) setPhotos({ front: file, back: file });
                    }}
                    className={`w-full border-2 border-dashed rounded-2xl py-7 flex flex-col items-center gap-2 transition-all cursor-pointer select-none
                      ${ pastedFlash
                          ? "border-[#067d62] bg-[#f2fbf7] scale-[1.01]"
                          : dragOver
                            ? "border-[#0f1923] bg-[#f5f6f8] scale-[1.01]"
                            : "border-[#c8cdd3] hover:border-[#0f1923] bg-white"
                      }`}
                  >
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${ pastedFlash ? "bg-[#e6f4ea]" : "bg-[#f0f2f5]" }`}>
                      {pastedFlash ? (
                        <svg className="w-7 h-7 text-[#067d62]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg className="w-7 h-7 text-[#6c7480]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                      )}
                    </div>
                    <p className={`text-[14px] font-bold transition-colors ${ pastedFlash ? "text-[#067d62]" : "text-[#0f1923]" }`}>
                      {pastedFlash ? "Image pasted ✓" : dragOver ? "Drop image here" : "Upload a photo"}
                    </p>
                    <p className="text-[12px] text-[#6c7480]">Click to browse · Drag &amp; drop · <kbd className="bg-[#f0f2f5] px-1.5 py-0.5 rounded text-[11px] font-mono border border-[#e3e6ea]">Ctrl+V</kbd> to paste</p>
                  </div>
                </>
              )}
            </div>

            {error && (
              <div className="bg-[#fff5f5] border border-[#ffd0d0] rounded-xl px-4 py-3">
                <p className="text-[13px] text-[#b12704] font-semibold">Could not submit return</p>
                <p className="text-[12px] text-[#b12704]/80 mt-0.5">{error}</p>
              </div>
            )}

            <button type="button" disabled={checkingInventory || (photoRequired && !activePhoto)} onClick={handleContinueToChoice}
              className="w-full bg-[#067d62] hover:bg-[#055e4a] disabled:opacity-50 text-white font-bold text-[15px] py-3.5 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2">
              {checkingInventory ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Checking availability…</>
              ) : "Continue →"}
            </button>


            <button type="button" onClick={() => setStep(1)} className="w-full text-[13px] text-[#6c7480] hover:text-[#0f1923] font-semibold py-2 transition-colors">â† Back</button>
          </div>
        )}

        {/* Step 3: Refund or Replacement */}
        {step === 3 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-[18px] font-bold text-[#0f1923]">What would you like?</h2>
            <p className="text-[13px] text-[#6c7480]">Choose how you'd like us to resolve this return.</p>

            {/* Replacement card */}
            <button type="button" onClick={() => setDisposition("replacement")}
              className={`w-full text-left rounded-2xl border-2 px-5 py-4 transition-all ${
                disposition === "replacement" ? "border-[#067d62] bg-[#f2fbf7]" : "border-[#e3e6ea] hover:border-[#c8cdd3]"
              }`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">🔄</span>
                <div>
                  <p className="text-[14px] font-bold text-[#0f1923]">Request a Replacement</p>
                  {inventoryAvailable ? (
                    <p className="text-[12px] text-[#067d62] font-semibold mt-0.5">✅ Hub stock available in your area — faster delivery + Green Credits!</p>
                  ) : (
                    <p className="text-[12px] text-[#6c7480] mt-0.5">No hub stock nearby — we'll order a fresh one from Amazon.</p>
                  )}
                </div>
              </div>
            </button>

            {/* Refund card */}
            <button type="button" onClick={() => setDisposition("refund")}
              className={`w-full text-left rounded-2xl border-2 px-5 py-4 transition-all ${
                disposition === "refund" ? "border-[#0f1923] bg-[#f5f6f8]" : "border-[#e3e6ea] hover:border-[#c8cdd3]"
              }`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">💰</span>
                <div>
                  <p className="text-[14px] font-bold text-[#0f1923]">Get a Refund</p>
                  <p className="text-[12px] text-[#6c7480] mt-0.5">Return the item and receive a refund to your original payment method.</p>
                </div>
              </div>
            </button>

            {error && (
              <div className="bg-[#fff5f5] border border-[#ffd0d0] rounded-xl px-4 py-3">
                <p className="text-[13px] text-[#b12704] font-semibold">{error}</p>
              </div>
            )}

            <button type="button" disabled={!disposition || submitting} onClick={handleDispositionSubmit}
              className="w-full bg-[#e47911] hover:bg-[#d56e0c] disabled:opacity-40 text-white font-bold text-[15px] py-3.5 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2">
              {submitting ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing…</>
              ) : "Confirm →"}
            </button>
            {submitting && disposition === "refund" && <p className="text-center text-[11px] text-[#6c7480]">Our AI is assessing your item. This usually takes a few seconds…</p>}
            <button type="button" onClick={() => setStep(2)} className="w-full text-[13px] text-[#6c7480] hover:text-[#0f1923] font-semibold py-2 transition-colors">← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
