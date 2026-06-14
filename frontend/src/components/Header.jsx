import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUsers } from "../api/client";
import { useUser } from "../context/UserContext";

const LEVEL_EMOJIS = {
  "Seed 🌱": "🌱",
  "Sapling 🌿": "🌿",
  "Green Hero 🌎": "🌎",
  "Planet Protector 🌍": "🌍",
  "Circular Champion ♻️": "♻️",
};

export default function Header() {
  const navigate = useNavigate();
  const { currentUser, switchUser } = useUser();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getUsers().then(setUsers).catch(console.error);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) {
      // In a real app, this would route to a search page
      navigate("/");
    }
  };

  const levelEmoji = currentUser ? (LEVEL_EMOJIS[currentUser.level] || "🌱") : "🌱";

  return (
    <header className="bg-amazon-navy text-white">
      {/* Top Nav */}
      <div className="flex items-center justify-between px-4 py-2 gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center pt-2 pb-1 px-2 border border-transparent hover:border-white rounded-sm">
          <span className="text-[24px] font-bold tracking-tight">amazon</span>
          <span className="text-amazon-orange text-[14px] font-bold ml-1 relative -top-2">.in</span>
        </Link>

        {/* Location (Desktop) */}
        <div className="hidden md:flex flex-col px-2 py-1 border border-transparent hover:border-white rounded-sm cursor-pointer">
          <span className="text-[12px] text-[#ccc] leading-tight ml-4">Delivering to Mumbai 400001</span>
          <span className="text-[14px] font-bold flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Update location
          </span>
        </div>

        {/* Search */}
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

        {/* Right Nav Items */}
        <div className="flex items-center gap-1">
          {/* User Switcher (Hackathon feature) */}
          <div className="group relative px-2 py-1 border border-transparent hover:border-white rounded-sm cursor-pointer">
            <div className="flex flex-col">
              <span className="text-[12px] text-white">Hello, {currentUser?.name?.split(" ")[0] || "Sign in"}</span>
              <span className="text-[14px] font-bold flex items-center gap-1">Accounts & Lists <span className="text-[10px] text-[#a7acb2]">▼</span></span>
            </div>
            
            {/* Dropdown menu */}
            <div className="hidden group-hover:block absolute right-0 top-full mt-1 w-[240px] bg-white text-amazon-text rounded-md shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-amazon-border z-50">
              <div className="p-3 border-b border-amazon-border bg-[#f0f2f2]">
                <p className="font-bold text-[14px]">Demo Profiles</p>
                <p className="text-[11px] text-amazon-text-secondary">Switch user to test different states</p>
              </div>
              <div className="py-2">
                {users.map(u => (
                  <button 
                    key={u.id} 
                    onClick={() => switchUser(u.id)}
                    className={`w-full text-left px-4 py-2 text-[13px] hover:bg-gray-100 flex items-center justify-between ${currentUser?.id === u.id ? 'font-bold bg-[#f5faff] text-amazon-link' : ''}`}
                  >
                    <span>{u.name}</span>
                    {currentUser?.id === u.id && <span>✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Link to="/orders" className="hidden lg:flex flex-col px-2 py-1 border border-transparent hover:border-white rounded-sm cursor-pointer">
            <span className="text-[12px] text-white leading-tight">Returns</span>
            <span className="text-[14px] font-bold">& Orders</span>
          </Link>

          {/* Green Credits Wallet Icon */}
          {currentUser && (
            <Link to="/profile" className="flex items-center gap-2 px-2 py-1 border border-transparent hover:border-white rounded-sm transition-colors">
              <div className="flex flex-col items-center">
                <span className="text-[18px] leading-none mb-[1px]">{levelEmoji}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[12px] text-white font-bold leading-tight">Green Credits</span>
                <span className="text-[14px] font-bold text-amazon-orange leading-none">{currentUser.green_credits}</span>
              </div>
            </Link>
          )}

          <Link to="/orders" className="flex items-center px-2 py-1 border border-transparent hover:border-white rounded-sm cursor-pointer relative">
            <span className="text-[32px] leading-none mt-1">🛒</span>
            <span className="absolute top-1 left-[22px] text-amazon-orange font-bold text-[16px]">0</span>
            <span className="hidden sm:block text-[14px] font-bold mt-3">Cart</span>
          </Link>
        </div>
      </div>

      {/* Mobile Search */}
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

      {/* Sub Nav */}
      <div className="bg-amazon-navy-light px-4 py-1.5 flex items-center gap-4 overflow-x-auto whitespace-nowrap text-[14px]">
        <button className="flex items-center gap-1 font-bold hover:outline hover:outline-1 hover:outline-white p-1 rounded-sm text-white">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          All
        </button>
        <Link to="/feed" className="hover:outline hover:outline-1 hover:outline-white p-1 rounded-sm text-white flex items-center gap-1">
          <span className="text-[#00FF00]">🌱</span> Second Life
        </Link>
        <Link to="/profile" className="hover:outline hover:outline-1 hover:outline-white p-1 rounded-sm text-white font-bold">
          Dashboard
        </Link>
        <a href="#" className="hover:outline hover:outline-1 hover:outline-white p-1 rounded-sm text-white">Fresh</a>
        <a href="#" className="hover:outline hover:outline-1 hover:outline-white p-1 rounded-sm text-white">Amazon miniTV</a>
        <a href="#" className="hover:outline hover:outline-1 hover:outline-white p-1 rounded-sm text-white">Sell</a>
        <a href="#" className="hover:outline hover:outline-1 hover:outline-white p-1 rounded-sm text-white">Best Sellers</a>
        <a href="#" className="hover:outline hover:outline-1 hover:outline-white p-1 rounded-sm text-white">Mobiles</a>
        <a href="#" className="hover:outline hover:outline-1 hover:outline-white p-1 rounded-sm text-white">Today's Deals</a>
        <a href="#" className="hover:outline hover:outline-1 hover:outline-white p-1 rounded-sm text-white hidden sm:block">Customer Service</a>
      </div>
    </header>
  );
}
