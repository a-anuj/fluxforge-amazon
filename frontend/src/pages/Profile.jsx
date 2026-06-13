import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getGreenCredits, getOrders, getProduct } from "../api/client";
import { useUser } from "../context/UserContext";

export default function Profile() {
  const { currentUser, updateUserProfile } = useUser();
  const [credits, setCredits] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit states
  const [isEditingTwin, setIsEditingTwin] = useState(false);
  const [isEditingInterests, setIsEditingInterests] = useState(false);

  // Form states
  const [twinForm, setTwinForm] = useState({
    name: "",
    sizes: "",
    budget_min: 0,
    budget_max: 0,
  });

  const [interestsForm, setInterestsForm] = useState({
    interests: "",
    brand_prefs: "",
  });

  const [savingTwin, setSavingTwin] = useState(false);
  const [savingInterests, setSavingInterests] = useState(false);
  const [errorTwin, setErrorTwin] = useState("");
  const [errorInterests, setErrorInterests] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    Promise.all([getGreenCredits(currentUser.id), getOrders(currentUser.id)])
      .then(([c, o]) => { setCredits(c); setOrders(o); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      setTwinForm({
        name: currentUser.name || "",
        sizes: currentUser.sizes || "",
        budget_min: currentUser.budget_min || 0,
        budget_max: currentUser.budget_max || 0,
      });
      setInterestsForm({
        interests: currentUser.interests || "",
        brand_prefs: currentUser.brand_prefs || "",
      });
    }
  }, [currentUser]);

  if (!currentUser) return null;

  const sizePairs = currentUser.sizes ? currentUser.sizes.split(",").map(s => { const [k, v] = s.split(":"); return { label: k?.trim(), value: v?.trim() }; }) : [];
  const interests = currentUser.interests ? currentUser.interests.split(",").map(i => i.trim()) : [];
  const brands = currentUser.brand_prefs ? currentUser.brand_prefs.split(",").map(b => b.trim()) : [];

  const handleSaveTwin = async (e) => {
    e.preventDefault();
    setSavingTwin(true);
    setErrorTwin("");
    try {
      await updateUserProfile(currentUser.id, {
        name: twinForm.name,
        sizes: twinForm.sizes,
        budget_min: Number(twinForm.budget_min),
        budget_max: Number(twinForm.budget_max),
      });
      setIsEditingTwin(false);
    } catch (err) {
      setErrorTwin(err.message || "Failed to update profile");
    } finally {
      setSavingTwin(false);
    }
  };

  const handleSaveInterests = async (e) => {
    e.preventDefault();
    setSavingInterests(true);
    setErrorInterests("");
    try {
      await updateUserProfile(currentUser.id, {
        interests: interestsForm.interests,
        brand_prefs: interestsForm.brand_prefs,
      });
      setIsEditingInterests(false);
    } catch (err) {
      setErrorInterests(err.message || "Failed to update profile");
    } finally {
      setSavingInterests(false);
    }
  };

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
          <div className="bg-white border border-amazon-border rounded-lg overflow-hidden flex flex-col">
            <div className="p-4 border-b border-amazon-border flex justify-between items-center bg-[#fafafa]">
              <div>
                <h2 className="text-[16px] font-bold text-amazon-text">Shopping Twin Profile</h2>
                <p className="text-[12px] text-amazon-text-secondary">Your preferences for AI matching</p>
              </div>
              {!isEditingTwin && (
                <button
                  type="button"
                  onClick={() => setIsEditingTwin(true)}
                  className="text-[12px] text-amazon-link hover:underline font-semibold"
                >
                  Edit
                </button>
              )}
            </div>

            {isEditingTwin ? (
              <form onSubmit={handleSaveTwin} className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  {errorTwin && <p className="text-[12px] text-amazon-red font-semibold">{errorTwin}</p>}
                  <div>
                    <label className="text-[12px] font-bold text-amazon-text mb-1 block">Name</label>
                    <input
                      type="text"
                      required
                      value={twinForm.name}
                      onChange={(e) => setTwinForm({ ...twinForm, name: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-[#a6a6a6] rounded text-[13px] text-amazon-text focus:outline-none focus:ring-1 focus:ring-[#e77600] focus:border-[#e77600] bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-bold text-amazon-text mb-1 block">
                      Sizes <span className="text-[10px] text-amazon-text-secondary font-normal">(comma-separated label:value)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="shoes:9,top:M"
                      value={twinForm.sizes}
                      onChange={(e) => setTwinForm({ ...twinForm, sizes: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-[#a6a6a6] rounded text-[13px] text-amazon-text focus:outline-none focus:ring-1 focus:ring-[#e77600] focus:border-[#e77600] bg-white"
                    />
                    <p className="text-[10px] text-amazon-text-secondary mt-0.5">Example: shoes:9,top:M,bottom:32</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[12px] font-bold text-amazon-text mb-1 block">Min Budget (₹)</label>
                      <input
                        type="number"
                        value={twinForm.budget_min}
                        onChange={(e) => setTwinForm({ ...twinForm, budget_min: e.target.value })}
                        className="w-full px-2.5 py-1.5 border border-[#a6a6a6] rounded text-[13px] text-amazon-text focus:outline-none focus:ring-1 focus:ring-[#e77600] focus:border-[#e77600] bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] font-bold text-amazon-text mb-1 block">Max Budget (₹)</label>
                      <input
                        type="number"
                        value={twinForm.budget_max}
                        onChange={(e) => setTwinForm({ ...twinForm, budget_max: e.target.value })}
                        className="w-full px-2.5 py-1.5 border border-[#a6a6a6] rounded text-[13px] text-amazon-text focus:outline-none focus:ring-1 focus:ring-[#e77600] focus:border-[#e77600] bg-white"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-4 border-t border-[#eee] mt-4">
                  <button
                    type="submit"
                    disabled={savingTwin}
                    className="btn-amazon text-[12px] py-1.5 flex-1 font-semibold disabled:opacity-50"
                  >
                    {savingTwin ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingTwin(false);
                      setTwinForm({
                        name: currentUser.name || "",
                        sizes: currentUser.sizes || "",
                        budget_min: currentUser.budget_min || 0,
                        budget_max: currentUser.budget_max || 0,
                      });
                      setErrorTwin("");
                    }}
                    className="border border-[#a6a6a6] hover:bg-gray-50 text-[12px] py-1.5 flex-1 rounded text-center text-amazon-text font-normal"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div>
                    <p className="text-[12px] font-bold text-amazon-text mb-1">Name</p>
                    <p className="text-[14px] text-amazon-text">{currentUser.name}</p>
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-amazon-text mb-1">Sizes</p>
                    <div className="flex flex-wrap gap-1">
                      {sizePairs.length > 0 ? (
                        sizePairs.map((s, i) => (
                          <span key={i} className="text-[12px] bg-[#f0f2f2] border border-amazon-border px-2 py-0.5 rounded text-amazon-text">
                            {s.label}: <b>{s.value}</b>
                          </span>
                        ))
                      ) : (
                        <span className="text-[12px] text-amazon-text-secondary italic">None set</span>
                      )}
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
            )}
          </div>

          {/* Interests & Brands Card */}
          <div className="bg-white border border-amazon-border rounded-lg overflow-hidden flex flex-col">
            <div className="p-4 border-b border-amazon-border flex justify-between items-center bg-[#fafafa]">
              <div>
                <h2 className="text-[16px] font-bold text-amazon-text">Interests & Brands</h2>
                <p className="text-[12px] text-amazon-text-secondary">Used to match you with Second Life items</p>
              </div>
              {!isEditingInterests && (
                <button
                  type="button"
                  onClick={() => setIsEditingInterests(true)}
                  className="text-[12px] text-amazon-link hover:underline font-semibold"
                >
                  Edit
                </button>
              )}
            </div>

            {isEditingInterests ? (
              <form onSubmit={handleSaveInterests} className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  {errorInterests && <p className="text-[12px] text-amazon-red font-semibold">{errorInterests}</p>}
                  <div>
                    <label className="text-[12px] font-bold text-amazon-text mb-1 block">
                      Interests <span className="text-[10px] text-amazon-text-secondary font-normal">(comma-separated list)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="hiking, running, tech"
                      value={interestsForm.interests}
                      onChange={(e) => setInterestsForm({ ...interestsForm, interests: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-[#a6a6a6] rounded text-[13px] text-amazon-text focus:outline-none focus:ring-1 focus:ring-[#e77600] focus:border-[#e77600] bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-bold text-amazon-text mb-1 block">
                      Favourite Brands <span className="text-[10px] text-amazon-text-secondary font-normal">(comma-separated list)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Nike, Puma, Sony"
                      value={interestsForm.brand_prefs}
                      onChange={(e) => setInterestsForm({ ...interestsForm, brand_prefs: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-[#a6a6a6] rounded text-[13px] text-amazon-text focus:outline-none focus:ring-1 focus:ring-[#e77600] focus:border-[#e77600] bg-white"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-4 border-t border-[#eee] mt-4">
                  <button
                    type="submit"
                    disabled={savingInterests}
                    className="btn-amazon text-[12px] py-1.5 flex-1 font-semibold disabled:opacity-50"
                  >
                    {savingInterests ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingInterests(false);
                      setInterestsForm({
                        interests: currentUser.interests || "",
                        brand_prefs: currentUser.brand_prefs || "",
                      });
                      setErrorInterests("");
                    }}
                    className="border border-[#a6a6a6] hover:bg-gray-50 text-[12px] py-1.5 flex-1 rounded text-center text-amazon-text font-normal"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div>
                    <p className="text-[12px] font-bold text-amazon-text mb-1.5">Interests</p>
                    <div className="flex flex-wrap gap-1">
                      {interests.length > 0 && interests[0] !== "" ? (
                        interests.map((int, i) => (
                          <span key={i} className="text-[11px] bg-[#232f3e] text-white px-2 py-0.5 rounded">{int}</span>
                        ))
                      ) : (
                        <span className="text-[12px] text-amazon-text-secondary italic">None set</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-amazon-text mb-1.5">Favourite Brands</p>
                    <div className="flex flex-wrap gap-1">
                      {brands.length > 0 && brands[0] !== "" ? (
                        brands.map((b, i) => (
                          <span key={i} className="text-[11px] border border-amazon-border text-amazon-text px-2 py-0.5 rounded">{b}</span>
                        ))
                      ) : (
                        <span className="text-[12px] text-amazon-text-secondary italic">None set</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
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
