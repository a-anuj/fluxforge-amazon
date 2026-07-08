import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
  BarChart, Bar, Cell,
} from "recharts";
import { TrendingDown, Package, Leaf, IndianRupee } from "lucide-react";
import { getDashboardMetrics } from "../api/client";
import { useUser } from "../context/UserContext";

const COLORS = ["#10B981", "#6366F1", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6"];

export default function Dashboard() {
  const { currentUser, loading: userLoading, isAdminMode } = useUser();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    if (userLoading) return;
    if (!isAdminMode) { setLoading(false); return; }
    getDashboardMetrics()
      .then(setMetrics)
      .catch((err) => setError(err.message || "Failed to load metrics"))
      .finally(() => setLoading(false));
  }, [isAdminMode, userLoading]);

  if (userLoading || loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAdminMode) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="rounded-xl border border-red-100 bg-red-50 p-8">
          <p className="text-2xl mb-3">🔒</p>
          <h2 className="text-lg font-bold text-red-600 mb-2">Admin only</h2>
          <p className="text-sm text-gray-500 mb-4">You need an admin account to view this dashboard.</p>
          <Link to="/" className="inline-block bg-[#FFD814] hover:bg-[#F7CA00] text-[#0f1923] font-bold px-5 py-2 rounded-lg text-sm transition-colors">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-red-500 font-semibold">{error}</p>
        <p className="text-sm text-gray-400 mt-2">Make sure the backend is running.</p>
      </div>
    );
  }

  if (!metrics) return null;

  const { overall, historicalTrends, reasonReturns, topReturnedProducts } = metrics;

  const kpis = [
    {
      label: "Return Rate Reduction",
      value: `${overall.reductionInReturnRate}%`,
      icon: TrendingDown,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      desc: "Fewer returns vs. baseline",
    },
    {
      label: "Items Resold / Refurbished",
      value: overall.productsResold.toLocaleString(),
      icon: Package,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      border: "border-indigo-100",
      desc: "Products given a second life",
    },
    {
      label: "CO₂ Saved",
      value: `${overall.carbonEmissionsSavedKg.toLocaleString()} kg`,
      icon: Leaf,
      color: "text-teal-600",
      bg: "bg-teal-50",
      border: "border-teal-100",
      desc: "Emissions avoided this cycle",
    },
    {
      label: "Cost Savings",
      value: `₹${overall.costSavingsINR.toLocaleString()}`,
      icon: IndianRupee,
      color: "text-green-600",
      bg: "bg-green-50",
      border: "border-green-100",
      desc: "Saved vs. traditional returns",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Hub Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Circular returns performance at a glance</p>
      </div>

      {/* KPI Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`rounded-xl border ${kpi.border} bg-white p-5 shadow-sm`}>
            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${kpi.bg}`}>
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
            </div>
            <p className="text-[12px] font-medium text-gray-500 mb-0.5">{kpi.label}</p>
            <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
            <p className="text-[11px] text-gray-400 mt-1">{kpi.desc}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {/* Return Rate Trend */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Return Rate Trend</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historicalTrends} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#9CA3AF", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9CA3AF", fontSize: 11 }} domain={["dataMin - 1", "dataMax + 1"]} />
                <RechartsTooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)" }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
                <Line type="monotone" dataKey="returnRate" name="Return Rate (%)" stroke="#10B981" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Return Reasons */}
        {reasonReturns && reasonReturns.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Return Reasons</h2>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reasonReturns} margin={{ top: 5, right: 10, bottom: 5, left: -10 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F3F4F6" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#9CA3AF", fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#6B7280", fontSize: 11 }} width={90} />
                  <RechartsTooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)" }} />
                  <Bar dataKey="value" name="Returns" radius={[0, 4, 4, 0]}>
                    {reasonReturns.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Top Returned Products */}
      {topReturnedProducts && topReturnedProducts.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Most Returned Products</h2>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Brand</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Returns</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {topReturnedProducts.map((p, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-6 py-3 text-gray-600">{p.brand}</td>
                  <td className="px-6 py-3 text-gray-600">{p.category}</td>
                  <td className="px-6 py-3 text-right font-bold text-red-500">{p.returns}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
