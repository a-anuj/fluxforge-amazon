import { Link, useLocation } from "react-router-dom";
import { useUser } from "../context/UserContext";

export default function Header() {
  const { users, currentUser, switchUser } = useUser();
  const location = useLocation();

  const navLinks = [
    { to: "/", label: "Catalog" },
    { to: "/orders", label: "Returns & Orders" },
    { to: "/returns/new", label: "Start Return" },
    { to: "/feed", label: "Second Life" },
    { to: "/profile", label: "Account" },
  ];

  return (
    <header className="sticky top-0 z-50">
      {/* Main Header Bar — Amazon navy */}
      <div className="bg-amazon-navy">
        <div className="max-w-[1500px] mx-auto px-4 flex items-center h-[60px] gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-1 px-2 py-1.5 border border-transparent hover:border-white rounded-sm flex-shrink-0">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg"
              alt="Amazon"
              className="h-[26px] brightness-0 invert"
            />
            <span className="text-[10px] text-amazon-orange font-bold tracking-wide">.ci</span>
          </Link>

          {/* Deliver to */}
          {currentUser && (
            <div className="hidden lg:flex items-center gap-1 px-2 py-1.5 border border-transparent hover:border-white rounded-sm cursor-pointer text-white">
              <span className="text-lg">📍</span>
              <div className="leading-tight">
                <span className="text-[#ccc] text-[11px] block">Deliver to {currentUser.name.split(" ")[0]}</span>
                <span className="text-white text-[13px] font-bold">India</span>
              </div>
            </div>
          )}

          {/* Search Bar */}
          <div className="flex-1 flex h-[40px] rounded-md overflow-hidden">
            <select className="bg-[#e6e6e6] border-none text-[#555] text-[12px] px-2 rounded-l-md focus:outline-none cursor-pointer">
              <option>All</option>
              <option>Running</option>
              <option>Electronics</option>
              <option>Backpacking</option>
              <option>Yoga</option>
              <option>Fitness</option>
            </select>
            <input
              type="text"
              placeholder="Search Amazon Circular Intelligence"
              className="flex-1 px-3 text-[14px] text-amazon-text border-none focus:outline-none"
            />
            <button className="bg-amazon-orange hover:bg-amazon-orange-hover px-4 flex items-center justify-center rounded-r-md">
              <svg className="w-5 h-5 text-amazon-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>

          {/* Account & User Switcher */}
          <div className="hidden md:flex items-center">
            <div className="relative px-2 py-1.5 border border-transparent hover:border-white rounded-sm cursor-pointer">
              <span className="text-[#ccc] text-[11px] block leading-tight">Hello, switch user</span>
              <select
                value={currentUser?.id || ""}
                onChange={(e) => switchUser(Number(e.target.value))}
                className="bg-transparent text-white text-[13px] font-bold appearance-none cursor-pointer focus:outline-none pr-3 w-full"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id} className="text-black">
                    {u.name}
                  </option>
                ))}
              </select>
              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[#ccc] text-[10px] pointer-events-none">▾</span>
            </div>
          </div>

          {/* Green Credits */}
          {currentUser && (
            <Link
              to="/profile"
              className="flex items-center gap-1.5 px-2 py-1.5 border border-transparent hover:border-white rounded-sm text-white"
            >
              <div className="leading-tight">
                <span className="text-[#ccc] text-[11px] block">Green Credits</span>
                <span className="text-amazon-orange text-[13px] font-bold flex items-center gap-1">
                  🌱 {currentUser.green_credits}
                </span>
              </div>
            </Link>
          )}

          {/* Cart-style element */}
          <Link
            to="/feed"
            className="flex items-center gap-1 px-2 py-1.5 border border-transparent hover:border-white rounded-sm text-white"
          >
            <span className="text-xl relative">
              ♻️
            </span>
            <span className="text-[13px] font-bold hidden lg:inline">Second Life</span>
          </Link>
        </div>
      </div>

      {/* Sub-nav bar — Amazon dark blue */}
      <div className="bg-amazon-navy-light">
        <div className="max-w-[1500px] mx-auto px-4 flex items-center h-[39px] gap-0 overflow-x-auto">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-[9px] py-[6px] text-[13px] border border-transparent rounded-sm whitespace-nowrap transition-colors ${
                location.pathname === link.to
                  ? "text-white font-bold border-white"
                  : "text-[#ddd] hover:text-white hover:border-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <span className="px-[9px] py-[6px] text-[13px] text-[#ddd]">|</span>
          <span className="px-[9px] py-[6px] text-[13px] text-white font-bold whitespace-nowrap">
            ♻️ Circular Intelligence — Sustainability Platform
          </span>
        </div>
      </div>
    </header>
  );
}
