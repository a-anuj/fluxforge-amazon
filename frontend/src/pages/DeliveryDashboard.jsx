import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { getPendingBaselineOrders } from "../api/client";

/* ─── Stat card ─────────────────────────────────────────────── */
function StatCard({ icon, label, value, sub, accentBg, accentText }) {
  return (
    <div className="flex items-center gap-4 bg-white border border-[#d5d9d9] rounded-lg p-5 flex-1 min-w-[160px] shadow-sm">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl flex-shrink-0 ${accentBg}`}>
        {icon}
      </div>
      <div>
        <p className={`text-[28px] font-extrabold leading-none ${accentText}`}>{value}</p>
        <p className="text-[12px] text-[#565959] mt-0.5 font-medium">{label}</p>
        {sub && <p className="text-[11px] text-[#888] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── Order row ─────────────────────────────────────────────── */
function OrderRow({ order, onScan }) {
  const placedAt = order.placed_at
    ? new Date(order.placed_at).toLocaleString("en-IN", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";

  const isReturn = order.is_return;

  return (
    <div className="flex items-center gap-4 bg-white border border-[#d5d9d9] rounded-lg px-5 py-4 hover:border-[#e77600] hover:shadow-sm transition-all group">
      {/* Thumbnail */}
      <div className="w-14 h-14 rounded-md bg-[#f0f2f2] flex items-center justify-center flex-shrink-0 overflow-hidden border border-[#e3e6e6]">
        {order.product_image ? (
          <img src={order.product_image} alt="" className="w-full h-full object-contain mix-blend-multiply" />
        ) : (
          <span className="text-2xl">{isReturn ? "↩️" : "📦"}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-[#0f1111] truncate">{order.product_name}</p>
        <p className="text-[13px] text-[#565959] truncate">
          <span className="font-medium">{order.customer_name}</span>
          {order.customer_pincode && (
            <span className="ml-1 text-[#888]">· {order.customer_pincode}</span>
          )}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[11px] text-[#888]">Order #{order.order_id}</span>
          {isReturn && (
            <span className="text-[10px] bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-bold">
              RETURN PICKUP
            </span>
          )}
          {!isReturn && order.has_no_return_policy && (
            <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded font-bold">
              NO RETURN
            </span>
          )}
          {!isReturn && !order.has_no_return_policy && order.return_period_days && (
            <span className="text-[10px] bg-[#e6f4ea] text-[#1a7a35] border border-[#c8e6c9] px-1.5 py-0.5 rounded font-bold">
              {order.return_period_days}d return
            </span>
          )}
        </div>
      </div>

      {/* Time + CTA */}
      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        <span className="text-[11px] text-[#888]">{placedAt}</span>
        <button
          onClick={() => onScan(order)}
          className="text-[12px] bg-[#FFD814] hover:bg-[#F7CA00] border border-[#FCD200] text-[#0f1111] font-bold px-4 py-1.5 rounded shadow-sm transition-colors"
        >
          Start Scan →
        </button>
      </div>
    </div>
  );
}

/* ─── Section ───────────────────────────────────────────────── */
function Section({ title, badge, badgeBg, badgeText, children, empty, emptyIcon = "📭" }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[16px] font-bold text-[#0f1111]">{title}</h2>
        {badge !== undefined && (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badgeBg} ${badgeText}`}>
            {badge}
          </span>
        )}
      </div>
      {empty ? (
        <div className="text-center py-10 bg-white border border-[#d5d9d9] rounded-lg shadow-sm">
          <span className="text-3xl">{emptyIcon}</span>
          <p className="text-[13px] text-[#888] mt-2">{empty}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */
export default function DeliveryDashboard() {
  const navigate = useNavigate();
  const { currentUser } = useUser();

  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const isEmployee = currentUser?.role === "employee";

  const fetchOrders = () => {
    if (!currentUser || !isEmployee) return;
    setLoading(true);
    getPendingBaselineOrders(currentUser.id)
      .then((data) => {
        setAllOrders(data);
        setLastRefresh(new Date());
      })
      .catch(() => setAllOrders([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#febd69] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isEmployee) {
    return (
      <div className="min-h-screen bg-[#f0f2f2] flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-5xl">🔒</div>
        <h2 className="text-[20px] font-bold text-[#0f1111]">Delivery Agent Access Only</h2>
        <p className="text-[#565959] text-[13px] max-w-xs">
          Switch to a delivery employee profile to access this dashboard.
        </p>
        <Link to="/" className="mt-2 text-amazon-link text-[13px] font-bold hover:underline">
          ← Back to Home
        </Link>
      </div>
    );
  }

  const pendingDeliveries = allOrders.filter((o) => !o.is_return);
  const returnPickups = allOrders.filter((o) => o.is_return);
  const totalPending = pendingDeliveries.length;
  const totalReturns = returnPickups.length;
  const totalQueue = allOrders.length;

  const handleScan = (order) => {
    sessionStorage.setItem("preselectOrder", JSON.stringify(order));
    navigate("/employee-scan");
  };

  return (
    <div className="min-h-screen bg-[#f0f2f2]">

      {/* ── Agent banner ─────────────────────────────────── */}
      <div className="bg-[#232f3e] text-white px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#febd69] flex items-center justify-center text-xl flex-shrink-0">
              🚚
            </div>
            <div>
              <h1 className="text-[16px] font-bold leading-tight">{currentUser.name}</h1>
              <p className="text-[11px] text-[#ccc]">
                {currentUser.employee_zone || "Delivery Agent"} ·{" "}
                <span className="text-[#febd69] font-semibold">On Duty</span>
                {lastRefresh && (
                  <span className="ml-2 text-[#888]">
                    · Updated {lastRefresh.toLocaleTimeString("en-IN")}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={fetchOrders}
            className="text-[12px] text-[#ccc] hover:text-white border border-[#3a4553] hover:border-[#555] px-3 py-1.5 rounded transition-colors flex items-center gap-1.5"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">

        {/* ── Stat Cards ───────────────────────────────── */}
        <div className="flex gap-4 flex-wrap">
          <StatCard
            icon="📦"
            label="Pending Deliveries"
            value={loading ? "—" : totalPending}
            sub={totalPending > 0 ? "Awaiting your scan" : "All clear!"}
            accentBg="bg-[#fff3cd]"
            accentText="text-[#c45500]"
          />
          <StatCard
            icon="↩️"
            label="Return Pickups"
            value={loading ? "—" : totalReturns}
            sub={totalReturns > 0 ? "Pickup + scan needed" : "None pending"}
            accentBg="bg-purple-100"
            accentText="text-purple-700"
          />
          <StatCard
            icon="⏳"
            label="Total in Queue"
            value={loading ? "—" : totalQueue}
            sub="Your active workload"
            accentBg="bg-blue-50"
            accentText="text-blue-700"
          />
        </div>

        {/* ── Info banner ───────────────────────────── */}
        <div className="bg-[#ebf2fb] border border-[#1a6bb5]/30 rounded-lg px-5 py-3 flex items-start gap-3">
          <span className="text-[18px] mt-0.5 flex-shrink-0">ℹ️</span>
          <p className="text-[13px] text-[#1a6bb5] leading-relaxed">
            For each delivery, tap <strong>Start Scan →</strong> to open the live video scanner.
            The scan creates an AI baseline of the product condition, marks it as{" "}
            <em>delivered</em> for the customer, and enables future return verification.
          </p>
        </div>

        {/* ── Two-column grid on wide screens ─────────── */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-[80px] rounded-lg bg-white border border-[#d5d9d9] animate-pulse shadow-sm" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Section
              title="Pending Deliveries"
              badge={totalPending}
              badgeBg="bg-[#fff3cd]"
              badgeText="text-[#c45500]"
              empty={totalPending === 0 ? "No pending deliveries in your zone 🎉" : null}
              emptyIcon="✅"
            >
              {pendingDeliveries.map((o) => (
                <OrderRow key={o.order_id} order={o} onScan={handleScan} />
              ))}
            </Section>

            <Section
              title="Return Pickups"
              badge={totalReturns}
              badgeBg="bg-purple-100"
              badgeText="text-purple-700"
              empty={totalReturns === 0 ? "No return pickups assigned" : null}
              emptyIcon="↩️"
            >
              {returnPickups.map((o) => (
                <OrderRow key={o.order_id} order={o} onScan={handleScan} />
              ))}
            </Section>
          </div>
        )}


      </div>
    </div>
  );
}
