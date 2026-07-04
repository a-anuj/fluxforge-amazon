import { Outlet } from "react-router-dom";
import Header from "./Header";

export default function Layout() {
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
    </div>
  );
}
