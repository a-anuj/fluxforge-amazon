import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useUser } from "../context/UserContext";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  getWishlistMatches,
  getWishlistNotifications,
  markWishlistNotificationsRead,
  getProductJourney,
  purchaseWishlistMatch,
  getProducts,
} from "../api/client";

// ── Product Journey Modal ──────────────────────────────────────────────
function JourneyModal({ listingId, onClose }) {
  const [journey, setJourney] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProductJourney(listingId)
      .then(setJourney)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [listingId]);

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl p-8 animate-pulse w-[480px]"><div className="h-[300px] bg-[#f5f5f5] rounded" /></div>
    </div>
  );

  if (!journey) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[520px] max-h-[85vh] overflow-y-auto">
        <div className="bg-[#232f3e] px-5 py-4 rounded-t-xl flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <span className="text-[24px]">🗺️</span>
            <div>
              <p className="text-white font-bold text-[15px]">Product Journey</p>
              <p className="text-[#adb1b8] text-[11px]">Full provenance & transparency report</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#adb1b8] hover:text-white text-[20px]">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Product Info */}
          <div className="flex items-center gap-3 p-3 bg-[#fafafa] border border-amazon-border rounded-lg">
            {journey.product.image_url && (
              <img src={journey.product.image_url} alt="" className="w-14 h-14 object-contain rounded" />
            )}
            <div>
              <p className="text-[14px] font-bold text-amazon-text">{journey.product.name}</p>
              <p className="text-[12px] text-amazon-text-secondary">{journey.product.brand} · {journey.product.category}</p>
              <p className="text-[12px] text-amazon-text">Original: ₹{journey.product.original_price?.toLocaleString("en-IN")}</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="relative pl-6">
            {journey.timeline.map((step, i) => (
              <div key={i} className="relative pb-6 last:pb-0">
                {i < journey.timeline.length - 1 && (
                  <div className="absolute left-[-16px] top-8 w-[2px] h-[calc(100%-16px)] bg-[#067d62]" />
                )}
                <div className="absolute left-[-22px] top-1 w-8 h-8 rounded-full bg-[#067d62] flex items-center justify-center text-[14px]">
                  {step.icon}
                </div>
                <div className="ml-4">
                  <p className="text-[13px] font-bold text-amazon-text">{step.title}</p>
                  <p className="text-[11px] text-amazon-text-secondary mt-0.5">{step.description}</p>
                  {step.condition_score && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] bg-[#f0f9f4] text-[#067d62] px-2 py-0.5 rounded font-bold">Score: {step.condition_score}/100</span>
                      {["electronics", "laptops"].includes((journey.product.category || "").toLowerCase()) ? (
                         <span className="text-[11px] bg-[#e8f4fd] text-[#1a73e8] px-2 py-0.5 rounded font-bold" title="Remaining life cannot be accurately determined from physical appearance, as it depends on internal hardware health.">Life: N/A*</span>
                      ) : (
                         <span className="text-[11px] bg-[#e8f4fd] text-[#1a73e8] px-2 py-0.5 rounded font-bold">Life: {step.remaining_life_pct}%</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Environmental Impact */}
          <div className="border border-[#d4edda] bg-[#f0f9f4] rounded-lg p-4">
            <p className="text-[12px] font-bold text-[#067d62] mb-2">🌍 Environmental Impact of This Purchase</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[18px] font-bold text-[#067d62]">{journey.environmental_impact.co2_saved_kg}</p>
                <p className="text-[9px] text-amazon-text-secondary">kg CO₂ saved</p>
              </div>
              <div>
                <p className="text-[18px] font-bold text-[#1a73e8]">{journey.environmental_impact.ewaste_prevented_kg}</p>
                <p className="text-[9px] text-amazon-text-secondary">kg e-waste prevented</p>
              </div>
              <div>
                <p className="text-[18px] font-bold text-[#00BCD4]">{journey.environmental_impact.lifespan_extended_months}</p>
                <p className="text-[9px] text-amazon-text-secondary">months life extended</p>
              </div>
            </div>
          </div>

          {/* Trust Metrics */}
            <div className="border border-amazon-border rounded-lg p-3">
              <p className="text-[11px] text-amazon-text-secondary uppercase font-bold mb-2">Trust Metrics</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
                <div className="flex justify-between"><span className="text-amazon-text-secondary">AI Verified</span><span className="text-[#067d62] font-bold">✓ Yes</span></div>
                <div className="flex justify-between"><span className="text-amazon-text-secondary">Condition</span><span className="font-bold">{journey.trust_metrics.condition_score}/100</span></div>
                {["electronics", "laptops"].includes((journey.product.category || "").toLowerCase()) ? (
                  <div className="flex justify-between col-span-1 sm:col-span-2"><span className="text-amazon-text-secondary">Remaining Life</span><span className="font-bold text-right text-[10px] leading-tight max-w-[150px]">Remaining life cannot be accurately determined from physical appearance, as it depends on internal hardware health.</span></div>
                ) : (
                  <div className="flex justify-between"><span className="text-amazon-text-secondary">Remaining Life</span><span className="font-bold">{journey.trust_metrics.remaining_life_pct}%</span></div>
                )}
                <div className="flex justify-between"><span className="text-amazon-text-secondary">Discount</span><span className="text-amazon-red font-bold">{journey.trust_metrics.discount_pct}% off</span></div>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}

// ── Add to Wishlist Modal ──────────────────────────────────────────────
// Replaced by inline ProductPicker — kept as lightweight radius/price config only,
// invoked after the user taps Watch on a product card.
function WatchConfigModal({ product, onClose, onAdd }) {
  const [maxPrice, setMaxPrice] = useState(Math.floor(product.price * 0.8));
  const [radius, setRadius]     = useState(10);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await onAdd({
      product_id: product.id,
      category:   product.category,
      brand:      product.brand,
      max_price:  maxPrice,
      radius_km:  radius,
    });
    setSubmitting(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-[400px]">
        {/* Handle bar on mobile */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 bg-[#d5d9d9] rounded-full" />
        </div>

        <div className="px-5 pt-4 pb-2 flex items-center gap-3 border-b border-amazon-border">
          {product.image_url && (
            <img src={product.image_url} alt="" className="w-12 h-12 object-contain rounded flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-amazon-text line-clamp-1">{product.name}</p>
            <p className="text-[11px] text-amazon-text-secondary">{product.brand} · ₹{product.price.toLocaleString("en-IN")}</p>
          </div>
          <button onClick={onClose} className="text-[#adb1b8] hover:text-amazon-text text-[20px] flex-shrink-0">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[12px] font-bold text-amazon-text">Max Price I'll pay (₹)</label>
              <span className="text-[13px] font-bold text-amazon-orange">₹{maxPrice.toLocaleString("en-IN")}</span>
            </div>
            <input
              type="range" min={500} max={product.price} step={100}
              value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="w-full accent-[#e77600]"
            />
            <div className="flex justify-between text-[10px] text-amazon-text-secondary mt-0.5">
              <span>₹500</span><span>₹{product.price.toLocaleString("en-IN")}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[12px] font-bold text-amazon-text">Match radius</label>
              <span className="text-[13px] font-bold text-amazon-orange">{radius} km</span>
            </div>
            <input
              type="range" min={1} max={50} value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-full accent-[#e77600]"
            />
            <div className="flex justify-between text-[10px] text-amazon-text-secondary mt-0.5">
              <span>1 km</span><span>50 km</span>
            </div>
          </div>

          <div className="bg-[#f0f9f4] border border-[#d4edda] rounded-lg p-3">
            <p className="text-[11px] text-[#067d62] leading-relaxed">
              <b>How it works:</b> When someone within {radius} km returns this product, you'll be notified instantly with a discount based on logistics savings.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-lg text-[14px] font-bold text-white disabled:opacity-50 active:scale-[0.98] transition-transform"
            style={{
              backgroundColor: "#e77600",
              animation: submitting ? "none" : "watchGlow 2s ease-in-out infinite",
            }}
          >
            <style>{`
              @keyframes watchGlow {
                0%   { box-shadow: 0 0 0 0 rgba(231,118,0,0.55); }
                50%  { box-shadow: 0 0 0 8px rgba(231,118,0,0); }
                100% { box-shadow: 0 0 0 0 rgba(231,118,0,0); }
              }
            `}</style>
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Adding…
              </span>
            ) : "📍 Watch this product"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Product Picker (browse & one-tap Watch) ────────────────────────────
function ProductPicker({ products, wishlist, onWatch, onClose }) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const watchedIds = new Set(wishlist.map(w => w.product_id).filter(Boolean));
  const categories = ["all", ...new Set(products.map(p => p.category))];

  const visible = products.filter(p => {
    const matchCat = catFilter === "all" || p.category === catFilter;
    const q = search.toLowerCase();
    const matchQ = !q || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white animate-fade-in">
      {/* Header */}
      <div className="bg-[#232f3e] px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={onClose} className="text-white/70 hover:text-white p-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 bg-white rounded-lg flex items-center px-3 h-9">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#888] flex-shrink-0 mr-2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products to watch…"
            className="flex-1 text-[13px] text-amazon-text outline-none bg-transparent"
            autoFocus
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-[#888] text-[16px] ml-1">✕</button>
          )}
        </div>
      </div>

      {/* Category pills */}
      <div className="bg-[#232f3e] pb-3 px-4 flex gap-2 overflow-x-auto scrollbar-none flex-shrink-0">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setCatFilter(cat)}
            className={`flex-shrink-0 text-[11px] font-bold px-3 py-1 rounded-full transition-colors ${
              catFilter === cat
                ? "bg-amazon-orange text-white"
                : "bg-white/10 text-white/80 hover:bg-white/20"
            }`}
          >
            {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="px-4 py-2 bg-[#f0f2f2] border-b border-amazon-border flex-shrink-0">
        <p className="text-[12px] text-amazon-text-secondary">
          {visible.length} product{visible.length !== 1 ? "s" : ""}
          {search ? ` for "${search}"` : catFilter !== "all" ? ` in ${catFilter}` : ""}
        </p>
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-[1px] bg-amazon-border">
          {visible.map(product => {
            const watched = watchedIds.has(product.id);
            return (
              <div key={product.id} className="bg-white p-3 flex flex-col">
                {/* Product image */}
                <Link to={`/products/${product.id}`} onClick={onClose}>
                  <div className="flex items-center justify-center h-[120px] sm:h-[160px] mb-2">
                    <img
                      src={product.image_url || "https://via.placeholder.com/200"}
                      alt={product.name}
                      className="max-h-full max-w-full object-contain mix-blend-multiply"
                    />
                  </div>
                </Link>

                {/* Info */}
                <div className="flex-1 flex flex-col">
                  <p className="text-[12px] sm:text-[13px] font-medium text-amazon-text leading-snug line-clamp-2 mb-1">
                    {product.name}
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-amazon-text-secondary mb-1">{product.brand}</p>
                  <p className="text-[13px] sm:text-[15px] font-bold text-amazon-text mb-2">
                    <span className="text-[10px] align-top relative top-[2px]">₹</span>
                    {Math.floor(product.price).toLocaleString("en-IN")}
                  </p>

                  {/* Watch button */}
                  <button
                    onClick={() => !watched && onWatch(product)}
                    disabled={watched}
                    className={`mt-auto w-full py-1.5 rounded-lg text-[11px] sm:text-[12px] font-bold transition-all active:scale-[0.97] ${
                      watched
                        ? "bg-[#f0f9f4] text-[#067d62] border border-[#067d62]/30 cursor-default"
                        : "bg-[#e77600] hover:bg-[#d56e0c] text-white"
                    }`}
                  >
                    {watched ? "✓ Watching" : "📍 Watch"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {visible.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-[15px] text-amazon-text-secondary">No products match "{search}"</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────
export default function NearDrop() {
  const { currentUser, refreshUser } = useUser();
  const [tab, setTab] = useState("matches");
  const [wishlist, setWishlist] = useState([]);
  const [matches, setMatches] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [watchTarget, setWatchTarget] = useState(null); // product selected in picker
  const [journeyListingId, setJourneyListingId] = useState(null);
  const [purchasing, setPurchasing] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    Promise.all([
      getWishlist(currentUser.id),
      getWishlistMatches(currentUser.id),
      getWishlistNotifications(currentUser.id),
      getProducts(),
    ])
      .then(([wl, m, n, p]) => { setWishlist(wl); setMatches(m); setNotifications(n); setProducts(p); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentUser]);

  const handleAdd = async (data) => {
    try {
      await addToWishlist({ ...data, user_id: currentUser.id });
      const wl = await getWishlist(currentUser.id);
      setWishlist(wl);
      const m = await getWishlistMatches(currentUser.id);
      setMatches(m);
      // Close everything and land on the wishlist tab
      setWatchTarget(null);
      setShowPicker(false);
      setTab("wishlist");
    } catch (err) { alert(err.message); }
  };

  // Called from ProductPicker when user taps Watch on a card
  const handlePickProduct = (product) => {
    setWatchTarget(product); // open the radius/price config sheet
  };

  const handleRemove = async (id) => {
    await removeFromWishlist(id);
    setWishlist(wl => wl.filter(w => w.id !== id));
  };

  const handlePurchase = async (matchId) => {
    setPurchasing(matchId);
    try {
      const result = await purchaseWishlistMatch(matchId, currentUser.id);
      alert(`✅ ${result.message}\n+${result.green_credits_earned} Green Credits earned!\nSaved ₹${result.savings} + ₹${result.environmental_impact.logistics_saved.toFixed(0)} logistics`);
      refreshUser();
      const m = await getWishlistMatches(currentUser.id);
      setMatches(m);
    } catch (err) { alert(err.message); }
    setPurchasing(null);
  };

  const handleMarkRead = async () => {
    await markWishlistNotificationsRead(currentUser.id);
    setNotifications(n => n.map(x => ({ ...x, is_read: true })));
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (!currentUser) return null;

  return (
    <div className="bg-amazon-bg min-h-screen animate-fade-in">
      {/* Hero */}
      <div className="bg-gradient-to-r from-[#1a365d] to-[#2d3748]">
        <div className="max-w-[1200px] mx-auto px-4 py-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-[#00e5a0] text-[12px] font-bold uppercase tracking-widest mb-1">Hyperlocal Circular Commerce</p>
              <h1 className="text-[28px] md:text-[36px] font-bold text-white leading-tight">
                NearDrop <span className="text-[#00e5a0]">Wishlist</span>
              </h1>
              <p className="text-[#ccc] text-[14px] mt-1 max-w-lg">
                Get notified when products you want are returned near you. Save money with dynamic discounts from logistics savings.
              </p>
            </div>
            <button onClick={() => setShowPicker(true)}
              className="btn-amazon-primary px-5 py-2.5 text-[14px] font-bold">
              + Add to Wishlist
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            {[
              { val: wishlist.length, label: "Watching", icon: "👁️" },
              { val: matches.length, label: "Matches Found", icon: "🎯" },
              { val: unreadCount, label: "New Notifications", icon: "🔔" },
            ].map(s => (
              <div key={s.label} className="bg-white/10 backdrop-blur rounded-lg p-4 text-center">
                <span className="text-[20px]">{s.icon}</span>
                <p className="text-[24px] font-bold text-white mt-1">{s.val}</p>
                <p className="text-[11px] text-[#ccc]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-amazon-border sticky top-[99px] z-40">
        <div className="max-w-[1200px] mx-auto px-4 flex gap-0">
          {[
            { key: "matches", label: `Nearby Matches (${matches.length})` },
            { key: "wishlist", label: `My Wishlist (${wishlist.length})` },
            { key: "notifications", label: `Notifications ${unreadCount > 0 ? `(${unreadCount})` : ""}` },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-[13px] border-b-2 transition-colors ${tab === t.key ? "border-amazon-orange text-amazon-text font-bold" : "border-transparent text-amazon-text-secondary hover:text-amazon-text"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 py-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="bg-white border border-amazon-border rounded-lg h-[200px] animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* ═══ MATCHES TAB ═══ */}
            {tab === "matches" && (
              matches.length === 0 ? (
                <div className="bg-white border border-amazon-border rounded-lg p-12 text-center">
                  <span className="text-[48px]">📍</span>
                  <p className="text-[16px] text-amazon-text mt-3 font-bold">No matches yet</p>
                  <p className="text-[13px] text-amazon-text-secondary mt-1">When someone near you returns a product from your wishlist, it'll appear here with a dynamic discount.</p>
                  <button onClick={() => setShowPicker(true)} className="btn-amazon-primary mt-4 px-5 py-2 text-[13px]">+ Add items to watch</button>
                </div>
              ) : (
                <div className="space-y-4">
                  {matches.map(match => (
                    <div key={match.id} className="bg-white border border-amazon-border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                      <div className="p-4 flex gap-4">
                        {match.product_image && (
                          <img src={match.product_image} alt="" className="w-[100px] h-[100px] object-contain flex-shrink-0 rounded" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[14px] font-bold text-amazon-link">{match.product_name}</p>
                              <p className="text-[12px] text-amazon-text-secondary">{match.product_brand} · {match.product_category}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="text-[11px] bg-[#067d62] text-white px-2 py-0.5 rounded font-bold">
                                {match.match_score.toFixed(0)}% match
                              </span>
                            </div>
                          </div>

                          {/* Pricing */}
                          <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-[20px] font-bold text-amazon-text">₹{Math.floor(match.discounted_price).toLocaleString("en-IN")}</span>
                            <span className="text-[13px] text-amazon-text-secondary line-through">₹{Math.floor(match.original_price).toLocaleString("en-IN")}</span>
                            <span className="text-[13px] text-amazon-red font-bold">-{match.discount_pct}%</span>
                          </div>

                          {/* Badges */}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="text-[10px] bg-[#f0f9f4] text-[#067d62] border border-[#d4edda] px-2 py-0.5 rounded font-bold">
                              📍 {match.distance_km?.toFixed(0)}km away
                            </span>
                            <span className="text-[10px] bg-[#e8f4fd] text-[#1a73e8] border border-[#b8daff] px-2 py-0.5 rounded font-bold">
                              🚚 ₹{match.logistics_saved?.toFixed(0)} logistics saved
                            </span>
                            <span className="text-[10px] bg-[#f0f9f4] text-[#067d62] border border-[#d4edda] px-2 py-0.5 rounded font-bold">
                              🌍 {match.co2_saved_delivery?.toFixed(1)}kg CO₂ saved
                            </span>
                            {match.condition_score && (
                              <span className="text-[10px] bg-[#fff3e0] text-[#c7511f] border border-[#ffe0b2] px-2 py-0.5 rounded font-bold">
                                AI Score: {match.condition_score}/100
                              </span>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="mt-3 flex gap-2">
                            <button onClick={() => handlePurchase(match.id)} disabled={purchasing === match.id}
                              className="btn-amazon-primary text-[12px] px-4 py-1.5 disabled:opacity-50">
                              {purchasing === match.id ? "Purchasing..." : "Buy Now at ₹" + Math.floor(match.discounted_price).toLocaleString("en-IN")}
                            </button>
                            <button onClick={() => setJourneyListingId(match.listing_id)}
                              className="btn-amazon text-[12px] px-4 py-1.5">
                              🗺️ View Journey
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ═══ WISHLIST TAB ═══ */}
            {tab === "wishlist" && (
              <>
                {wishlist.length === 0 ? (
                  <div className="bg-white border border-amazon-border rounded-lg p-12 text-center">
                    <span className="text-[48px]">♥</span>
                    <p className="text-[16px] text-amazon-text mt-3 font-bold">Your wishlist is empty</p>
                    <p className="text-[13px] text-amazon-text-secondary mt-1">Add products or categories you're looking for — we'll notify you when they're available nearby at a discount.</p>
                    <button onClick={() => setShowPicker(true)} className="btn-amazon-primary mt-4 px-5 py-2 text-[13px]">+ Add your first item</button>
                  </div>
                ) : (
                  <>
                    {/* Add more button */}
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[13px] text-amazon-text-secondary">
                        Watching <b className="text-amazon-text">{wishlist.length}</b> product{wishlist.length !== 1 ? "s" : ""}
                      </p>
                      <button
                        onClick={() => setShowPicker(true)}
                        className="flex items-center gap-1.5 text-[13px] font-bold text-amazon-link hover:text-amazon-link-hover border border-amazon-border rounded-lg px-3 py-1.5 hover:bg-[#f0f2f2] transition-colors"
                      >
                        <span>+</span> Add more
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[1px] bg-amazon-border">
                      {wishlist.map(item => {
                        // Cross-reference with the products list for full product data
                        const prod = products.find(p => p.id === item.product_id);
                        const productImage = item.product_image || prod?.image_url;
                        const productName  = item.product_name  || prod?.name || `${item.brand || ""} ${item.category || ""}`.trim() || "Custom search";
                        const productPrice = prod?.price;
                        const productId    = item.product_id || prod?.id;

                        return (
                          <div key={item.id} className="bg-white flex flex-col">
                            {/* Product card section — clickable to product page */}
                            <Link
                              to={productId ? `/products/${productId}` : "#"}
                              className="flex flex-col p-3 flex-1 hover:bg-[#fafafa] transition-colors group"
                            >
                              {/* Image */}
                              <div className="flex items-center justify-center h-[130px] sm:h-[180px] mb-2">
                                {productImage ? (
                                  <img
                                    src={productImage}
                                    alt={productName}
                                    className="max-h-full max-w-full object-contain mix-blend-multiply"
                                  />
                                ) : (
                                  <div className="w-16 h-16 bg-[#f0f2f2] rounded-full flex items-center justify-center text-[28px]">
                                    {item.category === "electronics" ? "💻" : item.category === "running" || item.category === "footwear" ? "👟" : item.category === "bags" || item.category === "backpacking" ? "🎒" : item.category === "clothing" ? "👕" : item.category === "kitchen" ? "🍳" : item.category === "furniture" ? "🛋️" : "📦"}
                                  </div>
                                )}
                              </div>

                              {/* Name + brand */}
                              <p className="text-[12px] sm:text-[13px] font-medium text-amazon-link group-hover:text-amazon-link-hover leading-snug line-clamp-2 mb-0.5">
                                {productName}
                              </p>
                              {item.brand && (
                                <p className="text-[10px] sm:text-[11px] text-amazon-text-secondary mb-1">{item.brand}</p>
                              )}

                              {/* Original price */}
                              {productPrice && (
                                <p className="text-[12px] sm:text-[14px] font-bold text-amazon-text">
                                  <span className="text-[10px] align-top relative top-[1px]">₹</span>
                                  {Math.floor(productPrice).toLocaleString("en-IN")}
                                </p>
                              )}
                            </Link>

                            {/* ── NearDrop metrics strip ── */}
                            <div className="border-t border-amazon-border bg-[#f8fffe] px-3 py-2 space-y-1.5">
                              {/* Max price I'll pay */}
                              {item.max_price && (
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-amazon-text-secondary">Max I'll pay</span>
                                  <span className="text-[11px] font-bold text-[#067d62]">
                                    ₹{Number(item.max_price).toLocaleString("en-IN")}
                                    {productPrice && (
                                      <span className="text-[10px] font-normal text-amazon-text-secondary ml-1">
                                        ({Math.round((1 - item.max_price / productPrice) * 100)}% off)
                                      </span>
                                    )}
                                  </span>
                                </div>
                              )}

                              {/* Radius */}
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-amazon-text-secondary">Match radius</span>
                                <span className="text-[11px] font-bold text-[#1a73e8]">📍 {item.radius_km} km</span>
                              </div>

                              {/* Keywords if set */}
                              {item.keywords && (
                                <p className="text-[10px] text-amazon-text-secondary truncate">
                                  🔍 {item.keywords}
                                </p>
                              )}

                              {/* Remove button */}
                              <button
                                onClick={() => handleRemove(item.id)}
                                className="w-full mt-1 py-1 rounded text-[11px] font-medium text-amazon-text-secondary border border-amazon-border hover:border-amazon-red hover:text-amazon-red active:bg-red-50 transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ═══ NOTIFICATIONS TAB ═══ */}
            {tab === "notifications" && (
              <>
                {unreadCount > 0 && (
                  <button onClick={handleMarkRead} className="text-[12px] text-amazon-link hover:underline mb-3">
                    Mark all as read
                  </button>
                )}
                {notifications.length === 0 ? (
                  <div className="bg-white border border-amazon-border rounded-lg p-12 text-center">
                    <span className="text-[48px]">🔔</span>
                    <p className="text-[16px] text-amazon-text mt-3 font-bold">No notifications yet</p>
                    <p className="text-[13px] text-amazon-text-secondary mt-1">When a match is found, you'll see it here.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {notifications.map(n => (
                      <div key={n.id} className={`bg-white border rounded-lg p-4 ${!n.is_read ? "border-[#067d62] bg-[#f8fffe]" : "border-amazon-border"}`}>
                        <div className="flex items-start gap-3">
                          <span className="text-[18px]">{!n.is_read ? "🆕" : "📬"}</span>
                          <div>
                            <p className="text-[13px] font-bold text-amazon-text">{n.title}</p>
                            <p className="text-[12px] text-amazon-text-secondary mt-0.5">{n.message}</p>
                            <p className="text-[10px] text-amazon-text-secondary mt-1">
                              {n.created_at ? new Date(n.created_at).toLocaleString("en-IN") : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showPicker && (
        <ProductPicker
          products={products}
          wishlist={wishlist}
          onWatch={handlePickProduct}
          onClose={() => setShowPicker(false)}
        />
      )}
      {watchTarget && (
        <WatchConfigModal
          product={watchTarget}
          onClose={() => setWatchTarget(null)}
          onAdd={handleAdd}
        />
      )}
      {journeyListingId && <JourneyModal listingId={journeyListingId} onClose={() => setJourneyListingId(null)} />}
    </div>
  );
}
