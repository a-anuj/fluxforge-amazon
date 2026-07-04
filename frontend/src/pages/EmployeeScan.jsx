import { useState, useEffect } from "react";
import { useUser } from "../context/UserContext";
import { getPendingBaselineOrders, submitBaselineScan, submitPickupScan } from "../api/client";
import LiveVideoScanner, { SCAN_PHASES } from "../components/LiveVideoScanner";

function OrderPicker({ orders, selectedOrder, onSelect, loading }) {
  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex-shrink-0 w-[180px] h-[90px] rounded-xl bg-[#1e293b] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!orders.length) {
    return (
      <div className="text-center py-8 text-[#94a3b8]">
        <div className="text-3xl mb-2">📦</div>
        <p className="text-[13px]">No pending items awaiting verification</p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {orders.map((o) => (
        <button
          key={o.order_id}
          onClick={() => onSelect(o)}
          className={`flex-shrink-0 w-[200px] text-left rounded-xl border-2 p-3 transition-all ${
            selectedOrder?.order_id === o.order_id
              ? "border-[#febd69] bg-[#2d2416]"
              : "border-[#334155] bg-[#1e293b] hover:border-[#febd69]/50"
          }`}
        >
          {o.product_image && (
            <img src={o.product_image} alt="" className="w-10 h-10 object-contain mb-2 rounded" />
          )}
          <p className="text-[12px] font-bold text-white truncate">{o.product_name}</p>
          <p className="text-[11px] text-[#94a3b8]">Order #{o.order_id}</p>
          <p className="text-[11px] text-[#94a3b8] truncate">→ {o.customer_name}</p>
          {o.is_return ? (
            <span className="inline-block mt-1 text-[9px] bg-[#7e22ce] text-[#d8b4fe] px-1.5 py-0.5 rounded font-bold mr-1">RETURN PICKUP</span>
          ) : null}
          {o.has_no_return_policy ? (
            <span className="inline-block mt-1 text-[9px] bg-red-900 text-red-300 px-1.5 py-0.5 rounded font-bold">NO RETURN</span>
          ) : (
            <span className="inline-block mt-1 text-[9px] bg-[#064e3b] text-[#6ee7b7] px-1.5 py-0.5 rounded font-bold">
              {o.return_period_days}d return
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function SuccessScreen({ result, onReset, isAdmin }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-6 bg-[#030712]">
      <div className="text-7xl animate-bounce">✅</div>
      <div>
        <h2 className="text-[22px] font-bold text-white mb-2">{isAdmin ? "Package Verified!" : "Delivery Verified!"}</h2>
        <p className="text-[#94a3b8] text-[14px] max-w-sm mx-auto">
          Live scan recorded for <strong className="text-white">{result?.product}</strong>.
          The customer can now see this order as delivered, and any future return will be compared against this baseline.
        </p>
      </div>
      <div className="bg-[#1e293b] rounded-xl p-4 text-left w-full max-w-sm">
        <p className="text-[12px] text-[#94a3b8] font-bold uppercase tracking-wider mb-2">Scan Summary</p>
        <div className="space-y-1 text-[13px]">
          <div className="flex justify-between"><span className="text-[#94a3b8]">Order #</span><span className="text-white font-bold">{result?.order_id}</span></div>
          <div className="flex justify-between"><span className="text-[#94a3b8]">Type</span><span className="text-white font-bold">{result?.is_return ? "Return Pickup" : "Delivery Baseline"}</span></div>
          <div className="flex justify-between"><span className="text-[#94a3b8]">Operator</span><span className="text-white">{result?.employee}</span></div>
          <div className="flex justify-between"><span className="text-[#94a3b8]">Time</span><span className="text-white">{new Date(result?.baseline_scan_at).toLocaleTimeString()}</span></div>
          {result?.frame_count > 0 && (
            <div className="flex justify-between">
              <span className="text-[#94a3b8]">Frames Stored</span>
              <span className="text-[#6ee7b7] font-bold">✓ {result.frame_count} angles in S3</span>
            </div>
          )}
        </div>
      </div>
      <button
        onClick={onReset}
        className="bg-[#febd69] hover:bg-[#f3a847] text-[#0f1111] font-bold px-8 py-3 rounded-lg transition-colors"
      >
        {isAdmin ? "Verify Next Package →" : "Verify Next Delivery →"}
      </button>
    </div>
  );
}

export default function EmployeeScan() {
  const { currentUser } = useUser();
  const [pendingOrders, setPendingOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState("pick");

  const isEmployee = currentUser?.role === "employee";
  const isAdmin = currentUser?.role === "admin";
  const canScan = isEmployee || isAdmin;
  const scanModeLabel = isAdmin ? "Packaging" : "Delivery";
  const scanTitle = isAdmin ? "Packaging Verification Scan" : "Delivery Verification Scan";
  const scanRoleLabel = isAdmin ? "Packaging Operator" : "Delivery Agent";

  useEffect(() => {
    if (!currentUser || !canScan) return;
    setLoadingOrders(true);
    getPendingBaselineOrders(currentUser.id)
      .then(setPendingOrders)
      .catch(() => setPendingOrders([]))
      .finally(() => setLoadingOrders(false));
  }, [currentUser, canScan]);

  const handleScanComplete = async ({ videoBlob, frames, phases }) => {
    if (!selectedOrder || !videoBlob) return;
    setSubmitting(true);
    setError(null);
    try {
      let snapshotBlob = null;
      if (frames && frames.length > 0) {
        const res = await fetch(frames[0]);
        snapshotBlob = await res.blob();
      }

      // Build a phase-keyed map of data URLs for angle-matched S3 storage
      // phases = [{id, label, frame}, ...] from LiveVideoScanner
      const framesMap = {};
      if (phases && phases.length > 0) {
        for (const p of phases) {
          if (p.id && p.frame) framesMap[p.id] = p.frame;
        }
      }

      let res;
      if (selectedOrder.is_return) {
        res = await submitPickupScan(selectedOrder.return_id, currentUser.id, videoBlob);
        res.product = selectedOrder.product_name;
        res.baseline_scan_at = new Date().toISOString();
        res.employee = currentUser.name;
        res.is_return = true;
      } else {
        res = await submitBaselineScan(selectedOrder.order_id, currentUser.id, videoBlob, snapshotBlob, framesMap);
      }
      setResult(res);
      setPhase("done");
    } catch (err) {
      if (err.detail && err.detail.type === "product_mismatch") {
        setError(`Product mismatch detected: ${err.detail.detected_product}. ${err.detail.reason}`);
      } else {
        setError(err.message || "Failed to submit scan. Please try again.");
      }
      setPhase("pick");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedOrder(null);
    setResult(null);
    setError(null);
    setPhase("pick");
    if (currentUser && canScan) {
      getPendingBaselineOrders(currentUser.id).then(setPendingOrders).catch(() => {});
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center">
        <p className="text-[#94a3b8]">Loading…</p>
      </div>
    );
  }

  if (!canScan) {
    return (
      <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-5xl">🔒</div>
        <h2 className="text-[20px] font-bold text-white">Operator Access Only</h2>
        <p className="text-[#94a3b8] text-[14px] max-w-sm">
          This page is for packaging or delivery operators. Switch to an admin or employee
          profile using the user switcher in the top navigation to access this feature.
        </p>
        <div className="mt-2 bg-[#1e293b] rounded-xl p-4 text-left max-w-sm w-full">
          <p className="text-[11px] text-[#febd69] font-bold uppercase tracking-wider mb-2">Demo Tip</p>
          <p className="text-[12px] text-[#94a3b8]">
            Switch to <strong className="text-white">Sneha Delivery Agent</strong> or an admin profile in the Accounts dropdown.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="min-h-screen bg-[#030712] flex flex-col">
        <SuccessScreen result={result} onReset={handleReset} isAdmin={isAdmin} />
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#030712] flex flex-col text-white overflow-hidden">
      <div className="bg-[#131921] border-b border-[#1e293b] px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#febd69] flex items-center justify-center text-xl flex-shrink-0">
          📦
        </div>
        <div>
          <h1 className="text-[16px] font-bold text-white">{scanTitle}</h1>
          <p className="text-[11px] text-[#94a3b8]">
            {currentUser.name} · {currentUser.employee_zone || scanRoleLabel}
          </p>
        </div>
        <div className="ml-auto">
          <span className="text-[11px] bg-[#febd69] text-[#0f1111] font-bold px-2 py-0.5 rounded-full">
            {isAdmin ? "ADMIN" : "EMPLOYEE"}
          </span>
        </div>
      </div>

      {phase === "pick" && (
        <div className="flex-1 flex flex-col gap-0 overflow-y-auto">
          <div className="px-4 pt-5 pb-3">
            <h2 className="text-[15px] font-bold mb-1">Select {scanModeLabel} to Verify</h2>
            <p className="text-[12px] text-[#94a3b8]">
              Choose the order awaiting verification. A guided live video scan creates the product baseline
              and unlocks the order for the customer.
            </p>
          </div>

          <div className="px-4 pb-4">
            <OrderPicker
              orders={pendingOrders}
              selectedOrder={selectedOrder}
              onSelect={setSelectedOrder}
              loading={loadingOrders}
            />
          </div>

          {selectedOrder && (
            <div className="px-4 pb-6">
              <div className="bg-[#1e293b] rounded-xl p-4 mb-4 border border-[#334155]">
                <div className="flex items-start gap-3">
                  {selectedOrder.product_image && (
                    <img src={selectedOrder.product_image} alt="" className="w-14 h-14 object-contain rounded-lg" />
                  )}
                  <div className="flex-1">
                    <p className="font-bold text-[14px] text-white">{selectedOrder.product_name}</p>
                    <p className="text-[12px] text-[#94a3b8]">Order #{selectedOrder.order_id}</p>
                    <p className="text-[12px] text-[#94a3b8]">Customer: {selectedOrder.customer_name} · {selectedOrder.customer_pincode}</p>
                  </div>
                </div>
              </div>

              <div className="bg-[#0f1a2e] rounded-xl p-4 mb-4 border border-[#1e3a5f]">
                <p className="text-[12px] text-[#60a5fa] font-bold mb-3 uppercase tracking-wider">
                  🎬 Live Motion Scan — {SCAN_PHASES.length} guided phases
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {SCAN_PHASES.map((a) => (
                    <div key={a.id} className="flex items-center gap-1.5 text-[12px]">
                      <span>{a.icon}</span>
                      <span className="text-[#cbd5e1]">{a.label}: <span className="text-[#93c5fd]">{a.motion}</span></span>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="mb-3 bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-[13px]">
                  ⚠️ {error}
                </div>
              )}

              <button
                onClick={() => setPhase("scan")}
                disabled={submitting}
                className="w-full bg-[#febd69] hover:bg-[#f3a847] text-[#0f1111] font-bold py-4 rounded-xl text-[16px] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                🎥 Start Live Verification Scan
              </button>
            </div>
          )}
        </div>
      )}

      {phase === "scan" && (
        <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
          {submitting ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-[#febd69] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-[#94a3b8] text-[14px]">Uploading baseline scan…</p>
              </div>
            </div>
          ) : (
            <LiveVideoScanner
              title={`Order #${selectedOrder?.order_id} — ${selectedOrder?.product_name}`}
              subtitle="A slower fingerprint-style pass captures the product from every side"
              onComplete={handleScanComplete}
              onCancel={() => setPhase("pick")}
              orderId={selectedOrder?.order_id}
              productName={selectedOrder?.product_name || ""}
              productCategory={selectedOrder?.product_category || ""}
            />
          )}
        </div>
      )}
    </div>
  );
}
