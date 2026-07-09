import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { CheckCircle, ShieldCheck, AlertTriangle, Package, ChevronLeft } from "lucide-react";
import ProductCameraCapture from "../components/ProductCameraCapture";
import {
  createCommunityListing,
  suggestPrice,
  getOrders,
  getProduct,
  verifyInvoice,
  getApiBaseUrl,
} from "../api/client";

// ── Constants ──────────────────────────────────────────────────────────────
const CATEGORIES = ["Electronics","Laptops","Mobiles","Clothing","Furniture","Appliances","Books","Sports","Toys","Other"];
const CONDITIONS = [
  { value: "like_new", label: "Like New",  desc: "Mint condition, barely used" },
  { value: "good",     label: "Good",      desc: "Minor signs of use, fully functional" },
  { value: "fair",     label: "Fair",      desc: "Visible wear but works perfectly" },
  { value: "poor",     label: "Poor",      desc: "Heavy use, may need minor repair" },
];
const INPUT  = "w-full border border-[#d5d9d9] rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#e77600] focus:ring-2 focus:ring-[#e77600]/20 bg-white transition-colors";
const LABEL  = "block text-[13px] font-semibold text-[#0f1111] mb-1.5";

// ── Step map: path → ordered step keys ────────────────────────────────────
const STEPS = {
  amazon:     ["path", "pick",    "photo", "details", "done"],
  non_amazon: ["path", "invoice", "photo", "details", "done"],
};

// Helper: step index for progress bar
function stepIndex(path, step) {
  if (!path) return 0;
  return STEPS[path].indexOf(step);
}
function totalSteps(path) {
  return path ? STEPS[path].length - 1 : 4; // -1 excludes "done"
}

// ── Progress bar ───────────────────────────────────────────────────────────
function ProgressBar({ path, step }) {
  const idx   = stepIndex(path, step);
  const total = totalSteps(path);
  const pct   = total > 0 ? Math.round((idx / total) * 100) : 0;
  const stepLabels = path === "amazon"
    ? ["Source", "Order", "Photo", "Details"]
    : ["Source", "Invoice", "Photo", "Details"];

  return (
    <div className="px-5 pt-4 pb-3 bg-white border-b border-[#e3e6ea]">
      {/* Bar */}
      <div className="h-1.5 bg-[#e3e6ea] rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-[#e77600] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Labels */}
      <div className="flex justify-between">
        {stepLabels.map((label, i) => {
          const isActive  = i === idx - (idx > 0 ? 1 : 0);
          const isDone    = i < idx - (idx > 0 ? 0 : 1);
          return (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all
                ${idx > i + 1
                  ? "bg-[#067d62] text-white"
                  : idx === i + 1
                    ? "bg-[#e77600] text-white"
                    : "bg-[#e3e6ea] text-[#6c7480]"
                }`}>
                {idx > i + 1 ? "✓" : i + 1}
              </div>
              <span className={`text-[9px] font-semibold tracking-wide whitespace-nowrap
                ${idx > i + 1 ? "text-[#067d62]" : idx === i + 1 ? "text-[#e77600]" : "text-[#adb1b8]"}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AI scan full-screen overlay ────────────────────────────────────────────
function AiScanOverlay({ subtitle, steps }) {
  return (
    <div className="fixed inset-0 bg-[#0f1923]/97 z-50 flex flex-col items-center justify-center p-6 animate-fade-in">
      <div className="relative w-28 h-28 mb-8">
        <div className="absolute inset-0 border-[5px] border-[#00e5a0]/20 rounded-full" />
        <div className="absolute inset-0 border-[5px] border-[#00e5a0] rounded-full border-t-transparent animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-12 h-12 text-[#00e5a0] animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
              d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        </div>
      </div>
      <h2 className="text-[28px] font-extrabold text-white mb-2">
        Amazon <span className="text-[#00e5a0]">Circular Intelligence</span>
      </h2>
      <p className="text-[#8a9bb0] text-[15px] mb-10 text-center max-w-sm">{subtitle}</p>
      <div className="w-80 space-y-4 bg-white/5 rounded-2xl p-6 border border-white/10">
        {steps.map((s, i) => (
          <div key={i} className={`flex items-center gap-4 ${i > 0 ? "opacity-45" : ""}`}>
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${i === 0 ? "bg-[#00e5a0] animate-ping shadow-[0_0_10px_#00e5a0]" : "bg-[#3a4553]"}`} />
            <span className={`text-[14px] ${i === 0 ? "text-white font-semibold" : "text-[#6c7480]"}`}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function SellItem() {
  const navigate    = useNavigate();
  const { currentUser } = useUser();

  // ── Global page state ──
  const [path, setPath]  = useState(null);   // "amazon" | "non_amazon"
  const [step, setStep]  = useState("path"); // see STEPS map

  // ── Amazon path state ──
  const [orders,        setOrders]        = useState([]);
  const [products,      setProducts]      = useState({});
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // ── Non-Amazon path state ──
  const [invoiceFile,    setInvoiceFile]    = useState(null);
  const [invoiceResult,  setInvoiceResult]  = useState(null);
  const [verifyingInv,   setVerifyingInv]   = useState(false);
  const [invoiceError,   setInvoiceError]   = useState(null);
  const [invoiceDragActive, setInvoiceDragActive] = useState(false);
  const invoiceRef = useRef(null);

  // ── Shared details form ──
  const [form, setForm] = useState({
    title: "", category: "Electronics", brand: "", condition: "good",
    asking_price: "", description: "",
    city: currentUser?.city || "", pincode: currentUser?.pincode || "",
    allows_local_pickup: false,
  });
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [suggesting,   setSuggesting]   = useState(false);

  // ── Photo state ──
  const [capturedPhotos, setCapturedPhotos] = useState(null); // { front: File, back: File }
  const [imageFile,     setImageFile]     = useState(null);  // front file used for AI check
  const [photoVerified, setPhotoVerified] = useState(null);
  const [photoError,    setPhotoError]    = useState(null);
  const [verifyingPhoto,setVerifyingPhoto] = useState(false);
  const [showCamera,    setShowCamera]    = useState(false);
  const photoRef = useRef(null);

  // ── Submit state ──
  const [submitting, setSubmitting] = useState(false);
  const [result,     setResult]     = useState(null); // listing after success

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // ── Redirect if not logged in ──
  useEffect(() => {
    if (!currentUser) navigate("/", { replace: true });
  }, [currentUser, navigate]);

  // ── Load orders when amazon path chosen ──
  useEffect(() => {
    if (path !== "amazon" || orders.length > 0) return;
    setLoadingOrders(true);
    getOrders(currentUser.id)
      .then(async (ords) => {
        const eligible = ords.filter(o => o.status !== "returned");
        setOrders(eligible);
        const prods = {};
        await Promise.all(eligible.map(async o => {
          try { prods[o.product_id] = await getProduct(o.product_id); } catch {}
        }));
        setProducts(prods);
      })
      .catch(console.error)
      .finally(() => setLoadingOrders(false));
  }, [path]);

  // ── Scroll to top on step change ──
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  // ── Derived ──
  const prod = selectedOrder ? products[selectedOrder.product_id] : null;

  // ── Navigation helpers ──
  const go = (s) => setStep(s);
  const back = () => {
    const chain = path ? STEPS[path] : ["path"];
    const idx = chain.indexOf(step);
    if (idx <= 1) { setPath(null); setStep("path"); }
    else go(chain[idx - 1]);
  };

  const chooseAmazonOrder = (order) => {
    setSelectedOrder(order);
    const p = products[order.product_id];
    if (p) {
      setF("title",    p.name);
      setF("category", p.category.charAt(0).toUpperCase() + p.category.slice(1));
      setF("brand",    p.brand || "");
    }
    go("photo");
  };

  // ── Invoice upload handler ──
  const handleInvoiceUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processInvoiceFile(file);
    e.target.value = "";
  };

  const processInvoiceFile = async (file) => {
    setVerifyingInv(true);
    setInvoiceError(null);
    setInvoiceResult(null);
    setInvoiceFile(null);
    try {
      // Pass asking_price so the backend can cross-validate price vs invoice total.
      // We also pass imageFile as the product photo for serial cross-check if available.
      const askingPrice = parseFloat(form.asking_price) || 0;
      const res = await verifyInvoice(
        file,
        form.title,
        form.category,
        form.brand,
        askingPrice,
        imageFile || null   // product photo for serial/IMEI cross-check if already uploaded
      );
      // Always store the full result — we surface warnings even when verified=true
      setInvoiceResult(res);
      if (!res.verified) {
        setInvoiceError(
          res.confidence_gate_reason || res.mismatch_reason || "Invoice could not be verified."
        );
      } else {
        setInvoiceFile(file);
        if (!form.title && res.product_name) setF("title", res.product_name);
      }
    } catch(err) { setInvoiceError(err.message); }
    finally { setVerifyingInv(false); }
  };

  // ── AI price suggestion — grounded in invoice total (non-Amazon) or product price (Amazon) ──
  const handleSuggestPrice = async () => {
    setSuggesting(true);
    try {
      // For non-Amazon: invoice_total_numeric is the verified purchase price — use it as anchor.
      // For Amazon: prod.price is the original retail price.
      // We never fall back to a pure prediction without a known price anchor.
      const knownPrice =
        path === "non_amazon" && invoiceResult?.invoice_total_numeric
          ? invoiceResult.invoice_total_numeric
          : prod?.price || null;

      if (!knownPrice) {
        // No price anchor available — don't call the API, tell the user why.
        setAiSuggestion({ _no_anchor: true });
        setSuggesting(false);
        return;
      }

      const res = await suggestPrice({
        category:      form.category,
        brand:         form.brand || prod?.brand || null,
        condition:     form.condition,
        description:   form.description || null,
        original_price: knownPrice,
      });
      // Attach the anchor so we can explain the suggestion in the UI
      res._anchor_price  = knownPrice;
      res._anchor_source = path === "non_amazon" ? "invoice" : "amazon_order";
      setAiSuggestion(res);
      if (!form.asking_price) setF("asking_price", String(Math.round(res.suggested_price)));
    } catch(e) { console.error(e); }
    finally { setSuggesting(false); }
  };

  // ── Camera capture handler — receives { front, back } from ProductCameraCapture ──
  const handleCameraCapture = async ({ front, back }) => {
    setShowCamera(false);
    setCapturedPhotos({ front, back });
    setImageFile(front); // front is used for AI verification
    setPhotoError(null);
    setPhotoVerified(null);
    await processPhotoFile(front);
  };

  // ── Photo handler ──
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processPhotoFile(file);
    e.target.value = "";
  };

  const processPhotoFile = async (file) => {
    setVerifyingPhoto(true);
    setPhotoError(null); setPhotoVerified(null); setImageFile(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("category", form.category);
      fd.append("title", form.title || prod?.name || "");
      fd.append("brand", form.brand || prod?.brand || "");
      const res = await fetch(`${getApiBaseUrl()}/community/verify-image`, { method: "POST", body: fd });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Photo rejected"); }
      const data = await res.json();
      setPhotoVerified(data.condition_summary || "Verified.");
      if (data.condition) {
        setF("condition", data.condition);
        setF("condition_locked", true);
      }
      setImageFile(file);
    } catch(err) { setPhotoError(err.message); }
    finally { setVerifyingPhoto(false); }
  };

  // ── Final submit ──
  const handleSubmit = async () => {
    if (!imageFile) return;
    setSubmitting(true);
    try {
      const payload = {
        seller_id:    currentUser.id,
        title:        form.title || prod?.name,
        description:  form.description || null,
        category:     form.category,
        brand:        form.brand || prod?.brand || null,
        asking_price: parseFloat(form.asking_price),
        condition:    form.condition,
        city:         form.city || currentUser.city || null,
        pincode:      form.pincode || currentUser.pincode || null,
        allows_local_pickup: form.allows_local_pickup,
        purchase_source: path,
        ...(path === "amazon"
          ? { amazon_order_id: selectedOrder?.id, invoice_verified: true }
          : {
              invoice_image_url:    invoiceResult?.s3_key || null,
              invoice_verified:     true,
              invoice_product_name: invoiceResult?.product_name || null,
              invoice_store:        invoiceResult?.store || null,
              invoice_date:         invoiceResult?.purchase_date || null,
            }
        ),
      };
      const listing = await createCommunityListing(payload);
      if (listing?.id) {
        const fd = new FormData();
        fd.append("image", imageFile);
        await fetch(`${getApiBaseUrl()}/community/listings/${listing.id}/image`, { method: "POST", body: fd });
      }
      setResult(listing);
      go("done");
    } catch(err) { alert("Error: " + err.message); }
    finally { setSubmitting(false); }
  };

  // ════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════
  return (
    <div className="bg-[#f0f2f2] min-h-screen">

      {/* ── Sticky top bar ── */}
      <div className="sticky top-0 z-30 bg-[#0f1923] shadow-lg">
        <div className="max-w-[640px] mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={step === "path" ? () => navigate("/feed") : back}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 transition-colors text-white/80 hover:text-white"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1">
            <p className="text-white font-bold text-[16px] leading-tight">
              {step === "path"    && "Sell a Product"}
              {step === "pick"    && "Choose your order"}
              {step === "invoice" && "Verify your purchase"}
              {step === "details" && "Pricing & details"}
              {step === "photo"   && "Product photo"}
              {step === "done"    && "Listing live!"}
            </p>
            <p className="text-[#8a9bb0] text-[11px]">
              {step === "done" ? "Your item is now on the marketplace" : "Earn +5 Green Credits for posting"}
            </p>
          </div>
          {step !== "path" && step !== "done" && (
            <span className="text-[11px] text-[#8a9bb0] font-medium">
              {path === "amazon" ? "🛒 Amazon" : "🏪 Invoice"}
            </span>
          )}
        </div>

        {/* Progress bar — hidden on path selector and done screen */}
        {step !== "path" && step !== "done" && path && (
          <ProgressBar path={path} step={step} />
        )}
      </div>

      {/* ── Page body ── */}
      <div className="max-w-[640px] mx-auto">

        {/* ══ STEP: PATH SELECTOR ══════════════════════════════════════ */}
        {step === "path" && (
          <div className="p-4 space-y-4 animate-fade-in">
            <div className="bg-white rounded-2xl p-5 border border-[#d5d9d9] shadow-sm">
              <p className="text-[15px] font-bold text-[#0f1111] mb-1">Where did you buy this product?</p>
              <p className="text-[13px] text-[#6c7480] mb-5">
                This determines how your listing is verified and what trust badge buyers see.
              </p>

              {/* Amazon card */}
              <button
                onClick={() => { setPath("amazon"); go("pick"); }}
                className="w-full flex items-start gap-4 p-4 border-2 border-[#e77600]/30 rounded-2xl hover:border-[#e77600] hover:bg-[#fff8ef] active:scale-[0.99] transition-all mb-3 text-left group"
              >
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#fff8ef] to-[#ffe9c7] border border-[#e77600]/20 flex items-center justify-center flex-shrink-0 text-[28px] group-hover:scale-105 transition-transform">
                  🛒
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-[15px] font-bold text-[#0f1111]">Bought on Amazon</p>
                    <span className="text-[10px] font-bold bg-[#e77600] text-white px-2 py-0.5 rounded-full">Fastest</span>
                  </div>
                  <p className="text-[12px] text-[#6c7480] mb-2">Pick directly from your order history — zero form filling, auto-filled</p>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle size={12} className="text-[#067d62]" />
                    <span className="text-[11px] font-bold text-[#067d62]">Amazon Verified Purchase badge</span>
                  </div>
                </div>
              </button>

              {/* Non-Amazon card */}
              <button
                onClick={() => { setPath("non_amazon"); go("invoice"); }}
                className="w-full flex items-start gap-4 p-4 border-2 border-[#d5d9d9] rounded-2xl hover:border-[#1a73e8] hover:bg-[#f0f6ff] active:scale-[0.99] transition-all text-left group"
              >
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#f0f6ff] to-[#dde8fd] border border-[#1a73e8]/20 flex items-center justify-center flex-shrink-0 text-[28px] group-hover:scale-105 transition-transform">
                  🏪
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-[15px] font-bold text-[#0f1111]">Bought elsewhere</p>
                    <span className="text-[10px] font-bold bg-[#1a73e8] text-white px-2 py-0.5 rounded-full">Invoice Required</span>
                  </div>
                  <p className="text-[12px] text-[#6c7480] mb-2">Upload your purchase bill — Nova Pro AI verifies ownership</p>
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck size={12} className="text-[#1a73e8]" />
                    <span className="text-[11px] font-bold text-[#1a73e8]">Invoice Verified badge</span>
                  </div>
                </div>
              </button>
            </div>

            <p className="text-[11px] text-[#6c7480] text-center">
              Both paths include AI product photo verification before your listing goes live.
            </p>
          </div>
        )}

        {/* ══ STEP: PICK ORDER (Amazon) ════════════════════════════════ */}
        {step === "pick" && (
          <div className="animate-fade-in">
            {loadingOrders ? (
              <div className="p-6 space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-white rounded-xl h-20 animate-pulse border border-[#d5d9d9]" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="p-10 text-center">
                <span className="text-[56px] block mb-3">📦</span>
                <p className="text-[16px] font-bold text-[#0f1111] mb-1">No eligible orders</p>
                <p className="text-[13px] text-[#6c7480] mb-5">Returned orders are excluded.</p>
                <Link to="/" className="text-[13px] text-amazon-link hover:underline">Browse products →</Link>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                <p className="text-[13px] text-[#6c7480] px-1 mb-3">Tap the order you want to list for sale</p>
                {orders.map(order => {
                  const p = products[order.product_id];
                  return (
                    <button
                      key={order.id}
                      onClick={() => chooseAmazonOrder(order)}
                      className="w-full bg-white rounded-xl border border-[#d5d9d9] hover:border-[#e77600] hover:shadow-md active:scale-[0.99] transition-all p-4 flex items-center gap-4 text-left group"
                    >
                      <div className="w-16 h-16 flex-shrink-0 border border-[#d5d9d9] rounded-xl bg-white flex items-center justify-center overflow-hidden">
                        {p?.image_url
                          ? <img src={p.image_url} alt="" className="max-h-full max-w-full object-contain p-1" />
                          : <Package size={24} className="text-[#adb1b8]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold text-[#0f1111] line-clamp-1">{p?.name || `Order #${order.id}`}</p>
                        <p className="text-[12px] text-[#6c7480] mt-0.5">{p?.brand}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[11px] font-bold text-[#0f1111]">
                            ₹{p ? Math.floor(p.price).toLocaleString("en-IN") : "—"}
                          </span>
                          <span className="text-[10px] bg-[#f0f9f4] text-[#067d62] font-bold px-1.5 py-0.5 rounded">
                            Order #{order.id}
                          </span>
                          <span className="text-[10px] text-[#6c7480] capitalize">{order.status}</span>
                        </div>
                      </div>
                      <ChevronLeft size={18} className="text-[#adb1b8] rotate-180 flex-shrink-0 group-hover:text-[#e77600]" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ STEP: INVOICE (Non-Amazon) ══════════════════════════════ */}
        {step === "invoice" && (
          <div className="p-4 space-y-4 animate-fade-in">

            {/* Product basics first */}
            <div className="bg-white rounded-2xl border border-[#d5d9d9] p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <button onClick={back} className="flex items-center gap-1 text-[12px] text-amazon-link hover:underline font-medium">
                  <ChevronLeft size={14} /> Back to source selection
                </button>
              </div>
              <p className="text-[14px] font-bold text-[#0f1111]">What are you selling?</p>
              <div>
                <label className={LABEL}>Product Title *</label>
                <input value={form.title} onChange={e => setF("title", e.target.value)}
                  placeholder="e.g. Sony WH-1000XM5 Headphones"
                  className={INPUT} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Category *</label>
                  <select value={form.category} onChange={e => setF("category", e.target.value)} className={INPUT}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Brand</label>
                  <input value={form.brand} onChange={e => setF("brand", e.target.value)}
                    placeholder="Sony, Apple…" className={INPUT} />
                </div>
              </div>
            </div>

            {/* Invoice upload */}
            <div className="bg-white rounded-2xl border border-[#d5d9d9] p-5 space-y-3">
              <div>
                <p className="text-[14px] font-bold text-[#0f1111]">Upload your purchase invoice</p>
                <p className="text-[12px] text-[#6c7480] mt-0.5">Required to verify ownership. Nova Pro AI reads and validates it.</p>
              </div>

              <input ref={invoiceRef} type="file" accept="image/jpeg, image/png, image/webp, application/pdf" onChange={handleInvoiceUpload} className="hidden" />
              {/* Drop zone */}
              <div
                onClick={() => invoiceRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setInvoiceDragActive(true); }}
                onDragEnter={(e) => { e.preventDefault(); setInvoiceDragActive(true); }}
                onDragLeave={() => setInvoiceDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setInvoiceDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) processInvoiceFile(file);
                }}
                className={`w-full border-2 border-dashed rounded-xl cursor-pointer transition-all select-none
                  ${invoiceDragActive
                    ? "border-[#1a73e8] bg-[#e8f0fe] scale-[1.01]"
                    : invoiceResult
                      ? "border-[#1a73e8] bg-[#f0f6ff]"
                      : "border-[#c8cdd3] hover:border-[#1a73e8] hover:bg-[#f0f6ff]"}`}
              >
                {invoiceResult ? (
                  <div className="flex flex-col items-center gap-2 py-5 px-4">
                    <span className="text-[30px]">📄✅</span>
                    <p className="text-[13px] font-semibold text-[#0f1111]">Invoice verified — tap or drop to replace</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-7 px-4">
                    <span className="text-[32px]">{invoiceDragActive ? "📥" : "📄"}</span>
                    <p className="text-[13px] font-semibold text-[#0f1111]">
                      {invoiceDragActive ? "Drop your invoice here" : "Tap to upload invoice / bill"}
                    </p>
                    <p className="text-[11px] text-[#6c7480]">
                      {invoiceDragActive ? "" : "Or drag and drop · "}Receipt · Invoice · Warranty card · JPEG / PNG / WebP
                    </p>
                  </div>
                )}
              </div>

              {verifyingInv && (
                <div className="flex items-center gap-3 bg-[#f0f6ff] border border-[#1a73e8]/20 rounded-xl px-4 py-3">
                  <svg className="w-5 h-5 animate-spin text-[#1a73e8] flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  <p className="text-[13px] text-[#1a73e8] font-medium">Nova Pro reading your invoice…</p>
                </div>
              )}

              {invoiceError && (
                <div className="flex items-start gap-3 bg-[#fff3cd] border border-[#c45500]/25 rounded-xl p-4">
                  <AlertTriangle size={18} className="text-[#c45500] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-bold text-[#c45500]">Invoice Not Accepted</p>
                    <p className="text-[12px] text-[#8a6d3b] mt-0.5">{invoiceError}</p>
                    <p className="text-[11px] text-[#adb1b8] mt-1">Make sure the invoice is clearly readable and matches the product above.</p>
                  </div>
                </div>
              )}

              {invoiceResult && (
                <div className="space-y-2">
                  {/* ── Extracted data card ── */}
                  <div className="border border-[#1a73e8]/25 rounded-xl overflow-hidden">
                    <div className="bg-[#e8f0fe] px-4 py-2.5 flex items-center gap-2">
                      <ShieldCheck size={16} className="text-[#1a73e8]" />
                      <p className="text-[13px] font-bold text-[#1a73e8] flex-1">
                        {invoiceResult.verified ? "Invoice Verified by Nova Pro" : "Invoice Read — Not Verified"}
                      </p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                        ${invoiceResult.match_confidence === "high"   ? "bg-[#067d62] text-white"
                        : invoiceResult.match_confidence === "medium" ? "bg-[#e77600] text-white"
                        : "bg-[#c45500] text-white"}`}>
                        {invoiceResult.match_confidence} confidence
                      </span>
                    </div>
                    <div className="bg-white px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
                      {invoiceResult.product_name  && <><span className="text-[#6c7480]">Product</span><span className="font-semibold text-[#0f1111] truncate col-span-1">{invoiceResult.product_name}</span></>}
                      {invoiceResult.store         && <><span className="text-[#6c7480]">Store</span><span className="font-semibold text-[#0f1111]">{invoiceResult.store}</span></>}
                      {invoiceResult.purchase_date && <><span className="text-[#6c7480]">Date</span><span className="font-semibold text-[#0f1111]">{invoiceResult.purchase_date}</span></>}
                      {invoiceResult.invoice_total && <><span className="text-[#6c7480]">Amount</span><span className="font-semibold text-[#0f1111]">{invoiceResult.invoice_total}</span></>}
                      {invoiceResult.serial_number && <><span className="text-[#6c7480]">Serial</span><span className="font-semibold text-[#0f1111] truncate font-mono text-[11px]">{invoiceResult.serial_number}</span></>}
                      {invoiceResult.imei          && <><span className="text-[#6c7480]">IMEI</span><span className="font-semibold text-[#0f1111] font-mono text-[11px]">{invoiceResult.imei}</span></>}
                    </div>
                  </div>

                  {/* ── Medium-confidence warning ── */}
                  {invoiceResult.verified && invoiceResult.match_confidence === "medium" && invoiceResult.confidence_gate_reason && (
                    <div className="flex items-start gap-2.5 bg-[#fff8ef] border border-[#e77600]/30 rounded-xl p-3.5">
                      <AlertTriangle size={15} className="text-[#e77600] flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[12px] font-bold text-[#c45500]">Partial verification</p>
                        <p className="text-[11px] text-[#8a6d3b] mt-0.5">{invoiceResult.confidence_gate_reason}</p>
                      </div>
                    </div>
                  )}

                  {/* ── Price flag warning ── */}
                  {invoiceResult.price_flag && invoiceResult.price_flag_severity !== "none" && (
                    <div className={`flex items-start gap-2.5 rounded-xl p-3.5 border
                      ${invoiceResult.price_flag_severity === "block"
                        ? "bg-[#fdecea] border-[#c45500]/30"
                        : "bg-[#fff8ef] border-[#e77600]/30"}`}>
                      <AlertTriangle size={15} className={`flex-shrink-0 mt-0.5 ${invoiceResult.price_flag_severity === "block" ? "text-[#c45500]" : "text-[#e77600]"}`} />
                      <div>
                        <p className={`text-[12px] font-bold ${invoiceResult.price_flag_severity === "block" ? "text-[#c45500]" : "text-[#c45500]"}`}>
                          {invoiceResult.price_flag_severity === "block" ? "Price not permitted" : "Price note"}
                        </p>
                        <p className="text-[11px] text-[#8a6d3b] mt-0.5">{invoiceResult.price_flag_reason}</p>
                      </div>
                    </div>
                  )}

                  {/* ── Serial cross-check result ── */}
                  {invoiceResult.serial_cross_checked && (
                    <div className={`flex items-start gap-2.5 rounded-xl p-3.5 border
                      ${invoiceResult.serial_match
                        ? "bg-[#f0f9f4] border-[#067d62]/25"
                        : "bg-[#fff8ef] border-[#e77600]/30"}`}>
                      <span className="text-[15px] flex-shrink-0">{invoiceResult.serial_match ? "🔗" : "⚠️"}</span>
                      <div>
                        <p className={`text-[12px] font-bold ${invoiceResult.serial_match ? "text-[#067d62]" : "text-[#c45500]"}`}>
                          {invoiceResult.serial_match
                            ? "Serial number confirmed in product photo"
                            : "Serial number not found in product photo"}
                        </p>
                        <p className="text-[11px] text-[#6c7480] mt-0.5">
                          {invoiceResult.serial_match
                            ? `Matched: ${invoiceResult.imei || invoiceResult.serial_number}`
                            : "Upload a photo showing the device label or box for a stronger verification."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              disabled={!invoiceResult?.verified || !form.title || invoiceResult?.price_flag_severity === "block"}
              onClick={() => go("photo")}
              className="w-full py-3.5 rounded-xl text-[15px] font-bold text-white bg-[#1a73e8] hover:bg-[#1558c0] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.99]">
              Next: Add Photo →
            </button>
          </div>
        )}

        {/* ══ STEP: DETAILS ═══════════════════════════════════════════ */}
        {step === "details" && (
          <div className="p-4 space-y-4 animate-fade-in">

            {/* Non-Amazon: show invoice summary + option to go back */}
            {path === "non_amazon" && invoiceResult && (
              <div className="bg-white rounded-2xl border border-[#d5d9d9] p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e8f0fe] flex items-center justify-center flex-shrink-0 text-[20px]">📄</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-[#0f1111] line-clamp-1">{invoiceResult.product_name || form.title}</p>
                  <p className="text-[11px] text-[#1a73e8] font-bold">
                    Invoice Verified · {invoiceResult.invoice_total || "—"}
                    {invoiceResult.invoice_total_numeric ? ` (₹${Math.floor(invoiceResult.invoice_total_numeric).toLocaleString("en-IN")})` : ""}
                  </p>
                </div>
                <button onClick={back} className="text-[11px] text-amazon-link hover:underline flex-shrink-0">
                  Edit invoice
                </button>
              </div>
            )}
            {/* Amazon: product summary card */}
            {path === "amazon" && prod && (
              <div className="bg-white rounded-2xl border border-[#d5d9d9] p-4 flex items-center gap-3">
                {prod.image_url && (
                  <img src={prod.image_url} alt="" className="w-16 h-16 object-contain border border-[#d5d9d9] rounded-xl p-1 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-[#0f1111] line-clamp-1">{prod.name}</p>
                  <p className="text-[12px] text-[#6c7480]">{prod.brand}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <CheckCircle size={12} className="text-[#067d62]" />
                    <span className="text-[11px] font-bold text-[#067d62]">Amazon Verified Purchase</span>
                  </div>
                </div>
              </div>
            )}

            {/* Condition */}
            <div className="bg-white rounded-2xl border border-[#d5d9d9] p-5 space-y-3 relative">
              <div className="flex items-center justify-between">
                <label className="text-[14px] font-bold text-[#0f1111] block">Condition *</label>
                {form.condition_locked && (
                  <span className="text-[11px] font-semibold text-[#067d62] bg-[#f0f9f4] px-2 py-0.5 rounded flex items-center gap-1">
                    <CheckCircle size={12} /> Auto-verified
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {CONDITIONS.map(c => (
                  <button key={c.value} type="button"
                    disabled={form.condition_locked && form.condition !== c.value}
                    onClick={() => !form.condition_locked && setF("condition", c.value)}
                    className={`p-3 rounded-xl border-2 text-left transition-all active:scale-[0.98]
                      ${form.condition === c.value
                        ? "border-[#e77600] bg-[#fff8ef]"
                        : "border-[#d5d9d9] hover:border-[#e77600]/50"}
                      ${form.condition_locked && form.condition !== c.value ? "opacity-40 cursor-not-allowed bg-gray-50" : ""}`}>
                    <p className="text-[13px] font-bold text-[#0f1111]">{c.label}</p>
                    <p className="text-[11px] text-[#6c7480] mt-0.5">{c.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Price */}
            <div className="bg-white rounded-2xl border border-[#d5d9d9] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[14px] font-bold text-[#0f1111]">Asking Price (₹) *</label>
                <button type="button" onClick={handleSuggestPrice} disabled={suggesting}
                  className="text-[12px] text-amazon-link hover:underline font-semibold disabled:opacity-50 flex items-center gap-1">
                  {suggesting
                    ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg> Getting AI price…</>
                    : "✨ AI Suggest"}
                </button>
              </div>
              <input type="number" min="1" value={form.asking_price}
                onChange={e => setF("asking_price", e.target.value)}
                placeholder="Enter your price in ₹" className={INPUT} />

              {/* No price anchor available */}
              {aiSuggestion?._no_anchor && (
                <div className="bg-[#fff8ef] border border-[#e77600]/30 rounded-xl p-3.5 text-[12px] text-[#8a6d3b]">
                  <p className="font-bold text-[#c45500] mb-0.5">Can't suggest a price yet</p>
                  {path === "non_amazon"
                    ? "Complete the invoice verification first — the AI uses your verified purchase price as the anchor."
                    : "Select your Amazon order first — the AI uses the original purchase price as the anchor."}
                </div>
              )}

              {/* Normal suggestion card */}
              {aiSuggestion && !aiSuggestion._no_anchor && (
                <div className="bg-[#f0fff8] border border-[#00a86b]/25 rounded-xl p-3.5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[13px] font-bold text-[#067d62]">
                      AI suggests ₹{Math.floor(aiSuggestion.suggested_price).toLocaleString("en-IN")}
                    </p>
                    <button onClick={() => setF("asking_price", String(Math.round(aiSuggestion.suggested_price)))}
                      className="text-[11px] font-bold text-[#067d62] border border-[#067d62]/30 rounded-lg px-2.5 py-1 hover:bg-[#e6f4ea] transition-colors">
                      Use this
                    </button>
                  </div>
                  {/* Anchor explanation */}
                  <p className="text-[10px] text-[#adb1b8] mb-1.5 flex items-center gap-1">
                    {aiSuggestion._anchor_source === "invoice"
                      ? <><span className="text-[#1a73e8] font-semibold">📄 Based on your verified invoice</span> — original price ₹{Math.floor(aiSuggestion._anchor_price).toLocaleString("en-IN")}</>
                      : <><span className="text-[#e77600] font-semibold">🛒 Based on Amazon purchase price</span> — original ₹{Math.floor(aiSuggestion._anchor_price).toLocaleString("en-IN")}</>}
                  </p>
                  <p className="text-[11px] text-[#6c7480]">{aiSuggestion.reasoning}</p>
                  <p className="text-[10px] text-[#adb1b8] mt-1">
                    Range: ₹{Math.floor(aiSuggestion.price_range_low).toLocaleString("en-IN")} – ₹{Math.floor(aiSuggestion.price_range_high).toLocaleString("en-IN")}
                    {aiSuggestion.depreciation_pct > 0 && ` · ${Math.round(aiSuggestion.depreciation_pct)}% depreciation`}
                  </p>
                </div>
              )}
            </div>

            {/* Description & Location */}
            <div className="bg-white rounded-2xl border border-[#d5d9d9] p-5 space-y-4">
              <div>
                <label className={LABEL}>Description <span className="font-normal text-[#adb1b8]">(optional)</span></label>
                <textarea rows={3} value={form.description}
                  onChange={e => setF("description", e.target.value)}
                  placeholder="Describe condition, what's included, reason for selling…"
                  className={`${INPUT} resize-none`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>City</label>
                  <input value={form.city} onChange={e => setF("city", e.target.value)}
                    placeholder="Mumbai" className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Pincode</label>
                  <input value={form.pincode} onChange={e => setF("pincode", e.target.value)}
                    placeholder="400001" className={INPUT} />
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-xl border border-[#d5d9d9] hover:bg-[#fafafa] transition-colors">
                <input type="checkbox" checked={form.allows_local_pickup}
                  onChange={e => setF("allows_local_pickup", e.target.checked)}
                  className="w-4 h-4 accent-[#e77600] flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-[#0f1111]">Allow Local Pickup</p>
                  <p className="text-[11px] text-[#6c7480]">Buyer & seller both earn +15 bonus Green Credits</p>
                </div>
              </label>
            </div>

            <button
              disabled={!form.asking_price || !form.condition || submitting}
              onClick={handleSubmit}
              className="w-full py-3.5 rounded-xl text-[15px] font-bold text-white bg-[#067d62] hover:bg-[#055d49] disabled:opacity-40 transition-all active:scale-[0.99]">
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Publishing your listing…
                </span>
              ) : "Publish Listing & Earn +5 Credits 🌱"}
            </button>
          </div>
        )}

        {/* ══ STEP: PHOTO ═════════════════════════════════════════════ */}
        {step === "photo" && (
          <div className="p-4 space-y-4 animate-fade-in">

            <div className="bg-white rounded-2xl border border-[#d5d9d9] p-5 space-y-4">
              <div>
                <p className="text-[14px] font-bold text-[#0f1111]">Capture product photos</p>
                <p className="text-[12px] text-[#6c7480] mt-0.5">
                  {path === "amazon"
                    ? "2 guided shots — AI verifies the product matches your Amazon order."
                    : "2 guided shots — AI cross-checks these photos against your invoice."}
                </p>
              </div>

              {/* ── Camera CTA / captured state ── */}
              {capturedPhotos ? (
                /* Both shots captured — show thumbnails + retake */
                <div className="border border-[#067d62]/30 rounded-2xl bg-[#f2fbf7] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[#067d62]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <p className="text-[13px] font-bold text-[#067d62]">Both photos captured</p>
                  </div>
                  <div className="flex gap-3">
                    {[
                      { label: "Front", file: capturedPhotos.front },
                      { label: "Back",  file: capturedPhotos.back },
                    ].map(({ label, file }) => (
                      <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={label}
                          className="w-full aspect-square object-cover rounded-xl border border-[#067d62]/20 shadow-sm"
                        />
                        <span className="text-[11px] font-semibold text-[#067d62]">{label}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setCapturedPhotos(null); setImageFile(null); setPhotoVerified(null); setPhotoError(null); }}
                    className="w-full text-[12px] font-semibold text-[#6c7480] hover:text-[#c45500] transition-colors py-1"
                  >
                    Retake photos
                  </button>
                </div>
              ) : (
                /* Open guided camera */
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="w-full border-2 border-dashed border-[#c8cdd3] hover:border-[#e77600] hover:bg-[#fff8ef] rounded-2xl py-8 flex flex-col items-center gap-3 transition-all active:scale-[0.99]"
                >
                  <div className="w-16 h-16 rounded-full bg-[#0f1923] flex items-center justify-center shadow-lg">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-[15px] font-bold text-[#0f1111]">Open Guided Camera</p>
                    <p className="text-[12px] text-[#6c7480] mt-0.5">Front &amp; back — frame guide with auto-detect</p>
                    <p className="text-[11px] text-[#adb1b8] mt-1">Works on mobile &amp; desktop · Green = perfect position</p>
                  </div>
                </button>
              )}

              {/* ── AI verification feedback ── */}
              {verifyingPhoto && (
                <div className="flex items-center gap-3 bg-[#f0f6ff] border border-[#1a73e8]/20 rounded-xl px-4 py-3">
                  <svg className="w-5 h-5 animate-spin text-[#1a73e8] flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  <p className="text-[13px] text-[#1a73e8] font-medium">AI verifying your product photo…</p>
                </div>
              )}

              {photoError && !verifyingPhoto && (
                <div className="flex items-start gap-3 bg-[#fff3cd] border border-[#c45500]/25 rounded-xl p-4">
                  <AlertTriangle size={18} className="text-[#c45500] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-bold text-[#c45500]">Photo Verification Failed</p>
                    <p className="text-[12px] text-[#8a6d3b] mt-0.5">{photoError}</p>
                    <button
                      type="button"
                      onClick={() => { setCapturedPhotos(null); setImageFile(null); setPhotoVerified(null); setPhotoError(null); setShowCamera(true); }}
                      className="mt-2 text-[12px] font-bold text-[#1a73e8] hover:underline"
                    >
                      Retake photos
                    </button>
                  </div>
                </div>
              )}

              {photoVerified && !verifyingPhoto && (
                <div className="flex items-start gap-3 bg-[#f0f9f4] border border-[#067d62]/25 rounded-xl p-4">
                  <CheckCircle size={18} className="text-[#067d62] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-bold text-[#067d62]">Product Qualified for Resale!</p>
                    <p className="text-[12px] text-[#0f1111] mt-0.5">{photoVerified}</p>
                  </div>
                </div>
              )}

              <div className={`rounded-xl p-3.5 text-[12px] ${path === "amazon" ? "bg-[#f0f6ff] text-[#1a73e8]" : "bg-[#fff3cd] text-[#8a6d3b]"}`}>
                {path === "amazon"
                  ? <><b>Amazon Verified listing</b> — order history is attached automatically. Buyers see the original purchase date and price.</>
                  : <><b>Invoice Verified listing</b> — buyers see your verified invoice details and an "Invoice Verified" trust badge.</>}
              </div>
            </div>

            <button
              disabled={!imageFile || !photoVerified || verifyingPhoto}
              onClick={() => go("details")}
              className="w-full py-3.5 rounded-xl text-[15px] font-bold text-white bg-[#067d62] hover:bg-[#055d49] disabled:opacity-40 transition-all active:scale-[0.99]">
              Next: Set Price & Publish →
            </button>
          </div>
        )}

        {/* Guided camera — full-screen overlay */}
        {showCamera && (
          <ProductCameraCapture
            title={path === "amazon" ? "Capture Product Photos" : "Capture Product Photos"}
            onCapture={handleCameraCapture}
            onClose={() => setShowCamera(false)}
          />
        )}

        {/* ══ STEP: DONE ══════════════════════════════════════════════ */}
        {step === "done" && (
          <div className="p-4 animate-fade-in">
            <div className="bg-white rounded-2xl border border-[#d5d9d9] overflow-hidden">
              {/* Green success header */}
              <div className="bg-gradient-to-br from-[#067d62] to-[#00a86b] px-6 py-10 flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mb-4">
                  <CheckCircle size={44} className="text-white" />
                </div>
                <h2 className="text-[24px] font-extrabold text-white mb-1">Listing is live!</h2>
                <p className="text-white/80 text-[14px] max-w-xs">
                  Your item is now visible on the Community Marketplace.
                  Buyers near you will be notified.
                </p>
              </div>

              {/* Credits earned */}
              <div className="border-t border-[#d5d9d9] px-6 py-5 flex items-center justify-between bg-[#f0f9f4]">
                <div>
                  <p className="text-[13px] text-[#6c7480]">Green Credits earned</p>
                  <p className="text-[28px] font-extrabold text-[#067d62]">+5</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] text-[#6c7480]">Trust badge</p>
                  <p className="text-[13px] font-bold mt-0.5">
                    {path === "amazon"
                      ? <span className="text-[#e77600]">🛒 Amazon Verified</span>
                      : <span className="text-[#1a73e8]">🛡 Invoice Verified</span>}
                  </p>
                </div>
              </div>

              {/* What happens next */}
              <div className="px-6 py-5 space-y-3 border-t border-[#d5d9d9]">
                <p className="text-[13px] font-bold text-[#0f1111]">What happens next</p>
                {[
                  ["🔔", "Nearby buyers are notified instantly"],
                  ["💰", "You earn +25 Green Credits when it sells"],
                  ["🚶", path === "amazon" ? "Enable local pickup for +15 bonus credits" : "Local pickup earns both parties +15 credits"],
                ].map(([icon, text]) => (
                  <div key={text} className="flex items-start gap-3">
                    <span className="text-[18px] flex-shrink-0">{icon}</span>
                    <p className="text-[13px] text-[#6c7480]">{text}</p>
                  </div>
                ))}
              </div>

              {/* CTAs */}
              <div className="px-6 pb-6 pt-2 flex flex-col gap-3">
                <Link
                  to="/feed"
                  className="w-full py-3.5 rounded-xl text-[15px] font-bold text-white bg-[#e77600] hover:bg-[#d56e0c] transition-colors text-center active:scale-[0.99] block"
                >
                  View on Marketplace →
                </Link>
                <Link
                  to="/feed"
                  onClick={() => { setPath(null); setStep("path"); setResult(null); setImageFile(null); setPhotoVerified(null); setInvoiceResult(null); setSelectedOrder(null); }}
                  className="w-full py-3 rounded-xl text-[14px] font-semibold text-[#0f1111] bg-[#f0f2f2] hover:bg-[#e3e6e6] transition-colors text-center active:scale-[0.99] block"
                >
                  Sell another item
                </Link>
              </div>
            </div>
          </div>
        )}

      </div>{/* /max-w body */}
    </div>
  );
}
