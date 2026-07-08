import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { 
  listReturns, 
  overrideReturnDisposition, 
  verifyReturnDisposition 
} from "../api/client";
import { 
  AlertTriangle, 
  RefreshCw, 
  Search, 
  CheckCircle2, 
  RotateCcw, 
  Package, 
  User, 
  MapPin, 
  Check, 
  Award, 
  Recycle, 
  ArrowRightLeft, 
  Edit, 
  CheckSquare,
  Filter
} from "lucide-react";

/* ─── AI details badge colours ──────────────────────────────── */
const ACTION_STYLE = {
  resell: {
    bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
    label: "RESTOCKED (AS NEW)",
    icon: <Package className="w-3.5 h-3.5 text-emerald-600" />
  },
  refurbish: {
    bg: "bg-blue-50 text-blue-700 border-blue-200",
    label: "REFURBISH",
    icon: <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
  },
  exchange: {
    bg: "bg-amber-50 text-amber-700 border-amber-200",
    label: "EXCHANGE",
    icon: <ArrowRightLeft className="w-3.5 h-3.5 text-amber-600" />
  },
  donate: {
    bg: "bg-orange-50 text-orange-700 border-orange-200",
    label: "DONATE",
    icon: <User className="w-3.5 h-3.5 text-orange-600" />
  },
  recycle: {
    bg: "bg-slate-100 text-slate-700 border-slate-200",
    label: "RECYCLE",
    icon: <Recycle className="w-3.5 h-3.5 text-slate-600" />
  },
};

function ConditionBar({ value }) {
  const color = value >= 75 ? "#10b981" : value >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1.5">
      <div 
        className="h-full rounded-full transition-all duration-700" 
        style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} 
      />
    </div>
  );
}

/* ─── Stat card ─────────────────────────────────────────────── */
function StatCard({ icon, label, value, sub, accentBg, accentText }) {
  return (
    <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl p-5 flex-1 min-w-[220px] shadow-sm">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${accentBg}`}>
        {icon}
      </div>
      <div>
        <p className={`text-2xl font-black leading-none ${accentText}`}>{value}</p>
        <p className="text-[12px] text-slate-500 mt-1 font-bold tracking-tight">{label}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── Return Card ───────────────────────────────────────────── */
function ReturnCard({ r, onVerify, onOverride, processingId }) {
  const [showOverride, setShowOverride] = useState(false);
  const [newAction, setNewAction] = useState(r.recommended_action || "recycle");
  const [justification, setJustification] = useState("");
  const [error, setError] = useState("");

  const handleOverrideSubmit = async (e) => {
    e.preventDefault();
    if (!justification.trim()) {
      setError("Please provide a justification for the override.");
      return;
    }
    setError("");
    try {
      await onOverride(r.id, newAction, justification);
      setShowOverride(false);
      setJustification("");
    } catch (err) {
      setError(err.message || "Override failed.");
    }
  };

  const actionStyle = ACTION_STYLE[r.recommended_action] || {
    bg: "bg-slate-100 text-slate-700 border-slate-250",
    label: (r.recommended_action || "unknown").toUpperCase(),
    icon: <Package className="w-4 h-4 text-slate-500" />
  };

  const confidencePct = r.confidence != null ? Math.round(r.confidence * 100) : null;
  const isLowConfidence = confidencePct !== null && confidencePct < 70;

  return (
    <div className={`bg-white border rounded-xl shadow-sm overflow-hidden transition-all duration-200 ${
      r.status === "verified" ? "border-emerald-200" : "border-slate-200 hover:border-slate-350 hover:shadow-md"
    }`}>
      {/* Card Header */}
      <div className="bg-slate-50 border-b border-slate-100 px-5 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Return ID: #{r.id}</span>
          <span className="text-slate-300">|</span>
          <span className="text-xs font-semibold text-slate-600">Order: #{r.order_id}</span>
        </div>
        <div className="flex items-center gap-3">
          {r.status === "verified" ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" /> Done
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              <RefreshCw className="w-3 h-3" /> Pending Review
            </span>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product & Customer */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-16 h-16 rounded-lg bg-slate-50 border border-slate-200 flex-shrink-0 flex items-center justify-center overflow-hidden">
              {r.product_image ? (
                <img src={r.product_image} alt="" className="w-full h-full object-contain mix-blend-multiply" />
              ) : (
                <Package className="w-8 h-8 text-slate-300" />
              )}
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-slate-900 truncate leading-tight">{r.product_name}</h4>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{r.product_category}</p>
              <p className="text-sm font-extrabold text-indigo-600 mt-1">₹{r.product_price}</p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3.5 space-y-2">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="font-semibold text-slate-700 truncate">{r.customer_name}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="font-medium text-slate-500">{r.customer_city} ({r.customer_pincode})</span>
            </div>
          </div>
        </div>

        {/* Middle Column: Customer Photo */}
        <div className="lg:col-span-3">
          <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mb-2.5">Submission Media</p>
          <div className="w-full h-32 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center relative group shadow-inner">
            {r.image_url ? (
              <>
                <img src={r.image_url} alt="Uploaded item" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                <a 
                  href={r.image_url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity"
                >
                  View Large Photo
                </a>
              </>
            ) : (
              <div className="text-center p-4">
                <span className="text-2xl block mb-1">📸</span>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">No Photo Provided</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AI Insights */}
        <div className="lg:col-span-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">AI Routing Decision</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border ${actionStyle.bg} ${actionStyle.text} ${actionStyle.border}`}>
              {actionStyle.icon}
              {actionStyle.label}
            </div>

            {confidencePct !== null && (
              <div className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold ${
                isLowConfidence 
                  ? "bg-rose-50 text-rose-700 border border-rose-200" 
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
              }`}>
                {confidencePct}% AI Confidence
              </div>
            )}
          </div>


          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Condition score</p>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-slate-800">{r.condition_score ?? "—"}</span>
                <span className="text-[10px] text-slate-400">/100</span>
              </div>
              <ConditionBar value={r.condition_score ?? 0} />
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Remaining Life</p>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-slate-800">{r.remaining_life_pct ?? "—"}</span>
                <span className="text-[10px] text-slate-400">%</span>
              </div>
              <ConditionBar value={r.remaining_life_pct ?? 0} />
            </div>
          </div>

          {/* Defects */}
          {r.defects && (
            <div className="bg-slate-50 border border-slate-150 rounded-xl px-3 py-2.5">
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mb-0.5">AI Defects Audit</p>
              <p className="text-xs text-slate-700 leading-normal font-semibold">{r.defects}</p>
            </div>
          )}
        </div>
      </div>

      {/* Card Actions / Override Area */}
      <div className="bg-slate-50 border-t border-slate-100 px-5 py-3.5 flex flex-col gap-3">
        {r.status !== "verified" ? (
          <>
            {!showOverride ? (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowOverride(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-all duration-150 cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5" /> Manual Override
                </button>
                <button
                  type="button"
                  onClick={() => onVerify(r.id)}
                  disabled={processingId === r.id}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 transition-all duration-150 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {processingId === r.id ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Verify & Confirm
                </button>
              </div>
            ) : (
              <form onSubmit={handleOverrideSubmit} className="space-y-3 pt-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Override Action</label>
                    <select
                      value={newAction}
                      onChange={(e) => setNewAction(e.target.value)}
                      className="w-full text-xs font-bold border border-slate-200 bg-white rounded-lg p-2.5 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="resell">Restock (As New)</option>
                      <option value="refurbish">Refurbish (Certified Refurbished)</option>
                      <option value="donate">Donate</option>
                      <option value="recycle">Recycle</option>
                    </select>
                  </div>
                  <div className="flex-[2]">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Override Reason & Diagnosis</label>
                    <input
                      type="text"
                      placeholder="Explain why you are overriding the AI circular disposition..."
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      className="w-full text-xs border border-slate-200 bg-white rounded-lg p-2.5 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowOverride(false);
                      setError("");
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-extrabold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-all duration-150 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={processingId === r.id}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all duration-150 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {processingId === r.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Apply Override"
                    )}
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-200 pb-3">
              <span>Disposition validated and logged.</span>
              <span className="font-extrabold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> RECOVERY LOOP ENGAGED
              </span>
            </div>
            
            {/* Timeline */}
            <div className="pl-2 relative">
              <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-slate-200"></div>
              
              <div className="relative flex items-start gap-4 mb-3">
                <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center relative z-10 flex-shrink-0 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Received</p>
                  <p className="text-xs text-slate-700 mt-0.5">Customer requested return ({r.reason})</p>
                </div>
              </div>

              <div className="relative flex items-start gap-4 mb-3">
                <div className="w-5 h-5 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center relative z-10 flex-shrink-0 mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                </div>
                <div>
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Hub Approval</p>
                  <p className="text-xs text-slate-700 mt-0.5">Validated by Hub Operator</p>
                </div>
              </div>

              <div className="relative flex items-start gap-4">
                <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center relative z-10 flex-shrink-0 mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                </div>
                <div>
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Future Action</p>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5">
                    {r.recommended_action === "resell" && "Will be restocked into inventory for replacements"}
                    {r.recommended_action === "refurbish" && "Pending shipment to refurbishment partner"}
                    {r.recommended_action === "donate" && "Scheduled for charity donation batch"}
                    {r.recommended_action === "recycle" && "Awaiting recycling facility pickup"}
                    {r.recommended_action === "exchange" && "Product exchange processing"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Hub Operations Dashboard ─────────────────────────── */
export default function DeliveryDashboard() {
  const { currentUser } = useUser();

  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  
  // Filters state
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("operations"); // 'operations' | 'restocked'

  const isEmployee = currentUser?.role === "employee" || currentUser?.role === "admin";

  const fetchReturnsList = () => {
    if (!currentUser || !isEmployee) return;
    setLoading(true);
    listReturns(currentUser.id)
      .then((data) => {
        setReturns(data);
        setLastRefresh(new Date());
      })
      .catch((err) => {
        console.error("Failed to load hub returns:", err);
        setReturns([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReturnsList();
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isEmployee) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-5xl">🔒</div>
        <h2 className="text-xl font-black text-slate-900">Hub Operations Authorized Only</h2>
        <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
          Access restricted. Please log in with a Hub Employee or Admin account.
        </p>
        <Link to="/" className="mt-2 text-indigo-600 font-bold hover:underline text-sm">
          ← Return to Storefront
        </Link>
      </div>
    );
  }

  const handleVerify = async (returnId) => {
    setProcessingId(returnId);
    try {
      await verifyReturnDisposition(returnId);
      // Update local state instantly
      setReturns((prev) => 
        prev.map((r) => r.id === returnId ? { ...r, status: "verified" } : r)
      );
    } catch (err) {
      alert(`Verification failed: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleOverride = async (returnId, recommendedAction, justification) => {
    setProcessingId(returnId);
    try {
      await overrideReturnDisposition(returnId, recommendedAction, justification);
      // Update local state instantly
      setReturns((prev) => 
        prev.map((r) => r.id === returnId ? { 
          ...r, 
          status: "verified", 
          recommended_action: recommendedAction,
          defects: `[Manual Override: ${justification}] ${r.defects || ""}`
        } : r)
      );
    } catch (err) {
      alert(`Override failed: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Stat computations
  const totalInHub = returns.length;
  const pendingVerification = returns.filter((r) => r.status !== "verified").length;
  const totalVerified = returns.filter((r) => r.status === "verified").length;
  
  const recoveryItems = returns.filter((r) => ["resell", "refurbish", "exchange", "donate"].includes(r.recommended_action));
  const recoveryRate = totalInHub > 0 
    ? Math.round((recoveryItems.length / totalInHub) * 100) 
    : 0;

  // Filtering returns
  const filteredReturns = returns.filter((r) => {
    // Tab logic
    if (activeTab === "restocked" && r.status !== "verified") return false;
    if (activeTab === "operations" && r.status === "verified") return false;

    // Filters logic
    if (statusFilter === "pending" && r.status === "verified") return false;
    if (statusFilter === "verified" && r.status !== "verified") return false;
    if (actionFilter !== "all" && r.recommended_action !== actionFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (
        !String(r.order_id).includes(q) &&
        !String(r.id).includes(q) &&
        !r.product_name?.toLowerCase().includes(q) &&
        !r.customer_name?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const verifiedCount = totalVerified;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      
      {/* ── Dashboard Navigation Banner ─────────────────── */}
      <div className="bg-slate-900 text-white px-6 py-5 shadow-md">
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-xl flex-shrink-0 font-black shadow-inner">
              ⚙️
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight leading-tight">Circular Operations Control</h1>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                {currentUser.employee_zone || "Global"} Hub · Authorized Operator:{" "}
                <span className="text-indigo-400">{currentUser.name}</span>
                {lastRefresh && (
                  <span className="ml-2 text-slate-500 font-medium normal-case">
                    · Last updated {lastRefresh.toLocaleTimeString("en-IN")}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={fetchReturnsList}
            className="text-xs font-bold text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Force Sync
          </button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">

        {/* ── Operational Insights Stat Cards ───────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon="🗳️"
            label="Total Returns"
            value={loading ? "—" : totalInHub}
            sub={`In ${currentUser.employee_zone || "your zone"}`}
            accentBg="bg-indigo-50"
            accentText="text-indigo-700"
          />
          <StatCard
            icon="⏳"
            label="Pending Review"
            value={loading ? "—" : pendingVerification}
            sub="Need hub confirmation"
            accentBg="bg-amber-50"
            accentText="text-amber-700"
          />
          <StatCard
            icon="♻️"
            label="Recovery Rate"
            value={loading ? "—" : `${recoveryRate}%`}
            sub={`${recoveryItems.length} items saved from landfill`}
            accentBg="bg-emerald-50"
            accentText="text-emerald-700"
          />
          <StatCard
            icon="✅"
            label="Confirmed"
            value={loading ? "—" : totalVerified}
            sub="Outcomes verified by hub"
            accentBg="bg-green-50"
            accentText="text-green-700"
          />
        </div>

        {/* ── Controls: Search & Analytical Filters ────────── */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-2">
            <Filter className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Operational Diagnostics Filters</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-slate-400" />
              </span>
              <input
                type="text"
                placeholder="Search by product, customer, order ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50/50"
              />
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-semibold text-slate-700"
              >
                <option value="all">All Returns</option>
                <option value="pending">Pending Review ({pendingVerification})</option>
                <option value="verified">Confirmed ({totalVerified})</option>
              </select>
            </div>

            {/* Action Filter */}
            <div>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-semibold text-slate-700"
              >
                <option value="all">All Actions</option>
                <option value="resell">Restock</option>
                <option value="refurbish">Refurbish</option>
                <option value="donate">Donate</option>
                <option value="recycle">Recycle</option>
                <option value="exchange">Exchange</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────── */}
        <div className="flex items-center gap-6 border-b border-slate-200">
          <button
            onClick={() => setActiveTab("operations")}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
              activeTab === "operations"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Processing & Processing Outcomes
          </button>
          <button
            onClick={() => setActiveTab("restocked")}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "restocked"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Processed Hub Inventory
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === "restocked" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
            }`}>
              {verifiedCount}
            </span>
          </button>
        </div>

        {/* ── Main Returns List ──────────────────────────── */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-44 rounded-xl bg-white border border-slate-200 animate-pulse shadow-sm" />
            ))}
          </div>
        ) : filteredReturns.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3">
            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto border border-slate-100">
              <CheckSquare className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No returns match your filter criteria</h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Try adjusting your diagnostics filters or check back later for new customer submissions.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
                Showing {filteredReturns.length} return {filteredReturns.length === 1 ? "item" : "items"}
              </p>
            </div>
            {filteredReturns.map((item) => (
              <ReturnCard 
                key={item.id} 
                r={item} 
                onVerify={handleVerify} 
                onOverride={handleOverride} 
                processingId={processingId}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
