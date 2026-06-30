import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart,
  Line
} from "recharts";
import { 
  TrendingDown, 
  ShieldCheck, 
  BrainCircuit, 
  ThumbsUp, 
  Clock, 
  IndianRupee, 
  Package, 
  Leaf,
  Download
} from "lucide-react";
import { getDashboardMetrics } from "../api/client";
import { useUser } from "../context/UserContext";

export default function Dashboard() {
  const { currentUser, loading: userLoading } = useUser();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (userLoading) return;
    if (!currentUser || !currentUser.is_admin) {
      setLoading(false);
      return;
    }

    const fetchMetrics = async () => {
      try {
        const data = await getDashboardMetrics();
        setMetrics(data);
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
        setError(err.message || "Failed to load metrics");
      } finally {
        setLoading(false);
      }
    };
    
    fetchMetrics();
  }, [currentUser, userLoading]);

  const handleExportCSV = () => {
    if (!metrics) return;
    
    // Create CSV content
    const headers = ["Month", "Return Rate (%)", "AI Accuracy (%)"];
    const rows = metrics.historicalTrends.map(t => 
      `${t.month},${t.returnRate},${t.aiAccuracy}`
    );
    
    const csvContent = [headers.join(","), ...rows].join("\n");
    
    // Trigger download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "ai_returns_metrics.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (userLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!currentUser || !currentUser.is_admin) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 text-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto shadow-sm">
          <h2 className="text-xl font-bold text-red-600 mb-2">Access Denied</h2>
          <p className="text-gray-600 text-sm mb-4">
            Only administrator accounts are authorized to view this KPI Dashboard.
          </p>
          <Link to="/" className="inline-block bg-[#FFD814] hover:bg-[#F7CA00] text-amazon-text font-bold px-4 py-2 rounded text-sm transition-colors shadow">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 text-center">
        <h2 className="text-xl font-bold text-red-600 mb-2">Error Loading Dashboard</h2>
        <p className="text-gray-600">{error}</p>
        <p className="text-sm text-gray-500 mt-4">Make sure the backend is running with the latest code.</p>
      </div>
    );
  }

  if (!metrics) return null;

  const { overall, historicalTrends } = metrics;

  const kpis = [
    { label: "Return Rate Reduction", value: `${overall.reductionInReturnRate}%`, icon: TrendingDown, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Eco-Delivery Choice", value: `${overall.ecoDeliveryRate}%`, icon: Package, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "AI Inspection Accuracy", value: `${overall.aiInspectionAccuracy}%`, icon: BrainCircuit, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Customer Satisfaction", value: `${overall.customerSatisfaction}/5`, icon: ThumbsUp, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Processing Time", value: `${overall.processingTimeMinutes}m`, icon: Clock, color: "text-orange-500", bg: "bg-orange-500/10" },
    { label: "Cost Savings", value: `₹${overall.costSavingsINR.toLocaleString()}`, icon: IndianRupee, color: "text-green-500", bg: "bg-green-500/10" },
    { label: "Items Resold / Refurbished", value: overall.productsResold.toLocaleString(), icon: Package, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { label: "CO₂ Saved", value: `${overall.carbonEmissionsSavedKg.toLocaleString()}kg`, icon: Leaf, color: "text-teal-500", bg: "bg-teal-500/10" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track KPIs and success metrics for the AI-powered Return System
          </p>
        </div>
        <button 
          onClick={handleExportCSV}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          Export Report
        </button>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${kpi.bg}`}>
              <kpi.icon className={`h-6 w-6 ${kpi.color}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{kpi.label}</p>
              <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-gray-900">Return Rate Trend</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historicalTrends} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#6B7280", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#6B7280", fontSize: 12 }} domain={['dataMin - 1', 'dataMax + 1']} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                />
                <Legend iconType="circle" />
                <Line 
                  type="monotone" 
                  dataKey="returnRate" 
                  name="Return Rate (%)" 
                  stroke="#10B981" 
                  strokeWidth={3}
                  activeDot={{ r: 6 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-gray-900">AI Accuracy Overview</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={historicalTrends} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#6B7280", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#6B7280", fontSize: 12 }} domain={[80, 100]} />
                <RechartsTooltip 
                  cursor={{ fill: "#F3F4F6" }}
                  contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                />
                <Legend iconType="circle" />
                <Bar 
                  dataKey="aiAccuracy" 
                  name="AI Inspection Accuracy (%)" 
                  fill="#8B5CF6" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
