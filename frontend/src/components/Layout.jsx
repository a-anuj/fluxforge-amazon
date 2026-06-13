import { Outlet } from "react-router-dom";
import Header from "./Header";

export default function Layout() {
  return (
    <div className="min-h-screen bg-amazon-bg flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      {/* Amazon-style footer */}
      <div>
        {/* Back to top */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="w-full bg-amazon-navy-mid text-white text-[13px] py-3 hover:bg-[#485769] transition-colors"
        >
          Back to top
        </button>
        {/* Footer links */}
        <div className="bg-amazon-navy-light">
          <div className="max-w-[1500px] mx-auto px-4 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h4 className="text-white text-[15px] font-bold mb-3">Get to Know Us</h4>
              <ul className="space-y-2 text-[13px] text-[#ddd]">
                <li className="hover:underline cursor-pointer">About Circular Intelligence</li>
                <li className="hover:underline cursor-pointer">Sustainability Mission</li>
                <li className="hover:underline cursor-pointer">Careers</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white text-[15px] font-bold mb-3">Circular Features</h4>
              <ul className="space-y-2 text-[13px] text-[#ddd]">
                <li className="hover:underline cursor-pointer">Return Risk Prediction</li>
                <li className="hover:underline cursor-pointer">AI Product Grading</li>
                <li className="hover:underline cursor-pointer">Shopping Twins</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white text-[15px] font-bold mb-3">Green Credits</h4>
              <ul className="space-y-2 text-[13px] text-[#ddd]">
                <li className="hover:underline cursor-pointer">Earn Credits</li>
                <li className="hover:underline cursor-pointer">Redeem Rewards</li>
                <li className="hover:underline cursor-pointer">Leaderboard</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white text-[15px] font-bold mb-3">Help</h4>
              <ul className="space-y-2 text-[13px] text-[#ddd]">
                <li className="hover:underline cursor-pointer">Your Account</li>
                <li className="hover:underline cursor-pointer">Returns Centre</li>
                <li className="hover:underline cursor-pointer">Customer Service</li>
              </ul>
            </div>
          </div>
        </div>
        {/* Bottom bar */}
        <div className="bg-amazon-navy border-t border-[#3a4553]">
          <div className="max-w-[1500px] mx-auto px-4 py-4 flex items-center justify-center gap-4">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg"
              alt="Amazon"
              className="h-[20px] brightness-0 invert"
            />
            <span className="text-[11px] text-[#999]">
              © 2026 Amazon Circular Intelligence — Hackathon Prototype
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
