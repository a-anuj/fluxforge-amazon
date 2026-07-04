import { Outlet } from "react-router-dom";
import Header from "./Header";
import { useState } from "react";

export default function Layout() {
  const [showPopup, setShowPopup] = useState(true);

  return (
    <div className="min-h-screen bg-amazon-bg flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      {/* Footer */}
      <div>
        <div className="bg-amazon-navy border-t border-[#3a4553]">
          <div className="max-w-[1500px] mx-auto px-4 py-4 flex items-center justify-center gap-4">
            <span className="text-[11px] text-[#999]">
              © 2026 Amazon Circular Intelligence — Hackathon Prototype
            </span>
          </div>
        </div>
      </div>

      {showPopup && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowPopup(false)}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-4xl mb-4">🚀</div>
            <h2 className="text-xl font-bold text-[#0f1111] mb-2">Welcome to FluxForge</h2>
            <p className="text-[14px] text-[#565959] mb-6">
              Please note that this is a <strong>Hackathon Prototype</strong> website built to demonstrate Amazon Circular Intelligence.
            </p>
            <button 
              onClick={() => setShowPopup(false)}
              className="w-full bg-[#febd69] hover:bg-[#f3a847] text-[#0f1111] font-bold py-3 rounded-lg transition-colors"
            >
              Continue to Prototype
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
