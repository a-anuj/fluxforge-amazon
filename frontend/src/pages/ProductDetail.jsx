import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { getProduct, getAlternatives, createOrder, getProductConfidence } from "../api/client";
import { useUser } from "../context/UserContext";

// ── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(score) {
  if (score >= 7.5) return "#067d62";   // green
  if (score >= 5.0) return "#c7511f";   // orange
  return "#b12704";                      // red
}

function scoreLabel(score) {
  if (score >= 7.5) return { icon: "🟢", text: "Great" };
  if (score >= 5.0) return { icon: "🟡", text: "Moderate" };
  return { icon: "🔴", text: "Low" };
}

/**
 * Animated score bar row used for both metrics.
 */
function ScoreRow({ label, score, sublabel, delay = 0 }) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(score), delay);
    return () => clearTimeout(t);
  }, [score, delay]);

  const color = scoreColor(score);
  const badge = scoreLabel(score);

  return (
    <div className="mb-3">
      {/* Header row */}
      <div className="flex items-center justify-between text-[12px] mb-1">
        <span className="text-amazon-text-secondary font-medium">{label}</span>
        <div className="flex items-center gap-1.5">
          <span style={{ color }} className="font-bold text-[13px]">
            {score.toFixed(1)}<span className="text-[10px] text-amazon-text-secondary font-normal"> / 10</span>
          </span>
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-sm text-white"
            style={{ backgroundColor: color }}
          >
            {badge.text}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-[7px] bg-[#e8e8e8] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${(animated / 10) * 100}%`, backgroundColor: color }}
        />
      </div>

      {/* Sub-label */}
      {sublabel && (
        <p className="text-[11px] text-amazon-text-secondary mt-1">{sublabel}</p>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function ProductDetail() {
  const { id } = useParams();
  const { currentUser, refreshUser } = useUser();
  const [product, setProduct] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderResult, setOrderResult] = useState(null);
  const [ordering, setOrdering] = useState(false);

  // ── Score state ──
  const [returnFreqScore, setReturnFreqScore] = useState(null);   // from backend
  const [returnLabel, setReturnLabel]         = useState("");
  const [comfortScore, setComfortScore]       = useState(null);   // computed client-side
  const [comfortSublabel, setComfortSublabel] = useState("");

  // ── Fetch product + alternatives + confidence ──
  useEffect(() => {
    setLoading(true);
    setOrderResult(null);
    setReturnFreqScore(null);
    setComfortScore(null);

    Promise.all([getProduct(id), getAlternatives(id), getProductConfidence(id)])
      .then(([p, alts, conf]) => {
        setProduct(p);
        setAlternatives(alts);
        setReturnFreqScore(conf.return_frequency_score);
        setReturnLabel(conf.return_label);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  // ── Compute Personal Comfort Score from user profile ──
  useEffect(() => {
    if (!product || !currentUser) return;

    let pts = 0;
    const reasons = [];

    // Size match → max 5 pts
    const userSizes = {};
    if (currentUser.sizes) {
      currentUser.sizes.split(",").forEach((pair) => {
        const [k, v] = pair.split(":");
        if (k && v) userSizes[k.trim().toLowerCase()] = v.trim().toLowerCase();
      });
    }
    const productSize = (product.size || "").toLowerCase();
    const sizeMatch = Object.values(userSizes).includes(productSize);
    if (sizeMatch) {
      pts += 5;
      reasons.push("size fits you");
    }

    // Brand preference → max 3 pts
    const userBrands = (currentUser.brand_prefs || "")
      .split(",")
      .map((b) => b.trim().toLowerCase());
    const brandMatch = userBrands.includes(product.brand.toLowerCase());
    if (brandMatch) {
      pts += 3;
      reasons.push("preferred brand");
    }

    // Budget fit → max 2 pts
    const price = product.price;
    const withinBudget =
      (!currentUser.budget_min || price >= currentUser.budget_min) &&
      (!currentUser.budget_max || price <= currentUser.budget_max);
    if (withinBudget) {
      pts += 2;
      reasons.push("within your budget");
    }

    const score = Math.max(1, Math.min(10, pts));
    setComfortScore(score);

    if (reasons.length === 0) {
      setComfortSublabel("No matching profile signals");
    } else {
      setComfortSublabel("Matches: " + reasons.join(", "));
    }
  }, [product, currentUser]);

  // ── Order handler ──
  const handleOrder = async () => {
    if (!currentUser || !product) return;
    setOrdering(true);
    try {
      const result = await createOrder(currentUser.id, product.id);
      setOrderResult(result);
      refreshUser();
    } catch (err) {
      alert(err.message);
    }
    setOrdering(false);
  };

  // ── Loading & error states ──
  if (loading)
    return (
      <div className="max-w-[1500px] mx-auto px-4 py-4">
        <div className="bg-white p-8 animate-pulse">
          <div className="h-[400px] bg-[#f5f5f5]" />
        </div>
      </div>
    );
  if (!product)
    return (
      <div className="text-center py-16 text-amazon-text-secondary">
        Product not found.
      </div>
    );

  const scoresReady = returnFreqScore !== null && comfortScore !== null;

  return (
    <div className="bg-white animate-fade-in">
      <div className="max-w-[1500px] mx-auto px-4 py-4">
        {/* Breadcrumb */}
        <div className="text-[12px] text-amazon-text-secondary mb-3 flex items-center gap-1">
          <Link to="/" className="text-amazon-link hover:text-amazon-link-hover hover:underline">
            Back to results
          </Link>
          <span>›</span>
          <span className="capitalize">{product.category}</span>
          <span>›</span>
          <span>{product.brand}</span>
        </div>

        <div className="grid md:grid-cols-[400px_1fr_300px] gap-6">
          {/* ── Image Column ── */}
          <div className="border border-amazon-border rounded p-4 flex items-center justify-center bg-white self-start">
            <img
              src={product.image_url || "https://via.placeholder.com/400"}
              alt={product.name}
              className="max-h-[400px] max-w-full object-contain"
            />
          </div>

          {/* ── Product Info Column ── */}
          <div>
            <h1 className="text-[24px] text-amazon-text leading-tight font-normal">
              {product.name}
            </h1>
            <p className="text-[14px] text-amazon-link mt-1">
              Visit the {product.brand} Store
            </p>

            {/* Rating */}
            <div className="flex items-center gap-2 mt-2 pb-3 border-b border-amazon-border">
              <span className="star-rating text-[16px]">★★★★☆</span>
              <span className="text-[14px] text-amazon-link">
                {Math.floor(Math.random() * 500 + 100)} ratings
              </span>
              <span className="text-[#ddd]">|</span>
              <span className="text-[14px] text-amazon-text-secondary">
                100+ bought in past month
              </span>
            </div>

            {/* Price */}
            <div className="mt-3 pb-3 border-b border-amazon-border">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] text-amazon-red">
                  -{Math.floor(Math.random() * 20 + 5)}%
                </span>
                <span className="text-[28px] text-amazon-text">
                  <span className="text-[13px] align-top relative top-[4px]">₹</span>
                  {Math.floor(product.price).toLocaleString("en-IN")}
                </span>
              </div>
              <p className="text-[12px] text-amazon-text-secondary">
                M.R.P.:{" "}
                <span className="line-through">
                  ₹{Math.floor(product.price * 1.2).toLocaleString("en-IN")}
                </span>
              </p>
              <p className="text-[13px] text-amazon-text-secondary mt-1">
                Inclusive of all taxes
              </p>
              <p className="text-[14px] text-amazon-text mt-2">
                FREE delivery{" "}
                <b>
                  Tomorrow,{" "}
                  {new Date(Date.now() + 86400000).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                  })}
                </b>
              </p>
            </div>

            {/* Size */}
            {product.size && (
              <div className="mt-3 pb-3 border-b border-amazon-border">
                <p className="text-[14px] text-amazon-text">
                  <b>Size:</b> {product.size}
                </p>
              </div>
            )}

            {/* Description */}
            <div className="mt-3">
              <h3 className="text-[16px] font-bold text-amazon-text mb-2">
                About this item
              </h3>
              <p className="text-[14px] text-amazon-text leading-relaxed">
                {product.description}
              </p>
            </div>

            {/* Eco badge */}
            <div className="mt-4 flex items-center gap-2">
              <span className="eco-badge">♻ Circular Ready</span>
              <span className="text-[12px] text-amazon-text-secondary">
                This item participates in Amazon Circular Intelligence
              </span>
            </div>
          </div>

          {/* ── Buy Box Column ── */}
          <div className="border border-amazon-border rounded-lg p-4 self-start bg-white">
            <p className="text-[28px] text-amazon-text mb-1">
              <span className="text-[13px] align-top relative top-[4px]">₹</span>
              {Math.floor(product.price).toLocaleString("en-IN")}
            </p>
            <p className="text-[14px] text-amazon-text mb-1">
              FREE delivery <b>Tomorrow</b>
            </p>
            <p className="text-[14px] text-amazon-success font-bold mb-3">In stock</p>

            {/* ── Purchase Confidence Card ── */}
            {scoresReady && (
              <div className="border border-amazon-border rounded-lg p-3 mb-3 bg-[#fafafa]">
                {/* Card header */}
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] font-bold text-amazon-text flex items-center gap-1">
                    🎯 Purchase Confidence
                    <span className="text-[10px] text-amazon-orange font-normal bg-[#fff3e0] px-1.5 rounded">
                      AI
                    </span>
                  </p>
                </div>

                {/* Score 1 — Return Frequency */}
                <ScoreRow
                  label="Return Frequency"
                  score={returnFreqScore}
                  sublabel={returnLabel}
                  delay={100}
                />

                {/* Divider */}
                <div className="border-t border-[#e8e8e8] my-2" />

                {/* Score 2 — Personal Comfort */}
                <ScoreRow
                  label="Personal Comfort"
                  score={comfortScore}
                  sublabel={comfortSublabel}
                  delay={350}
                />

                {/* Scoring breakdown legend */}
                <div className="mt-2 pt-2 border-t border-[#e8e8e8]">
                  <p className="text-[10px] text-amazon-text-secondary leading-relaxed">
                    Comfort based on: size match (5 pts) · brand preference (3 pts) · budget fit (2 pts)
                  </p>
                </div>
              </div>
            )}

            {/* Order CTA */}
            {orderResult ? (
              <div className="border border-[#067d62] rounded-lg p-3 bg-[#f0faf7]">
                <p className="text-[14px] text-[#067d62] font-bold">✓ Order placed!</p>
                <p className="text-[12px] text-amazon-text-secondary mt-1">
                  Order #{orderResult.id} • Fit: {orderResult.fit_score}%
                </p>
                <Link
                  to="/orders"
                  className="text-[13px] text-amazon-link mt-1 inline-block hover:underline"
                >
                  View your orders ›
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={handleOrder}
                  disabled={ordering}
                  className="w-full btn-amazon-primary py-2 text-[13px] disabled:opacity-50"
                >
                  {ordering ? "Placing order..." : "Add to Cart"}
                </button>
                <button
                  onClick={handleOrder}
                  disabled={ordering}
                  className="w-full btn-amazon-orange py-2 text-[13px] disabled:opacity-50"
                >
                  {ordering ? "..." : "Buy Now"}
                </button>
              </div>
            )}

            <div className="mt-3 text-[12px] text-amazon-text-secondary space-y-1">
              <p className="flex justify-between">
                <span className="text-[#565959]">Ships from</span>
                <span className="text-amazon-text">Amazon</span>
              </p>
              <p className="flex justify-between">
                <span className="text-[#565959]">Sold by</span>
                <span className="text-amazon-link">{product.brand} India</span>
              </p>
            </div>
          </div>
        </div>

        {/* Alternatives */}
        {alternatives.length > 0 && (
          <div className="mt-8 border-t border-amazon-border pt-6">
            <h2 className="text-[21px] font-bold text-amazon-text mb-4">
              Products related to this item
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {alternatives.map((alt) => (
                <Link
                  key={alt.id}
                  to={`/products/${alt.id}`}
                  className="product-card border border-amazon-border rounded-lg p-3"
                >
                  <div className="flex items-center justify-center h-[120px] mb-2">
                    <img
                      src={alt.image_url || "https://via.placeholder.com/150"}
                      alt={alt.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <p className="text-[13px] text-amazon-link line-clamp-2">{alt.name}</p>
                  <div className="star-rating text-[12px] mt-1">★★★★☆</div>
                  <p className="mt-1">
                    <span className="text-[13px] align-top relative top-[2px]">₹</span>
                    <span className="text-[18px] text-amazon-text">
                      {Math.floor(alt.price).toLocaleString("en-IN")}
                    </span>
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
