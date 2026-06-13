import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getProducts } from "../api/client";
import { useUser } from "../context/UserContext";

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const { currentUser } = useUser();

  useEffect(() => {
    getProducts()
      .then(setProducts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const categories = ["all", ...new Set(products.map((p) => p.category))];
  const filtered = products.filter(
    (p) => categoryFilter === "all" || p.category === categoryFilter
  );

  return (
    <div className="animate-fade-in">
      {/* Hero Banner — Amazon style carousel placeholder */}
      <div className="relative bg-gradient-to-b from-[#232f3e] to-amazon-bg">
        <div className="max-w-[1500px] mx-auto px-4 py-6">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="relative bg-gradient-to-r from-[#232f3e] to-[#37475a] p-8 md:p-12">
              <div className="relative z-10 max-w-xl">
                <p className="text-amazon-orange text-[13px] font-bold tracking-wide uppercase mb-2">
                  ♻️ New — Amazon Circular Intelligence
                </p>
                <h1 className="text-[28px] md:text-[36px] font-bold text-white leading-tight mb-3">
                  Every return gets a second life
                </h1>
                <p className="text-[#ccc] text-[14px] mb-5 leading-relaxed">
                  AI-powered fit prediction, smart product grading, and shopping
                  twin matching — reducing waste while saving you money.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link to="/feed" className="btn-amazon-primary text-[14px] px-6 py-2.5 font-bold inline-block">
                    Shop Second Life
                  </Link>
                  <Link to="/returns/new" className="btn-amazon-orange text-[14px] px-6 py-2.5 inline-block">
                    Start a Return
                  </Link>
                </div>
              </div>
              {/* Decorative */}
              <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden lg:block opacity-20 text-[120px]">
                ♻️
              </div>
            </div>

            {/* Stats row */}
            {currentUser && (
              <div className="grid grid-cols-2 md:grid-cols-4 border-t border-amazon-border">
                <div className="p-4 border-r border-amazon-border text-center">
                  <p className="text-[11px] text-amazon-text-secondary">Welcome back</p>
                  <p className="text-[14px] font-bold text-amazon-text">{currentUser.name}</p>
                </div>
                <div className="p-4 border-r border-amazon-border text-center">
                  <p className="text-[11px] text-amazon-text-secondary">Green Credits</p>
                  <p className="text-[14px] font-bold text-amazon-green">🌱 {currentUser.green_credits}</p>
                </div>
                <div className="p-4 border-r border-amazon-border text-center">
                  <p className="text-[11px] text-amazon-text-secondary">Products Available</p>
                  <p className="text-[14px] font-bold text-amazon-text">{products.length}</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-[11px] text-amazon-text-secondary">Impact</p>
                  <p className="text-[14px] font-bold text-amazon-green">12kg CO₂ saved</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto px-4 pb-8">
        {/* Category filters — Amazon style */}
        <div className="flex items-center gap-2 py-4 border-b border-amazon-border mb-4 overflow-x-auto">
          <span className="text-[13px] text-amazon-text-secondary font-bold flex-shrink-0">Department:</span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`text-[13px] px-3 py-1.5 rounded-full whitespace-nowrap transition-colors border ${
                categoryFilter === cat
                  ? "bg-amazon-navy text-white border-amazon-navy"
                  : "bg-white text-amazon-text border-amazon-border hover:bg-[#f0f0f0]"
              }`}
            >
              {cat === "all" ? "All Departments" : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-[14px] text-amazon-text">
            <span className="text-amazon-text-secondary">
              {filtered.length === products.length
                ? `Showing 1-${filtered.length} of ${filtered.length} results`
                : `${filtered.length} results for "${categoryFilter}"`}
            </span>
          </p>
          <select className="text-[13px] bg-[#f0f2f2] border border-[#d5d9d9] rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#e77600] focus:border-[#e77600]">
            <option>Featured</option>
            <option>Price: Low to High</option>
            <option>Price: High to Low</option>
            <option>Newest</option>
          </select>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-[1px] bg-amazon-border">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="bg-white p-4 h-[360px] animate-pulse">
                <div className="bg-[#f5f5f5] h-[200px] mb-3" />
                <div className="bg-[#f5f5f5] h-4 mb-2 w-3/4" />
                <div className="bg-[#f5f5f5] h-4 mb-2 w-1/2" />
                <div className="bg-[#f5f5f5] h-5 w-1/3" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-[1px] bg-amazon-border">
            {filtered.map((product) => (
              <Link
                key={product.id}
                to={`/products/${product.id}`}
                className="product-card flex flex-col"
              >
                {/* Image */}
                <div className="flex items-center justify-center h-[200px] mb-2">
                  <img
                    src={product.image_url || "https://via.placeholder.com/300"}
                    alt={product.name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 flex flex-col">
                  <h3 className="text-[13px] text-amazon-link leading-snug line-clamp-2 hover:text-amazon-link-hover">
                    {product.name}
                  </h3>

                  <p className="text-[11px] text-amazon-text-secondary mt-1">
                    {product.brand}
                  </p>

                  {/* Rating placeholder */}
                  <div className="flex items-center gap-1 mt-1">
                    <span className="star-rating text-[13px]">★★★★☆</span>
                    <span className="text-[12px] text-amazon-link">{Math.floor(Math.random() * 500 + 50)}</span>
                  </div>

                  {/* Price */}
                  <div className="mt-1">
                    <span className="amazon-price">
                      <span className="symbol">₹</span>
                      {Math.floor(product.price).toLocaleString("en-IN")}
                    </span>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {product.size && product.size !== "One Size" && (
                      <span className="text-[11px] bg-[#f0f2f2] text-amazon-text-secondary px-1.5 py-0.5 rounded">
                        Size: {product.size}
                      </span>
                    )}
                    <span className="eco-badge">
                      ♻ Circular Ready
                    </span>
                  </div>

                  <p className="text-[12px] text-amazon-text-secondary mt-1.5">
                    FREE delivery by <b className="text-amazon-text">Tomorrow</b>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
