import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { getProduct, getAlternatives, createOrder, getProductConfidence, getProductImpact, getRefurbishedAlt, getSustainabilityAdvice, getDeliveryOptions, addToWishlist } from "../api/client";
import { useUser } from "../context/UserContext";
import TryOnModal from "../components/TryOnModal";

// ── Garment body-placement detection ────────────────────────────────────
const LOWER_BODY_KW = ["pant","pants","trouser","trousers","jeans","denim","shorts","leggings","skirt","chinos","jogger","joggers","cargo","capri","palazzos","culottes","sweatpants","trackpants","bottoms"];
const FULL_BODY_KW  = ["dress","jumpsuit","romper","dungaree","dungarees","overalls","gown","saree","kurta","kurti"];
function isTryOnUnsupported(product) {
  const t = `${product?.name ?? ""} ${product?.category ?? ""} ${product?.description ?? ""}`.toLowerCase();
  return FULL_BODY_KW.some(k => t.includes(k)) || LOWER_BODY_KW.some(k => t.includes(k));
}

// Same formula as backend credit_engine.py
const PRODUCT_IMPACT_SCORES = {
  electronics: 2.5, running: 1.2, backpacking: 1.0,
  yoga: 0.8, fitness: 1.0, clothing: 1.0, sports: 0.9, other: 1.0,
};
function computePendingCredits(category) {
  const impact = PRODUCT_IMPACT_SCORES[(category || "").toLowerCase()] || 1.0;
  return Math.max(1, Math.round(20 * impact * 0.4));
}

function scoreColor(score) {
  if (score >= 7.5) return "#067d62";
  if (score >= 5.0) return "#c7511f";
  return "#b12704";
}

function ScoreRow({ label, score, sublabel, delay = 0 }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => { const t = setTimeout(() => setAnimated(score), delay); return () => clearTimeout(t); }, [score, delay]);
  const color = scoreColor(score);
  const badge = score >= 7.5 ? "Great" : score >= 5.0 ? "Moderate" : "Low";
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-[12px] mb-1">
        <span className="text-amazon-text-secondary font-medium">{label}</span>
        <div className="flex items-center gap-1.5">
          <span style={{ color }} className="font-bold text-[13px]">{score.toFixed(1)}<span className="text-[10px] text-amazon-text-secondary font-normal"> / 10</span></span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-sm text-white" style={{ backgroundColor: color }}>{badge}</span>
        </div>
      </div>
      <div className="h-[7px] bg-[#e8e8e8] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${(animated / 10) * 100}%`, backgroundColor: color }} />
      </div>
      {sublabel && <p className="text-[11px] text-amazon-text-secondary mt-1">{sublabel}</p>}
    </div>
  );
}

/* Clickable credit badge with attached info popup — mobile-safe */
function CreditInfoBadge({ label, color, title, reason }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const [popupStyle, setPopupStyle] = useState({});

  // Position the popup so it never clips outside the viewport on mobile
  const updatePosition = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const popupW = Math.min(256, vw - 24); // 240px capped, 12px side margins
    let left = rect.left;
    // Push left if it would overflow the right edge
    if (left + popupW > vw - 12) left = vw - popupW - 12;
    // Never go negative
    if (left < 12) left = 12;
    setPopupStyle({ position: "fixed", top: rect.bottom + 8, left, width: popupW });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <div className="relative inline-block mt-1" ref={ref}>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[12px] font-bold focus:outline-none"
        style={{ color }}
      >
        {label}
        <span className="text-[10px] font-normal opacity-60 border rounded-full px-1 ml-0.5" style={{ borderColor: color }}>
          ?
        </span>
      </button>

      {open && (
        <div
          className="z-[9999] bg-white rounded-xl shadow-xl border overflow-hidden"
          style={{ ...popupStyle, borderColor: color, animation: "fadeSlideDown 0.15s ease" }}
        >
          <style>{`@keyframes fadeSlideDown { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:translateY(0) } }`}</style>
          <div className="px-3 py-2 text-white text-[12px] font-bold" style={{ backgroundColor: color }}>
            {title}
          </div>
          <p className="px-3 py-2.5 text-[12px] text-[#333] leading-relaxed">{reason}</p>
          <button
            onClick={() => setOpen(false)}
            className="w-full text-center text-[11px] py-1.5 border-t text-[#888] hover:text-[#444] active:text-[#444] transition-colors"
            style={{ borderColor: "#e8e8e8" }}
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}


export default function ProductDetail() {
  const { id } = useParams();
  const { currentUser, refreshUser } = useUser();
  const [product, setProduct] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderResult, setOrderResult] = useState(null);
  const [ordering, setOrdering] = useState(false);
  const [returnFreqScore, setReturnFreqScore] = useState(null);
  const [returnLabel, setReturnLabel] = useState("");
  const [comfortScore, setComfortScore] = useState(null);
  const [comfortSublabel, setComfortSublabel] = useState("");
  const [refurbishedAlt, setRefurbishedAlt] = useState(null);
  const [impact, setImpact] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [deliveryOptions, setDeliveryOptions] = useState([]);
  const [selectedDelivery, setSelectedDelivery] = useState("standard");
  const [showTryOn, setShowTryOn] = useState(false);
  const [activeImg, setActiveImg] = useState(0);

  const ratingCount = useMemo(() => Math.floor(Math.random() * 500 + 100), [id]);
  const discountPct = useMemo(() => Math.floor(Math.random() * 20 + 5), [id]);

  useEffect(() => {
    setLoading(true); setOrderResult(null); setReturnFreqScore(null); setComfortScore(null); setActiveImg(0);
    Promise.all([getProduct(id), getAlternatives(id), getProductConfidence(id), getProductImpact(id), getRefurbishedAlt(id), getSustainabilityAdvice(id)])
      .then(([p, alts, conf, imp, refurb, adv]) => {
        setProduct(p); setAlternatives(alts);
        setReturnFreqScore(conf.return_frequency_score); setReturnLabel(conf.return_label);
        setImpact(imp); setRefurbishedAlt(refurb); setAdvice(adv);
        if (p) getDeliveryOptions(p.category).then(setDeliveryOptions).catch(() => { });
      })
      .catch(console.error).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!product || !currentUser) return;
    let pts = 0; const reasons = [];
    const userSizes = {};
    if (currentUser.sizes) currentUser.sizes.split(",").forEach(pair => { const [k, v] = pair.split(":"); if (k && v) userSizes[k.trim().toLowerCase()] = v.trim().toLowerCase(); });
    if (Object.values(userSizes).includes((product.size || "").toLowerCase())) { pts += 5; reasons.push("size fits you"); }
    if ((currentUser.brand_prefs || "").split(",").map(b => b.trim().toLowerCase()).includes(product.brand.toLowerCase())) { pts += 3; reasons.push("preferred brand"); }
    if ((!currentUser.budget_min || product.price >= currentUser.budget_min) && (!currentUser.budget_max || product.price <= currentUser.budget_max)) { pts += 2; reasons.push("within your budget"); }
    setComfortScore(Math.max(1, Math.min(10, pts)));
    setComfortSublabel(reasons.length === 0 ? "No matching profile signals" : "Matches: " + reasons.join(", "));
  }, [product, currentUser]);

  const handleOrder = async () => {
    if (!currentUser || !product) return;
    setOrdering(true);
    try {
      const result = await createOrder(currentUser.id, product.id, false, selectedDelivery);
      setOrderResult(result); refreshUser();
    } catch (err) { alert(err.message); }
    setOrdering(false);
  };

  const handleAddToWishlist = async () => {
    if (!currentUser || !product) return;
    try {
      await addToWishlist({
        user_id: currentUser.id,
        product_id: product.id,
        category: product.category,
        brand: product.brand,
        max_price: product.price,
        radius_km: 15,
      });
      alert(`📍 Added "${product.name}" to your NearDrop Wishlist!\nYou'll be notified when this becomes available nearby at a discount.`);
    } catch (err) { alert(err.message); }
  };

  if (loading) return <div className="max-w-[1500px] mx-auto px-4 py-4"><div className="bg-white p-8 animate-pulse"><div className="h-[400px] bg-[#f5f5f5]" /></div></div>;
  if (!product) return <div className="text-center py-16 text-amazon-text-secondary">Product not found.</div>;

  const scoresReady = returnFreqScore !== null && comfortScore !== null;
  const selectedDO = deliveryOptions.find(d => d.type === selectedDelivery);

  // Build ordered image list: primary + extras from comma-separated image_urls field
  const allImages = [
    product.image_url,
    ...(product.image_urls ? product.image_urls.split(",").filter(Boolean) : []),
  ].filter(Boolean);
  if (allImages.length === 0) allImages.push("https://via.placeholder.com/400");

  return (
    <div className="bg-white animate-fade-in">
      <div className="max-w-[1500px] mx-auto px-4 py-4">
        <div className="text-[12px] text-amazon-text-secondary mb-3 flex items-center gap-1">
          <Link to="/" className="text-amazon-link hover:text-amazon-link-hover hover:underline">Back to results</Link>
          <span>›</span><span className="capitalize">{product.category}</span><span>›</span><span>{product.brand}</span>
        </div>

        {/* Buy Circular Banner */}
        {refurbishedAlt?.available && (
          <Link to={`/listings/${refurbishedAlt.listing_id}`} className="block mb-4 border-2 border-[#067d62] rounded-lg p-4 bg-[#f0f9f4] hover:bg-[#e0f5ec] transition-colors">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="text-[28px]"></span>
                <div>
                  <p className="text-[14px] font-bold text-[#067d62]">Buy Certified Refurbished — Save ₹{refurbishedAlt.savings?.toLocaleString("en-IN")}</p>
                  <p className="text-[12px] text-amazon-text-secondary">
                    ✓ Save ₹{refurbishedAlt.savings?.toLocaleString("en-IN")} &nbsp;
                    ✓ Prevent {refurbishedAlt.ewaste_prevented} kg E-Waste &nbsp;
                    ✓ Save {refurbishedAlt.co2_saved} kg CO₂ &nbsp;
                    ✓ Earn {refurbishedAlt.green_credits_potential} Green Credits
                  </p>
                </div>
              </div>
              <span className="btn-amazon-primary text-[12px] px-4 py-1.5 flex-shrink-0">View Refurbished →</span>
            </div>
          </Link>
        )}

        <div className="grid md:grid-cols-[400px_1fr_300px] gap-6">
          {/* Image Gallery + Virtual Try-On */}
          <div className="self-start flex flex-col gap-3">

            {/* Main image with prev/next arrows when multiple images */}
            <div className="relative border border-amazon-border rounded p-4 flex items-center justify-center bg-white min-h-[320px] sm:min-h-[400px] group">
              <img
                key={allImages[activeImg]}
                src={allImages[activeImg]}
                alt={`${product.name} — view ${activeImg + 1}`}
                className="max-h-[320px] sm:max-h-[400px] max-w-full object-contain transition-opacity duration-200"
              />
              {allImages.length > 1 && (
                <>
                  <button
                    aria-label="Previous image"
                    onClick={() => setActiveImg(i => (i - 1 + allImages.length) % allImages.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 border border-amazon-border shadow-sm flex items-center justify-center text-amazon-text hover:bg-white active:bg-[#f0f2f2] transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    aria-label="Next image"
                    onClick={() => setActiveImg(i => (i + 1) % allImages.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 border border-amazon-border shadow-sm flex items-center justify-center text-amazon-text hover:bg-white active:bg-[#f0f2f2] transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {/* Image counter pill */}
                  <span className="absolute bottom-2 right-3 text-[11px] text-amazon-text-secondary bg-white/80 border border-amazon-border rounded-full px-2 py-0.5 font-medium">
                    {activeImg + 1} / {allImages.length}
                  </span>
                </>
              )}
            </div>

            {/* Thumbnail strip — only shown when there are 2+ images */}
            {allImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {allImages.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    aria-label={`View image ${i + 1}`}
                    className={`flex-shrink-0 w-[60px] h-[60px] sm:w-[72px] sm:h-[72px] rounded border-2 flex items-center justify-center bg-white p-1 transition-all ${
                      i === activeImg
                        ? "border-amazon-orange shadow-sm scale-[1.05]"
                        : "border-amazon-border hover:border-[#999] active:border-amazon-orange"
                    }`}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <img
                      src={url}
                      alt={`Thumbnail ${i + 1}`}
                      className="max-h-full max-w-full object-contain"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
            {["clothing", "fashion", "apparel", "shirts", "tops", "dresses", "running", "fitness", "sports", "shoes", "footwear"].some(c => (product.category || "").toLowerCase().includes(c)) && (
              isTryOnUnsupported(product) ? (
                <div style={{
                  textAlign: "center", padding: "10px 14px",
                  background: "#fef9ec", border: "1px solid #fcd34d",
                  borderRadius: "8px", fontSize: "12px", color: "#92400e",
                  lineHeight: 1.4,
                }}>
                  <span style={{ fontSize: "16px" }}>👕</span>&nbsp;
                  <strong>Virtual Try-On</strong> is available for shirts &amp; tops only.
                  <br /><span style={{ fontSize: "11px", color: "#b45309" }}>Coming soon for pants &amp; more!</span>
                </div>
              ) : (
                <button
                  onClick={() => setShowTryOn(true)}
                  className="btn-amazon-primary w-full py-2.5 rounded-lg font-bold text-[13px] shadow-md transition-all hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  ✨ Virtual Try-On
                </button>
              )
            )}
          </div>

          {/* Product Info */}
          <div>
            <h1 className="text-[24px] text-amazon-text leading-tight font-normal">{product.name}</h1>
            <p className="text-[14px] text-amazon-link mt-1">Visit the {product.brand} Store</p>
            <div className="flex items-center gap-2 mt-2 pb-3 border-b border-amazon-border">
              <span className="star-rating text-[16px]">★★★★☆</span>
              <span className="text-[14px] text-amazon-link">{ratingCount} ratings</span>
            </div>
            <div className="mt-3 pb-3 border-b border-amazon-border">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] text-amazon-red">-{discountPct}%</span>
                <span className="text-[28px] text-amazon-text"><span className="text-[13px] align-top relative top-[4px]">₹</span>{Math.floor(product.price).toLocaleString("en-IN")}</span>
              </div>
              <p className="text-[12px] text-amazon-text-secondary">M.R.P.: <span className="line-through">₹{Math.floor(product.price * (1 + discountPct/100)).toLocaleString("en-IN")}</span></p>
            </div>
            {product.size && <div className="mt-3 pb-3 border-b border-amazon-border"><p className="text-[14px] text-amazon-text"><b>Size:</b> {product.size}</p></div>}
            <div className="mt-3"><h3 className="text-[16px] font-bold text-amazon-text mb-2">About this item</h3><p className="text-[14px] text-amazon-text leading-relaxed">{product.description}</p></div>

            {/* AI Advisor Tip */}
            {advice && (
              <div className="mt-4 border border-[#d4edda] bg-[#f0f9f4] rounded-lg p-3">
                <p className="text-[13px] font-bold text-[#067d62] flex items-center gap-1">{advice.title} <span className="text-[10px] text-amazon-orange bg-[#fff3e0] px-1.5 rounded font-normal">AI</span></p>
                <p className="text-[12px] text-amazon-text mt-1">{advice.message}</p>
              </div>
            )}

            {/* Product Impact */}
            {impact && (
              <div className="mt-4 border border-amazon-border rounded-lg p-3">
                <p className="text-[13px] font-bold text-amazon-text mb-2">Environmental Footprint</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><p className="text-[18px] font-bold text-amazon-text">{impact.co2_footprint}</p><p className="text-[10px] text-amazon-text-secondary">kg CO₂</p></div>
                  <div><p className="text-[18px] font-bold text-amazon-text">{impact.ewaste_potential}</p><p className="text-[10px] text-amazon-text-secondary">kg E-Waste</p></div>
                  <div><p className="text-[18px] font-bold text-amazon-text">{impact.water_footprint}</p><p className="text-[10px] text-amazon-text-secondary">L Water</p></div>
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <span className="eco-badge">Circular Ready</span>
              <span className="text-[12px] text-amazon-text-secondary">This item participates in Amazon Green Credits</span>
            </div>
          </div>

          {/* Buy Box */}
          <div className="border border-amazon-border rounded-lg p-4 self-start bg-white">
            <p className="text-[28px] text-amazon-text mb-1"><span className="text-[13px] align-top relative top-[4px]">₹</span>{Math.floor(product.price).toLocaleString("en-IN")}</p>
            <p className="text-[14px] text-amazon-success font-bold mb-3">In stock</p>

            {/* Eco-Delivery Slider */}
            {deliveryOptions.length > 0 && (
              <div className="border border-amazon-border rounded-lg p-3 mb-3">
                <p className="text-[12px] font-bold text-amazon-text mb-2">🚚 Delivery Options</p>
                <div className="space-y-2">
                  {deliveryOptions.map(opt => (
                    <label key={opt.type} onClick={() => setSelectedDelivery(opt.type)}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer border transition-colors ${selectedDelivery === opt.type ? "border-amazon-orange bg-[#fff8ef]" : "border-transparent hover:bg-[#fafafa]"}`}>
                      <input type="radio" name="delivery" checked={selectedDelivery === opt.type} onChange={() => setSelectedDelivery(opt.type)} className="accent-[#e77600]" />
                      <div className="flex-1">
                        <p className="text-[12px] font-bold text-amazon-text">{opt.label} <span className="font-normal text-amazon-text-secondary">({opt.days} day{opt.days > 1 ? "s" : ""})</span></p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-amazon-text-secondary">{opt.co2_kg > 0 ? `${opt.co2_kg} kg CO₂` : "Zero carbon"}</span>
                          {opt.green_credits > 0 && (
                            <>
                              <span className="text-[10px] font-bold text-[#067d62]">+{opt.green_credits} credits</span>
                              <CreditInfoBadge
                                label=""
                                color="#067d62"
                                title={`${opt.label} Delivery Credits`}
                                reason={`Choosing ${opt.label} delivery earns you +${opt.green_credits} Green Credits instantly when you place the order. Lower-carbon delivery options earn more credits.`}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {scoresReady && (
              <div className="border border-amazon-border rounded-lg p-3 mb-3 bg-[#fafafa]">
                <p className="text-[13px] font-bold text-amazon-text flex items-center gap-1 mb-3"> Purchase Confidence <span className="text-[10px] text-amazon-orange font-normal bg-[#fff3e0] px-1.5 rounded">AI</span></p>
                <ScoreRow label="Return Frequency" score={returnFreqScore} sublabel={returnLabel} delay={100} />
                <div className="border-t border-[#e8e8e8] my-2" />
                <ScoreRow label="Personal Comfort" score={comfortScore} sublabel={comfortSublabel} delay={350} />
              </div>
            )}

            {/* 🌱 Green Loyalty Credits Incentive */}
            {product && (() => {
              const pendingCredits = computePendingCredits(product.category);
              const returnDays = product.return_period_days ?? 7;
              return (
                <div className="border border-[#a5d6a7] rounded-lg p-3 mb-3 bg-gradient-to-br from-[#f1f8e9] to-[#e8f5e9]">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[12px] font-bold text-[#2e7d32] flex items-center gap-1.5">
                      🌱 Keep it, earn it
                    </p>
                    <span className="text-[18px] font-bold text-[#2e7d32]">{pendingCredits}</span>
                  </div>
                  <p className="text-[11px] text-[#555] leading-relaxed">
                    Buy this product and keep it past the <strong>{returnDays}-day return window</strong> to
                    earn <strong className="text-[#2e7d32]">{pendingCredits} Green Credits</strong> automatically.
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="flex-1 bg-[#c8e6c9] rounded-full h-1.5 overflow-hidden">
                      <div className="bg-gradient-to-r from-[#66bb6a] to-[#2e7d32] h-1.5 rounded-full" style={{ width: "0%", transition: "width 1s" }} />
                    </div>
                    <span className="text-[10px] text-[#777]">Unlocks after day {returnDays}</span>
                    <CreditInfoBadge
                      label=""
                      color="#2e7d32"
                      title="No-Return Loyalty Credits"
                      reason={`If you keep this product without returning it for ${returnDays} days, ${pendingCredits} Green Credits will be added to your wallet automatically. Returning the item forfeits these credits.`}
                    />
                  </div>
                </div>
              );
            })()}

            {orderResult ? (
              <div className="border border-[#067d62] rounded-lg p-3 bg-[#f0faf7]">
                <p className="text-[14px] text-[#067d62] font-bold">✓ Order placed!</p>
                <p className="text-[12px] text-amazon-text-secondary mt-1">Order #{orderResult.id} • Fit: {orderResult.fit_score}%</p>

                {/* Immediate delivery credits — clickable info popup */}
                {orderResult.green_credits_earned > 0 && (
                  <CreditInfoBadge
                    label={`+${orderResult.green_credits_earned} Green Credits earned!`}
                    color="#067d62"
                    title="Delivery Green Credits"
                    reason={`You earned ${orderResult.green_credits_earned} Green Credits instantly for choosing an eco-friendly delivery option. Lower-carbon delivery reduces emissions and is rewarded right away.`}
                  />
                )}

                {/* Pending loyalty credits — clickable info popup */}
                {orderResult.no_return_credits > 0 && (
                  <CreditInfoBadge
                    label={`${orderResult.no_return_credits} credits on the way`}
                    color="#2e7d32"
                    title="No-Return Loyalty Credits"
                    reason={`These ${orderResult.no_return_credits} Green Credits will be added to your wallet automatically after the 7-day return window closes — as a reward for keeping the product instead of returning it.`}
                  />
                )}

                <Link
                  to="/orders"
                  className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 px-4 rounded-lg text-[13px] font-bold text-white shadow-sm active:scale-[0.98] transition-transform"
                  style={{ backgroundColor: "#e77600", boxShadow: "0 1px 3px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)" }}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  View your orders
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                <button onClick={handleOrder} disabled={ordering} className="w-full btn-amazon-orange py-2 text-[13px] disabled:opacity-50">{ordering ? "Placing order..." : "Buy Now"}</button>
                <button onClick={() => handleAddToWishlist()} className="w-full py-2 text-[12px] border border-[#067d62] text-[#067d62] rounded-full hover:bg-[#f0f9f4] transition-colors mt-1">
                  📍 Add to NearDrop Wishlist
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Alternatives */}
        {alternatives.length > 0 && (
          <div className="mt-8 border-t border-amazon-border pt-6">
            <h2 className="text-[18px] sm:text-[21px] font-bold text-amazon-text mb-4">Products related to this item</h2>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
              {alternatives.map(alt => (
                <Link key={alt.id} to={`/products/${alt.id}`} className="product-card border border-amazon-border rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow flex flex-col h-[300px] sm:h-[380px]">
                  <div className="flex items-center justify-center h-[140px] sm:h-[200px] mb-2 sm:mb-3"><img src={alt.image_url} alt={alt.name} className="max-h-full max-w-full object-contain mix-blend-multiply" /></div>
                  <div className="flex flex-col flex-1">
                    <p className="text-[12px] sm:text-[14px] font-medium text-amazon-link leading-snug line-clamp-2 hover:text-amazon-link-hover">{alt.name}</p>
                    <div className="star-rating text-[11px] sm:text-[13px] mt-1">★★★★☆</div>
                    <div className="mt-auto pt-2">
                      <p><span className="text-[13px] sm:text-[14px] font-bold text-amazon-text"><span className="text-[10px] align-top relative top-[3px] mr-0.5">₹</span>{Math.floor(alt.price).toLocaleString("en-IN")}</span></p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Virtual Try-On Modal — only for supported upper-body garments */}
      {showTryOn && product && !isTryOnUnsupported(product) && (
        <TryOnModal product={product} onClose={() => setShowTryOn(false)} />
      )}
    </div>
  );
}
