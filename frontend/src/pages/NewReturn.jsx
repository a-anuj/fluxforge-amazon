import { useRef, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getOrders, getProduct, createReturnWithPhoto, checkHubInventory, requestReplacement } from "../api/client";
import { useUser } from "../context/UserContext";

const RETURN_REASONS = [
  { value: "size_mismatch", label: "Doesn't fit / wrong size",  icon: "📐", requiresPhoto: true },
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

function PhotoZone({ file, preview, onFile, required }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      onClick={() => inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-2xl cursor-pointer transition-all flex flex-col items-center justify-center text-center overflow-hidden
        ${dragging ? "border-[#e47911] bg-[#fff8f0]" : preview ? "border-[#067d62]/50 bg-[#f2fbf7]" : "border-[#c8cdd3] hover:border-[#0f1923]"}
        ${preview ? "h-[200px]" : "h-[140px]"}`}
    >
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      {preview ? (
        <>
          <img src={preview} alt="Your photo" className="h-full w-full object-contain p-2" />
          <div className="absolute inset-0 bg-black/0 hover:bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-2xl">
            <span className="text-white text-[12px] font-semibold bg-black/60 px-3 py-1.5 rounded-full">📷 Change photo</span>
          </div>
          <div className="absolute top-2 right-2 bg-[#067d62] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">✓ Photo added</div>
        </>
      ) : (
        <>
          <div className="w-12 h-12 rounded-full bg-[#f0f0f0] flex items-center justify-center text-2xl mb-2">📷</div>
          <p className="text-[13px] font-semibold text-[#0f1923]">{required ? "Upload a photo (required)" : "Take or upload a photo"}</p>
          <p className="text-[11px] text-[#6c7480] mt-0.5">{required ? "Needed to process this return" : "Optional — helps us process faster"}</p>
          <p className="text-[10px] text-[#adb1b8] mt-1">JPEG · PNG · WebP</p>
        </>
      )}
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
          Pickup will be arranged within <strong className="text-[#0f1923]">2–3 business days</strong>.
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
  const [photoFile, setPhotoFile]         = useState(null);
  const [photoPreview, setPhotoPreview]   = useState(null);
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

  const handlePhotoFile = (file) => {
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPhotoPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  // Step 2 → 3: check inventory then show disposition choice
  const handleContinueToChoice = async () => {
    if (photoRequired && !photoFile) { setError("A photo is required for this return reason."); return; }
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
        const res = await requestReplacement(Number(selectedOrder), "replacement");
        setReplacementResult(res);
        refreshUser();
        setStep("replacement_done");
      } else {
        // Refund: proceed with normal photo return
        const res = await createReturnWithPhoto(Number(selectedOrder), photoFile || null, reason);
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
                <Link to="/orders" className="mt-4 inline-block text-[#1a6bb5] text-[13px] font-semibold hover:underline">View your orders →</Link>
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
                  Continue →
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
                  <button key={r.value} type="button" onClick={() => { setReason(r.value); setPhotoFile(null); setPhotoPreview(null); }}
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

            {/* Photo upload */}
            <div>
              <p className="text-[13px] font-semibold text-[#0f1923] mb-1.5">
                Add a photo {photoRequired ? <span className="text-[#b12704]">*</span> : <span className="text-[#9aa0aa] font-normal">(optional)</span>}
              </p>
              <PhotoZone file={photoFile} preview={photoPreview} onFile={handlePhotoFile} required={photoRequired} />
              {photoFile && (
                <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="mt-2 text-[11px] text-[#6c7480] hover:text-[#b12704] font-semibold">Remove photo</button>
              )}
            </div>

            {error && (
              <div className="bg-[#fff5f5] border border-[#ffd0d0] rounded-xl px-4 py-3">
                <p className="text-[13px] text-[#b12704] font-semibold">Could not submit return</p>
                <p className="text-[12px] text-[#b12704]/80 mt-0.5">{error}</p>
              </div>
            )}

            <button type="button" disabled={checkingInventory || (photoRequired && !photoFile)} onClick={handleContinueToChoice}
              className="w-full bg-[#067d62] hover:bg-[#055e4a] disabled:opacity-50 text-white font-bold text-[15px] py-3.5 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2">
              {checkingInventory ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Checking availability…</>
              ) : "Continue →"}
            </button>

            <button type="button" onClick={() => setStep(1)} className="w-full text-[13px] text-[#6c7480] hover:text-[#0f1923] font-semibold py-2 transition-colors">← Back</button>
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