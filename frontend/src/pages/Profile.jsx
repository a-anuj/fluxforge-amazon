import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getGreenCredits, getImpactStats, getChallenges, getRedemptionOptions, redeemCredits, completeChallenge, getOrders } from "../api/client";
import { useUser } from "../context/UserContext";

const LEVEL_COLORS = {
  "Seed 🌱": "#8B9467",
  "Sapling 🌿": "#4CAF50",
  "Green Hero 🌎": "#2196F3",
  "Planet Protector 🌍": "#9C27B0",
  "Circular Champion ♻️": "#FF9800",
};

function CircularProgress({ value, max, size = 100, stroke = 8, color = "#067d62", label, sublabel }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(value / max, 1);
  const offset = circumference * (1 - pct);
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#e8e8e8" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000 ease-out" />
      </svg>
      <p className="text-[20px] font-bold text-amazon-text -mt-[64px] mb-[28px]">{typeof value === 'number' ? value.toFixed(1) : value}</p>
      <p className="text-[12px] font-bold text-amazon-text mt-1">{label}</p>
      {sublabel && <p className="text-[10px] text-amazon-text-secondary">{sublabel}</p>}
    </div>
  );
}

export default function Profile() {
  const { currentUser, refreshUser, updateUserProfile } = useUser();
  const [credits, setCredits] = useState(null);
  const [impact, setImpact] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [redemptionOptions, setRedemptionOptions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [redeeming, setRedeeming] = useState(null);

  // Edit states
  const [isEditingTwin, setIsEditingTwin] = useState(false);
  const [isEditingInterests, setIsEditingInterests] = useState(false);
  const [twinForm, setTwinForm] = useState({ name: "", sizes: "", budget_min: 0, budget_max: 0 });
  const [interestsForm, setInterestsForm] = useState({ interests: "", brand_prefs: "" });
  const [savingTwin, setSavingTwin] = useState(false);
  const [savingInterests, setSavingInterests] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    Promise.all([
      getGreenCredits(currentUser.id),
      getImpactStats(currentUser.id),
      getChallenges(currentUser.id),
      getRedemptionOptions(),
      getOrders(currentUser.id),
    ])
      .then(([c, i, ch, ro, o]) => { setCredits(c); setImpact(i); setChallenges(ch); setRedemptionOptions(ro); setOrders(o); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      setTwinForm({ name: currentUser.name || "", sizes: currentUser.sizes || "", budget_min: currentUser.budget_min || 0, budget_max: currentUser.budget_max || 0 });
      setInterestsForm({ interests: currentUser.interests || "", brand_prefs: currentUser.brand_prefs || "" });
    }
  }, [currentUser]);

  if (!currentUser) return null;

  const handleRedeem = async (option) => {
    if (currentUser.green_credits < option.credits_required) return alert("Insufficient credits");
    setRedeeming(option.type);
    try {
      await redeemCredits(currentUser.id, option.type, option.credits_required);
      refreshUser();
      const [c, i] = await Promise.all([getGreenCredits(currentUser.id), getImpactStats(currentUser.id)]);
      setCredits(c); setImpact(i);
    } catch (err) { alert(err.message); }
    setRedeeming(null);
  };

  const handleCompleteChallenge = async (challengeId) => {
    try {
      await completeChallenge(currentUser.id, challengeId);
      refreshUser();
      const [c, i, ch] = await Promise.all([getGreenCredits(currentUser.id), getImpactStats(currentUser.id), getChallenges(currentUser.id)]);
      setCredits(c); setImpact(i); setChallenges(ch);
    } catch (err) { alert(err.message); }
  };

  const handleSaveTwin = async (e) => {
    e.preventDefault(); setSavingTwin(true);
    try { await updateUserProfile(currentUser.id, { name: twinForm.name, sizes: twinForm.sizes, budget_min: Number(twinForm.budget_min), budget_max: Number(twinForm.budget_max) }); setIsEditingTwin(false); } catch {}
    setSavingTwin(false);
  };
  const handleSaveInterests = async (e) => {
    e.preventDefault(); setSavingInterests(true);
    try { await updateUserProfile(currentUser.id, { interests: interestsForm.interests, brand_prefs: interestsForm.brand_prefs }); setIsEditingInterests(false); } catch {}
    setSavingInterests(false);
  };

  const levelColor = LEVEL_COLORS[currentUser.level] || "#067d62";
  const activeChallenges = challenges.filter(c => c.status === "active");
  const completedChallenges = challenges.filter(c => c.status === "completed");

  if (loading) return (
    <div className="bg-white min-h-screen"><div className="max-w-[1100px] mx-auto px-4 py-6"><div className="h-[400px] bg-[#fafafa] animate-pulse rounded-lg" /></div></div>
  );

  return (
    <div className="bg-amazon-bg min-h-screen animate-fade-in">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-[#232f3e] to-[#37475a]">
        <div className="max-w-[1100px] mx-auto px-4 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-[12px] text-[#ccc]">Welcome back</p>
              <h1 className="text-[28px] text-white font-bold">{currentUser.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[14px] px-3 py-1 rounded-full font-bold text-white" style={{ backgroundColor: levelColor }}>{currentUser.level}</span>
                {credits && credits.next_level && (
                  <span className="text-[11px] text-[#ccc]">{credits.credits_to_next} credits to {credits.next_level}</span>
                )}
              </div>
            </div>
            <div className="text-center">
              <p className="text-[42px] font-bold text-amazon-orange leading-none">{currentUser.green_credits}</p>
              <p className="text-[12px] text-[#ccc]">Green Credits</p>
              {credits && (
                <div className="mt-2 w-[200px]">
                  <div className="h-[6px] bg-[#4a5568] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${credits.level_progress}%`, backgroundColor: levelColor }} />
                  </div>
                  <p className="text-[10px] text-[#999] mt-1">{credits.level_progress}% to next level</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-amazon-border sticky top-[99px] z-40">
        <div className="max-w-[1100px] mx-auto px-4 flex gap-0">
          {["dashboard", "wallet", "redeem", "profile"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-[13px] border-b-2 capitalize transition-colors ${activeTab === tab ? "border-amazon-orange text-amazon-text font-bold" : "border-transparent text-amazon-text-secondary hover:text-amazon-text"}`}>
              {tab === "redeem" ? "Redeem Credits" : tab}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 py-6 space-y-4">

        {/* ═══ DASHBOARD TAB ═══ */}
        {activeTab === "dashboard" && impact && (
          <>
            {/* Environmental Impact Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white border border-amazon-border rounded-lg p-5 text-center">
                <CircularProgress value={impact.co2_saved} max={100} color="#067d62" label="CO₂ Saved" sublabel="kilograms" />
              </div>
              <div className="bg-white border border-amazon-border rounded-lg p-5 text-center">
                <CircularProgress value={impact.ewaste_prevented} max={20} color="#1a73e8" label="E-Waste Prevented" sublabel="kilograms" />
              </div>
              <div className="bg-white border border-amazon-border rounded-lg p-5 text-center">
                <CircularProgress value={impact.water_saved} max={500} color="#00BCD4" label="Water Saved" sublabel="liters" />
              </div>
            </div>

            {/* Activity Summary */}
            <div className="bg-white border border-amazon-border rounded-lg overflow-hidden">
              <div className="p-4 border-b border-amazon-border bg-[#fafafa]">
                <h2 className="text-[16px] font-bold text-amazon-text">Sustainability Activity</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5">
                {[
                  { val: impact.products_reused, label: "Products Reused", icon: "♻️" },
                  { val: impact.products_repaired, label: "Products Repaired", icon: "🔧" },
                  { val: impact.products_resold, label: "Products Resold", icon: "🔄" },
                  { val: impact.circular_orders, label: "Circular Orders", icon: "🌿" },
                  { val: `${impact.circular_percentage}%`, label: "Circular Rate", icon: "📊" },
                ].map((s, i) => (
                  <div key={i} className="p-4 text-center border-r border-b border-amazon-border last:border-r-0">
                    <span className="text-[24px]">{s.icon}</span>
                    <p className="text-[24px] font-bold text-amazon-text mt-1">{s.val}</p>
                    <p className="text-[11px] text-amazon-text-secondary">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Green Challenges */}
            <div className="bg-white border border-amazon-border rounded-lg overflow-hidden">
              <div className="p-4 border-b border-amazon-border bg-[#fafafa] flex items-center justify-between">
                <div>
                  <h2 className="text-[16px] font-bold text-amazon-text">🎯 Green Challenges</h2>
                  <p className="text-[12px] text-amazon-text-secondary">Complete challenges to earn bonus credits</p>
                </div>
                <span className="text-[12px] text-amazon-text-secondary">{activeChallenges.length} active</span>
              </div>
              <div className="divide-y divide-amazon-border">
                {activeChallenges.map(ch => (
                  <div key={ch.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-[14px] font-bold text-amazon-text">{ch.title}</p>
                      <p className="text-[12px] text-amazon-text-secondary mt-0.5">{ch.description}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-[14px] font-bold text-amazon-orange">+{ch.reward_credits}</span>
                      <p className="text-[10px] text-amazon-text-secondary">credits</p>
                      <button onClick={() => handleCompleteChallenge(ch.id)}
                        className="btn-amazon text-[11px] px-3 py-1 mt-1">Complete</button>
                    </div>
                  </div>
                ))}
                {completedChallenges.length > 0 && (
                  <div className="p-3 bg-[#f0f9f4]">
                    <p className="text-[11px] text-[#067d62] font-bold">✓ {completedChallenges.length} challenge{completedChallenges.length > 1 ? 's' : ''} completed</p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid md:grid-cols-3 gap-4">
              <Link to="/feed" className="bg-white border border-amazon-border rounded-lg p-4 hover:bg-[#fafafa] transition-colors flex items-center gap-3">
                <span className="text-[24px]">♻️</span>
                <div><p className="text-[14px] font-bold text-amazon-text">Second Life Feed</p><p className="text-[12px] text-amazon-text-secondary">Items matched for you</p></div>
              </Link>
              <Link to="/returns/new" className="bg-white border border-amazon-border rounded-lg p-4 hover:bg-[#fafafa] transition-colors flex items-center gap-3">
                <span className="text-[24px]">🔄</span>
                <div><p className="text-[14px] font-bold text-amazon-text">Start a Return</p><p className="text-[12px] text-amazon-text-secondary">AI-powered assessment</p></div>
              </Link>
              <Link to="/orders" className="bg-white border border-amazon-border rounded-lg p-4 hover:bg-[#fafafa] transition-colors flex items-center gap-3">
                <span className="text-[24px]">📦</span>
                <div><p className="text-[14px] font-bold text-amazon-text">Your Orders</p><p className="text-[12px] text-amazon-text-secondary">Track, return or buy again</p></div>
              </Link>
            </div>
          </>
        )}

        {/* ═══ WALLET TAB ═══ */}
        {activeTab === "wallet" && credits && (
          <div className="bg-white border border-amazon-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-amazon-border bg-[#fafafa]">
              <h2 className="text-[16px] font-bold text-amazon-text">Green Credits Wallet</h2>
            </div>
            <div className="p-4">
              <div className="bg-[#232f3e] rounded-lg p-5 flex items-center justify-between mb-4">
                <div>
                  <p className="text-[11px] text-[#ccc]">Available Balance</p>
                  <p className="text-[36px] font-bold text-amazon-orange leading-tight">{credits.balance}</p>
                  <p className="text-[11px] text-[#ccc]">Lifetime: {credits.lifetime_credits} credits earned</p>
                </div>
                <div className="text-right">
                  <span className="text-[14px] px-3 py-1 rounded-full font-bold text-white" style={{ backgroundColor: levelColor }}>{currentUser.level}</span>
                </div>
              </div>
              <p className="text-[13px] font-bold text-amazon-text mb-2">Transaction History</p>
              <div className="divide-y divide-[#f0f0f0]">
                {credits.transactions.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-[13px] text-amazon-text">{tx.description || (tx.type === "earned" ? "Credits Earned" : "Credits Redeemed")}</p>
                      <p className="text-[10px] text-amazon-text-secondary">{tx.action_type} • {tx.created_at ? new Date(tx.created_at).toLocaleDateString("en-IN") : ""}</p>
                    </div>
                    <span className={`font-bold text-[14px] ${tx.type === "earned" ? "text-[#067d62]" : "text-amazon-red"}`}>
                      {tx.type === "earned" ? "+" : "-"}{tx.amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ REDEEM TAB ═══ */}
        {activeTab === "redeem" && (
          <div className="space-y-4">
            <div className="bg-white border border-amazon-border rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="text-[14px] font-bold text-amazon-text">Your Balance</p>
                <p className="text-[28px] font-bold text-amazon-orange">{currentUser.green_credits} <span className="text-[14px] text-amazon-text-secondary font-normal">credits</span></p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {redemptionOptions.map(opt => (
                <div key={opt.type} className="bg-white border border-amazon-border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-[32px]">{opt.icon}</span>
                    <div className="flex-1">
                      <p className="text-[14px] font-bold text-amazon-text">{opt.title}</p>
                      <p className="text-[12px] text-amazon-text-secondary">{opt.description}</p>
                      <p className="text-[13px] font-bold text-amazon-orange mt-2">{opt.credits_required} credits</p>
                    </div>
                  </div>
                  <button onClick={() => handleRedeem(opt)} disabled={redeeming === opt.type || currentUser.green_credits < opt.credits_required}
                    className={`w-full mt-3 py-2 text-[13px] rounded-full font-bold ${currentUser.green_credits >= opt.credits_required ? "btn-amazon-primary" : "bg-[#f0f2f2] text-amazon-text-secondary cursor-not-allowed border border-amazon-border"}`}>
                    {redeeming === opt.type ? "Redeeming..." : currentUser.green_credits >= opt.credits_required ? "Redeem" : "Not enough credits"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ PROFILE TAB ═══ */}
        {activeTab === "profile" && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* Shopping Twin Card */}
            <div className="bg-white border border-amazon-border rounded-lg overflow-hidden">
              <div className="p-4 border-b border-amazon-border flex justify-between items-center bg-[#fafafa]">
                <div><h2 className="text-[16px] font-bold text-amazon-text">Shopping Twin Profile</h2><p className="text-[12px] text-amazon-text-secondary">Your preferences for AI matching</p></div>
                {!isEditingTwin && <button onClick={() => setIsEditingTwin(true)} className="text-[12px] text-amazon-link hover:underline font-semibold">Edit</button>}
              </div>
              {isEditingTwin ? (
                <form onSubmit={handleSaveTwin} className="p-4 space-y-3">
                  <div><label className="text-[12px] font-bold text-amazon-text mb-1 block">Name</label><input type="text" required value={twinForm.name} onChange={e => setTwinForm({...twinForm, name: e.target.value})} className="w-full px-2.5 py-1.5 border border-[#a6a6a6] rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#e77600]" /></div>
                  <div><label className="text-[12px] font-bold text-amazon-text mb-1 block">Sizes</label><input type="text" placeholder="shoes:9,top:M" value={twinForm.sizes} onChange={e => setTwinForm({...twinForm, sizes: e.target.value})} className="w-full px-2.5 py-1.5 border border-[#a6a6a6] rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#e77600]" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[12px] font-bold text-amazon-text mb-1 block">Min Budget (₹)</label><input type="number" value={twinForm.budget_min} onChange={e => setTwinForm({...twinForm, budget_min: e.target.value})} className="w-full px-2.5 py-1.5 border border-[#a6a6a6] rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#e77600]" /></div>
                    <div><label className="text-[12px] font-bold text-amazon-text mb-1 block">Max Budget (₹)</label><input type="number" value={twinForm.budget_max} onChange={e => setTwinForm({...twinForm, budget_max: e.target.value})} className="w-full px-2.5 py-1.5 border border-[#a6a6a6] rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#e77600]" /></div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" disabled={savingTwin} className="btn-amazon text-[12px] py-1.5 flex-1 font-semibold disabled:opacity-50">{savingTwin ? "Saving..." : "Save"}</button>
                    <button type="button" onClick={() => setIsEditingTwin(false)} className="border border-[#a6a6a6] hover:bg-gray-50 text-[12px] py-1.5 flex-1 rounded text-center">Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="p-4 space-y-3">
                  <div><p className="text-[12px] font-bold text-amazon-text mb-1">Name</p><p className="text-[14px]">{currentUser.name}</p></div>
                  <div><p className="text-[12px] font-bold text-amazon-text mb-1">Sizes</p>
                    <div className="flex flex-wrap gap-1">{currentUser.sizes ? currentUser.sizes.split(",").map((s,i) => { const [k,v] = s.split(":"); return <span key={i} className="text-[12px] bg-[#f0f2f2] border border-amazon-border px-2 py-0.5 rounded">{k?.trim()}: <b>{v?.trim()}</b></span>; }) : <span className="text-[12px] text-amazon-text-secondary italic">None set</span>}</div>
                  </div>
                  <div><p className="text-[12px] font-bold text-amazon-text mb-1">Budget Range</p><p className="text-[14px]">₹{currentUser.budget_min?.toLocaleString("en-IN")} — ₹{currentUser.budget_max?.toLocaleString("en-IN")}</p></div>
                </div>
              )}
            </div>

            {/* Interests Card */}
            <div className="bg-white border border-amazon-border rounded-lg overflow-hidden">
              <div className="p-4 border-b border-amazon-border flex justify-between items-center bg-[#fafafa]">
                <div><h2 className="text-[16px] font-bold text-amazon-text">Interests & Brands</h2><p className="text-[12px] text-amazon-text-secondary">Used to match you with Second Life items</p></div>
                {!isEditingInterests && <button onClick={() => setIsEditingInterests(true)} className="text-[12px] text-amazon-link hover:underline font-semibold">Edit</button>}
              </div>
              {isEditingInterests ? (
                <form onSubmit={handleSaveInterests} className="p-4 space-y-3">
                  <div><label className="text-[12px] font-bold text-amazon-text mb-1 block">Interests</label><input type="text" placeholder="hiking, running, tech" value={interestsForm.interests} onChange={e => setInterestsForm({...interestsForm, interests: e.target.value})} className="w-full px-2.5 py-1.5 border border-[#a6a6a6] rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#e77600]" /></div>
                  <div><label className="text-[12px] font-bold text-amazon-text mb-1 block">Favourite Brands</label><input type="text" placeholder="Nike, Puma" value={interestsForm.brand_prefs} onChange={e => setInterestsForm({...interestsForm, brand_prefs: e.target.value})} className="w-full px-2.5 py-1.5 border border-[#a6a6a6] rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#e77600]" /></div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" disabled={savingInterests} className="btn-amazon text-[12px] py-1.5 flex-1 font-semibold disabled:opacity-50">{savingInterests ? "Saving..." : "Save"}</button>
                    <button type="button" onClick={() => setIsEditingInterests(false)} className="border border-[#a6a6a6] hover:bg-gray-50 text-[12px] py-1.5 flex-1 rounded text-center">Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="p-4 space-y-3">
                  <div><p className="text-[12px] font-bold text-amazon-text mb-1.5">Interests</p>
                    <div className="flex flex-wrap gap-1">{currentUser.interests ? currentUser.interests.split(",").map((s,i) => <span key={i} className="text-[11px] bg-[#232f3e] text-white px-2 py-0.5 rounded">{s.trim()}</span>) : <span className="text-[12px] text-amazon-text-secondary italic">None set</span>}</div>
                  </div>
                  <div><p className="text-[12px] font-bold text-amazon-text mb-1.5">Favourite Brands</p>
                    <div className="flex flex-wrap gap-1">{currentUser.brand_prefs ? currentUser.brand_prefs.split(",").map((b,i) => <span key={i} className="text-[11px] border border-amazon-border text-amazon-text px-2 py-0.5 rounded">{b.trim()}</span>) : <span className="text-[12px] text-amazon-text-secondary italic">None set</span>}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
