import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getOrders, getProduct, getCommunityPurchases } from "../api/client";
import { useUser } from "../context/UserContext";

export default function Orders() {
  const { currentUser } = useUser();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    Promise.all([
      getOrders(currentUser.id),
      getCommunityPurchases(currentUser.id)
    ])
      .then(async ([standardOrders, commPurchases]) => {
        // Normalize community purchases to look like orders
        const commOrders = commPurchases.map(c => ({
          id: `C${c.id}`,
          is_community: true,
          status: 'delivered', // Assume delivered for community
          created_at: c.sold_at || c.created_at,
          product_id: `C${c.id}`, // Dummy ID to match prod lookup
          community_data: c
        }));
        
        const allData = [...standardOrders, ...commOrders];
        // Sort by id roughly, or by date if possible. We'll rely on original logic for now or sort by date.
        allData.sort((a, b) => b.id.toString().localeCompare(a.id.toString()));
        setOrders(allData);

        const prods = {};
        await Promise.all(
          allData.map(async (o) => {
            if (o.is_community) {
              prods[o.product_id] = {
                id: o.community_data.id,
                name: o.community_data.title,
                image_url: o.community_data.image_urls ? (o.community_data.image_urls.startsWith('http') ? o.community_data.image_urls.split(',')[0] : `http://${window.location.hostname}:8000/api/community/image/${o.community_data.image_urls.split(',')[0]}`) : null,
                price: o.community_data.asking_price,
                brand: o.community_data.brand || o.community_data.category
              };
            } else if (!prods[o.product_id]) {
              try { prods[o.product_id] = await getProduct(o.product_id); } catch {}
            }
          })
        );
        setProducts(prods);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentUser]);

  const statusStyles = {
    placed:   { color: "text-[#c7511f]", label: "Order Placed" },
    delivered:{ color: "text-[#067d62]", label: "Delivered" },
    returned: { color: "text-amazon-red", label: "Returned" },
  };

  return (
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
              return (
                <div key={order.id} className="border border-amazon-border rounded-lg overflow-hidden">
                  {/* Order header */}
                  <div className="bg-[#f0f2f2] px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-amazon-text-secondary border-b border-amazon-border">
                    <div className="flex gap-6">
                      <div>
                        <p className="uppercase font-bold text-[11px]">Order Placed</p>
                        <p>13 June, 2026</p>
                      </div>
                      <div>
                        <p className="uppercase font-bold text-[11px]">Total</p>
                        <p className="text-amazon-text font-bold">₹{prod ? Math.floor(prod.price).toLocaleString("en-IN") : "—"}</p>
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
                        <img src={prod.image_url || "https://via.placeholder.com/80"} alt={prod.name} className="w-[90px] h-[90px] object-contain flex-shrink-0" />
                      </Link>
                    )}
                    <div className="flex-1">
                      <p className={`text-[14px] font-bold ${st.color} mb-1`}>{st.label}</p>
                      <p className="text-[14px] text-amazon-link hover:text-amazon-link-hover">
                        {prod ? <Link to={`/products/${prod.id}`}>{prod.name}</Link> : `Product #${order.product_id}`}
                      </p>
                      {prod && <p className="text-[12px] text-amazon-text-secondary mt-0.5">{prod.brand}</p>}

                      <div className="flex items-center gap-3 mt-2">
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
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {prod && !order.is_community && (
                          <Link to={`/products/${prod.id}`} className="btn-amazon text-[12px] px-3 py-1">
                            Buy it again
                          </Link>
                        )}
                        {!order.is_community && order.status !== "returned" && (
                          <Link to={`/returns/new?orderId=${order.id}`} className="btn-amazon text-[12px] px-3 py-1">
                            Return or Replace
                          </Link>
                        )}
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
  );
}
