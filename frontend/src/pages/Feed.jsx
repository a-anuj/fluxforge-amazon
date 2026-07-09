import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import {
  getFeed, getAllListings,
  getCommunityListings, getNearbyListings,
  buyCommunityListing, getLeaderboard, getNotifications,
  markNotificationsRead,
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
  const navigate    = useNavigate();
  const { currentUser } = useUser();
  const [tab, setTab] = useState("all");
  
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
      showToast("Purchase successful! Green Credits awarded.");
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
              <h1 className="text-[32px] md:text-[40px] font-bold text-white leading-tight mb-2">
                Give Items a Second Life.<br/>
                <span className="text-[#00e5a0]">Save the Planet.</span>
              </h1>
              <p className="text-[#aaa] text-[14px] max-w-lg mb-5">
                Shop Amazon Certified Pre-Owned items or buy directly from your community.
                Earn Green Credits and keep e-waste out of landfills.
              </p>
              <button
                onClick={() => navigate("/community/sell")}
                className="bg-[#00e5a0] hover:bg-[#00c98a] text-[#0f2027] font-bold px-6 py-2.5 rounded-md text-[14px] transition-colors"
              >
                + Post a Community Listing
              </button>
            </div>
          </div>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            {[
              { label: "Community E-waste Saved", val: `${communityAll.reduce((s,l) => s + (l.ewaste_kg_saved||0), 0).toFixed(1)} kg`, icon: "" },
              { label: "Amazon Certified Listings", val: allCertified.length, icon: "" },
              { label: "Near You", val: communityNearby.filter(l => l.is_local).length, icon: "" },
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
            { id: "all", label: "All" },
            { id: "community", label: "Community" },
            { id: "leaderboard", label: "Leaderboard" },
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
              <h2 className="text-white font-bold text-[18px]">Circular Commerce Leaderboard</h2>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white border border-amazon-border rounded-lg h-[440px] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              
              {/* SECOND LIFE & COMMUNITY LISTINGS */}
              {(tab === "all" || tab === "community") && (
                (tab === "all" && allCertified.length === 0 && communityAll.length === 0) ||
                (tab === "community" && communityAll.length === 0) ? (
                  <div className="col-span-full bg-white border border-amazon-border rounded-lg p-12 text-center">
                    <p className="text-[48px] mb-3"></p>
                    <p className="text-[16px] font-semibold mb-1">No listings available</p>
                    <button onClick={() => navigate("/community/sell")} className="btn-amazon-primary text-[13px] px-5 py-2 mt-4">
                      Post a Listing
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Render Amazon Certified (Second Life) only in 'all' */}
                    {tab === "all" && allCertified.map(listing => (
                      <Link
                        key={`cert-${listing.id}`}
                        to={`/listings/${listing.id}`}
                        className="bg-white border border-amazon-border rounded-lg overflow-hidden hover:shadow-md transition-shadow flex flex-col h-full"
                      >
                        {listing.product && (
                          <div className="relative">
                            <div className="flex items-center justify-center h-[220px] p-4 bg-white border-b border-[#f0f0f0]">
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
                          <p className="text-[14px] font-medium text-amazon-link leading-snug line-clamp-2 hover:text-amazon-link-hover">
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

                          <div className="mt-auto pt-2">
                            <p className="text-[12px] text-amazon-text-secondary">
                              FREE delivery by <b className="text-amazon-text">Tomorrow</b>
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}

                    {/* Render Community Listings */}
                    {communityAll.map(listing => (
                      <div key={`comm-${listing.id}`} className="bg-white border border-amazon-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full">
                        {/* Image */}
                        <div className="h-[220px] bg-[#f5f5f5] flex items-center justify-center relative border-b border-[#f0f0f0] p-4">
                          {listing.image_urls ? (
                            <img
                              src={listing.image_urls.startsWith("http") ? listing.image_urls.split(",")[0] : `${import.meta.env.PROD ? "" : `http://${window.location.hostname}:8000`}/api/community/image/${listing.image_urls.split(",")[0]}`}
                              alt={listing.title}
                              className="max-h-full max-w-full object-contain"
                              onError={e => { e.target.style.display = "none"; }}
                            />
                          ) : (
                            <span className="text-[48px]">
                              {listing.category === "Laptops" ? "💻" : listing.category === "Mobiles" ? "📱" : listing.category === "Clothing" ? "👕" : listing.category === "Electronics" ? "🔌" : "📦"}
                            </span>
                          )}
                          {/* Badges */}
                          <div className="absolute top-2 left-2 flex flex-col gap-1">
                            {listing.is_local && (
                              <span className="bg-[#00a86b] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Near You</span>
                            )}
                            {listing.allows_local_pickup && (
                              <span className="bg-[#232f3e] text-white text-[10px] px-2 py-0.5 rounded-full">🚶 Pickup</span>
                            )}
                          </div>
                        </div>

                        <div className="p-3 flex flex-col flex-1">
                          <p className="text-[14px] font-semibold text-amazon-text line-clamp-2 mb-1">{listing.title}</p>
                          {listing.brand && <p className="text-[11px] text-amazon-text-secondary mb-1">{listing.brand} · {listing.category}</p>}

                          <div className="flex items-center gap-2 mb-2">
                            <ConditionBadge condition={listing.condition} />
                          </div>

                          {/* E-waste badge */}
                          <div className="bg-[#f0fff8] border border-[#00a86b]/20 rounded px-2 py-1 mb-2 text-[11px] text-[#00a86b] font-medium">
                            Saves {listing.ewaste_kg_saved.toFixed(1)} kg e-waste
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
                    ))}
                  </>
                )
              )}

            </div>
          )
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-xl text-white text-[14px] font-medium z-50 transition-all ${toast.type === "error" ? "bg-red-600" : "bg-[#00a86b]"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// â”€â”€ Shared AI scanning overlay (reused by both paths) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
