import { useRef, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getOrders, getProduct, createReturnWithPhoto } from "../api/client";
import { useUser } from "../context/UserContext";

const RETURN_REASONS = [
  { value: "size_mismatch",   label: "Doesn't fit / wrong size" },
  { value: "quality",         label: "Quality not as expected" },
  { value: "wrong_item",      label: "Wrong item received" },
  { value: "changed_mind",    label: "Changed my mind" },
  { value: "defective",       label: "Product is defective" },
  { value: "other",           label: "Other reason" },
];

// ── Step indicator ──────────────────────────────────────────────────────
function Steps({ current }) {
  const steps = ["Select Item", "Add Photo", "Done"];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((label, i) => {
        const idx = i + 1;
        const active = current === idx;
        const done = current > idx;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold transition-all
                  ${done  ? "bg-[#067d62] text-white"
                  : active ? "bg-[#0f1923] text-white"
                  : "bg-[#e3e6ea] text-[#6c7480]"}`}
              >
                {done ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : idx}
              </div>
              <span className={`text-[10px] mt-1 font-semibold tracking-wide whitespace-nowrap
                ${active ? "text-[#0f1923]" : done ? "text-[#067d62]" : "text-[#9aa0aa]"}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-[2px] mx-2 mt-[-12px] rounded transition-colors
                ${done ? "bg-[#067d62]" : "bg-[#e3e6ea]"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Photo drop zone ─────────────────────────────────────────────────────
function PhotoZone({ file, preview, onFile }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      onClick={() => inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 flex flex-col items-center justify-center text-center overflow-hidden
        ${dragging ? "border-[#e47911] bg-[#fff8f0]" : preview ? "border-[#067d62]/50 bg-[#f2fbf7]" : "border-[#c8cdd3] hover:border-[#0f1923] hover:bg-[#fafbfc]"}
        ${preview ? "h-[200px]" : "h-[140px]"}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {preview ? (
        <>
          <img src={preview} alt="Your photo" className="h-full w-full object-contain p-2" />
          <div className="absolute inset-0 bg-black/0 hover:bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-2xl">
            <span className="text-white text-[12px] font-semibold bg-black/60 px-3 py-1.5 rounded-full">
              📷 Change photo
            </span>
          </div>
          <div className="absolute top-2 right-2 bg-[#067d62] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            ✓ Photo added
          </div>
        </>
      ) : (
        <>
          <div className="w-12 h-12 rounded-full bg-[#f0f0f0] flex items-center justify-center text-2xl mb-2">📷</div>
          <p className="text-[13px] font-semibold text-[#0f1923]">Take or upload a photo</p>
          <p className="text-[11px] text-[#6c7480] mt-0.5">Optional — helps us process your return faster</p>
          <p className="text-[10px] text-[#adb1b8] mt-1">JPEG · PNG · WebP · max 10 MB</p>
        </>
      )}
    </div>
  );
}

// ── Success screen ──────────────────────────────────────────────────────
function SuccessScreen({ result, productName }) {
  const credits = result?.green_credits_earned ?? 0;
  const co2 = result?.co2_saved ?? 0;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12 animate-fade-in">
      <div className="max-w-[480px] w-full text-center">
        {/* Big checkmark */}
        <div className="w-24 h-24 rounded-full bg-[#e6f4ea] flex items-center justify-center mx-auto mb-6 shadow-lg">
          <svg className="w-14 h-14 text-[#067d62]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>

        <h1 className="text-[28px] font-bold text-[#0f1923] mb-2 leading-tight">
          Return submitted!
        </h1>
        <p className="text-[15px] text-[#6c7480] leading-relaxed mb-8">
          {productName
            ? <>We've received your return request for <strong className="text-[#0f1923]">{productName}</strong>.</>
            : "We've received your return request."
          }{" "}
          Our team will handle everything from here.
        </p>

        {/* Credits earned */}
        {credits > 0 && (
          <div className="bg-gradient-to-br from-[#e6f4ea] to-[#f2fbf7] border border-[#067d62]/25 rounded-2xl px-6 py-5 mb-5 flex items-center justify-between shadow-sm">
            <div className="text-left">
              <p className="text-[11px] text-[#067d62] uppercase font-bold tracking-widest mb-0.5">Green Credits Earned</p>
              <p className="text-[13px] text-[#1a4a35] leading-snug">Thanks for returning sustainably 🌱</p>
            </div>
            <div className="text-[40px] font-extrabold text-[#067d62] leading-none">
              +{credits}
            </div>
          </div>
        )}

        {/* CO2 impact */}
        {co2 > 0 && (
          <div className="bg-[#f0f9ff] border border-[#1a6bb5]/20 rounded-2xl px-5 py-4 mb-6 flex items-center gap-3">
            <span className="text-2xl">🌍</span>
            <p className="text-[13px] text-[#1a4a70] leading-relaxed text-left">
              This return will save up to <strong>{co2} kg CO₂</strong> compared to throwing it away.
            </p>
          </div>
        )}

        {/* What happens next */}
        <div className="border border-[#e3e6ea] rounded-2xl px-5 py-4 mb-6 text-left space-y-3">
          <p className="text-[11px] text-[#6c7480] uppercase font-bold tracking-widest mb-2">What happens next</p>
          {[
            { icon: "🚚", text: "Our delivery partner will pick up your item within 2–3 days." },
            { icon: "♻️", text: "The item will be checked, cleaned, and given a second life." },
            { icon: "💚", text: "Your Green Credits have been added to your account." },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-start gap-3">
              <span className="text-lg leading-none mt-0.5">{icon}</span>
              <p className="text-[13px] text-[#1a1f27] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Link
            to="/orders"
            className="w-full bg-[#0f1923] hover:bg-[#1a2b3c] text-white font-semibold text-[14px] py-3 rounded-xl text-center transition-colors"
          >
            Back to Orders
          </Link>
          <Link
            to="/profile"
            className="w-full bg-white hover:bg-[#fafbfc] border border-[#d0d4d9] text-[#0f1923] font-semibold text-[14px] py-3 rounded-xl text-center transition-colors"
          >
            View Green Credits
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────
export default function NewReturn() {
  const { currentUser, refreshUser } = useUser();
  const [searchParams] = useSearchParams();
  const preselectedOrderId = searchParams.get("orderId") || "";

  const [orders, setOrders]           = useState([]);
  const [products, setProducts]       = useState({});
  const [loading, setLoading]         = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(preselectedOrderId);
  const [reason, setReason]           = useState("size_mismatch");
  const [photoFile, setPhotoFile]     = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [step, setStep]               = useState(1);   // 1 | 2 | "done"
  const [submitting, setSubmitting]   = useState(false);
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState("");

  useEffect(() => {
    if (!currentUser) return;
    getOrders(currentUser.id)
      .then(async (data) => {
        // Allow returning any order that hasn't already been returned
        const returnable = data.filter(
          (o) => o.status !== "returned" && o.status !== "return_pending" && o.status !== "return_verified"
        );
        setOrders(returnable);
        const preselectedFound = returnable.find((o) => String(o.id) === preselectedOrderId);
        if (preselectedOrderId && !preselectedFound) {
          setSelectedOrder("");
        } else if (preselectedOrderId && preselectedFound) {
          // Auto-advance to photo step since the order is already selected
          setSelectedOrder(String(preselectedOrderId));
          setStep(2);
        }
        const prods = {};
        const uniqueIds = [...new Set(returnable.map((o) => o.product_id))];
        await Promise.all(uniqueIds.map(async (pid) => {
          try { prods[pid] = await getProduct(pid); } catch {}
        }));
        setProducts(prods);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentUser]);

  const selectedProductObj = selectedOrder
    ? products[orders.find((o) => String(o.id) === String(selectedOrder))?.product_id]
    : null;

  const handlePhotoFile = (file) => {
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPhotoPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!selectedOrder) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await createReturnWithPhoto(Number(selectedOrder), photoFile || null, reason);
      setResult(res);
      refreshUser();
      setStep("done");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Done screen ─────────────────────────────────────────────────────
  if (step === "done") {
    return <SuccessScreen result={result} productName={selectedProductObj?.name} />;
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-[520px] mx-auto px-4 py-8">

        {/* Breadcrumb */}
        <div className="text-[12px] text-[#6c7480] mb-5">
          <Link to="/orders" className="text-[#1a6bb5] hover:underline">Your Orders</Link>
          <span className="mx-1.5">›</span>
          <span>Return an Item</span>
        </div>

        <h1 className="text-[26px] font-bold text-[#0f1923] mb-1">Return an Item</h1>
        <p className="text-[14px] text-[#6c7480] mb-7">
          Quick and simple. We'll take care of the rest.
        </p>

        <Steps current={step === "done" ? 3 : step} />

        {/* ── Step 1: Select order ─────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5 animate-fade-in">
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-20 rounded-2xl bg-[#f0f2f5] animate-pulse" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-12 border border-[#e3e6ea] rounded-2xl">
                <div className="text-4xl mb-3">🚚</div>
                <p className="text-[15px] font-semibold text-[#0f1923] mb-1">No orders ready for return</p>
                <p className="text-[13px] text-[#6c7480]">
                  Only delivered orders can be returned.
                </p>
                <Link to="/orders" className="mt-4 inline-block text-[#1a6bb5] text-[13px] font-semibold hover:underline">
                  View your orders →
                </Link>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {orders.map((order) => {
                    const prod = products[order.product_id];
                    const isSelected = String(selectedOrder) === String(order.id);
                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => setSelectedOrder(String(order.id))}
                        className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl border-2 text-left transition-all
                          ${isSelected
                            ? "border-[#0f1923] bg-[#f5f6f8]"
                            : "border-[#e3e6ea] hover:border-[#c8cdd3] bg-white"}`}
                      >
                        <div className="w-12 h-12 rounded-xl bg-[#f0f2f5] flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {prod?.image_url
                            ? <img src={prod.image_url} alt="" className="w-full h-full object-contain mix-blend-multiply" />
                            : <span className="text-xl">📦</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-[#0f1923] truncate">{prod?.name || `Order #${order.id}`}</p>
                          <p className="text-[11px] text-[#6c7480] mt-0.5">Order #{order.id}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                          ${isSelected ? "border-[#0f1923] bg-[#0f1923]" : "border-[#c8cdd3]"}`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>



                <button
                  type="button"
                  disabled={!selectedOrder}
                  onClick={() => setStep(2)}
                  className="w-full bg-[#e47911] hover:bg-[#d56e0c] disabled:opacity-40 text-white font-bold text-[15px] py-3.5 rounded-xl transition-colors shadow-sm"
                >
                  Continue →
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Step 2: Photo + confirm ───────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5 animate-fade-in">

            {/* Selected product recap */}
            {selectedProductObj && (
              <div className="flex items-center gap-3 bg-[#f5f6f8] rounded-2xl px-4 py-3">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 border border-[#e3e6ea] overflow-hidden">
                  {selectedProductObj.image_url
                    ? <img src={selectedProductObj.image_url} alt="" className="w-full h-full object-contain mix-blend-multiply" />
                    : <span className="text-lg">📦</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#0f1923] truncate">{selectedProductObj.name}</p>
                  <p className="text-[11px] text-[#6c7480]">
                    Order #{selectedOrder}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-[11px] text-[#1a6bb5] font-semibold hover:underline flex-shrink-0"
                >
                  Change
                </button>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-[12px] font-semibold text-[#0f1923] mb-1.5">
                Why are you returning?
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#c8cdd3] rounded-xl text-[13px] text-[#0f1923] focus:outline-none focus:ring-2 focus:ring-[#0f1923]/20 bg-white"
              >
                {RETURN_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>


            {/* Photo upload */}
            <div>
              <p className="text-[13px] font-semibold text-[#0f1923] mb-1.5">
                Add a photo <span className="text-[#9aa0aa] font-normal">(optional)</span>
              </p>
              <p className="text-[11px] text-[#6c7480] mb-3">
                A photo of your item helps us assess it quickly and get your refund or credit processed faster.
              </p>
              <PhotoZone file={photoFile} preview={photoPreview} onFile={handlePhotoFile} />
              {photoFile && (
                <button
                  type="button"
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="mt-2 text-[11px] text-[#6c7480] hover:text-[#b12704] font-semibold"
                >
                  Remove photo
                </button>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-[#fff5f5] border border-[#ffd0d0] rounded-xl px-4 py-3">
                <p className="text-[13px] text-[#b12704] font-semibold">Could not submit return</p>
                <p className="text-[12px] text-[#b12704]/80 mt-0.5">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="w-full bg-[#067d62] hover:bg-[#055e4a] disabled:opacity-50 text-white font-bold text-[15px] py-3.5 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing your return…
                </>
              ) : (
                "Submit Return"
              )}
            </button>

            {submitting && (
              <p className="text-center text-[11px] text-[#6c7480]">
                Our AI is assessing your item. This usually takes a few seconds…
              </p>
            )}

            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full text-[13px] text-[#6c7480] hover:text-[#0f1923] font-semibold py-2 transition-colors"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}