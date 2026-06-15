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
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[11px] bg-[#f0f9f4] text-[#067d62] px-2 py-0.5 rounded font-bold">Score: {step.condition_score}/100</span>
                      <span className="text-[11px] bg-[#e8f4fd] text-[#1a73e8] px-2 py-0.5 rounded font-bold">Life: {step.remaining_life_pct}%</span>
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
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div className="flex justify-between"><span className="text-amazon-text-secondary">AI Verified</span><span className="text-[#067d62] font-bold">✓ Yes</span></div>
              <div className="flex justify-between"><span className="text-amazon-text-secondary">Condition</span><span className="font-bold">{journey.trust_metrics.condition_score}/100</span></div>
              <div className="flex justify-between"><span className="text-amazon-text-secondary">Remaining Life</span><span className="font-bold">{journey.trust_metrics.remaining_life_pct}%</span></div>
              <div className="flex justify-between"><span className="text-amazon-text-secondary">Discount</span><span className="text-amazon-red font-bold">{journey.trust_metrics.discount_pct}% off</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add to Wishlist Modal ──────────────────────────────────────────────
function AddWishlistModal({ onClose, onAdd, products }) {
  const [form, setForm] = useState({
    product_id: "",
    category: "",
    brand: "",
    keywords: "",
    max_price: "",
    radius_km: 10,
  });
  const [submitting, setSubmitting] = useState(false);

  const categories = [...new Set(products.map(p => p.category))];
  const brands = [...new Set(products.map(p => p.brand))];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await onAdd({
      product_id: form.product_id ? Number(form.product_id) : null,
      category: form.category || null,
      brand: form.brand || null,
      keywords: form.keywords || null,
      max_price: form.max_price ? Number(form.max_price) : null,
      radius_km: Number(form.radius_km),
    });
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[440px]">
        <div className="bg-[#232f3e] px-5 py-4 rounded-t-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[24px]">📍</span>
            <div>
              <p className="text-white font-bold text-[15px]">Add to NearDrop Wishlist</p>
              <p className="text-[#adb1b8] text-[11px]">Get notified when this becomes available nearby</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#adb1b8] hover:text-white text-[20px]">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="text-[12px] font-bold text-amazon-text block mb-1">Specific Product (optional)</label>
            <select value={form.product_id} onChange={(e) => setForm({...form, product_id: e.target.value})}
              className="w-full px-3 py-2 border border-[#a6a6a6] rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#e77600]">
              <option value="">Any matching product</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} — ₹{p.price}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-bold text-amazon-text block mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm({...form, category: e.target.value})}
                className="w-full px-3 py-2 border border-[#a6a6a6] rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#e77600]">
                <option value="">Any</option>
                {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-bold text-amazon-text block mb-1">Brand</label>
              <select value={form.brand} onChange={(e) => setForm({...form, brand: e.target.value})}
                className="w-full px-3 py-2 border border-[#a6a6a6] rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#e77600]">
                <option value="">Any</option>
                {brands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[12px] font-bold text-amazon-text block mb-1">Keywords (comma-separated)</label>
            <input type="text" value={form.keywords} onChange={(e) => setForm({...form, keywords: e.target.value})}
              placeholder="e.g., earbuds, headphones, tws"
              className="w-full px-3 py-2 border border-[#a6a6a6] rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#e77600]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-bold text-amazon-text block mb-1">Max Price (₹)</label>
              <input type="number" value={form.max_price} onChange={(e) => setForm({...form, max_price: e.target.value})}
                placeholder="e.g., 5000"
                className="w-full px-3 py-2 border border-[#a6a6a6] rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#e77600]" />
            </div>
            <div>
              <label className="text-[12px] font-bold text-amazon-text block mb-1">Radius (km)</label>
              <input type="range" min="1" max="50" value={form.radius_km} onChange={(e) => setForm({...form, radius_km: e.target.value})}
                className="w-full mt-2 accent-[#e77600]" />
              <p className="text-[11px] text-amazon-text-secondary text-center">{form.radius_km} km</p>
            </div>
          </div>

          <div className="bg-[#f0f9f4] border border-[#d4edda] rounded p-3">
            <p className="text-[11px] text-[#067d62]">
              <b>How it works:</b> When someone within {form.radius_km}km returns a matching product, you'll be notified instantly with a dynamic discount (15-50% off) based on logistics savings.
            </p>
          </div>

          <button type="submit" disabled={submitting || (!form.product_id && !form.category && !form.brand && !form.keywords)}
            className="btn-amazon-primary w-full py-2.5 text-[14px] font-bold disabled:opacity-40">
            {submitting ? "Adding..." : "📍 Add to NearDrop Wishlist"}
          </button>
        </form>
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
  const [showAddModal, setShowAddModal] = useState(false);
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
      // Check for immediate matches
      const m = await getWishlistMatches(currentUser.id);
      setMatches(m);
      setShowAddModal(false);
    } catch (err) { alert(err.message); }
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
            <button onClick={() => setShowAddModal(true)}
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
                  <button onClick={() => setShowAddModal(true)} className="btn-amazon-primary mt-4 px-5 py-2 text-[13px]">+ Add items to watch</button>
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
                    <button onClick={() => setShowAddModal(true)} className="btn-amazon-primary mt-4 px-5 py-2 text-[13px]">+ Add your first item</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {wishlist.map(item => (
                      <div key={item.id} className="bg-white border border-amazon-border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            {item.product_image ? (
                              <img src={item.product_image} alt="" className="w-12 h-12 object-contain rounded" />
                            ) : (
                              <div className="w-12 h-12 bg-[#f0f2f2] rounded flex items-center justify-center text-[20px]">
                                {item.category === "electronics" ? "🎧" : item.category === "running" ? "👟" : item.category === "backpacking" ? "🎒" : "📦"}
                              </div>
                            )}
                            <div>
                              <p className="text-[13px] font-bold text-amazon-text">
                                {item.product_name || `${item.brand || ""} ${item.category || ""}`.trim() || "Custom search"}
                              </p>
                              {item.keywords && <p className="text-[11px] text-amazon-text-secondary">Keywords: {item.keywords}</p>}
                              <div className="flex gap-2 mt-1">
                                {item.max_price && <span className="text-[10px] bg-[#f0f2f2] px-1.5 py-0.5 rounded">Max ₹{item.max_price}</span>}
                                <span className="text-[10px] bg-[#f0f2f2] px-1.5 py-0.5 rounded">📍 {item.radius_km}km</span>
                              </div>
                            </div>
                          </div>
                          <button onClick={() => handleRemove(item.id)} className="text-[12px] text-amazon-text-secondary hover:text-amazon-red">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
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
      {showAddModal && <AddWishlistModal onClose={() => setShowAddModal(false)} onAdd={handleAdd} products={products} />}
      {journeyListingId && <JourneyModal listingId={journeyListingId} onClose={() => setJourneyListingId(null)} />}
    </div>
  );
}
