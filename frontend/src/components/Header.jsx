import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getUsers } from "../api/client";
import { useUser } from "../context/UserContext";

const LEVEL_EMOJIS = {
  "Seed": "🌱",
  "Sapling": "🌿",
  "Green Hero": "🌎",
  "Planet Protector": "🛡️",
  "Circular Champion": "🏆",
};

export default function Header() {
  const navigate = useNavigate();
  const { currentUser, switchUser, updateUserProfile, isAdminMode, setIsAdminMode } = useUser();
  const [users, setUsers] = useState([]);
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [showLocModal, setShowLocModal] = useState(false);
  const [locForm, setLocForm] = useState({ city: "", pincode: "" });
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const userMenuRef = useRef(null);
  const mobileMenuRef = useRef(null);

  useEffect(() => {
    if (currentUser) {
      setLocForm({ city: currentUser.city || "", pincode: currentUser.pincode || "" });
    }
  }, [currentUser]);

  const handleSaveLoc = async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    try {
      await updateUserProfile(currentUser.id, locForm);
      setShowLocModal(false);
    } catch (err) {
      console.error("Failed to update location", err);
    }
  };
  useEffect(() => {
    getUsers().then(setUsers).catch(console.error);
  }, []);

  useEffect(() => {
    setSearch(searchParams.get("q") || "");
  }, [searchParams]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/?q=${encodeURIComponent(search.trim())}`);
    } else {
      navigate("/");
    }
  };

  // Close user menu on outside click or Escape
  useEffect(() => {
    if (!showUserMenu) return;
    function handleOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    }
    function handleKey(e) {
      if (e.key === "Escape") setShowUserMenu(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showUserMenu]);

  // Close mobile menu on outside click or Escape
  useEffect(() => {
    if (!showMobileMenu) return;
    function handleOutside(e) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target)) {
        setShowMobileMenu(false);
      }
    }
    function handleKey(e) {
      if (e.key === "Escape") setShowMobileMenu(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden"; // lock scroll
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "auto"; // unlock scroll
    };
  }, [showMobileMenu]);

  const handleProfileSwitch = async (userId) => {
    const switched = users.find((u) => u.id === userId);
    await switchUser(userId);
    if (switched?.role === "employee") {
      navigate("/delivery");
    } else {
      navigate("/");
    }
    window.location.reload();
  };

  const isEmployee = currentUser?.role === "employee";

  const levelEmoji = currentUser ? (LEVEL_EMOJIS[currentUser.level] || "") : "";

  return (
    <header className="bg-amazon-navy text-white">
      {/* Top Nav */}
      <div className="flex items-center justify-between px-4 py-2 gap-4">
        {/* Left Section: Hamburger + Logo */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Hamburger Menu Icon (Mobile Only) */}
          <button 
            onClick={() => setShowMobileMenu(true)}
            className="md:hidden flex flex-col justify-center gap-[4px] p-2 hover:bg-white/10 rounded"
          >
            <div className="w-5 h-[2px] bg-white"></div>
            <div className="w-5 h-[2px] bg-white"></div>
            <div className="w-5 h-[2px] bg-white"></div>
          </button>

          {/* Logo */}
          <Link to="/" className="flex flex-col items-start pt-1 pb-1 px-1 sm:px-2 rounded-md transition-colors hover:bg-white/5 no-underline hover:no-underline">
            <svg viewBox="0 0 90 20" className="h-4 sm:h-5" xmlns="http://www.w3.org/2000/svg">
              <text x="0" y="15" fill="white" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="bold" fontSize="16" letterSpacing="-0.03em">amazon</text>
              <text x="59" y="15" fill="#febd69" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="bold" fontSize="15">.in</text>
            </svg>
            <span className="text-[7px] sm:text-[9px] text-[#febd69] font-bold leading-none mt-1 ml-0.5 tracking-wide">PROTOTYPE FOR HACKON 6.0</span>
          </Link>
        </div>

        {/* Location (Desktop) */}
        {!isAdminMode && !isEmployee && (
          <div 
            onClick={() => setShowLocModal(true)}
            className="group hidden md:flex flex-col px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-white/5"
          >
            <span className="text-[12px] text-[#ccc] leading-tight ml-4 transition-colors group-hover:text-white/90">
              Delivering to {currentUser?.city || "Select"} {currentUser?.pincode || "Location"}
            </span>
            <span className="text-[14px] font-bold flex items-center gap-1 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Update location
            </span>
          </div>
        )}

        {/* Search */}
        {!isAdminMode && !isEmployee && (
          <form onSubmit={handleSearch} className="flex-1 hidden sm:flex rounded-md overflow-hidden bg-white">
            <select className="bg-[#f3f3f3] text-[#0f1111] text-[12px] px-3 border-r border-[#cdcdcd] outline-none hover:bg-[#d4d4d4] cursor-pointer">
              <option>All</option>
              <option>Electronics</option>
              <option>Sports & Outdoors</option>
            </select>
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Amazon.in"
              className="flex-1 px-3 py-2 text-amazon-text text-[15px] outline-none"
            />
            <button type="submit" className="bg-[#febd69] hover:bg-[#f3a847] px-4 flex items-center justify-center transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amazon-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </form>
        )}

        {/* Right Nav Items */}
        <div className="flex items-center gap-1">
          {/* Admin Toggle */}
          <div className="hidden sm:flex items-center gap-2 px-3 border-r border-gray-600 mr-2">
            <span className="text-[12px] font-bold text-white select-none">Admin</span>
            <div 
              className={`w-8 h-4 rounded-full p-0.5 cursor-pointer flex items-center transition-colors ${isAdminMode ? 'bg-[#00e5a0]' : 'bg-gray-500'}`}
              onClick={() => {
                 setIsAdminMode(!isAdminMode);
                 navigate(!isAdminMode ? "/dashboard" : "/");
              }}
            >
              <div className={`w-3 h-3 rounded-full bg-white transition-transform ${isAdminMode ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
          </div>

          {/* User Switcher — hidden on mobile (available in drawer), visible on desktop */}
          {!isAdminMode && (
          <div ref={userMenuRef} className="hidden md:block relative px-3 py-1.5 pb-2 rounded-md cursor-pointer transition-colors hover:bg-white/5">
              <button
                onClick={() => setShowUserMenu(o => !o)}
                className="flex flex-col text-left w-full focus:outline-none"
              >
                <span className="text-[12px] text-white/95 flex items-center gap-1">
                  Hello, {currentUser?.name?.split(" ")[0] || "Sign in"}
                  {currentUser?.role === "employee" && (
                    <span className="text-[9px] bg-[#c7511f] text-white px-1.5 py-0.5 rounded font-bold leading-none">STAFF</span>
                  )}
                </span>
                <span className="text-[14px] font-bold flex items-center gap-1">Accounts & Lists <span className="text-[10px] text-[#a7acb2]">▼</span></span>
              </button>

              {/* Dropdown menu */}
              {showUserMenu && (
              <div className="absolute right-0 top-full mt-0 w-[260px] bg-white text-amazon-text rounded-md shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-amazon-border z-50">
                <div className="p-3 border-b border-amazon-border bg-[#f0f2f2]">
                  <p className="font-bold text-[14px]">Demo Profiles</p>
                  <p className="text-[11px] text-amazon-text-secondary">Switch user to test different roles</p>
                </div>
                <div className="py-2">
                  {/* Customer profiles */}
                  <p className="px-4 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-amazon-text-secondary">Customers</p>
                  {users.filter(u => u.role === "customer" || (!u.role && !u.is_admin)).map(u => (
                    <button
                      key={u.id}
                      onClick={() => { handleProfileSwitch(u.id); setShowUserMenu(false); }}
                      className={`w-full text-left px-4 py-2 text-[13px] hover:bg-gray-100 active:bg-gray-100 flex items-center justify-between ${currentUser?.id === u.id ? 'font-bold bg-[#f5faff] text-amazon-link' : ''}`}
                    >
                      <div>
                        <span>{u.name}</span>
                        <span className="ml-2 text-[10px] bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded font-bold">{u.city || 'Location'}</span>
                      </div>
                      {currentUser?.id === u.id && <span>✓</span>}
                    </button>
                  ))}
                  {/* Employee profiles */}
                  <p className="px-4 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-[#c7511f]">🚚 Delivery Employees</p>
                  {users.filter(u => u.role === "employee").map(u => (
                    <button
                      key={u.id}
                      onClick={() => { handleProfileSwitch(u.id); setShowUserMenu(false); }}
                      className={`w-full text-left px-4 py-2 text-[13px] hover:bg-orange-50 active:bg-orange-50 flex items-center justify-between ${currentUser?.id === u.id ? 'font-bold bg-[#fff8f0] text-[#c7511f]' : ''}`}
                    >
                      <div>
                        <span>{u.name}</span>
                        <span className="ml-2 text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold">{u.employee_zone || 'Employee'}</span>
                      </div>
                      {currentUser?.id === u.id && <span className="text-[#c7511f]">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
              )}
            </div>
          )}

          
          {!isAdminMode && !isEmployee && (
            <>
              <Link to="/orders" className="hidden lg:flex flex-col px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-white/5 no-underline hover:no-underline">
                <span className="text-[12px] text-white leading-tight">Returns</span>
                <span className="text-[14px] font-bold">& Orders</span>
              </Link>

              {/* Green Credits Wallet Icon */}
              {currentUser && (
                <Link to="/profile" className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors hover:bg-white/5 no-underline hover:no-underline">
                  <div className="flex flex-col items-center">
                    <span className="text-[18px] leading-none mb-[1px]">{levelEmoji}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[12px] text-white font-bold leading-tight">Green Credits</span>
                    <span className="text-[14px] font-bold text-amazon-orange leading-none">{currentUser.green_credits}</span>
                  </div>
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile Search */}
      {!isAdminMode && !isEmployee && (
        <div className="sm:hidden px-4 pb-3">
          <form onSubmit={handleSearch} className="flex rounded-md overflow-hidden bg-white h-10">
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Amazon.in"
              className="flex-1 px-3 py-2 text-amazon-text text-[15px] outline-none"
            />
            <button type="submit" className="bg-[#febd69] px-4 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amazon-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* Sub Nav */}
      <div className="bg-amazon-navy-light px-4 py-1.5 flex items-center gap-4 overflow-x-auto whitespace-nowrap text-[14px]">
        {isEmployee ? (
          /* Employee-only sub-nav: just the delivery link */
          <Link to="/delivery" className="px-2 py-1 rounded-md text-[#febd69] font-bold flex items-center gap-1 transition-colors hover:bg-white/5 no-underline hover:no-underline">
            <span>📦</span> My Deliveries
          </Link>
        ) : !isAdminMode ? (
          <>
            <Link to="/" className="flex items-center gap-1 font-bold px-2 py-1 rounded-md text-white transition-colors hover:bg-white/5 no-underline hover:no-underline">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              All
            </Link>
            <Link to="/feed" className="px-2 py-1 rounded-md text-[#00e5a0] font-bold flex items-center gap-1 transition-colors hover:bg-white/5 no-underline hover:no-underline">
              Circular Commerce
            </Link>
            <Link to="/neardrop" className="px-2 py-1 rounded-md text-white font-bold flex items-center gap-1 transition-colors hover:bg-white/5 no-underline hover:no-underline">
              <span className="text-[#00e5a0]">📍</span> NearDrop
            </Link>
          </>
        ) : (
          <Link to="/dashboard" className="px-2 py-1 rounded-md text-white font-bold transition-colors hover:bg-white/5 no-underline hover:no-underline">
            KPI Dashboard
          </Link>
        )}
        {!isAdminMode && !isEmployee && currentUser?.role === "employee" && (
          <Link to="/delivery" className="px-2 py-1 rounded-md text-[#febd69] font-bold flex items-center gap-1 transition-colors hover:bg-white/5 no-underline hover:no-underline">
            <span>📦</span> Delivery Scan
          </Link>
        )}
      </div>

      {/* Location Modal */}
      {showLocModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm text-amazon-text">
            <div className="bg-[#f0f2f2] border-b border-[#D5D9D9] px-4 py-3 rounded-t-lg flex justify-between items-center">
              <h3 className="font-bold text-[14px]">Choose your location</h3>
              <button onClick={() => setShowLocModal(false)} className="text-[20px] leading-none hover:opacity-70">×</button>
            </div>
            <div className="p-4">
              <p className="text-[12px] text-amazon-text-secondary mb-4">
                Delivery options and delivery speeds may vary for different locations
              </p>
              <form onSubmit={handleSaveLoc} className="flex flex-col gap-3">
                <div>
                  <label className="block text-[12px] font-bold mb-1">City</label>
                  <input 
                    type="text" 
                    value={locForm.city}
                    onChange={(e) => setLocForm({...locForm, city: e.target.value})}
                    placeholder="E.g. Mumbai"
                    className="w-full border border-amazon-border rounded px-3 py-2 text-[13px] outline-none focus:border-amazon-orange shadow-[0_1px_2px_rgba(15,17,17,0.15)_inset]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-bold mb-1">Pincode</label>
                  <input 
                    type="text" 
                    value={locForm.pincode}
                    onChange={(e) => setLocForm({...locForm, pincode: e.target.value})}
                    placeholder="E.g. 400001"
                    className="w-full border border-amazon-border rounded px-3 py-2 text-[13px] outline-none focus:border-amazon-orange shadow-[0_1px_2px_rgba(15,17,17,0.15)_inset]"
                  />
                </div>
                <button 
                  type="submit" 
                  className="mt-2 bg-[#FFD814] hover:bg-[#F7CA00] border border-[#FCD200] rounded-lg shadow-sm py-1.5 text-[13px] text-amazon-text cursor-pointer transition-colors"
                >
                  Apply
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Menu */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black/70 transition-opacity"
            onClick={() => setShowMobileMenu(false)}
          />
          {/* Drawer */}
          <div 
            ref={mobileMenuRef}
            className="relative w-[80%] max-w-[320px] bg-white h-full overflow-y-auto flex flex-col shadow-2xl animate-slide-right text-amazon-text"
          >
            <div className="bg-amazon-navy px-5 py-4 flex items-center justify-between text-white sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <div className="bg-white/20 p-1.5 rounded-full">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <h2 className="font-bold text-[18px]">
                  Hello, {currentUser?.name?.split(" ")[0] || "Sign in"}
                </h2>
              </div>
              <button onClick={() => setShowMobileMenu(false)} className="text-white hover:text-gray-300 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="py-2">
              <div className="px-5 py-2 border-b border-gray-200">
                <p className="font-bold text-[16px] mb-2">My Account</p>
                {!isAdminMode && !isEmployee && (
                  <>
                    <Link to="/orders" onClick={() => setShowMobileMenu(false)} className="block py-2 text-[14px] text-amazon-text hover:text-amazon-orange transition-colors">Returns & Orders</Link>
                    {currentUser && (
                      <Link to="/profile" onClick={() => setShowMobileMenu(false)} className="block py-2 text-[14px] text-amazon-text hover:text-amazon-orange transition-colors">
                        Green Credits Balance: <span className="font-bold text-amazon-orange">{currentUser.green_credits}</span> {levelEmoji}
                      </Link>
                    )}
                    <button onClick={() => { setShowMobileMenu(false); setShowLocModal(true); }} className="block w-full text-left py-2 text-[14px] text-amazon-text hover:text-amazon-orange transition-colors">
                      Location: {currentUser?.city || "Select"} {currentUser?.pincode || ""}
                    </button>
                  </>
                )}
                {isEmployee && (
                  <Link to="/delivery" onClick={() => setShowMobileMenu(false)} className="block py-2 text-[14px] text-amazon-text hover:text-amazon-orange transition-colors">My Deliveries</Link>
                )}
              </div>

              {!isAdminMode && !isEmployee && (
                <div className="px-5 py-2 border-b border-gray-200">
                  <p className="font-bold text-[16px] mb-2">Explore</p>
                  <Link to="/" onClick={() => setShowMobileMenu(false)} className="block py-2 text-[14px] text-amazon-text hover:text-amazon-orange transition-colors">All Products</Link>
                  <Link to="/feed" onClick={() => setShowMobileMenu(false)} className="block py-2 text-[14px] text-[#00e5a0] font-bold hover:text-amazon-green transition-colors">Circular Commerce</Link>
                  <Link to="/neardrop" onClick={() => setShowMobileMenu(false)} className="block py-2 text-[14px] text-amazon-text hover:text-amazon-orange transition-colors">📍 NearDrop</Link>
                </div>
              )}

              {/* Admin Toggle */}
              <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                <span className="font-bold text-[14px]">Admin Mode</span>
                <div 
                  className={`w-10 h-5 rounded-full p-0.5 cursor-pointer flex items-center transition-colors ${isAdminMode ? 'bg-[#00e5a0]' : 'bg-gray-400'}`}
                  onClick={() => {
                     setIsAdminMode(!isAdminMode);
                     navigate(!isAdminMode ? "/dashboard" : "/");
                     setShowMobileMenu(false);
                  }}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isAdminMode ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </div>

              {/* User Switcher (Mobile) */}
              {!isAdminMode && (
                <div className="px-5 py-2 mb-4">
                  <p className="font-bold text-[16px] mb-2 mt-2">Switch Profile</p>
                  
                  <p className="pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-amazon-text-secondary">Customers</p>
                  <div className="flex flex-col gap-1">
                    {users.filter(u => u.role === "customer" || (!u.role && !u.is_admin)).map(u => (
                      <button
                        key={u.id}
                        onClick={() => { handleProfileSwitch(u.id); setShowMobileMenu(false); }}
                        className={`text-left px-3 py-2 rounded text-[14px] flex items-center justify-between transition-colors ${currentUser?.id === u.id ? 'bg-[#f5faff] border border-[#007185] text-[#007185] font-bold' : 'border border-gray-200 hover:bg-gray-50'}`}
                      >
                        {u.name}
                        {currentUser?.id === u.id && <span>✓</span>}
                      </button>
                    ))}
                  </div>

                  <p className="pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#c7511f]">🚚 Delivery</p>
                  <div className="flex flex-col gap-1">
                    {users.filter(u => u.role === "employee").map(u => (
                      <button
                        key={u.id}
                        onClick={() => { handleProfileSwitch(u.id); setShowMobileMenu(false); }}
                        className={`text-left px-3 py-2 rounded text-[14px] flex items-center justify-between transition-colors ${currentUser?.id === u.id ? 'bg-[#fff8f0] border border-[#c7511f] text-[#c7511f] font-bold' : 'border border-gray-200 hover:bg-gray-50'}`}
                      >
                        {u.name}
                        {currentUser?.id === u.id && <span>✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
