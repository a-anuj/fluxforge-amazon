import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getGreenCredits, getOrders, getProduct } from "../api/client";
import { useUser } from "../context/UserContext";

export default function Profile() {
  const { currentUser } = useUser();
  const [credits, setCredits] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    Promise.all([getGreenCredits(currentUser.id), getOrders(currentUser.id)])
      .then(([c, o]) => { setCredits(c); setOrders(o); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentUser]);

  if (!currentUser) return null;

  const sizePairs = currentUser.sizes ? currentUser.sizes.split(",").map(s => { const [k, v] = s.split(":"); return { label: k?.trim(), value: v?.trim() }; }) : [];
  const interests = currentUser.interests ? currentUser.interests.split(",").map(i => i.trim()) : [];
  const brands = currentUser.brand_prefs ? currentUser.brand_prefs.split(",").map(b => b.trim()) : [];

  if (loading) return (
    <div className="bg-white min-h-screen">
      <div className="max-w-[1100px] mx-auto px-4 py-6">
        <div className="h-[400px] bg-[#fafafa] animate-pulse rounded-lg" />
      </div>
    </div>
  );

  return (
    <div className="bg-amazon-bg min-h-screen animate-fade-in">
      {/* Account header */}
      <div className="bg-white border-b border-amazon-border">
        <div className="max-w-[1100px] mx-auto px-4 py-4">
          <div className="text-[12px] text-amazon-text-secondary mb-2">
            <Link to="/" className="text-amazon-link hover:underline">Home</Link>
            <span className="mx-1">›</span>
            <span>Your Account</span>
          </div>
          <h1 className="text-[28px] text-amazon-text font-normal">Your Account</h1>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 py-6 space-y-4">
        {/* Grid of account cards — Amazon "Your Account" style */}
        <div className="grid md:grid-cols-3 gap-4">

          {/* Shopping Twin Card */}
          <div className="bg-white border border-amazon-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-amazon-border">
              <h2 className="text-[16px] font-bold text-amazon-text">Shopping Twin Profile</h2>
              <p className="text-[12px] text-amazon-text-secondary">Your preferences for AI matching</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-[12px] font-bold text-amazon-text mb-1">Name</p>
                <p className="text-[14px] text-amazon-text">{currentUser.name}</p>
              </div>
              <div>
                <p className="text-[12px] font-bold text-amazon-text mb-1">Sizes</p>
                <div className="flex flex-wrap gap-1">
                  {sizePairs.map((s, i) => (
                    <span key={i} className="text-[12px] bg-[#f0f2f2] border border-amazon-border px-2 py-0.5 rounded text-amazon-text">
                      {s.label}: <b>{s.value}</b>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[12px] font-bold text-amazon-text mb-1">Budget Range</p>
                <p className="text-[14px] text-amazon-text">
                  ₹{currentUser.budget_min?.toLocaleString("en-IN")} — ₹{currentUser.budget_max?.toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </div>

          {/* Interests & Brands Card */}
          <div className="bg-white border border-amazon-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-amazon-border">
              <h2 className="text-[16px] font-bold text-amazon-text">Interests & Brands</h2>
              <p className="text-[12px] text-amazon-text-secondary">Used to match you with Second Life items</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-[12px] font-bold text-amazon-text mb-1.5">Interests</p>
                <div className="flex flex-wrap gap-1">
                  {interests.map((int, i) => (
                    <span key={i} className="text-[11px] bg-[#232f3e] text-white px-2 py-0.5 rounded">{int}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[12px] font-bold text-amazon-text mb-1.5">Favourite Brands</p>
                <div className="flex flex-wrap gap-1">
                  {brands.map((b, i) => (
                    <span key={i} className="text-[11px] border border-amazon-border text-amazon-text px-2 py-0.5 rounded">{b}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Green Credits Card */}
          <div className="bg-white border border-amazon-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-amazon-border">
              <h2 className="text-[16px] font-bold text-amazon-text">Green Credits Wallet</h2>
              <p className="text-[12px] text-amazon-text-secondary">Earn credits, reduce waste</p>
            </div>
            <div className="p-4">
              {/* Balance */}
              <div className="bg-[#232f3e] rounded-lg p-4 text-center mb-3">
                <p className="text-[11px] text-[#ccc]">Available Balance</p>
                <p className="text-[36px] font-bold text-amazon-orange leading-tight">{credits?.balance || 0}</p>
                <p className="text-[11px] text-[#ccc]">green credits</p>
              </div>

              {/* Transactions */}
              {credits?.transactions?.length > 0 ? (
                <div>
                  <p className="text-[11px] font-bold text-amazon-text-secondary uppercase mb-1">Transactions</p>
                  {credits.transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between py-1.5 border-b border-[#f0f0f0] text-[13px]">
                      <span className="text-amazon-text">
                        {tx.type === "earned" ? "🌱 Earned" : "🔄 Redeemed"}
                      </span>
                      <span className={`font-bold ${tx.type === "earned" ? "text-[#067d62]" : "text-amazon-red"}`}>
                        {tx.type === "earned" ? "+" : "-"}{tx.amount}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-amazon-text-secondary text-center">
                  No transactions yet
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-white border border-amazon-border rounded-lg overflow-hidden">
          <div className="p-4 border-b border-amazon-border flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-bold text-amazon-text">Order & Return Summary</h2>
              <p className="text-[12px] text-amazon-text-secondary">Your circular commerce activity</p>
            </div>
            <Link to="/orders" className="btn-amazon text-[12px] px-3 py-1">View all orders</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4">
            <div className="p-4 text-center border-r border-amazon-border">
              <p className="text-[28px] font-bold text-amazon-text">{orders.length}</p>
              <p className="text-[12px] text-amazon-text-secondary">Total Orders</p>
            </div>
            <div className="p-4 text-center border-r border-amazon-border">
              <p className="text-[28px] font-bold text-[#067d62]">{orders.filter(o => o.status === "delivered").length}</p>
              <p className="text-[12px] text-amazon-text-secondary">Delivered</p>
            </div>
            <div className="p-4 text-center border-r border-amazon-border">
              <p className="text-[28px] font-bold text-[#c7511f]">{orders.filter(o => o.status === "returned").length}</p>
              <p className="text-[12px] text-amazon-text-secondary">Returned</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-[28px] font-bold text-amazon-orange">{credits?.balance || 0}</p>
              <p className="text-[12px] text-amazon-text-secondary">Green Credits</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-4">
          <Link to="/orders" className="bg-white border border-amazon-border rounded-lg p-4 hover:bg-[#fafafa] transition-colors flex items-center gap-3">
            <span className="text-[24px]">📦</span>
            <div>
              <p className="text-[14px] font-bold text-amazon-text">Your Orders</p>
              <p className="text-[12px] text-amazon-text-secondary">Track, return or buy again</p>
            </div>
          </Link>
          <Link to="/returns/new" className="bg-white border border-amazon-border rounded-lg p-4 hover:bg-[#fafafa] transition-colors flex items-center gap-3">
            <span className="text-[24px]">🔄</span>
            <div>
              <p className="text-[14px] font-bold text-amazon-text">Start a Return</p>
              <p className="text-[12px] text-amazon-text-secondary">AI-powered assessment</p>
            </div>
          </Link>
          <Link to="/feed" className="bg-white border border-amazon-border rounded-lg p-4 hover:bg-[#fafafa] transition-colors flex items-center gap-3">
            <span className="text-[24px]">♻️</span>
            <div>
              <p className="text-[14px] font-bold text-amazon-text">Second Life Feed</p>
              <p className="text-[12px] text-amazon-text-secondary">Items matched for you</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
