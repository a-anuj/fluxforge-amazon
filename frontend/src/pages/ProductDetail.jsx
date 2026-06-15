import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { getProduct, getAlternatives, createOrder, getProductConfidence, getProductImpact, getRefurbishedAlt, getSustainabilityAdvice, getDeliveryOptions } from "../api/client";
import { useUser } from "../context/UserContext";

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

export default function ProductDetail() {
  const { id } = useParams();
  const { currentUser, refreshUser, cart, addToCart, removeFromCart, isInCart } = useUser();
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

  const ratingCount = useMemo(() => Math.floor(Math.random() * 500 + 100), [id]);
  const discountPct = useMemo(() => Math.floor(Math.random() * 20 + 5), [id]);

  useEffect(() => {
    setLoading(true); setOrderResult(null); setReturnFreqScore(null); setComfortScore(null);
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

  if (loading) return <div className="max-w-[1500px] mx-auto px-4 py-4"><div className="bg-white p-8 animate-pulse"><div className="h-[400px] bg-[#f5f5f5]" /></div></div>;
  if (!product) return <div className="text-center py-16 text-amazon-text-secondary">Product not found.</div>;

  const scoresReady = returnFreqScore !== null && comfortScore !== null;
  const selectedDO = deliveryOptions.find(d => d.type === selectedDelivery);

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
          {/* Image */}
          <div className="border border-amazon-border rounded p-4 flex items-center justify-center bg-white self-start">
            <img src={product.image_url || "https://via.placeholder.com/400"} alt={product.name} className="max-h-[400px] max-w-full object-contain" />
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
                          {opt.green_credits > 0 && <span className="text-[10px] font-bold text-[#067d62]">+{opt.green_credits} credits</span>}
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

            {orderResult ? (
              <div className="border border-[#067d62] rounded-lg p-3 bg-[#f0faf7]">
                <p className="text-[14px] text-[#067d62] font-bold">✓ Order placed!</p>
                <p className="text-[12px] text-amazon-text-secondary mt-1">Order #{orderResult.id} • Fit: {orderResult.fit_score}%</p>
                {orderResult.green_credits_earned > 0 && <p className="text-[12px] text-[#067d62] font-bold mt-1">+{orderResult.green_credits_earned} Green Credits earned!</p>}
                <Link to="/orders" className="text-[13px] text-amazon-link mt-1 inline-block hover:underline">View your orders ›</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {product && isInCart(`product_${product.id}`) ? (
                  <button onClick={() => removeFromCart(`product_${product.id}`)} disabled={ordering} className="w-full py-2 text-[13px] border rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 transition-colors bg-[#f0f2f2] text-amazon-text border-amazon-border hover:bg-[#e3e6e6]">Remove from Cart</button>
                ) : (
                  <button onClick={() => addToCart({ ...product, cartId: `product_${product.id}`, cartType: 'product' })} disabled={ordering} className="w-full btn-amazon-primary py-2 text-[13px] disabled:opacity-50">Add to Cart</button>
                )}
                <button onClick={handleOrder} disabled={ordering} className="w-full btn-amazon-orange py-2 text-[13px] disabled:opacity-50">{ordering ? "Placing order..." : "Buy Now"}</button>
              </div>
            )}
          </div>
        </div>

        {/* Alternatives */}
        {alternatives.length > 0 && (
          <div className="mt-8 border-t border-amazon-border pt-6">
            <h2 className="text-[21px] font-bold text-amazon-text mb-4">Products related to this item</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {alternatives.map(alt => (
                <Link key={alt.id} to={`/products/${alt.id}`} className="product-card border border-amazon-border rounded-lg p-4 hover:shadow-md transition-shadow flex flex-col h-[380px]">
                  <div className="flex items-center justify-center h-[200px] mb-3"><img src={alt.image_url} alt={alt.name} className="max-h-full max-w-full object-contain mix-blend-multiply" /></div>
                  <div className="flex flex-col flex-1">
                    <p className="text-[14px] font-medium text-amazon-link leading-snug line-clamp-2 hover:text-amazon-link-hover">{alt.name}</p>
                    <div className="star-rating text-[13px] mt-1">★★★★☆</div>
                    <div className="mt-auto pt-2">
                      <p><span className="text-[14px] font-bold text-amazon-text"><span className="text-[10px] align-top relative top-[3px] mr-0.5">₹</span>{Math.floor(alt.price).toLocaleString("en-IN")}</span></p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
