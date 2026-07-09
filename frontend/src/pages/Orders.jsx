import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getOrders, getProduct, getCommunityPurchases, vestNoReturnCredits, getBaselineScan, createReturn } from "../api/client";
import { useUser } from "../context/UserContext";

/* ── Credits Badge with simple "why" popup ───────────────── */
function PendingCreditsTooltip({ order }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const isVested = order.no_return_credits_status === "vested";
  const isForfeited = order.no_return_credits_status === "forfeited";
  const credits = order.no_return_credits;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  if (isForfeited) return null;

  return (
    <div className="relative inline-block" ref={ref}>
      {/* Badge */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`
          group flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border
          transition-all duration-200 cursor-pointer select-none
          ${isVested
            ? "bg-[#e6f4ea] border-[#34a853] text-[#1a7a35]"
            : "bg-gradient-to-r from-[#e8f5e9] to-[#f1f8e9] border-[#81c784] text-[#2e7d32] hover:from-[#c8e6c9] hover:to-[#dcedc8] hover:border-[#4caf50]"
          }
        `}
        style={!isVested ? { animation: "credits-pulse 2.5s infinite" } : {}}
      >
        {isVested && <span className="text-[13px]">✅</span>}
        <span>
          {isVested ? `${credits} credits earned!` : `${credits} credits on the way`}
        </span>
        <span className="text-[10px] opacity-50 group-hover:opacity-100 transition-opacity">ⓘ</span>
      </button>

      {/* Simple "why" popup */}
      {open && (
        <div
          className="absolute z-50 left-full ml-2 top-0 w-[240px] bg-white rounded-xl shadow-xl border border-[#c8e6c9] overflow-hidden"
          style={{ animation: "fadeSlideIn 0.15s ease" }}
        >
          {/* Coloured header */}
          <div className="px-3 py-2 bg-[#2e7d32] text-white">
            <p className="text-[12px] font-bold">
              {isVested ? "Green Credits Earned" : "Green Loyalty Credits"}
            </p>
          </div>

          {/* Body */}
          <div className="px-3 py-2.5 text-[12px] text-[#333] leading-relaxed space-y-1.5">
            {isVested ? (
              <p>
                You kept this product past the <strong>{order.return_period_days}-day return window</strong>.
                As a reward, <strong className="text-[#1a7a35]">{credits} Green Credits</strong> have been added to your wallet.
              </p>
            ) : (
              <>
                <p>
                  These <strong className="text-[#2e7d32]">{credits} Green Credits</strong> are a loyalty reward for
                  keeping this product without returning it.
                </p>
                <p className="text-[#555]">
                  They will be automatically granted to you once your{" "}
                  <strong>{order.return_period_days}-day return window</strong> closes.
                </p>
                <p className="text-[11px] text-[#888] pt-0.5">
                  Returning this item will forfeit the pending credits.
                </p>
              </>
            )}
          </div>

          <button
            onClick={() => setOpen(false)}
            className="w-full text-center text-[11px] text-[#888] hover:text-[#444] py-1.5 border-t border-[#e8f5e9] transition-colors"
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main Orders Page ─────────────────────────────────────── */
export default function Orders() {
  const navigate = useNavigate();
  const { currentUser, refreshUser } = useUser();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState({});
  const [loading, setLoading] = useState(true);
  const [returningId, setReturningId] = useState(null);

  const handleReturn = (orderId) => {
    navigate(`/returns/new?orderId=${orderId}`);
  };

  const getOrderSortTime = (order) => {
    const rawTimestamp = order?.placed_at || order?.created_at || order?.sold_at;
    const timeValue = rawTimestamp ? new Date(rawTimestamp).getTime() : 0;
    return Number.isNaN(timeValue) ? 0 : timeValue;
  };

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    Promise.all([
      getOrders(currentUser.id),
      getCommunityPurchases(currentUser.id)
    ])
      .then(async ([standardOrders, commPurchases]) => {
        const commOrders = commPurchases.map(c => ({
          id: `C${c.id}`,
          is_community: true,
          status: "placed",
          created_at: c.sold_at || c.created_at,
          product_id: `C${c.id}`,
          community_data: c,
          no_return_credits: 0,
          no_return_credits_status: "na",
        }));

        const allData = [...standardOrders, ...commOrders];
        // Sort by the newest timestamp first so recently placed orders appear at the top
        allData.sort((a, b) => {
          const timeDiff = getOrderSortTime(b) - getOrderSortTime(a);
          if (timeDiff !== 0) return timeDiff;

          const aNum = Number.parseInt(a.id, 10) || 0;
          const bNum = Number.parseInt(b.id, 10) || 0;
          return bNum - aNum;
        });
        setOrders(allData);

        const prods = {};
        await Promise.all(
          allData.map(async (o) => {
            if (o.is_community) {
              prods[o.product_id] = {
                id: o.community_data.id,
                name: o.community_data.title,
                image_url: o.community_data.image_urls
                  ? (o.community_data.image_urls.startsWith("http")
                    ? o.community_data.image_urls.split(",")[0]
                    : `${import.meta.env.PROD ? "" : `http://${window.location.hostname}:8000`}/api/community/image/${o.community_data.image_urls.split(",")[0]}`)
                  : null,
                price: o.community_data.asking_price,
                brand: o.community_data.brand || o.community_data.category,
              };
            } else if (!prods[o.product_id]) {
              try { prods[o.product_id] = await getProduct(o.product_id); } catch {}
            }
          })
        );
        setProducts(prods);

        // Auto-vest any orders whose window has clearly passed on the client side
        const now = new Date();
        const toVest = standardOrders.filter(o => {
          if (o.no_return_credits_status !== "pending" || !o.placed_at || !o.no_return_credits) return false;
          const vestDate = new Date(new Date(o.placed_at).getTime() + o.return_period_days * 86400000);
          return now >= vestDate;
        });

        if (toVest.length > 0) {
          // Fire vest requests in parallel (silent — no loading state)
          await Promise.allSettled(
            toVest.map(o =>
              vestNoReturnCredits(o.id).then(res => {
                if (res.status === "vested" && res.credits_vested > 0) {
                  setOrders(prev =>
                    prev.map(ord =>
                      ord.id === o.id
                        ? { ...ord, no_return_credits_status: "vested", no_return_credits: res.credits_vested }
                        : ord
                    )
                  );
                } else if (res.status === "forfeited") {
                  setOrders(prev =>
                    prev.map(ord => ord.id === o.id ? { ...ord, no_return_credits_status: "forfeited" } : ord)
                  );
                }
              }).catch(() => {})
            )
          );
          // NOTE: do NOT call refreshUser() here — it would update currentUser
          // and re-trigger this effect, causing an infinite reload loop.
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentUser]);

  const handleVested = (orderId, creditsVested) => {
    setOrders(prev =>
      prev.map(o =>
        o.id === orderId
          ? { ...o, no_return_credits_status: "vested", no_return_credits: creditsVested }
          : o
      )
    );
    // Credits updated on server — user balance will refresh on next page load / profile visit
  };

  const statusStyles = {
    placed:          { color: "text-[#067d62]",             label: "Order Received" },
    delivered:       { color: "text-[#067d62]",             label: "Delivered" },
    returned:        { color: "text-amazon-red",            label: "Returned" },
    return_pending:  { color: "text-[#c7511f]",             label: "Return Requested — Awaiting Pickup" },
    return_verified: { color: "text-[#8b5cf6]",             label: "Return Verified" },
  };

  const pendingCount = orders.filter(
    o => !o.is_community && o.no_return_credits > 0 && o.no_return_credits_status === "pending"
  ).length;

  const vestedCount = orders.filter(
    o => !o.is_community && o.no_return_credits_status === "vested"
  ).length;

  return (
    <>
      <style>{`
        @keyframes credits-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(76,175,80,0.5); }
          70%  { box-shadow: 0 0 0 7px rgba(76,175,80,0); }
          100% { box-shadow: 0 0 0 0 rgba(76,175,80,0); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="bg-white min-h-screen animate-fade-in">
        <div className="max-w-[1100px] mx-auto px-4 py-6">
          {/* Breadcrumb */}
          <div className="text-[12px] text-amazon-text-secondary mb-3">
            <Link to="/" className="text-amazon-link hover:underline">Your Account</Link>
            <span className="mx-1">›</span>
            <span>Your Orders</span>
          </div>

          <h1 className="text-[28px] text-amazon-text font-normal mb-1">Your Orders</h1>

          {/* Tabs */}
          <div className="border-b border-amazon-border mb-4 flex gap-0">
            <span className="text-[14px] font-bold text-amazon-text border-b-2 border-amazon-orange pb-2 px-3">
              Orders
            </span>
            <Link to="/returns/new" className="text-[14px] text-amazon-link hover:text-amazon-link-hover pb-2 px-3">
              Returns
            </Link>
          </div>




          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="border border-amazon-border rounded-lg h-[140px] animate-pulse bg-[#fafafa]" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="border border-amazon-border rounded-lg p-8 text-center">
              <p className="text-[16px] text-amazon-text mb-2">You have no orders.</p>
              <Link to="/" className="text-amazon-link text-[14px] hover:underline">Continue shopping</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => {
                const prod = products[order.product_id];
                const st = statusStyles[order.status] || { color: "text-amazon-text-secondary", label: order.status };
                const showCreditsBadge =
                  !order.is_community &&
                  order.no_return_credits > 0 &&
                  order.status !== "returned" &&
                  order.no_return_credits_status !== "forfeited" &&
                  order.no_return_credits_status !== "na";

                // Format placed date
                const placedDate = order.placed_at
                  ? new Date(order.placed_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
                  : "13 June, 2026";

                return (
                  <div key={order.id} className="border border-amazon-border rounded-lg overflow-hidden">
                    {/* Order header */}
                    <div className="bg-[#f0f2f2] px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-amazon-text-secondary border-b border-amazon-border">
                      <div className="flex gap-6">
                        <div>
                          <p className="uppercase font-bold text-[11px]">Order Placed</p>
                          <p>{placedDate}</p>
                        </div>
                        <div>
                          <p className="uppercase font-bold text-[11px]">Total</p>
                          <p className="text-amazon-text font-bold">
                            ₹{prod ? Math.floor(prod.price).toLocaleString("en-IN") : "—"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="uppercase font-bold text-[11px]">Order # {order.id}</p>
                      </div>
                    </div>

                    {/* Order body */}
                    <div className="p-4 flex gap-4">
                      {prod && (
                        <Link to={`/products/${prod.id}`}>
                          <img
                            src={prod.image_url || "https://via.placeholder.com/80"}
                            alt={prod.name}
                            className="w-[90px] h-[90px] object-contain flex-shrink-0"
                          />
                        </Link>
                      )}
                      <div className="flex-1">
                        <p className={`text-[14px] font-bold ${st.color} mb-1`}>{st.label}</p>
                        <p className="text-[14px] text-amazon-link hover:text-amazon-link-hover">
                          {prod
                            ? <Link to={`/products/${prod.id}`}>{prod.name}</Link>
                            : `Product #${order.product_id}`}
                        </p>
                        {prod && <p className="text-[12px] text-amazon-text-secondary mt-0.5">{prod.brand}</p>}

                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {order.fit_score != null && (
                            <span className="text-[11px] bg-[#f0f2f2] px-2 py-0.5 rounded text-amazon-text">
                              Fit Score: <b>{order.fit_score}%</b>
                            </span>
                          )}
                          {order.return_risk && (
                            <span className={`text-[11px] px-2 py-0.5 rounded font-bold text-white ${
                              order.return_risk === "low" ? "bg-[#067d62]" : order.return_risk === "medium" ? "bg-[#c7511f]" : "bg-amazon-red"
                            }`}>
                              Risk: {order.return_risk}
                            </span>
                          )}
                          {order.is_community && (
                            <span className="text-[11px] bg-[#00a86b] px-2 py-0.5 rounded font-bold text-white">
                              Community Purchase
                            </span>
                          )}

                          {/* 🌱 Credits Badge */}
                          {showCreditsBadge && (
                            <PendingCreditsTooltip order={order} onVested={handleVested} />
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2 mt-3">
                          {prod && !order.is_community && (
                            <Link to={`/products/${prod.id}`} className="btn-amazon text-[12px] px-3 py-1">
                              Buy it again
                            </Link>
                          )}
                          {/* Return button — only shown if product has a return policy and order not yet returned */}
                          {!order.is_community && order.status !== "returned" && order.status !== "return_pending" && order.status !== "return_verified" && (() => {
                            const noReturn = prod?.has_no_return_policy;
                            const returnDays = prod?.return_period_days ?? order.return_period_days ?? 7;
                            const placedAt = order.placed_at ? new Date(order.placed_at) : null;
                            const returnDeadline = placedAt ? new Date(placedAt.getTime() + returnDays * 86400000) : null;
                            const isWithinWindow = returnDeadline ? new Date() <= returnDeadline : true;
                            const daysLeft = returnDeadline ? Math.max(0, Math.ceil((returnDeadline - new Date()) / 86400000)) : null;

                            if (noReturn) {
                              return (
                                <span className="inline-flex items-center gap-1 text-[11px] bg-red-50 border border-red-200 text-red-600 px-2.5 py-1 rounded font-bold">
                                  🚫 No Return Policy
                                </span>
                              );
                            }
                            if (!isWithinWindow) {
                              return (
                                <span className="inline-flex items-center gap-1 text-[11px] bg-[#f0f2f2] border border-amazon-border text-amazon-text-secondary px-2.5 py-1 rounded">
                                  ⏰ Return window expired
                                </span>
                              );
                            }
                            return (
                              <button
                                onClick={() => handleReturn(order.id)}
                                disabled={returningId === order.id}
                                className="btn-amazon text-[12px] px-3 py-1 flex items-center gap-1 disabled:opacity-50"
                              >
                                {returningId === order.id ? "Processing…" : "Return or Replace"}
                                {daysLeft !== null && returningId !== order.id && (
                                  <span className={`ml-1 text-[10px] font-bold ${
                                    daysLeft <= 2 ? 'text-red-500' : daysLeft <= 5 ? 'text-orange-500' : 'text-[#067d62]'
                                  }`}>
                                    {daysLeft}d left
                                  </span>
                                )}
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
