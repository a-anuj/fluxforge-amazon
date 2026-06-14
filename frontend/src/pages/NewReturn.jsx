import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getOrders, createReturn } from "../api/client";
import { useUser } from "../context/UserContext";

export default function NewReturn() {
  const { currentUser, refreshUser } = useUser();
  const [searchParams] = useSearchParams();
  const preselectedOrderId = searchParams.get("orderId") || "";
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(preselectedOrderId);
  const [reason, setReason] = useState("size_mismatch");
  const [imageUrls, setImageUrls] = useState(["", ""]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    getOrders(currentUser.id)
      .then((data) => {
        const returnable = data.filter((o) => o.status !== "returned");
        setOrders(returnable);
        // If a preselected order ID came from the URL, ensure it stays selected
        // (it may not be in the returnable list if already returned, so clear it)
        if (preselectedOrderId && !returnable.find((o) => String(o.id) === preselectedOrderId)) {
          setSelectedOrder("");
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setSubmitting(true);
    try {
      const urls = imageUrls.filter((u) => u.trim());
      const res = await createReturn(Number(selectedOrder), urls.length ? urls : ["https://via.placeholder.com/400"]);
      setResult(res);
      refreshUser();
    } catch (err) { alert(err.message); }
    setSubmitting(false);
  };

  const actionMap = {
    resell: { label: "Resell as Certified Pre-Owned", bg: "bg-[#067d62]" },
    refurbish: { label: "Refurbish & Resell", bg: "bg-[#1a73e8]" },
    exchange: { label: "Exchange for New", bg: "bg-[#c7511f]" },
    donate: { label: "Donate to Charity", bg: "bg-[#7b2d8b]" },
    recycle: { label: "Recycle Materials", bg: "bg-amazon-text-secondary" },
  };

  if (result) {
    const action = actionMap[result.recommended_action] || { label: result.recommended_action, bg: "bg-amazon-text-secondary" };
    const impact = result.environmental_impact;
    const advice = result.sustainability_advice;

    return (
      <div className="bg-white min-h-screen animate-fade-in">
        <div className="max-w-[800px] mx-auto px-4 py-6">
          <div className="text-[12px] text-amazon-text-secondary mb-3">
            <Link to="/orders" className="text-amazon-link hover:underline">Your Orders</Link>
            <span className="mx-1">›</span><span>Return Assessment</span>
          </div>
          <h1 className="text-[28px] text-amazon-text font-normal mb-4">AI Assessment Complete</h1>

          <div className="border border-amazon-border rounded-lg overflow-hidden">
            <div className="bg-[#232f3e] px-5 py-4 flex items-center gap-3">
              <span className="text-[28px]">🔬</span>
              <div>
                <p className="text-white font-bold text-[16px]">Circular Intelligence Assessment</p>
                <p className="text-[#ccc] text-[12px]">Return #{result.id} — AI-powered condition analysis</p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-amazon-border rounded-lg p-4">
                  <p className="text-[11px] text-amazon-text-secondary uppercase font-bold mb-1">Condition Score</p>
                  <div className="flex items-end gap-1">
                    <span className="text-[32px] font-bold text-amazon-text leading-none">{result.condition_score}</span>
                    <span className="text-[14px] text-amazon-text-secondary mb-1">/100</span>
                  </div>
                  <div className="h-[6px] bg-[#e8e8e8] rounded-full mt-2 overflow-hidden">
                    <div className={`h-full rounded-full ${result.condition_score >= 80 ? "bg-[#067d62]" : result.condition_score >= 60 ? "bg-amazon-orange" : "bg-amazon-red"}`} style={{ width: `${result.condition_score}%` }} />
                  </div>
                </div>
                <div className="border border-amazon-border rounded-lg p-4">
                  <p className="text-[11px] text-amazon-text-secondary uppercase font-bold mb-1">Remaining Life</p>
                  <div className="flex items-end gap-1">
                    <span className="text-[32px] font-bold text-amazon-text leading-none">{result.remaining_life_pct}</span>
                    <span className="text-[14px] text-amazon-text-secondary mb-1">%</span>
                  </div>
                  <div className="h-[6px] bg-[#e8e8e8] rounded-full mt-2 overflow-hidden">
                    <div className="h-full rounded-full bg-[#1a73e8]" style={{ width: `${result.remaining_life_pct}%` }} />
                  </div>
                </div>
              </div>

              {/* Defects */}
              <div className="border border-amazon-border rounded-lg p-4">
                <p className="text-[11px] text-amazon-text-secondary uppercase font-bold mb-1">Defects Found</p>
                <p className="text-[14px] text-amazon-text">{result.defects || "No defects detected"}</p>
              </div>

              {/* Green Credits Earned */}
              {result.green_credits_earned > 0 && (
                <div className="border-2 border-[#067d62] rounded-lg p-4 bg-[#f0f9f4]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-bold text-[#067d62]">🌱 Green Credits Earned</p>
                      <p className="text-[12px] text-amazon-text-secondary mt-0.5">For choosing the sustainable option</p>
                    </div>
                    <span className="text-[28px] font-bold text-[#067d62]">+{result.green_credits_earned}</span>
                  </div>
                </div>
              )}

              {/* Environmental Impact */}
              {impact && (
                <div className="border border-amazon-border rounded-lg p-4">
                  <p className="text-[11px] text-amazon-text-secondary uppercase font-bold mb-2">Environmental Impact of This Action</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[18px] font-bold text-[#067d62]">{impact.co2_saved}</p>
                      <p className="text-[10px] text-amazon-text-secondary">kg CO₂ saved</p>
                    </div>
                    <div>
                      <p className="text-[18px] font-bold text-[#1a73e8]">{impact.ewaste_prevented}</p>
                      <p className="text-[10px] text-amazon-text-secondary">kg e-waste prevented</p>
                    </div>
                    <div>
                      <p className="text-[18px] font-bold text-[#00BCD4]">{impact.water_saved}</p>
                      <p className="text-[10px] text-amazon-text-secondary">L water saved</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Recommended Action */}
              <div className="border border-amazon-border rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-amazon-text-secondary uppercase font-bold mb-1">Recommended Action</p>
                  <span className={`text-white text-[13px] font-bold px-3 py-1 rounded-sm ${action.bg}`}>{action.label}</span>
                </div>
                {(result.recommended_action === "resell" || result.recommended_action === "refurbish") && result.listing_id && (
                  <div className="text-right">
                    <span className="eco-badge text-[11px]">♻ Second Life listing created</span>
                    <p className="text-[11px] text-amazon-text-secondary mt-1">Matched to your shopping twin</p>
                  </div>
                )}
              </div>

              {/* AI Advisor Suggestions */}
              {advice?.suggestions && advice.suggestions.length > 0 && (
                <div className="border border-amazon-border rounded-lg overflow-hidden">
                  <div className="p-3 bg-[#fafafa] border-b border-amazon-border">
                    <p className="text-[13px] font-bold text-amazon-text flex items-center gap-1">
                      {advice.title} <span className="text-[10px] text-amazon-orange bg-[#fff3e0] px-1.5 rounded font-normal">AI</span>
                    </p>
                    <p className="text-[11px] text-amazon-text-secondary">{advice.message}</p>
                  </div>
                  <div className="divide-y divide-amazon-border">
                    {advice.suggestions.map((s, i) => (
                      <div key={i} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-[13px] font-bold text-amazon-text">{s.title}</p>
                          <p className="text-[11px] text-amazon-text-secondary">{s.message}</p>
                        </div>
                        <span className="text-[13px] font-bold text-amazon-orange flex-shrink-0 ml-3">+{s.credits}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Link to="/orders" className="btn-amazon-primary text-[13px] px-5 py-2">View Orders</Link>
                <Link to="/feed" className="btn-amazon text-[13px] px-5 py-2">Browse Second Life</Link>
                <Link to="/profile" className="btn-amazon text-[13px] px-5 py-2">View Dashboard</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen animate-fade-in">
      <div className="max-w-[800px] mx-auto px-4 py-6">
        <div className="text-[12px] text-amazon-text-secondary mb-3">
          <Link to="/orders" className="text-amazon-link hover:underline">Your Orders</Link>
          <span className="mx-1">›</span><span>Return an Item</span>
        </div>
        <h1 className="text-[28px] text-amazon-text font-normal mb-1">Return an Item</h1>
        <p className="text-[14px] text-amazon-text-secondary mb-5">Our AI will assess the product condition and recommend the best circular action. <span className="text-[#067d62] font-bold">Earn Green Credits for every return!</span></p>

        {loading ? (
          <div className="border border-amazon-border rounded-lg p-8 animate-pulse bg-[#fafafa]" />
        ) : (
          <form onSubmit={handleSubmit} className="border border-amazon-border rounded-lg overflow-hidden">
            <div className="bg-[#f0f2f2] px-4 py-3 border-b border-amazon-border">
              <p className="text-[14px] font-bold text-amazon-text">Step 1: Select order & provide details</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[13px] font-bold text-amazon-text block mb-1">Which order are you returning?</label>
                <select value={selectedOrder} onChange={(e) => setSelectedOrder(e.target.value)} required className="w-full px-3 py-2 border border-[#a6a6a6] rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#e77600] bg-white">
                  <option value="">Select an order</option>
                  {orders.map((o) => (<option key={o.id} value={o.id}>Order #{o.id} — Product #{o.product_id} ({o.status})</option>))}
                </select>
              </div>
              <div>
                <label className="text-[13px] font-bold text-amazon-text block mb-1">Reason for return</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-3 py-2 border border-[#a6a6a6] rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#e77600] bg-white">
                  <option value="size_mismatch">Size doesn't fit</option>
                  <option value="quality">Quality not as expected</option>
                  <option value="wrong_item">Wrong item received</option>
                  <option value="changed_mind">Changed my mind</option>
                  <option value="defective">Product is defective</option>
                </select>
              </div>
              <div>
                <label className="text-[13px] font-bold text-amazon-text block mb-1">Product photos <span className="text-amazon-text-secondary font-normal">(for AI assessment)</span></label>
                {imageUrls.map((url, i) => (
                  <input key={i} type="text" value={url} onChange={(e) => { const u = [...imageUrls]; u[i] = e.target.value; setImageUrls(u); }}
                    placeholder={`Image URL ${i + 1} (optional)`} className="w-full px-3 py-2 border border-[#a6a6a6] rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#e77600] mb-2" />
                ))}
                <button type="button" onClick={() => setImageUrls([...imageUrls, ""])} className="text-[12px] text-amazon-link hover:underline">+ Add another photo</button>
              </div>
              <button type="submit" disabled={submitting || !selectedOrder} className="btn-amazon-primary w-full py-2.5 text-[14px] font-bold disabled:opacity-50">
                {submitting ? "Analyzing with AI..." : "Submit & Get AI Assessment"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
