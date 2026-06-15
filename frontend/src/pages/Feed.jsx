import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useUser } from "../context/UserContext";
import {
  getFeed, getAllListings,
  getCommunityListings, getNearbyListings, createCommunityListing,
  buyCommunityListing, suggestPrice, getLeaderboard, getNotifications,
  markNotificationsRead
} from "../api/client";

const CATEGORIES = ["Electronics","Laptops","Mobiles","Clothing","Furniture","Appliances","Books","Sports","Toys","Other"];
const CONDITIONS = [
  { value: "like_new", label: "Like New", color: "bg-green-100 text-green-700" },
  { value: "good", label: "Good", color: "bg-blue-100 text-blue-700" },
  { value: "fair", label: "Fair", color: "bg-yellow-100 text-yellow-700" },
  { value: "poor", label: "Poor", color: "bg-red-100 text-red-700" },
];

function ConditionBadge({ condition }) {
  const c = CONDITIONS.find(x => x.value === condition) || CONDITIONS[1];
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${c.color}`}>{c.label}</span>;
}

function StarRating({ score }) {
  const full = Math.floor(score);
  return (
    <span className="text-[12px] text-amber-500">
      {"★".repeat(full)}{"☆".repeat(5 - full)}
      <span className="text-amazon-text-secondary ml-1">({score.toFixed(1)})</span>
    </span>
  );
}

export default function Feed() {
  const { currentUser } = useUser();
  const [tab, setTab] = useState("certified_matched");
  
  // Second Life Data
  const [matched, setMatched] = useState([]);
  const [allCertified, setAllCertified] = useState([]);
  
  // Community Data
  const [communityNearby, setCommunityNearby] = useState([]);
  const [communityAll, setCommunityAll] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [notifications, setNotifications] = useState([]);
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [buying, setBuying] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAllData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [m, a, cNearby, cAll] = await Promise.all([
        getFeed(currentUser.id),
        getAllListings(),
        getNearbyListings(currentUser.id),
        getCommunityListings(currentUser.id)
      ]);
      setMatched(m);
      setAllCertified(a);
      setCommunityNearby(cNearby);
      setCommunityAll(cAll);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (tab !== "leaderboard") fetchAllData();
    else setLoading(false);
  }, [currentUser]); // Fetch everything on load

  useEffect(() => {
    if (tab === "leaderboard") {
      setLoading(true);
      getLeaderboard().then(setLeaderboard).catch(console.error).finally(() => setLoading(false));
    }
  }, [tab]);

  useEffect(() => {
    if (!currentUser) return;
    getNotifications(currentUser.id).then(setNotifications).catch(console.error);
  }, [currentUser]);

  const handleBuyCommunity = async (listingId) => {
    if (!currentUser) return;
    setBuying(listingId);
    try {
      await buyCommunityListing(listingId, currentUser.id);
      showToast("🎉 Purchase successful! Green Credits awarded.");
      fetchAllData();
    } catch(e) { showToast(e.message, "error"); }
    finally { setBuying(null); }
  };

  const whyMatch = (listing) => {
    if (!currentUser || !listing.product) return "";
    const reasons = [];
    const prod = listing.product;
    if (currentUser.sizes && prod.size) {
      const vals = currentUser.sizes.split(",").map(s => s.split(":")[1]?.trim().toLowerCase());
      if (vals.includes(prod.size?.toLowerCase())) reasons.push("Your size");
    }
    if (currentUser.budget_min != null && currentUser.budget_max != null) {
      if (listing.price >= currentUser.budget_min && listing.price <= currentUser.budget_max) reasons.push("Within budget");
    }
    if (currentUser.interests && prod.category) {
      const ints = currentUser.interests.split(",").map(i => i.trim().toLowerCase());
      if (ints.includes(prod.category.toLowerCase())) reasons.push(`"${prod.category}" interest`);
    }
    if (currentUser.brand_prefs && prod.brand) {
      const prefs = currentUser.brand_prefs.split(",").map(b => b.trim().toLowerCase());
      if (prefs.includes(prod.brand.toLowerCase())) reasons.push(`${prod.brand} fan`);
    }
    return reasons.join(" · ") || "Based on your profile";
  };

  const unread = notifications.filter(n => !n.is_read).length;

  return (
    <div className="bg-amazon-bg min-h-screen animate-fade-in">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-[#0f2027] via-[#203a43] to-[#2c5364]">
        <div className="max-w-[1500px] mx-auto px-4 py-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[#00e5a0] text-[13px] font-semibold uppercase tracking-widest mb-2">♻️ Circular Commerce</p>
              <h1 className="text-[32px] md:text-[40px] font-bold text-white leading-tight mb-2">
                Give Items a Second Life.<br/>
                <span className="text-[#00e5a0]">Save the Planet.</span>
              </h1>
              <p className="text-[#aaa] text-[14px] max-w-lg mb-5">
                Shop Amazon Certified Pre-Owned items or buy directly from your community.
                Earn Green Credits and keep e-waste out of landfills.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="bg-[#00e5a0] hover:bg-[#00c98a] text-[#0f2027] font-bold px-6 py-2.5 rounded-md text-[14px] transition-colors"
              >
                + Post a Community Listing
              </button>
            </div>
            {/* Notification Bell */}
            <div className="relative mt-2">
              <button
                onClick={async () => {
                  setShowNotifs(!showNotifs);
                  if (!showNotifs && currentUser && unread > 0) {
                    await markNotificationsRead(currentUser.id);
                    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
                  }
                }}
                className="relative bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-colors"
              >
                🔔
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {unread}
                  </span>
                )}
              </button>
              {showNotifs && (
                <div className="absolute right-0 top-14 w-80 bg-white rounded-lg shadow-xl border border-amazon-border z-50 max-h-80 overflow-y-auto">
                  <p className="font-bold text-[13px] px-4 py-3 border-b">Notifications</p>
                  {notifications.length === 0 ? (
                    <p className="text-[13px] text-amazon-text-secondary px-4 py-4">No notifications yet.</p>
                  ) : notifications.map(n => (
                    <div key={n.id} className={`px-4 py-3 border-b text-[13px] ${!n.is_read ? "bg-[#f0fff8]" : ""}`}>
                      {n.message}
                      <p className="text-[11px] text-amazon-text-secondary mt-0.5">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            {[
              { label: "Community E-waste Saved", val: `${communityAll.reduce((s,l) => s + (l.ewaste_kg_saved||0), 0).toFixed(1)} kg`, icon: "🌍" },
              { label: "Certified Listings", val: allCertified.length, icon: "✅" },
              { label: "Near You", val: communityNearby.filter(l => l.is_local).length, icon: "📍" },
            ].map(s => (
              <div key={s.label} className="bg-white/10 backdrop-blur rounded-lg p-4 text-center">
                <p className="text-2xl mb-1">{s.icon}</p>
                <p className="text-white font-bold text-[20px]">{s.val}</p>
                <p className="text-[#aaa] text-[12px]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1500px] mx-auto px-4 py-4">
        {/* Tabs */}
        <div className="flex gap-0 border-b border-amazon-border mb-4 bg-white px-4 rounded-t-lg overflow-x-auto">
          {[
            { id: "certified_matched", label: "✨ Recommended for You" },
            { id: "certified_all", label: "✅ Amazon Certified" },
            { id: "community_nearby", label: "📍 Community: Near You" },
            { id: "community_all", label: "🌍 Community: All" },
            { id: "leaderboard", label: "🏆 Leaderboard" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`text-[14px] px-5 py-3 border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id ? "border-amazon-orange text-amazon-text font-bold" : "border-transparent text-amazon-text-secondary hover:text-amazon-text"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Leaderboard */}
        {tab === "leaderboard" && (
          <div className="bg-white border border-amazon-border rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b bg-gradient-to-r from-[#0f2027] to-[#203a43]">
              <h2 className="text-white font-bold text-[18px]">🏆 Circular Commerce Leaderboard</h2>
              <p className="text-[#aaa] text-[13px]">Top users ranked by e-waste prevented</p>
            </div>
            {leaderboard.length === 0 ? (
              <p className="text-center py-8 text-amazon-text-secondary text-[14px]">No sales yet. Be the first!</p>
            ) : leaderboard.map((u, i) => (
              <div key={u.user_id} className={`flex items-center gap-4 px-6 py-4 border-b last:border-0 ${i < 3 ? "bg-[#fffbf0]" : ""}`}>
                <span className="text-[22px] w-8 text-center font-bold">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                </span>
                <div className="flex-1">
                  <p className="font-semibold text-[14px]">{u.name}</p>
                  <p className="text-[12px] text-amazon-text-secondary">{u.level} {u.city ? `· ${u.city}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[#00a86b] text-[14px]">{u.ewaste_kg_saved.toFixed(1)} kg saved</p>
                  <p className="text-[12px] text-amazon-text-secondary">{u.listings_sold} sold · {u.green_credits} credits</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Listings Grid */}
        {tab !== "leaderboard" && (
          loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-white border border-amazon-border rounded-lg h-[380px] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              
              {/* CERTIFIED SECOND LIFE LISTINGS */}
              {(tab === "certified_matched" || tab === "certified_all") && (
                (tab === "certified_matched" ? matched : allCertified).length === 0 ? (
                  <div className="col-span-full bg-white border border-amazon-border rounded-lg p-12 text-center">
                    <p className="text-[16px] text-amazon-text mb-2">
                      {tab === "certified_matched"
                        ? "No items matched to your profile yet."
                        : "No certified pre-owned listings available."}
                    </p>
                  </div>
                ) : (
                  (tab === "certified_matched" ? matched : allCertified).map(listing => (
                    <Link
                      key={`cert-${listing.id}`}
                      to={`/listings/${listing.id}`}
                      className="bg-white border border-amazon-border rounded-lg overflow-hidden hover:shadow-md transition-shadow flex flex-col h-[380px]"
                    >
                      {listing.product && (
                        <div className="relative">
                          <div className="flex items-center justify-center h-[160px] p-3 bg-white border-b border-[#f0f0f0]">
                            <img
                              src={listing.product.image_url || "https://via.placeholder.com/300"}
                              alt={listing.product.name}
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                          {/* Badges */}
                          <div className="absolute top-2 left-2 flex flex-col gap-1">
                            <span className="badge-choice text-[11px]">Certified Pre-Owned</span>
                            {listing.return_item && (
                              <span className="bg-white border border-amazon-border text-[10px] text-amazon-text px-1.5 py-0.5 rounded shadow-sm font-bold">
                                {listing.return_item.condition_score}% condition
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      
                      <div className="p-3 flex flex-col flex-1">
                        <p className="text-[13px] text-amazon-link leading-snug line-clamp-2 hover:text-amazon-link-hover">
                          {listing.product?.name}
                        </p>
                        <p className="text-[11px] text-amazon-text-secondary mt-0.5">
                          {listing.product?.brand} · {listing.product?.category}
                        </p>

                        {/* Price */}
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-[18px] text-amazon-text">
                            <span className="text-[12px] align-top relative top-[2px]">₹</span>
                            {Math.floor(listing.price).toLocaleString("en-IN")}
                          </span>
                          {listing.product && (
                            <span className="text-[12px] text-amazon-text-secondary line-through">
                              ₹{Math.floor(listing.product.price).toLocaleString("en-IN")}
                            </span>
                          )}
                        </div>

                        {listing.product && (
                          <p className="text-[12px] text-amazon-red font-bold mt-0.5">
                            {Math.round((1 - listing.price / listing.product.price) * 100)}% off
                          </p>
                        )}

                        {/* Why matched */}
                        {tab === "certified_matched" && (
                          <div className="mt-2 bg-[#f0f9f4] border border-[#d4edda] rounded px-2 py-1 text-[11px] text-[#067d62] line-clamp-2">
                            <b>Match:</b> {whyMatch(listing)}
                          </div>
                        )}

                        <div className="mt-auto pt-2">
                          <p className="text-[12px] text-amazon-text-secondary">
                            FREE delivery by <b className="text-amazon-text">Tomorrow</b>
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))
                )
              )}

              {/* COMMUNITY LISTINGS */}
              {(tab === "community_nearby" || tab === "community_all") && (
                (tab === "community_nearby" ? communityNearby : communityAll).length === 0 ? (
                  <div className="col-span-full bg-white border border-amazon-border rounded-lg p-12 text-center">
                    <p className="text-[48px] mb-3">📦</p>
                    <p className="text-[16px] font-semibold mb-1">No community listings {tab === "community_nearby" ? "near you" : "yet"}</p>
                    <p className="text-[13px] text-amazon-text-secondary mb-4">
                      {tab === "community_nearby" ? "Make sure your pincode is set in your profile." : "Be the first to post!"}
                    </p>
                    <button onClick={() => setShowModal(true)} className="btn-amazon-primary text-[13px] px-5 py-2">
                      Post a Listing
                    </button>
                  </div>
                ) : (
                  (tab === "community_nearby" ? communityNearby : communityAll).map(listing => (
                    <div key={`comm-${listing.id}`} className="bg-white border border-amazon-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-[380px]">
                      {/* Image */}
                      <div className="h-[160px] bg-[#f5f5f5] flex items-center justify-center relative border-b border-[#f0f0f0]">
                        {listing.image_urls ? (
                          <img
                            src={`https://${import.meta.env.VITE_S3_BUCKET || "fluxforge-returns"}.s3.us-east-1.amazonaws.com/${listing.image_urls.split(",")[0]}`}
                            alt={listing.title}
                            className="max-h-full max-w-full object-contain"
                            onError={e => { e.target.style.display = "none"; }}
                          />
                        ) : (
                          <span className="text-[48px]">
                            {listing.category === "Laptops" ? "💻" : listing.category === "Mobiles" ? "📱" : listing.category === "Clothing" ? "👕" : listing.category === "Electronics" ? "🖥️" : "📦"}
                          </span>
                        )}
                        {/* Badges */}
                        <div className="absolute top-2 left-2 flex flex-col gap-1">
                          {listing.is_local && (
                            <span className="bg-[#00a86b] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">📍 Near You</span>
                          )}
                          {listing.allows_local_pickup && (
                            <span className="bg-[#232f3e] text-white text-[10px] px-2 py-0.5 rounded-full">🚶 Pickup</span>
                          )}
                        </div>
                      </div>

                      <div className="p-3 flex flex-col flex-1">
                        <p className="text-[13px] font-semibold text-amazon-text line-clamp-2 mb-1">{listing.title}</p>
                        {listing.brand && <p className="text-[11px] text-amazon-text-secondary mb-1">{listing.brand} · {listing.category}</p>}

                        <div className="flex items-center gap-2 mb-2">
                          <ConditionBadge condition={listing.condition} />
                        </div>

                        {/* E-waste badge */}
                        <div className="bg-[#f0fff8] border border-[#00a86b]/20 rounded px-2 py-1 mb-2 text-[11px] text-[#00a86b] font-medium">
                          🌍 Saves {listing.ewaste_kg_saved.toFixed(1)} kg e-waste
                        </div>

                        {/* AI condition summary */}
                        {listing.ai_condition_summary && (
                          <p className="text-[11px] text-amazon-text-secondary mb-2 italic line-clamp-2">"{listing.ai_condition_summary}"</p>
                        )}

                        <div className="mt-auto">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-[18px] font-bold text-amazon-text">
                              <span className="text-[12px] align-top relative top-[2px]">₹</span>
                              {Math.floor(listing.asking_price).toLocaleString("en-IN")}
                            </span>
                            {listing.suggested_price && listing.suggested_price !== listing.asking_price && (
                              <span className="text-[10px] text-amazon-text-secondary">AI: ₹{Math.floor(listing.suggested_price).toLocaleString("en-IN")}</span>
                            )}
                          </div>

                          {/* Seller info */}
                          {listing.seller && (
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[11px] text-amazon-text-secondary">by {listing.seller.name}</p>
                              <StarRating score={listing.seller_trust_score || 1} />
                            </div>
                          )}

                          {listing.status === "active" && currentUser && listing.seller_id !== currentUser.id ? (
                            <button
                              onClick={() => handleBuyCommunity(listing.id)}
                              disabled={buying === listing.id}
                              className="w-full bg-amazon-orange hover:bg-amazon-orange-hover text-amazon-text font-bold text-[12px] py-1.5 rounded transition-colors"
                            >
                              {buying === listing.id ? "Processing…" : "Buy Now"}
                            </button>
                          ) : listing.status === "sold" ? (
                            <span className="block w-full text-center text-[12px] text-amazon-text-secondary bg-[#f0f2f2] py-1.5 rounded">Sold</span>
                          ) : listing.seller_id === currentUser?.id ? (
                            <span className="block w-full text-center text-[12px] text-[#00a86b] bg-[#f0fff8] py-1.5 rounded font-semibold">Your Listing</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                )
              )}

            </div>
          )
        )}
      </div>

      {/* Post Listing Modal */}
      {showModal && <PostModal currentUser={currentUser} onClose={() => setShowModal(false)} onSuccess={() => { setShowModal(false); fetchAllData(); showToast("✅ Listing posted! +5 Green Credits earned."); }} />}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-xl text-white text-[14px] font-medium z-50 transition-all ${toast.type === "error" ? "bg-red-600" : "bg-[#00a86b]"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function PostModal({ currentUser, onClose, onSuccess }) {
  const [form, setForm] = useState({
    title: "", category: "Electronics", brand: "", condition: "good",
    asking_price: "", description: "", city: currentUser?.city || "", pincode: currentUser?.pincode || "",
    allows_local_pickup: false,
  });
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleAiSuggest = async () => {
    if (!form.category || !form.condition) return;
    setSuggesting(true);
    try {
      const res = await suggestPrice({
        category: form.category, brand: form.brand || null,
        condition: form.condition, description: form.description || null,
        original_price: form.asking_price ? parseFloat(form.asking_price) : null,
      });
      setAiSuggestion(res);
      if (!form.asking_price) set("asking_price", String(Math.round(res.suggested_price)));
    } catch(e) { console.error(e); }
    finally { setSuggesting(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    setSubmitting(true);
    try {
      const listing = await createCommunityListing({
        seller_id: currentUser.id,
        title: form.title, category: form.category, brand: form.brand || null,
        condition: form.condition, asking_price: parseFloat(form.asking_price),
        description: form.description || null, city: form.city || null,
        pincode: form.pincode || null, allows_local_pickup: form.allows_local_pickup,
      });
      if (imageFile && listing?.id) {
        const fd = new FormData();
        fd.append("image", imageFile);
        await fetch(`http://localhost:8000/api/community/listings/${listing.id}/image`, { method: "POST", body: fd });
      }
      onSuccess();
    } catch(e) { console.error(e); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-[#0f2027] to-[#2c5364] px-6 py-4 rounded-t-xl flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-[18px]">Post a Listing</h2>
            <p className="text-[#aaa] text-[12px]">Earn +5 Green Credits just for posting!</p>
          </div>
          <button onClick={onClose} className="text-white text-[22px] hover:opacity-70">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-amazon-text mb-1">Title *</label>
            <input required value={form.title} onChange={e => set("title", e.target.value)}
              placeholder="e.g. Dell XPS 15 Laptop, barely used"
              className="w-full border border-amazon-border rounded px-3 py-2 text-[13px] focus:outline-none focus:border-amazon-orange" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold mb-1">Category *</label>
              <select value={form.category} onChange={e => set("category", e.target.value)}
                className="w-full border border-amazon-border rounded px-3 py-2 text-[13px] focus:outline-none focus:border-amazon-orange">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold mb-1">Condition *</label>
              <select value={form.condition} onChange={e => set("condition", e.target.value)}
                className="w-full border border-amazon-border rounded px-3 py-2 text-[13px] focus:outline-none focus:border-amazon-orange">
                {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-semibold mb-1">Brand</label>
            <input value={form.brand} onChange={e => set("brand", e.target.value)}
              placeholder="Dell, Apple, Samsung…"
              className="w-full border border-amazon-border rounded px-3 py-2 text-[13px] focus:outline-none focus:border-amazon-orange" />
          </div>
          <div>
            <label className="block text-[12px] font-semibold mb-1">Description</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)}
              rows={3} placeholder="Describe the item's condition, what's included, reason for selling…"
              className="w-full border border-amazon-border rounded px-3 py-2 text-[13px] focus:outline-none focus:border-amazon-orange resize-none" />
          </div>
          {/* AI Price Suggestion */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[12px] font-semibold">Asking Price (₹) *</label>
              <button type="button" onClick={handleAiSuggest} disabled={suggesting}
                className="text-[11px] text-amazon-link hover:underline flex items-center gap-1">
                {suggesting ? "⏳ Getting AI price…" : "✨ Get AI Price Suggestion"}
              </button>
            </div>
            {aiSuggestion && (
              <div className="bg-[#f0fff8] border border-[#00a86b]/30 rounded p-3 mb-2 text-[12px]">
                <p className="font-bold text-[#00a86b] mb-0.5">
                  AI Suggests: ₹{Math.floor(aiSuggestion.suggested_price).toLocaleString("en-IN")}
                  <span className="font-normal text-amazon-text-secondary ml-2">
                    (₹{Math.floor(aiSuggestion.price_range_low).toLocaleString("en-IN")} – ₹{Math.floor(aiSuggestion.price_range_high).toLocaleString("en-IN")})
                  </span>
                </p>
                <p className="text-amazon-text-secondary">{aiSuggestion.reasoning}</p>
                <button type="button" onClick={() => set("asking_price", String(Math.round(aiSuggestion.suggested_price)))}
                  className="mt-1 text-amazon-link text-[11px] hover:underline">Use suggested price</button>
              </div>
            )}
            <input required type="number" min="1" value={form.asking_price} onChange={e => set("asking_price", e.target.value)}
              placeholder="Enter price in ₹"
              className="w-full border border-amazon-border rounded px-3 py-2 text-[13px] focus:outline-none focus:border-amazon-orange" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold mb-1">City</label>
              <input value={form.city} onChange={e => set("city", e.target.value)}
                placeholder="Mumbai"
                className="w-full border border-amazon-border rounded px-3 py-2 text-[13px] focus:outline-none focus:border-amazon-orange" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold mb-1">Pincode</label>
              <input value={form.pincode} onChange={e => set("pincode", e.target.value)}
                placeholder="400001"
                className="w-full border border-amazon-border rounded px-3 py-2 text-[13px] focus:outline-none focus:border-amazon-orange" />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-semibold mb-1">Photo</label>
            <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files[0])}
              className="w-full text-[13px] border border-amazon-border rounded px-3 py-2" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.allows_local_pickup} onChange={e => set("allows_local_pickup", e.target.checked)}
              className="w-4 h-4 accent-amazon-orange" />
            <div>
              <p className="text-[13px] font-semibold">Allow Local Pickup</p>
              <p className="text-[11px] text-amazon-text-secondary">+15 bonus credits for both buyer and seller 🌱</p>
            </div>
          </label>
          <button type="submit" disabled={submitting}
            className="w-full bg-amazon-orange hover:bg-amazon-orange-hover text-amazon-text font-bold py-2.5 rounded transition-colors text-[14px]">
            {submitting ? "Posting…" : "Post Listing & Earn Credits"}
          </button>
        </form>
      </div>
    </div>
  );
}
