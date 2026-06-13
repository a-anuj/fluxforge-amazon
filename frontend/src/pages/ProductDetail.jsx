import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { getProduct, getAlternatives, createOrder } from "../api/client";
import { useUser } from "../context/UserContext";

export default function ProductDetail() {
  const { id } = useParams();
  const { currentUser, refreshUser } = useUser();
  const [product, setProduct] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderResult, setOrderResult] = useState(null);
  const [ordering, setOrdering] = useState(false);
  const [simulated, setSimulated] = useState(null);

  useEffect(() => {
    setLoading(true);
    setOrderResult(null);
    setSimulated(null);
    Promise.all([getProduct(id), getAlternatives(id)])
      .then(([p, alts]) => { setProduct(p); setAlternatives(alts); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!product || !currentUser) return;
    const userSizes = {};
    if (currentUser.sizes) {
      currentUser.sizes.split(",").forEach((pair) => {
        const [k, v] = pair.split(":");
        if (k && v) userSizes[k.trim().toLowerCase()] = v.trim().toLowerCase();
      });
    }
    const productSize = (product.size || "").toLowerCase();
    const sizeMatch = Object.values(userSizes).includes(productSize);
    setSimulated({
      fit_score: sizeMatch ? Math.floor(90 + Math.random() * 10) : Math.floor(40 + Math.random() * 20),
      return_risk: sizeMatch ? "low" : "high",
    });
  }, [product, currentUser]);

  const handleOrder = async () => {
    if (!currentUser || !product) return;
    setOrdering(true);
    try {
      const result = await createOrder(currentUser.id, product.id);
      setOrderResult(result);
      refreshUser();
    } catch (err) { alert(err.message); }
    setOrdering(false);
  };

  if (loading) return (
    <div className="max-w-[1500px] mx-auto px-4 py-4">
      <div className="bg-white p-8 animate-pulse"><div className="h-[400px] bg-[#f5f5f5]" /></div>
    </div>
  );
  if (!product) return <div className="text-center py-16 text-amazon-text-secondary">Product not found.</div>;

  const riskStyles = {
    low: { bg: "bg-[#067d62]", text: "Low", icon: "✓" },
    medium: { bg: "bg-[#c7511f]", text: "Medium", icon: "!" },
    high: { bg: "bg-[#b12704]", text: "High", icon: "✕" },
  };
  const risk = simulated ? riskStyles[simulated.return_risk] : null;

  return (
    <div className="bg-white animate-fade-in">
      <div className="max-w-[1500px] mx-auto px-4 py-4">
        {/* Breadcrumb */}
        <div className="text-[12px] text-amazon-text-secondary mb-3 flex items-center gap-1">
          <Link to="/" className="text-amazon-link hover:text-amazon-link-hover hover:underline">Back to results</Link>
          <span>›</span>
          <span className="capitalize">{product.category}</span>
          <span>›</span>
          <span>{product.brand}</span>
        </div>

        <div className="grid md:grid-cols-[400px_1fr_280px] gap-6">
          {/* Image Column */}
          <div className="border border-amazon-border rounded p-4 flex items-center justify-center bg-white self-start">
            <img
              src={product.image_url || "https://via.placeholder.com/400"}
              alt={product.name}
              className="max-h-[400px] max-w-full object-contain"
            />
          </div>

          {/* Product Info Column */}
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
              <span className="text-[14px] text-amazon-link">{Math.floor(Math.random() * 500 + 100)} ratings</span>
              <span className="text-[#ddd]">|</span>
              <span className="text-[14px] text-amazon-text-secondary">100+ bought in past month</span>
            </div>

            {/* Price */}
            <div className="mt-3 pb-3 border-b border-amazon-border">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] text-amazon-red">-{Math.floor(Math.random() * 20 + 5)}%</span>
                <span className="text-[28px] text-amazon-text">
                  <span className="text-[13px] align-top relative top-[4px]">₹</span>
                  {Math.floor(product.price).toLocaleString("en-IN")}
                </span>
              </div>
              <p className="text-[12px] text-amazon-text-secondary">
                M.R.P.: <span className="line-through">₹{Math.floor(product.price * 1.2).toLocaleString("en-IN")}</span>
              </p>
              <p className="text-[13px] text-amazon-text-secondary mt-1">Inclusive of all taxes</p>
              <p className="text-[14px] text-amazon-text mt-2">
                FREE delivery <b>Tomorrow, {new Date(Date.now() + 86400000).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}</b>
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
              <h3 className="text-[16px] font-bold text-amazon-text mb-2">About this item</h3>
              <p className="text-[14px] text-amazon-text leading-relaxed">{product.description}</p>
            </div>

            {/* Eco badge */}
            <div className="mt-4 flex items-center gap-2">
              <span className="eco-badge">♻ Circular Ready</span>
              <span className="text-[12px] text-amazon-text-secondary">
                This item participates in Amazon Circular Intelligence
              </span>
            </div>
          </div>

          {/* Buy Box Column — Amazon style */}
          <div className="border border-amazon-border rounded-lg p-4 self-start bg-white">
            <p className="text-[28px] text-amazon-text mb-1">
              <span className="text-[13px] align-top relative top-[4px]">₹</span>
              {Math.floor(product.price).toLocaleString("en-IN")}
            </p>
            <p className="text-[14px] text-amazon-text mb-1">
              FREE delivery <b>Tomorrow</b>
            </p>
            <p className="text-[14px] text-amazon-success font-bold mb-3">In stock</p>

            {/* Purchase Confidence — Circular Intelligence Feature */}
            {simulated && (
              <div className="border border-amazon-border rounded-lg p-3 mb-3 bg-[#fafafa]">
                <p className="text-[13px] font-bold text-amazon-text mb-2 flex items-center gap-1">
                  🎯 Purchase Confidence
                  <span className="text-[10px] text-amazon-orange font-normal bg-[#fff3e0] px-1.5 rounded">AI</span>
                </p>
                {/* Fit Score Bar */}
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <span className="text-amazon-text-secondary">Fit Score</span>
                    <span className="font-bold text-amazon-text">{simulated.fit_score}%</span>
                  </div>
                  <div className="h-[6px] bg-[#e8e8e8] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${simulated.fit_score >= 80 ? "bg-[#067d62]" : simulated.fit_score >= 60 ? "bg-amazon-orange" : "bg-amazon-red"}`}
                      style={{ width: `${simulated.fit_score}%` }}
                    />
                  </div>
                </div>
                {/* Return Risk */}
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-amazon-text-secondary">Return Risk</span>
                  <span className={`text-white text-[11px] font-bold px-2 py-0.5 rounded-sm ${risk?.bg}`}>
                    {risk?.icon} {risk?.text}
                  </span>
                </div>
              </div>
            )}

            {orderResult ? (
              <div className="border border-[#067d62] rounded-lg p-3 bg-[#f0faf7]">
                <p className="text-[14px] text-[#067d62] font-bold">✓ Order placed!</p>
                <p className="text-[12px] text-amazon-text-secondary mt-1">
                  Order #{orderResult.id} • Fit: {orderResult.fit_score}%
                </p>
                <Link to="/orders" className="text-[13px] text-amazon-link mt-1 inline-block hover:underline">
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
              <p className="flex justify-between"><span className="text-[#565959]">Ships from</span><span className="text-amazon-text">Amazon</span></p>
              <p className="flex justify-between"><span className="text-[#565959]">Sold by</span><span className="text-amazon-link">{product.brand} India</span></p>
            </div>
          </div>
        </div>

        {/* Alternatives — "Customers who viewed this also viewed" */}
        {alternatives.length > 0 && (
          <div className="mt-8 border-t border-amazon-border pt-6">
            <h2 className="text-[21px] font-bold text-amazon-text mb-4">
              Products related to this item
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {alternatives.map((alt) => (
                <Link key={alt.id} to={`/products/${alt.id}`} className="product-card border border-amazon-border rounded-lg p-3">
                  <div className="flex items-center justify-center h-[120px] mb-2">
                    <img src={alt.image_url || "https://via.placeholder.com/150"} alt={alt.name} className="max-h-full max-w-full object-contain" />
                  </div>
                  <p className="text-[13px] text-amazon-link line-clamp-2">{alt.name}</p>
                  <div className="star-rating text-[12px] mt-1">★★★★☆</div>
                  <p className="mt-1">
                    <span className="text-[13px] align-top relative top-[2px]">₹</span>
                    <span className="text-[18px] text-amazon-text">{Math.floor(alt.price).toLocaleString("en-IN")}</span>
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
