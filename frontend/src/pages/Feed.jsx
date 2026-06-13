import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getFeed, getAllListings } from "../api/client";
import { useUser } from "../context/UserContext";

export default function Feed() {
  const { currentUser } = useUser();
  const [matched, setMatched] = useState([]);
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("matched");

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    Promise.all([getFeed(currentUser.id), getAllListings()])
      .then(([m, a]) => { setMatched(m); setAll(a); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentUser]);

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

  const listings = tab === "matched" ? matched : all;

  return (
    <div className="bg-amazon-bg min-h-screen animate-fade-in">
      {/* Banner */}
      <div className="bg-[#232f3e]">
        <div className="max-w-[1500px] mx-auto px-4 py-5">
          <div className="flex items-center gap-3">
            <span className="text-[32px]">♻️</span>
            <div>
              <h1 className="text-[24px] text-white font-normal">Amazon Second Life</h1>
              <p className="text-[13px] text-[#ccc]">
                Certified pre-owned items, AI-verified and matched to your preferences
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto px-4 py-4">
        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-amazon-border mb-4 bg-white px-4 rounded-t-lg">
          <button
            onClick={() => setTab("matched")}
            className={`text-[14px] px-4 py-3 border-b-2 transition-colors ${
              tab === "matched"
                ? "border-amazon-orange text-amazon-text font-bold"
                : "border-transparent text-amazon-text-secondary hover:text-amazon-text"
            }`}
          >
            Matched for You
          </button>
          <button
            onClick={() => setTab("all")}
            className={`text-[14px] px-4 py-3 border-b-2 transition-colors ${
              tab === "all"
                ? "border-amazon-orange text-amazon-text font-bold"
                : "border-transparent text-amazon-text-secondary hover:text-amazon-text"
            }`}
          >
            Browse All
          </button>
          <span className="ml-auto text-[12px] text-amazon-text-secondary">
            {listings.length} {listings.length === 1 ? "result" : "results"}
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-amazon-border rounded-lg p-4 h-[360px] animate-pulse">
                <div className="bg-[#f5f5f5] h-[180px] mb-3" />
                <div className="bg-[#f5f5f5] h-4 mb-2 w-3/4" />
                <div className="bg-[#f5f5f5] h-4 mb-2 w-1/2" />
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="bg-white border border-amazon-border rounded-lg p-12 text-center">
            <p className="text-[16px] text-amazon-text mb-2">
              {tab === "matched"
                ? "No items matched to your profile yet."
                : "No second-life listings available."}
            </p>
            <Link to="/" className="text-amazon-link text-[14px] hover:underline">
              Continue shopping ›
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {listings.map((listing) => (
              <Link
                key={listing.id}
                to={`/listings/${listing.id}`}
                className="bg-white border border-amazon-border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
              >
                {listing.product && (
                  <div className="relative">
                    <div className="flex items-center justify-center h-[180px] p-3 bg-white">
                      <img
                        src={listing.product.image_url || "https://via.placeholder.com/300"}
                        alt={listing.product.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    {/* Badges */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      <span className="badge-choice text-[11px]">
                        Certified Pre-Owned
                      </span>
                      {listing.return_item && (
                        <span className="bg-white border border-amazon-border text-[10px] text-amazon-text px-1.5 py-0.5 rounded shadow-sm font-bold">
                          {listing.return_item.condition_score}% condition
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="p-3 border-t border-[#f0f0f0]">
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

                  <p className="text-[12px] text-amazon-text-secondary mt-1">
                    FREE delivery by <b className="text-amazon-text">Tomorrow</b>
                  </p>

                  {/* Why matched */}
                  {tab === "matched" && (
                    <div className="mt-2 bg-[#f0f9f4] border border-[#d4edda] rounded px-2 py-1.5 text-[11px] text-[#067d62]">
                      <b>Why this matches you:</b> {whyMatch(listing)}
                    </div>
                  )}

                  {/* Status */}
                  <span className={`inline-block mt-2 text-[11px] px-1.5 py-0.5 rounded ${
                    listing.status === "matched" ? "bg-[#f0f9f4] text-[#067d62] border border-[#d4edda]"
                    : listing.status === "sold" ? "bg-[#f0f2f2] text-amazon-text-secondary border border-amazon-border"
                    : "bg-[#fff3e0] text-[#c7511f] border border-[#ffe0b2]"
                  }`}>
                    {listing.status === "matched" ? "✓ Matched to you" : listing.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Earn credits callout */}
        <div className="mt-6 bg-white border border-amazon-border rounded-lg p-4 flex items-center gap-4">
          <span className="text-[32px]">🌱</span>
          <div>
            <p className="text-[14px] font-bold text-amazon-text">Earn Green Credits with every Second Life purchase</p>
            <p className="text-[13px] text-amazon-text-secondary">
              Get +20 green credits for each certified pre-owned item you buy. Redeem credits for discounts on future orders.
            </p>
          </div>
          <Link to="/profile" className="btn-amazon-primary text-[12px] px-4 py-1.5 flex-shrink-0">
            View Credits
          </Link>
        </div>
      </div>
    </div>
  );
}
