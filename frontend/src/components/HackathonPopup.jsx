import { useState, useEffect } from 'react';

export default function HackathonPopup() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasSeenPopup = sessionStorage.getItem('hasSeenHackathonPopup');
    if (!hasSeenPopup) {
      setIsVisible(true);
      sessionStorage.setItem('hasSeenHackathonPopup', 'true');
    }
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-in relative">
        <div className="bg-amazon-navy p-4 text-center">
          <h2 className="text-white text-xl font-bold">Hackathon Prototype</h2>
        </div>
        <div className="p-6 text-center">
          <p className="text-gray-700 text-base mb-6">
            Welcome to FluxForge! This is a prototype built for <strong>Amazon Hackon 6.0</strong>. 
            The data and features shown are for demonstration purposes only.
          </p>
          <button
            onClick={() => setIsVisible(false)}
            className="bg-amazon-yellow hover:bg-amazon-orange transition-colors w-full py-2.5 rounded-lg font-medium text-amazon-navy"
          >
            Continue to App
          </button>
        </div>
      </div>
    </div>
  );
}
