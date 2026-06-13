import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { getListing, purchaseListing } from "../api/client";
import { useUser } from "../context/UserContext";

export default function ListingDetail() {
  const { id } = useParams();
  const { currentUser, refreshUser } = useUser();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [purchased, setPurchased] = useState(null);

  useEffect(() => {
    setLoading(true);
    getListing(id).then(setListing).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const handlePurchase = async () => {
    if (!currentUser || !listing) return;
    setPurchasing(true);
    try {
      const res = await purchaseListing(listing.id, currentUser.id);
      setPurchased(res);
      refreshUser();
    } catch (err) { alert(err.message); }
    setPurchasing(false);
  };

  if (loading) return (
    <div className="bg-white min-h-screen">
      <div className="max-w-[1100px] mx-auto px-4 py-6">
        <div className="h-[500px] bg-[#fafafa] animate-pulse rounded-lg" />
      </div>
    </div>
  );
  if (!listing) return <div className="text-center py-16 text-amazon-text-secondary">Listing not found.</div>;

  const ret = listing.return_item;
  const prod = listing.product;
  const discount = prod ? Math.round((1 - listing.price / prod.price) * 100) : 0;

  return (
    <div className="bg-white min-h-screen animate-fade-in">
      <div className="max-w-[1100px] mx-auto px-4 py-4">
        {/* Breadcrumb */}
        <div className="text-[12px] text-amazon-text-secondary mb-3">
          <Link to="/feed" className="text-amazon-link hover:underline">Second Life</Link>
          <span className="mx-1">›</span>
          <span>Trust & Transparency Report</span>
        </div>

        <div className="grid md:grid-cols-[380px_1fr_260px] gap-6">
          {/* Image */}
          {prod && (
            <div className="border border-amazon-border rounded p-4 flex items-center justify-center bg-white self-start">
              <img src={prod.image_url || "https://via.placeholder.com/400"} alt={prod.name}
                className="max-h-[350px] max-w-full object-contain" />
            </div>
          )}

          {/* Trust Report */}
          <div>
            {/* Product name */}
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
                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-amazon-border rounded p-3">
                      <p className="text-[11px] text-amazon-text-secondary uppercase font-bold">Condition Score</p>
                      <div className="flex items-end gap-1 mt-1">
                        <span className="text-[28px] font-bold text-amazon-text leading-none">{ret.condition_score}</span>
                        <span className="text-[13px] text-amazon-text-secondary mb-0.5">/100</span>
                      </div>
                      <div className="h-[5px] bg-[#e8e8e8] rounded-full mt-2 overflow-hidden">
                        <div className={`h-full rounded-full ${ret.condition_score >= 80 ? "bg-[#067d62]" : ret.condition_score >= 60 ? "bg-amazon-orange" : "bg-amazon-red"}`}
                          style={{ width: `${ret.condition_score}%` }} />
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

                  {/* Certification */}
                  <div className="flex items-center gap-2 border border-[#d4edda] bg-[#f0f9f4] rounded p-3">
                    <span className="text-[20px]">✅</span>
                    <div>
                      <p className="text-[13px] font-bold text-[#067d62]">Amazon Certified</p>
                      <p className="text-[11px] text-amazon-text-secondary">Inspected and verified by AI quality assessment</p>
                    </div>
                  </div>

                  {/* Wear Analysis */}
                  {ret.defects && (
                    <div className="border border-amazon-border rounded p-3">
                      <p className="text-[11px] text-amazon-text-secondary uppercase font-bold mb-1">Wear Analysis</p>
                      <p className="text-[13px] text-amazon-text">{ret.defects}</p>
                    </div>
                  )}

                  {/* Action */}
                  <div className="border border-amazon-border rounded p-3 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-amazon-text-secondary uppercase font-bold">Classification</p>
                      <span className="text-[12px] font-bold text-[#067d62] bg-[#f0f9f4] px-2 py-0.5 rounded mt-1 inline-block">
                        {ret.recommended_action?.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-[11px] text-amazon-text-secondary uppercase font-bold">Assessment Status</p>
                      <span className="text-[12px] font-bold text-amazon-text mt-1 inline-block">{ret.status?.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Buy Box */}
          <div className="border border-amazon-border rounded-lg p-4 self-start bg-white">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-[13px] text-amazon-red font-bold">-{discount}%</span>
              <span className="text-[28px] text-amazon-text">
                <span className="text-[13px] align-top relative top-[4px]">₹</span>
                {Math.floor(listing.price).toLocaleString("en-IN")}
              </span>
            </div>
            {prod && (
              <p className="text-[12px] text-amazon-text-secondary mb-2">
                M.R.P.: <span className="line-through">₹{Math.floor(prod.price).toLocaleString("en-IN")}</span>
              </p>
            )}
            <p className="text-[14px] text-amazon-text mb-1">
              FREE delivery <b>Tomorrow</b>
            </p>
            <p className="text-[14px] text-amazon-success font-bold mb-3">In stock</p>

            {/* Green Credits Incentive */}
            <div className="bg-[#f0f9f4] border border-[#d4edda] rounded p-3 mb-3">
              <p className="text-[12px] text-[#067d62] font-bold">🌱 Earn +20 Green Credits</p>
              <p className="text-[11px] text-amazon-text-secondary">with this Second Life purchase</p>
            </div>

            {purchased ? (
              <div className="border border-[#067d62] rounded-lg p-3 bg-[#f0f9f4] text-center">
                <p className="text-[14px] text-[#067d62] font-bold">✓ Purchase successful!</p>
                <p className="text-[12px] text-amazon-text-secondary mt-1">
                  +{purchased.green_credits_earned} green credits earned
                </p>
                <p className="text-[12px] text-amazon-text mt-1">
                  New balance: <b>{purchased.new_balance}</b>
                </p>
              </div>
            ) : listing.status === "sold" ? (
              <div className="bg-[#f0f2f2] rounded-lg p-3 text-center">
                <p className="text-[14px] text-amazon-text-secondary font-bold">Currently unavailable</p>
              </div>
            ) : (
              <div className="space-y-2">
                <button onClick={handlePurchase} disabled={purchasing}
                  className="w-full btn-amazon-primary py-2 text-[13px] disabled:opacity-50">
                  {purchasing ? "Processing..." : "Add to Cart"}
                </button>
                <button onClick={handlePurchase} disabled={purchasing}
                  className="w-full btn-amazon-orange py-2 text-[13px] disabled:opacity-50">
                  {purchasing ? "..." : "Buy Now"}
                </button>
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
