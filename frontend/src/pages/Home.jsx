import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { getProducts, getImpactStats } from "../api/client";
import { useUser } from "../context/UserContext";

const PAGE_SIZE = 10;
const SLIDE_INTERVAL = 4000;
const RESUME_DELAY = 6000; // resume auto-play 6s after user interaction

// ── Category meta — icon + display label ─────────────────────────────────
const CATEGORY_META = {
  all:         { icon: "🏪", label: "All Departments" },
  electronics: { icon: "💻", label: "Electronics" },
  running:     { icon: "👟", label: "Running" },
  footwear:    { icon: "👞", label: "Footwear" },
  backpacking: { icon: "🎒", label: "Backpacking" },
  yoga:        { icon: "🧘", label: "Yoga" },
  fitness:     { icon: "🏋️", label: "Fitness" },
  clothing:    { icon: "👕", label: "Clothing" },
  luggage:     { icon: "🧳", label: "Luggage" },
  bags:        { icon: "👜", label: "Bags" },
  kitchen:     { icon: "🍳", label: "Kitchen" },
  furniture:   { icon: "🛋️", label: "Furniture" },
  sports:      { icon: "⚽", label: "Sports" },
};
function catLabel(cat) {
  return CATEGORY_META[cat]?.label ?? (cat.charAt(0).toUpperCase() + cat.slice(1));
}
function catIcon(cat) {
  return CATEGORY_META[cat]?.icon ?? "📦";
}

// ── Slideshow Data ────────────────────────────────────────────────────────
const slides = [
  {
    badge: "🌱 Green Credits Ecosystem",
    title: "Sustainability that rewards you",
    desc: "Earn Green Credits for every sustainable action — buy refurbished, repair, resell, or donate. Every choice makes a real environmental impact.",
    italic: "AI-powered circular commerce — every return finds its next life",
    ctas: [
      { label: "Shop Second Life", to: "/feed", primary: true },
      { label: "View My Credits", to: "/profile", primary: false },
    ],
    emoji: "🌍",
  },
  {
    badge: "📦 AI Delivery Verification",
    title: "Every delivery, verified by AI",
    desc: "Our delivery agents scan each package on arrival using live video AI. The system captures a baseline of the product condition — making returns fair and fraud-proof.",
    italic: "Real-time computer vision — protecting buyers and sellers",
    ctas: [
      { label: "See How It Works", to: "/employee-scan", primary: true },
      { label: "My Orders", to: "/orders", primary: false },
    ],
    emoji: "🤖",
  },
  {
    badge: "🔁 Circular Returns",
    title: "Returns that give back",
    desc: "When you return a product, our AI assesses its condition and recommends the best second life — resale, refurbishment, or recycling. Nothing goes to waste.",
    italic: "Every returned product gets a second chance",
    ctas: [
      { label: "Start a Return", to: "/orders", primary: true },
      { label: "Shop Second Life", to: "/feed", primary: false },
    ],
    emoji: "♻️",
  },
  {
    badge: "📍 NearDrop Wishlist",
    title: "Get your desired items fast, locally",
    desc: "Add products you want to your wishlist. When someone nearby returns a matching item, get notified instantly — ultra-fast delivery with logistics savings.",
    italic: "Hyperlocal matching — connecting local returns directly to you",
    ctas: [
      { label: "Go to NearDrop", to: "/neardrop", primary: true },
    ],
    emoji: "⚡",
  },
];

// ── Slideshow component — fully self-contained ───────────────────────────
function HeroSlideshow() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const resumeTimer = useRef(null);
  const stripRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  // Auto-advance
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => advance(1), SLIDE_INTERVAL);
    return () => clearInterval(id);
  }, [paused, index]);

  // Schedule auto-play resume after user interaction
  const pauseTemporarily = useCallback(() => {
    setPaused(true);
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), RESUME_DELAY);
  }, []);

  useEffect(() => () => clearTimeout(resumeTimer.current), []);

  const advance = useCallback((dir) => {
    if (transitioning) return;
    setTransitioning(true);
    setIndex(i => (i + dir + slides.length) % slides.length);
    setTimeout(() => setTransitioning(false), 520);
  }, [transitioning]);

  const goTo = useCallback((i) => {
    if (i === index) return;
    setTransitioning(true);
    setIndex(i);
    setTimeout(() => setTransitioning(false), 520);
    pauseTemporarily();
  }, [index, pauseTemporarily]);

  // Touch / swipe support
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    // Only register as horizontal swipe if horizontal movement dominates
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      advance(dx < 0 ? 1 : -1);
      pauseTemporarily();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      {/* Slide viewport — clips the strip, never overflows */}
      <div
        className="relative w-full overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: "pan-y" }}
      >
        {/* Strip — 400% wide, slides are each 25% of the strip = 1 viewport unit each */}
        <div
          ref={stripRef}
          className="flex"
          style={{
            width: `${slides.length * 100}%`,
            transform: `translateX(-${(index / slides.length) * 100}%)`,
            transition: transitioning ? "transform 0.5s cubic-bezier(0.25,0.46,0.45,0.94)" : "none",
            willChange: "transform",
          }}
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              className="relative flex-shrink-0 bg-gradient-to-r from-[#232f3e] to-[#37475a]"
              style={{ width: `${100 / slides.length}%` }}
            >
              {/* Slide inner — responsive padding, min-height avoids collapse */}
              <div className="px-6 py-8 sm:px-10 sm:py-12 min-h-[260px] sm:min-h-[320px] flex flex-col justify-center">
                <div className="relative z-10 max-w-xl">
                  <p className="text-amazon-orange text-[12px] sm:text-[13px] font-bold tracking-wide uppercase mb-2">
                    {slide.badge}
                  </p>
                  <h1 className="text-[22px] sm:text-[28px] md:text-[36px] font-bold text-white leading-tight mb-3">
                    {slide.title}
                  </h1>
                  <p className="text-[#ccc] text-[13px] sm:text-[14px] mb-3 leading-relaxed line-clamp-3 sm:line-clamp-none">
                    {slide.desc}
                  </p>
                  <p className="text-amazon-orange text-[12px] sm:text-[14px] italic tracking-wide mb-5 hidden sm:block">
                    {slide.italic}
                  </p>
                  <div className="flex flex-wrap gap-2 sm:gap-3">
                    {slide.ctas.map((cta) => (
                      <Link
                        key={cta.label}
                        to={cta.to}
                        className={`text-[13px] sm:text-[14px] px-4 sm:px-6 py-2 sm:py-2.5 font-bold inline-block rounded ${
                          cta.primary ? "btn-amazon-primary" : "btn-amazon-orange"
                        }`}
                      >
                        {cta.label}
                      </Link>
                    ))}
                  </div>
                </div>
                {/* Decorative emoji — desktop only */}
                <div className="absolute right-10 top-1/2 -translate-y-1/2 hidden lg:block text-[90px] opacity-25 select-none text-white pointer-events-none">
                  {slide.emoji}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Prev / Next arrows — always visible on mobile, hover-only on desktop */}
        <button
          aria-label="Previous slide"
          onClick={() => { advance(-1); pauseTemporarily(); }}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20
            w-9 h-9 rounded-full bg-black/30 hover:bg-black/50 active:bg-black/60
            flex items-center justify-center text-white
            transition-colors touch-manipulation
            sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          aria-label="Next slide"
          onClick={() => { advance(1); pauseTemporarily(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-20
            w-9 h-9 rounded-full bg-black/30 hover:bg-black/50 active:bg-black/60
            flex items-center justify-center text-white
            transition-colors touch-manipulation
            sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Dot indicators */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
          {slides.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => goTo(i)}
              className={`rounded-full transition-all duration-300 touch-manipulation ${
                i === index
                  ? "w-6 h-2 bg-amazon-orange"
                  : "w-2 h-2 bg-white/50 hover:bg-white/80 active:bg-white"
              }`}
              style={{ WebkitTapHighlightColor: "transparent" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [impact, setImpact] = useState(null);
  const { currentUser } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") || "";
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef(null);

  // Delivery agents have no business on the product home page
  useEffect(() => {
    if (currentUser?.role === "employee") {
      navigate("/delivery", { replace: true });
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    getProducts().then(setProducts).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (currentUser) getImpactStats(currentUser.id).then(setImpact).catch(() => {});
  }, [currentUser]);

  const categories = ["all", ...new Set(products.map((p) => p.category))];
  const filtered = products.filter((p) => {
    const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Reset pagination when filter/search changes
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [categoryFilter, searchQuery]);

  // Close category dropdown on outside click / Escape
  useEffect(() => {
    if (!catOpen) return;
    function close(e) {
      if (catRef.current && !catRef.current.contains(e.target)) setCatOpen(false);
    }
    function esc(e) { if (e.key === "Escape") setCatOpen(false); }
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", esc);
    };
  }, [catOpen]);

  const visibleProducts = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="animate-fade-in">
      {/* ── Hero Slideshow ────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-[#232f3e] to-amazon-bg">
        <div className="max-w-[1500px] mx-auto px-4 pt-6 pb-2">
          {/* Slideshow + stats card */}
          <div className="group">
            <HeroSlideshow />

            {/* Stats row */}
            {currentUser && (
              <div className="bg-white rounded-b-lg mt-[-4px] grid grid-cols-2 md:grid-cols-5 border-t border-amazon-border shadow-sm">
                <div className="p-3 sm:p-4 border-r border-amazon-border text-center">
                  <p className="text-[10px] sm:text-[11px] text-amazon-text-secondary">Welcome back</p>
                  <p className="text-[13px] sm:text-[14px] font-bold text-amazon-text truncate px-1">{currentUser.name}</p>
                </div>
                <div className="p-3 sm:p-4 border-r border-amazon-border text-center">
                  <p className="text-[10px] sm:text-[11px] text-amazon-text-secondary">Level</p>
                  <p className="text-[13px] sm:text-[14px] font-bold text-amazon-green">{currentUser.level}</p>
                </div>
                <div className="p-3 sm:p-4 border-r border-amazon-border text-center">
                  <p className="text-[10px] sm:text-[11px] text-amazon-text-secondary">Green Credits</p>
                  <p className="text-[13px] sm:text-[14px] font-bold text-amazon-orange">{currentUser.green_credits}</p>
                </div>
                <div className="p-3 sm:p-4 border-r border-amazon-border text-center">
                  <p className="text-[10px] sm:text-[11px] text-amazon-text-secondary">CO&#x2082; Saved</p>
                  <p className="text-[13px] sm:text-[14px] font-bold text-amazon-green">
                    {impact ? `${impact.co2_saved} kg` : "—"}
                  </p>
                </div>
                <div className="p-3 sm:p-4 text-center col-span-2 md:col-span-1">
                  <p className="text-[10px] sm:text-[11px] text-amazon-text-secondary">E-Waste Prevented</p>
                  <p className="text-[13px] sm:text-[14px] font-bold text-amazon-green">
                    {impact ? `${impact.ewaste_prevented} kg` : "—"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Product listing ──────────────────────────────────────────────────── */}
      <div className="max-w-[1500px] mx-auto px-4 pb-8">
        {searchQuery && (
          <div className="flex items-center justify-between bg-white border border-[#d5d9d9] rounded-lg p-3.5 mb-4 shadow-sm">
            <div className="text-[14px] text-amazon-text">
              Results for <span className="font-bold text-[#c45500]">&quot;{searchQuery}&quot;</span>
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

        {/* Category dropdown — Amazon-style */}
        <div className="flex items-center gap-3 py-4 border-b border-amazon-border mb-4">
          <span className="text-[13px] text-amazon-text-secondary font-bold flex-shrink-0 hidden sm:block">Department:</span>

          {/* Dropdown trigger */}
          <div ref={catRef} className="relative">
            <button
              onClick={() => setCatOpen(o => !o)}
              className="flex items-center gap-2 bg-white border border-[#d5d9d9] rounded-lg px-3.5 py-2 text-[13px] text-amazon-text font-medium shadow-sm hover:bg-[#f7f8f8] active:bg-[#eaeded] transition-colors min-w-[200px] justify-between"
            >
              <span className="flex items-center gap-2">
                <span>{catIcon(categoryFilter)}</span>
                <span>{catLabel(categoryFilter)}</span>
              </span>
              <svg
                className={`w-4 h-4 text-[#565959] transition-transform duration-200 ${catOpen ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown panel */}
            {catOpen && (
              <div className="absolute left-0 top-full mt-1 w-[240px] bg-white rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.18)] border border-[#d5d9d9] z-50 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-2.5 bg-[#f0f2f2] border-b border-[#d5d9d9]">
                  <p className="text-[12px] font-bold text-amazon-text uppercase tracking-wide">Shop by Department</p>
                </div>
                <div className="py-1 max-h-[340px] overflow-y-auto">
                  {categories.map((cat) => {
                    const active = categoryFilter === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => { setCategoryFilter(cat); setCatOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors text-left
                          ${active
                            ? "bg-[#fff8ef] text-amazon-orange font-bold border-l-[3px] border-amazon-orange"
                            : "text-amazon-text hover:bg-[#f0f2f2] border-l-[3px] border-transparent"
                          }`}
                      >
                        <span className="text-[16px] w-6 text-center flex-shrink-0">{catIcon(cat)}</span>
                        <span className="flex-1">{catLabel(cat)}</span>
                        {active && (
                          <svg className="w-4 h-4 text-amazon-orange flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Active filter chip + count */}
          <div className="flex items-center gap-2 ml-1">
            {categoryFilter !== "all" && (
              <button
                onClick={() => setCategoryFilter("all")}
                className="flex items-center gap-1 text-[12px] bg-[#fff3cd] text-[#856404] border border-[#ffc107]/40 px-2.5 py-1 rounded-full font-medium hover:bg-[#ffeaa7] transition-colors"
              >
                {catIcon(categoryFilter)} {catLabel(categoryFilter)}
                <span className="ml-0.5 text-[11px] opacity-70">✕</span>
              </button>
            )}
            <span className="text-[12px] text-amazon-text-secondary">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-[14px] text-amazon-text">
            <span className="text-amazon-text-secondary">
              {searchQuery
                ? `Found ${filtered.length} result${filtered.length === 1 ? "" : "s"} matching "${searchQuery}"`
                : filtered.length === products.length
                ? `Showing ${Math.min(visibleCount, filtered.length)} of ${filtered.length} results`
                : `${filtered.length} results in "${catLabel(categoryFilter)}"`}
            </span>
          </p>
          <select className="text-[13px] bg-[#f0f2f2] border border-[#d5d9d9] rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#e77600]">
            <option>Featured</option>
            <option>Price: Low to High</option>
            <option>Price: High to Low</option>
            <option>Newest</option>
          </select>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[1px] bg-amazon-border">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white p-3 sm:p-6 h-[320px] sm:h-[400px] animate-pulse">
                <div className="bg-[#f5f5f5] h-[180px] sm:h-[240px] mb-4" />
                <div className="bg-[#f5f5f5] h-4 mb-2 w-3/4" />
                <div className="bg-[#f5f5f5] h-5 w-1/3" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[1px] bg-amazon-border">
              {visibleProducts.map((product) => (
                <Link
                  key={product.id}
                  to={`/products/${product.id}`}
                  className="product-card flex flex-col bg-white p-3 sm:p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-center justify-center h-[160px] sm:h-[240px] mb-3 sm:mb-4">
                    <img
                      src={product.image_url || "https://via.placeholder.com/300"}
                      alt={product.name}
                      className="max-h-full max-w-full object-contain mix-blend-multiply"
                    />
                  </div>
                  <div className="flex-1 flex flex-col">
                    <h3 className="text-[13px] sm:text-[15px] font-medium text-amazon-link leading-snug line-clamp-2 hover:text-amazon-link-hover">
                      {product.name}
                    </h3>
                    <p className="text-[11px] sm:text-[13px] text-amazon-text-secondary mt-1">{product.brand}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="star-rating text-[11px] sm:text-[13px]">★★★★☆</span>
                      <span className="text-[11px] sm:text-[12px] text-amazon-link">
                        {Math.floor(Math.random() * 500 + 50)}
                      </span>
                    </div>
                    <div className="mt-1.5 sm:mt-2">
                      <span className="text-[18px] sm:text-[24px] font-bold text-amazon-text">
                        <span className="text-[11px] sm:text-[14px] align-top relative top-[3px] mr-0.5">₹</span>
                        {Math.floor(product.price).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-2 sm:mt-3">
                      {product.size && product.size !== "One Size" && (
                        <span className="text-[10px] sm:text-[11px] bg-[#f0f2f2] text-amazon-text-secondary px-1.5 py-0.5 rounded">
                          Size: {product.size}
                        </span>
                      )}
                      <span className="eco-badge">Circular Ready</span>
                    </div>
                    <p className="text-[10px] sm:text-[12px] text-amazon-text-secondary mt-1.5">
                      FREE delivery by <b className="text-amazon-text">Tomorrow</b>
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="flex flex-col items-center gap-2 mt-8 mb-4">
                <button
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="flex items-center gap-2 bg-white border border-[#d5d9d9] hover:bg-[#f7f8f8] active:bg-[#eaeded] text-amazon-text text-[14px] font-medium px-8 py-3 rounded-lg shadow-sm transition-colors"
                >
                  <svg className="w-4 h-4 text-[#565959]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                  See more results
                  <span className="text-[12px] text-amazon-text-secondary ml-1">
                    ({filtered.length - visibleCount} remaining)
                  </span>
                </button>
                <p className="text-[11px] text-amazon-text-secondary">
                  Showing {visibleCount} of {filtered.length} products
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
