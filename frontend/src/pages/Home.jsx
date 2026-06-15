import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getProducts, getImpactStats } from "../api/client";
import { useUser } from "../context/UserContext";

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [impact, setImpact] = useState(null);
  const { currentUser } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") || "";

  useEffect(() => {
    getProducts().then(setProducts).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (currentUser) getImpactStats(currentUser.id).then(setImpact).catch(() => {});
  }, [currentUser]);

  const categories = ["all", ...new Set(products.map((p) => p.category))];
  const filtered = products.filter((p) => {
    const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
    const matchesSearch = !searchQuery.trim() || 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.brand.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="animate-fade-in">
      {/* Hero Banner */}
      <div className="relative bg-gradient-to-b from-[#232f3e] to-amazon-bg">
        <div className="max-w-[1500px] mx-auto px-4 py-6">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="relative bg-gradient-to-r from-[#232f3e] to-[#37475a] p-8 md:p-12">
              <div className="relative z-10 max-w-xl">
                <p className="text-amazon-orange text-[13px] font-bold tracking-wide uppercase mb-2">Amazon Green Credits Ecosystem</p>
                <h1 className="text-[28px] md:text-[36px] font-bold text-white leading-tight mb-3">Sustainability that rewards you</h1>
                <p className="text-[#ccc] text-[14px] mb-4 leading-relaxed">
                  Earn Green Credits for every sustainable action &mdash; buy refurbished, repair, resell, or donate.
                  Every choice makes an impact.
                </p>
                <p className="text-amazon-orange text-[14px] italic tracking-wide mb-5">AI-powered circular commerce &mdash; every return finds its next life</p>
                <div className="flex flex-wrap gap-3">
                  <Link to="/feed" className="btn-amazon-primary text-[14px] px-6 py-2.5 font-bold inline-block">Shop Second Life</Link>
                  <Link to="/profile" className="btn-amazon-orange text-[14px] px-6 py-2.5 inline-block">View Dashboard</Link>
                </div>
              </div>
              <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden lg:block opacity-20 text-[120px]"></div>
            </div>

            {/* Dynamic Stats Row */}
            {currentUser && (
              <div className="grid grid-cols-2 md:grid-cols-5 border-t border-amazon-border">
                <div className="p-4 border-r border-amazon-border text-center">
                  <p className="text-[11px] text-amazon-text-secondary">Welcome back</p>
                  <p className="text-[14px] font-bold text-amazon-text">{currentUser.name}</p>
                </div>
                <div className="p-4 border-r border-amazon-border text-center">
                  <p className="text-[11px] text-amazon-text-secondary">Level</p>
                  <p className="text-[14px] font-bold text-amazon-green">{currentUser.level}</p>
                </div>
                <div className="p-4 border-r border-amazon-border text-center">
                  <p className="text-[11px] text-amazon-text-secondary">Green Credits</p>
                  <p className="text-[14px] font-bold text-amazon-orange">{currentUser.green_credits}</p>
                </div>
                <div className="p-4 border-r border-amazon-border text-center">
                  <p className="text-[11px] text-amazon-text-secondary">CO₂ Saved</p>
                  <p className="text-[14px] font-bold text-amazon-green">{impact ? `${impact.co2_saved} kg` : "—"}</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-[11px] text-amazon-text-secondary">E-Waste Prevented</p>
                  <p className="text-[14px] font-bold text-amazon-green">{impact ? `${impact.ewaste_prevented} kg` : "—"}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto px-4 pb-8">
        {searchQuery && (
          <div className="flex items-center justify-between bg-white border border-[#d5d9d9] rounded-lg p-3.5 mb-4 shadow-sm">
            <div className="text-[14px] text-amazon-text">
              Results for <span className="font-bold text-[#c45500]">"{searchQuery}"</span>
            </div>
            <button 
              onClick={() => {
                const newParams = new URLSearchParams(searchParams);
                newParams.delete("q");
                setSearchParams(newParams);
              }}
              className="text-[13px] text-amazon-link hover:underline font-medium hover:text-amazon-link-hover"
            >
              Clear Search
            </button>
          </div>
        )}

        {/* Category filters */}
        <div className="flex items-center gap-2 py-4 border-b border-amazon-border mb-4 overflow-x-auto">
          <span className="text-[13px] text-amazon-text-secondary font-bold flex-shrink-0">Department:</span>
          {categories.map((cat) => (
            <button key={cat} onClick={() => setCategoryFilter(cat)}
              className={`text-[13px] px-3 py-1.5 rounded-full whitespace-nowrap transition-colors border ${categoryFilter === cat ? "bg-amazon-navy text-white border-amazon-navy" : "bg-white text-amazon-text border-amazon-border hover:bg-[#f0f0f0]"}`}>
              {cat === "all" ? "All Departments" : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-[14px] text-amazon-text">
            <span className="text-amazon-text-secondary">
              {searchQuery ? (
                `Found ${filtered.length} result${filtered.length === 1 ? '' : 's'} matching "${searchQuery}"`
              ) : filtered.length === products.length ? (
                `Showing 1-${filtered.length} of ${filtered.length} results`
              ) : (
                `${filtered.length} results for "${categoryFilter}"`
              )}
            </span>
          </p>
          <select className="text-[13px] bg-[#f0f2f2] border border-[#d5d9d9] rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#e77600]">
            <option>Featured</option><option>Price: Low to High</option><option>Price: High to Low</option><option>Newest</option>
          </select>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[1px] bg-amazon-border">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white p-6 h-[400px] animate-pulse">
                <div className="bg-[#f5f5f5] h-[240px] mb-4" /><div className="bg-[#f5f5f5] h-4 mb-2 w-3/4" /><div className="bg-[#f5f5f5] h-5 w-1/3" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[1px] bg-amazon-border">
            {filtered.map((product) => (
              <Link key={product.id} to={`/products/${product.id}`} className="product-card flex flex-col bg-white p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-center h-[240px] mb-4">
                  <img src={product.image_url || "https://via.placeholder.com/300"} alt={product.name} className="max-h-full max-w-full object-contain mix-blend-multiply" />
                </div>
                <div className="flex-1 flex flex-col">
                  <h3 className="text-[15px] font-medium text-amazon-link leading-snug line-clamp-2 hover:text-amazon-link-hover">{product.name}</h3>
                  <p className="text-[13px] text-amazon-text-secondary mt-1">{product.brand}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="star-rating text-[13px]">★★★★☆</span>
                    <span className="text-[12px] text-amazon-link">{Math.floor(Math.random() * 500 + 50)}</span>
                  </div>
                  <div className="mt-2">
                    <span className="text-[24px] font-bold text-amazon-text"><span className="text-[14px] align-top relative top-[3px] mr-1">₹</span>{Math.floor(product.price).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {product.size && product.size !== "One Size" && (
                      <span className="text-[11px] bg-[#f0f2f2] text-amazon-text-secondary px-1.5 py-0.5 rounded">Size: {product.size}</span>
                    )}
                    <span className="eco-badge">Circular Ready</span>
                  </div>
                  <p className="text-[12px] text-amazon-text-secondary mt-1.5">FREE delivery by <b className="text-amazon-text">Tomorrow</b></p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
