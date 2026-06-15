import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { getListing, purchaseListing, getProductImpact } from "../api/client";
import { useUser } from "../context/UserContext";

export default function ListingDetail() {
  const { id } = useParams();
  const { currentUser, refreshUser, cart, addToCart, removeFromCart, isInCart } = useUser();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [purchased, setPurchased] = useState(null);
  const [impact, setImpact] = useState(null);

  useEffect(() => {
    setLoading(true);
    getListing(id).then(l => {
      setListing(l);
      if (l?.product_id) getProductImpact(l.product_id).then(setImpact).catch(() => { });
    }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const handlePurchase = async () => {
    if (!currentUser || !listing) return;
    setPurchasing(true);
    try {
      const res = await purchaseListing(listing.id, currentUser.id);
      setPurchased(res); refreshUser();
    } catch (err) { alert(err.message); }
    setPurchasing(false);
  };

  if (loading) return <div className="bg-white min-h-screen"><div className="max-w-[1100px] mx-auto px-4 py-6"><div className="h-[500px] bg-[#fafafa] animate-pulse rounded-lg" /></div></div>;
  if (!listing) return <div className="text-center py-16 text-amazon-text-secondary">Listing not found.</div>;

  const ret = listing.return_item;
  const prod = listing.product;
  const discount = prod ? Math.round((1 - listing.price / prod.price) * 100) : 0;
  const circularSavings = impact?.circular_savings;

  return (
    <div className="bg-white min-h-screen animate-fade-in">
      <div className="max-w-[1100px] mx-auto px-4 py-4">
        <div className="text-[12px] text-amazon-text-secondary mb-3">
          <Link to="/feed" className="text-amazon-link hover:underline">Second Life</Link>
          <span className="mx-1">›</span><span>Trust & Transparency Report</span>
        </div>

        <div className="grid md:grid-cols-[380px_1fr_260px] gap-6">
          {/* Image */}
          {prod && (
            <div className="border border-amazon-border rounded p-4 flex items-center justify-center bg-white self-start">
              <img src={prod.image_url || "https://via.placeholder.com/400"} alt={prod.name} className="max-h-[350px] max-w-full object-contain" />
            </div>
          )}

          {/* Trust Report + Lifecycle */}
          <div>
            {prod && (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <span className="badge-choice">Certified Pre-Owned</span>
                  <span className="eco-badge">♻ Second Life</span>
                </div>
                <h1 className="text-[24px] text-amazon-text leading-tight font-normal">{prod.name}</h1>
                <p className="text-[14px] text-amazon-link mt-1">{prod.brand} · {prod.category}</p>
              </>
            )}

            {/* Product Lifecycle Visualization */}
            <div className="mt-4 border border-amazon-border rounded-lg overflow-hidden">
              <div className="bg-[#232f3e] px-4 py-3 flex items-center gap-2">
                <span className="text-[18px]">🔄</span>
                <div>
                  <p className="text-white text-[14px] font-bold">Product Lifecycle Journey</p>
                  <p className="text-[11px] text-[#ccc]">Every product deserves a second chance</p>
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  {[
                    { icon: "👤", label: "Original Owner", sub: "Purchased new", active: true },
                    { icon: "📦", label: "Returned", sub: "AI assessed", active: true },
                    { icon: "🔬", label: ret?.recommended_action === "refurbish" ? "Refurbished" : "Verified", sub: `Score: ${ret?.condition_score || "—"}/100`, active: true },
                    { icon: "♻️", label: "Listed", sub: "On Second Life", active: true },
                    { icon: "🎉", label: "You", sub: "New owner", active: purchased ? true : false },
                  ].map((step, i, arr) => (
                    <div key={i} className="flex items-center gap-1 flex-1">
                      <div className={`flex flex-col items-center text-center flex-shrink-0 ${step.active ? "" : "opacity-40"}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[18px] ${step.active ? "bg-[#067d62] text-white" : "bg-[#e8e8e8]"}`}>{step.icon}</div>
                        <p className="text-[10px] font-bold text-amazon-text mt-1 leading-tight">{step.label}</p>
                        <p className="text-[9px] text-amazon-text-secondary">{step.sub}</p>
                      </div>
                      {i < arr.length - 1 && <div className={`flex-1 h-[2px] ${step.active ? "bg-[#067d62]" : "bg-[#e8e8e8]"} mb-6`} />}
                    </div>
                  ))}
                </div>

                {/* Impact stats */}
                {circularSavings && (
                  <div className="mt-4 pt-3 border-t border-amazon-border grid grid-cols-3 gap-3 text-center">
                    <div className="bg-[#f0f9f4] rounded p-2">
                      <p className="text-[16px] font-bold text-[#067d62]">+{prod?.avg_lifespan_months ? (prod.avg_lifespan_months / 12).toFixed(1) : "2.0"} yrs</p>
                      <p className="text-[9px] text-amazon-text-secondary">Life Extended</p>
                    </div>
                    <div className="bg-[#f0f9f4] rounded p-2">
                      <p className="text-[16px] font-bold text-[#067d62]">{circularSavings.co2_saved_kg} kg</p>
                      <p className="text-[9px] text-amazon-text-secondary">CO₂ Saved</p>
                    </div>
                    <div className="bg-[#f0f9f4] rounded p-2">
                      <p className="text-[16px] font-bold text-[#067d62]">{circularSavings.ewaste_prevented_kg} kg</p>
                      <p className="text-[9px] text-amazon-text-secondary">E-Waste Prevented</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Trust & Transparency Report */}
            <div className="mt-4 border border-amazon-border rounded-lg overflow-hidden">
              <div className="bg-[#232f3e] px-4 py-3 flex items-center gap-2">
                <span className="text-[18px]">🛡️</span>
                <div>
                  <p className="text-white text-[14px] font-bold">Trust & Transparency Report</p>
                  <p className="text-[11px] text-[#ccc]">AI-verified condition assessment · Listing #{listing.id}</p>
                </div>
              </div>
              {ret && (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-amazon-border rounded p-3">
                      <p className="text-[11px] text-amazon-text-secondary uppercase font-bold">Condition Score</p>
                      <div className="flex items-end gap-1 mt-1">
                        <span className="text-[28px] font-bold text-amazon-text leading-none">{ret.condition_score}</span>
                        <span className="text-[13px] text-amazon-text-secondary mb-0.5">/100</span>
                      </div>
                      <div className="h-[5px] bg-[#e8e8e8] rounded-full mt-2 overflow-hidden">
                        <div className={`h-full rounded-full ${ret.condition_score >= 80 ? "bg-[#067d62]" : ret.condition_score >= 60 ? "bg-amazon-orange" : "bg-amazon-red"}`} style={{ width: `${ret.condition_score}%` }} />
                      </div>
                    </div>
                    <div className="border border-amazon-border rounded p-3">
                      <p className="text-[11px] text-amazon-text-secondary uppercase font-bold">Remaining Lifespan</p>
                      <div className="flex items-end gap-1 mt-1">
                        <span className="text-[28px] font-bold text-amazon-text leading-none">{ret.remaining_life_pct}</span>
                        <span className="text-[13px] text-amazon-text-secondary mb-0.5">%</span>
                      </div>
                      <div className="h-[5px] bg-[#e8e8e8] rounded-full mt-2 overflow-hidden">
                        <div className="h-full rounded-full bg-[#1a73e8]" style={{ width: `${ret.remaining_life_pct}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border border-[#d4edda] bg-[#f0f9f4] rounded p-3">
                    <span className="text-[20px]">✅</span>
                    <div>
                      <p className="text-[13px] font-bold text-[#067d62]">Amazon Certified</p>
                      <p className="text-[11px] text-amazon-text-secondary">Inspected and verified by AI quality assessment</p>
                    </div>
                  </div>
                  {ret.defects && (
                    <div className="border border-amazon-border rounded p-3">
                      <p className="text-[11px] text-amazon-text-secondary uppercase font-bold mb-1">Wear Analysis</p>
                      <p className="text-[13px] text-amazon-text">{ret.defects}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Buy Box */}
          <div className="border border-amazon-border rounded-lg p-4 self-start bg-white">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-[13px] text-amazon-red font-bold">-{discount}%</span>
              <span className="text-[28px] text-amazon-text"><span className="text-[13px] align-top relative top-[4px]">₹</span>{Math.floor(listing.price).toLocaleString("en-IN")}</span>
            </div>
            {prod && <p className="text-[12px] text-amazon-text-secondary mb-2">M.R.P.: <span className="line-through">₹{Math.floor(prod.price).toLocaleString("en-IN")}</span></p>}
            <p className="text-[14px] text-amazon-text mb-1">FREE delivery <b>Tomorrow</b></p>
            <p className="text-[14px] text-amazon-success font-bold mb-3">In stock</p>

            {/* Dynamic Green Credits */}
            <div className="bg-[#f0f9f4] border border-[#d4edda] rounded p-3 mb-3">
              <p className="text-[12px] text-[#067d62] font-bold">🌱 Earn Green Credits with this purchase</p>
              <p className="text-[11px] text-amazon-text-secondary">Dynamic credits based on product environmental impact</p>
              {circularSavings && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                  <div>✓ Save {circularSavings.co2_saved_kg} kg CO₂</div>
                  <div>✓ Prevent {circularSavings.ewaste_prevented_kg} kg e-waste</div>
                </div>
              )}
            </div>

            {purchased ? (
              <div className="border border-[#067d62] rounded-lg p-3 bg-[#f0f9f4] text-center">
                <p className="text-[14px] text-[#067d62] font-bold">✓ Purchase successful!</p>
                <p className="text-[12px] text-amazon-text-secondary mt-1">+{purchased.green_credits_earned} green credits earned</p>
                <p className="text-[12px] text-amazon-text mt-1">New balance: <b>{purchased.new_balance}</b></p>
                {purchased.level && <p className="text-[11px] text-[#067d62] mt-1">Level: {purchased.level}</p>}
                {purchased.environmental_impact && (
                  <div className="mt-2 pt-2 border-t border-[#d4edda] text-[10px] text-amazon-text-secondary">
                    🌍 You saved {purchased.environmental_impact.co2_saved} kg CO₂, prevented {purchased.environmental_impact.ewaste_prevented} kg e-waste
                  </div>
                )}
              </div>
            ) : listing.status === "sold" ? (
              <div className="bg-[#f0f2f2] rounded-lg p-3 text-center">
                <p className="text-[14px] text-amazon-text-secondary font-bold">Currently unavailable</p>
              </div>
            ) : (
              <div className="space-y-2">
                {listing && isInCart(`listing_${listing.id}`) ? (
                  <button onClick={() => removeFromCart(`listing_${listing.id}`)} disabled={purchasing} className="w-full py-2 text-[13px] border rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 transition-colors bg-[#f0f2f2] text-amazon-text border-amazon-border hover:bg-[#e3e6e6]">Remove from Cart</button>
                ) : (
                  <button onClick={() => addToCart({ ...listing, cartId: `listing_${listing.id}`, cartType: 'listing' })} disabled={purchasing} className="w-full btn-amazon-primary py-2 text-[13px] disabled:opacity-50">Add to Cart</button>
                )}
                <button onClick={handlePurchase} disabled={purchasing} className="w-full btn-amazon-orange py-2 text-[13px] disabled:opacity-50">{purchasing ? "Processing..." : "Buy Now"}</button>
              </div>
            )}

            <div className="mt-3 text-[12px] text-amazon-text-secondary space-y-1">
              <p className="flex justify-between"><span>Ships from</span><span className="text-amazon-text">Amazon</span></p>
              <p className="flex justify-between"><span>Sold by</span><span className="text-amazon-link">Amazon Second Life</span></p>
              <p className="flex justify-between"><span>Condition</span><span className="text-amazon-text">Certified Pre-Owned</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
