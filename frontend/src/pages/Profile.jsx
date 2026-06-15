import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getGreenCredits, getImpactStats, getChallenges, getRedemptionOptions, redeemCredits, completeChallenge, getOrders } from "../api/client";
import { useUser } from "../context/UserContext";
import { 
  Leaf, Droplet, RefreshCw, Wrench, Package, BarChart2, 
  Target, ShoppingBag, Box, ChevronRight, Award, Zap, CheckCircle2, UserCircle, Wallet, Activity
} from "lucide-react";

const LEVEL_COLORS = {
  "Seed": "#8B9467",
  "Sapling": "#4CAF50",
  "Green Hero": "#2196F3",
  "Planet Protector": "#9C27B0",
  "Circular Champion": "#FF9800",
};

function CircularProgress({ value, max, size = 100, stroke = 8, color = "#067d62", label, sublabel }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(value / max, 1);
  const offset = circumference * (1 - pct);
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#f0f2f2" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000 ease-out drop-shadow-sm" />
      </svg>
      <p className="text-[22px] font-extrabold text-amazon-text -mt-[66px] mb-[30px] tracking-tight">{typeof value === 'number' ? value.toFixed(1) : value}</p>
      <p className="text-[13px] font-semibold text-amazon-text mt-2">{label}</p>
      {sublabel && <p className="text-[11px] text-amazon-text-secondary">{sublabel}</p>}
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
    <div className="bg-white min-h-screen"><div className="max-w-[1100px] mx-auto px-4 py-6"><div className="h-[400px] bg-[#fafafa] animate-pulse rounded-2xl" /></div></div>
  );

  return (
    <div className="bg-gray-50 min-h-screen animate-fade-in font-sans">
      {/* Premium Hero Banner */}
      <div className="relative overflow-hidden bg-[#232f3e] text-white shadow-md">
        <div className="absolute inset-0 bg-gradient-to-br from-[#232f3e] to-[#37475a] opacity-90"></div>
        <div className="absolute -right-20 -top-20 opacity-5">
          <Leaf size={300} strokeWidth={0.5} />
        </div>
        <div className="relative max-w-[1100px] mx-auto px-6 py-10">
          <div className="flex items-center justify-between flex-wrap gap-6">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
                <UserCircle size={40} className="text-white/80" />
              </div>
              <div>
                <p className="text-[13px] text-gray-400 tracking-wide font-medium">Welcome back,</p>
                <h1 className="text-[32px] font-extrabold tracking-tight">{currentUser.name}</h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[13px] px-3.5 py-1 rounded-full font-bold shadow-sm" style={{ backgroundColor: levelColor, color: '#fff' }}>
                    Level: {currentUser.level}
                  </span>
                  {credits && credits.next_level && (
                    <span className="text-[12px] text-gray-300 font-medium">{credits.credits_to_next} credits to {credits.next_level}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-5 text-center min-w-[220px] shadow-lg">
              <p className="text-[13px] text-gray-300 uppercase tracking-widest font-semibold mb-1">Green Credits</p>
              <p className="text-[48px] font-black text-amazon-orange leading-none drop-shadow-md">{currentUser.green_credits}</p>
              {credits && (
                <div className="mt-4">
                  <div className="h-[8px] bg-black/30 rounded-full overflow-hidden inset-shadow-sm">
                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${credits.level_progress}%`, backgroundColor: levelColor }} />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2 font-medium">{credits.level_progress}% to next level</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modern Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-[1100px] mx-auto px-6 flex gap-8">
          {[
            { id: "dashboard", label: "Dashboard", icon: <Activity size={18} /> },
            { id: "wallet", label: "Wallet", icon: <Wallet size={18} /> },
            { id: "redeem", label: "Redeem", icon: <Award size={18} /> },
            { id: "profile", label: "Profile", icon: <UserCircle size={18} /> }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-1 py-4 text-[14px] font-semibold border-b-[3px] transition-all duration-200 ${activeTab === tab.id ? "border-amazon-orange text-amazon-text" : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"}`}>
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-6">

        {/* ═══ DASHBOARD TAB ═══ */}
        {activeTab === "dashboard" && impact && (
          <div className="space-y-6">
            {/* Environmental Impact Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center shadow-[0_2px_10px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_15px_rgba(0,0,0,0.08)] transition-shadow">
                <CircularProgress value={impact.co2_saved} max={100} color="#067d62" label="CO₂ Saved" sublabel="kilograms" />
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center shadow-[0_2px_10px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_15px_rgba(0,0,0,0.08)] transition-shadow">
                <CircularProgress value={impact.ewaste_prevented} max={20} color="#1a73e8" label="E-Waste Prevented" sublabel="kilograms" />
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center shadow-[0_2px_10px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_15px_rgba(0,0,0,0.08)] transition-shadow">
                <CircularProgress value={impact.water_saved} max={500} color="#00BCD4" label="Water Saved" sublabel="liters" />
              </div>
            </div>

            {/* Activity Summary */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
              <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-[18px] font-bold text-amazon-text flex items-center gap-2">
                  <BarChart2 className="text-gray-400" size={20} /> Sustainability Activity
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                {[
                  { val: impact.products_resold, label: "Products Resold", icon: <Package size={24} className="text-purple-600" /> },
                  { val: impact.circular_orders, label: "Circular Orders", icon: <Leaf size={24} className="text-green-600" /> },
                  { val: `${impact.circular_percentage}%`, label: "Circular Rate", icon: <Target size={24} className="text-orange-500" /> },
                ].map((s, i) => (
                  <div key={i} className="p-6 text-center flex flex-col items-center justify-center">
                    <div className="mb-3 p-3 rounded-full bg-gray-50">{s.icon}</div>
                    <p className="text-[26px] font-black text-amazon-text leading-tight">{s.val}</p>
                    <p className="text-[12px] text-gray-500 font-medium mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Green Challenges */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
              <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <div>
                  <h2 className="text-[18px] font-bold text-amazon-text flex items-center gap-2">
                    <Target className="text-amazon-orange" size={20} /> Green Challenges
                  </h2>
                  <p className="text-[13px] text-gray-500 mt-1">Complete challenges to earn bonus credits</p>
                </div>
                <span className="text-[13px] font-semibold bg-gray-200 text-gray-700 px-3 py-1 rounded-full">{activeChallenges.length} active</span>
              </div>
              <div className="divide-y divide-gray-100">
                {activeChallenges.map(ch => (
                  <div key={ch.id} className="p-6 flex items-center justify-between gap-6 hover:bg-gray-50/50 transition-colors">
                    <div className="flex-1">
                      <p className="text-[15px] font-bold text-amazon-text">{ch.title}</p>
                      <p className="text-[13px] text-gray-500 mt-1">{ch.description}</p>
                    </div>
                    <div className="text-right flex-shrink-0 flex flex-col items-end">
                      <div className="bg-orange-50 px-3 py-1.5 rounded-lg mb-2">
                        <span className="text-[16px] font-bold text-amazon-orange">+{ch.reward_credits}</span>
                        <span className="text-[11px] text-amazon-orange font-semibold ml-1 uppercase">credits</span>
                      </div>
                      <button onClick={() => handleCompleteChallenge(ch.id)}
                        className="bg-amazon-primary hover:bg-amazon-primary-hover text-black font-bold text-[12px] px-4 py-2 rounded-lg shadow-sm transition-colors">
                        Complete
                      </button>
                    </div>
                  </div>
                ))}
                {completedChallenges.length > 0 && (
                  <div className="p-4 bg-emerald-50/50 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <p className="text-[12px] text-emerald-700 font-bold">{completedChallenges.length} challenge{completedChallenges.length > 1 ? 's' : ''} completed</p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid md:grid-cols-3 gap-5">
              <Link to="/feed" className="group bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-[0_4px_15px_rgba(0,0,0,0.08)] transition-all flex items-center gap-4">
                <div className="p-3 rounded-xl bg-green-50 text-green-600 group-hover:scale-110 transition-transform"><Leaf size={24} /></div>
                <div><p className="text-[15px] font-bold text-amazon-text">Second Life Feed</p><p className="text-[12px] text-gray-500">Items matched for you</p></div>
              </Link>
              <Link to="/returns/new" className="group bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-[0_4px_15px_rgba(0,0,0,0.08)] transition-all flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform"><RefreshCw size={24} /></div>
                <div><p className="text-[15px] font-bold text-amazon-text">Sell on Second Life</p><p className="text-[12px] text-gray-500">Verify & list items with AI</p></div>
              </Link>
              <Link to="/orders" className="group bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-[0_4px_15px_rgba(0,0,0,0.08)] transition-all flex items-center gap-4">
                <div className="p-3 rounded-xl bg-purple-50 text-purple-600 group-hover:scale-110 transition-transform"><Box size={24} /></div>
                <div><p className="text-[15px] font-bold text-amazon-text">Your Orders</p><p className="text-[12px] text-gray-500">Track, return or buy again</p></div>
              </Link>
            </div>
          </div>
        )}

        {/* ═══ WALLET TAB ═══ */}
        {activeTab === "wallet" && credits && (
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.04)] max-w-3xl mx-auto">
            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-[18px] font-bold text-amazon-text flex items-center gap-2">
                <Wallet className="text-gray-400" size={20} /> Green Credits Wallet
              </h2>
            </div>
            <div className="p-6">
              <div className="bg-gradient-to-br from-[#232f3e] to-[#37475a] rounded-2xl p-8 flex items-center justify-between mb-8 shadow-lg text-white">
                <div>
                  <p className="text-[13px] text-gray-300 font-medium uppercase tracking-wider mb-2">Available Balance</p>
                  <p className="text-[54px] font-black text-amazon-orange leading-none drop-shadow-md">{credits.balance}</p>
                  <p className="text-[12px] text-gray-400 mt-3 font-medium">Lifetime: {credits.lifetime_credits} credits earned</p>
                </div>
                <div className="text-right">
                  <span className="text-[16px] px-5 py-2 rounded-full font-bold shadow-md inline-block" style={{ backgroundColor: levelColor }}>Level: {currentUser.level}</span>
                </div>
              </div>
              <p className="text-[15px] font-bold text-amazon-text mb-4">Transaction History</p>
              <div className="divide-y divide-gray-100">
                {credits.transactions.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between py-4 hover:bg-gray-50/50 transition-colors px-2 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-full ${tx.type === "earned" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                        {tx.type === "earned" ? <Leaf size={18} /> : <ShoppingBag size={18} />}
                      </div>
                      <div>
                        <p className="text-[14px] font-bold text-amazon-text">{tx.description || (tx.type === "earned" ? "Credits Earned" : "Credits Redeemed")}</p>
                        <p className="text-[12px] text-gray-500 font-medium mt-0.5 capitalize">{tx.action_type.replace('_', ' ')} • {tx.created_at ? new Date(tx.created_at).toLocaleDateString("en-IN", {day: 'numeric', month: 'short', year: 'numeric'}) : ""}</p>
                      </div>
                    </div>
                    <span className={`font-black text-[16px] ${tx.type === "earned" ? "text-emerald-600" : "text-red-500"}`}>
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
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="bg-white border border-gray-100 rounded-2xl p-6 flex items-center justify-between shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
              <div>
                <p className="text-[14px] font-bold text-gray-500 uppercase tracking-wider mb-1">Your Balance</p>
                <p className="text-[36px] font-black text-amazon-orange leading-none">{currentUser.green_credits} <span className="text-[16px] text-gray-400 font-semibold tracking-normal">credits</span></p>
              </div>
              <Award size={48} className="text-gray-200" />
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              {redemptionOptions.map((opt, index) => {
                const Icon = index === 0 ? Leaf : index === 1 ? ShoppingBag : Award;
                const canAfford = currentUser.green_credits >= opt.credits_required;
                return (
                <div key={opt.type} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_rgba(0,0,0,0.04)] flex flex-col justify-between hover:shadow-[0_4px_15px_rgba(0,0,0,0.08)] transition-shadow">
                  <div>
                    <div className="flex items-start gap-4 mb-4">
                      <div className="p-4 rounded-xl bg-blue-50 text-blue-600"><Icon size={28} /></div>
                      <div className="flex-1">
                        <p className="text-[16px] font-bold text-amazon-text">{opt.title}</p>
                        <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">{opt.description}</p>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 inline-block mb-4">
                      <p className="text-[15px] font-black text-amazon-orange">{opt.credits_required} <span className="text-[12px] text-gray-500 font-semibold uppercase">credits</span></p>
                    </div>
                  </div>
                  <button onClick={() => handleRedeem(opt)} disabled={redeeming === opt.type || !canAfford}
                    className={`w-full py-3 rounded-xl font-bold text-[14px] transition-colors shadow-sm ${canAfford ? "bg-amazon-primary hover:bg-amazon-primary-hover text-black" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
                    {redeeming === opt.type ? "Processing..." : canAfford ? "Redeem Reward" : "Not enough credits"}
                  </button>
                </div>
              )})}
            </div>
          </div>
        )}

        {/* ═══ PROFILE TAB ═══ */}
        {activeTab === "profile" && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Shopping Twin Card */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
              <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h2 className="text-[18px] font-bold text-amazon-text flex items-center gap-2">
                    <UserCircle size={20} className="text-gray-400" /> Shopping Twin Profile
                  </h2>
                  <p className="text-[13px] text-gray-500 mt-1">Your preferences for AI matching</p>
                </div>
                {!isEditingTwin && <button onClick={() => setIsEditingTwin(true)} className="text-[13px] text-amazon-link hover:underline font-bold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">Edit</button>}
              </div>
              {isEditingTwin ? (
                <form onSubmit={handleSaveTwin} className="p-6 space-y-4">
                  <div><label className="text-[13px] font-bold text-amazon-text mb-1.5 block">Name</label><input type="text" required value={twinForm.name} onChange={e => setTwinForm({...twinForm, name: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-amazon-orange/50 focus:border-amazon-orange transition-shadow" /></div>
                  <div><label className="text-[13px] font-bold text-amazon-text mb-1.5 block">Sizes</label><input type="text" placeholder="shoes:9,top:M" value={twinForm.sizes} onChange={e => setTwinForm({...twinForm, sizes: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-amazon-orange/50 focus:border-amazon-orange transition-shadow" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[13px] font-bold text-amazon-text mb-1.5 block">Min Budget (₹)</label><input type="number" value={twinForm.budget_min} onChange={e => setTwinForm({...twinForm, budget_min: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-amazon-orange/50 focus:border-amazon-orange transition-shadow" /></div>
                    <div><label className="text-[13px] font-bold text-amazon-text mb-1.5 block">Max Budget (₹)</label><input type="number" value={twinForm.budget_max} onChange={e => setTwinForm({...twinForm, budget_max: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-amazon-orange/50 focus:border-amazon-orange transition-shadow" /></div>
                  </div>
                  <div className="flex gap-3 pt-4 border-t border-gray-100 mt-4">
                    <button type="submit" disabled={savingTwin} className="bg-amazon-primary hover:bg-amazon-primary-hover text-black font-bold text-[14px] py-2.5 flex-1 rounded-lg shadow-sm transition-colors disabled:opacity-50">{savingTwin ? "Saving..." : "Save Changes"}</button>
                    <button type="button" onClick={() => setIsEditingTwin(false)} className="border border-gray-300 hover:bg-gray-50 text-amazon-text font-bold text-[14px] py-2.5 flex-1 rounded-lg text-center transition-colors">Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="p-6 space-y-5">
                  <div><p className="text-[13px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Name</p><p className="text-[15px] font-semibold text-amazon-text">{currentUser.name}</p></div>
                  <div><p className="text-[13px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Sizes</p>
                    <div className="flex flex-wrap gap-2">{currentUser.sizes ? currentUser.sizes.split(",").map((s,i) => { const [k,v] = s.split(":"); return <span key={i} className="text-[13px] bg-gray-100 text-gray-800 px-3 py-1 rounded-md font-medium">{k?.trim()}: <b className="text-amazon-text">{v?.trim()}</b></span>; }) : <span className="text-[13px] text-gray-400 italic">Not specified</span>}</div>
                  </div>
                  <div><p className="text-[13px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Budget Range</p><p className="text-[15px] font-semibold text-amazon-text">₹{currentUser.budget_min?.toLocaleString("en-IN")} — ₹{currentUser.budget_max?.toLocaleString("en-IN")}</p></div>
                </div>
              )}
            </div>

            {/* Interests Card */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
              <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h2 className="text-[18px] font-bold text-amazon-text flex items-center gap-2">
                    <Target size={20} className="text-gray-400" /> Interests & Brands
                  </h2>
                  <p className="text-[13px] text-gray-500 mt-1">Used to match you with Second Life items</p>
                </div>
                {!isEditingInterests && <button onClick={() => setIsEditingInterests(true)} className="text-[13px] text-amazon-link hover:underline font-bold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">Edit</button>}
              </div>
              {isEditingInterests ? (
                <form onSubmit={handleSaveInterests} className="p-6 space-y-4">
                  <div><label className="text-[13px] font-bold text-amazon-text mb-1.5 block">Interests</label><input type="text" placeholder="hiking, running, tech" value={interestsForm.interests} onChange={e => setInterestsForm({...interestsForm, interests: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-amazon-orange/50 focus:border-amazon-orange transition-shadow" /></div>
                  <div><label className="text-[13px] font-bold text-amazon-text mb-1.5 block">Favourite Brands</label><input type="text" placeholder="Nike, Puma" value={interestsForm.brand_prefs} onChange={e => setInterestsForm({...interestsForm, brand_prefs: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-amazon-orange/50 focus:border-amazon-orange transition-shadow" /></div>
                  <div className="flex gap-3 pt-4 border-t border-gray-100 mt-4">
                    <button type="submit" disabled={savingInterests} className="bg-amazon-primary hover:bg-amazon-primary-hover text-black font-bold text-[14px] py-2.5 flex-1 rounded-lg shadow-sm transition-colors disabled:opacity-50">{savingInterests ? "Saving..." : "Save Changes"}</button>
                    <button type="button" onClick={() => setIsEditingInterests(false)} className="border border-gray-300 hover:bg-gray-50 text-amazon-text font-bold text-[14px] py-2.5 flex-1 rounded-lg text-center transition-colors">Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="p-6 space-y-5">
                  <div><p className="text-[13px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Interests</p>
                    <div className="flex flex-wrap gap-2">{currentUser.interests ? currentUser.interests.split(",").map((s,i) => <span key={i} className="text-[12px] bg-[#232f3e] text-white px-3 py-1 rounded-full font-medium tracking-wide">{s.trim()}</span>) : <span className="text-[13px] text-gray-400 italic">Not specified</span>}</div>
                  </div>
                  <div><p className="text-[13px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Favourite Brands</p>
                    <div className="flex flex-wrap gap-2">{currentUser.brand_prefs ? currentUser.brand_prefs.split(",").map((b,i) => <span key={i} className="text-[12px] border-2 border-gray-200 text-amazon-text px-3 py-1 rounded-full font-bold">{b.trim()}</span>) : <span className="text-[13px] text-gray-400 italic">Not specified</span>}</div>
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
