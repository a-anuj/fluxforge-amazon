import { useState } from "react";
import { Link } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { createOrder, purchaseListing } from "../api/client";

export default function Cart() {
  const { currentUser, refreshUser, cart, removeFromCart, setCart } = useUser();
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState(null);

  const calculateTotal = () => {
    return cart.reduce((total, item) => total + (item.price || 0), 0);
  };

  const handleCheckout = async () => {
    if (!currentUser || cart.length === 0) return;
    setCheckingOut(true);
    let successCount = 0;
    try {
      for (const item of cart) {
        if (item.cartType === "product") {
          await createOrder(currentUser.id, item.id, false, "standard");
        } else if (item.cartType === "listing") {
          await purchaseListing(item.id, currentUser.id);
        }
        successCount++;
      }
      setCheckoutResult(`Successfully purchased ${successCount} item(s)!`);
      refreshUser();
      
      // Since setCart wasn't exposed in useUser, we'll just clear the localStorage manually 
      // or remove items one by one. Let's do it by calling removeFromCart on all items.
      cart.forEach(item => removeFromCart(item.cartId));
    } catch (err) {
      alert("Error during checkout: " + err.message);
    }
    setCheckingOut(false);
  };

  if (checkoutResult) {
    return (
      <div className="max-w-[1000px] mx-auto px-4 py-8">
        <div className="bg-white p-6 rounded shadow text-center">
          <p className="text-[24px] text-amazon-success font-bold mb-4">{checkoutResult}</p>
          <Link to="/orders" className="btn-amazon-primary px-6 py-2 inline-block">View Your Orders</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#eaeded] min-h-screen py-4">
      <div className="max-w-[1200px] mx-auto px-4 grid grid-cols-1 md:grid-cols-[1fr_300px] gap-4">
        {/* Cart Items */}
        <div className="bg-white p-5 rounded">
          <h1 className="text-[28px] text-amazon-text font-normal border-b border-amazon-border pb-2 mb-4">Shopping Cart</h1>
          
          {cart.length === 0 ? (
            <div className="py-8">
              <p className="text-[18px]">Your Amazon Cart is empty.</p>
              <Link to="/" className="text-amazon-link hover:underline text-[14px]">Shop today's deals</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item) => (
                <div key={item.cartId} className="flex gap-4 border-b border-amazon-border pb-4">
                  <div className="w-[150px] h-[150px] flex-shrink-0 flex items-center justify-center">
                    <img src={item.image_url || "https://via.placeholder.com/150"} alt={item.name} className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[18px] text-amazon-text font-medium">
                      {item.name || (item.product && item.product.name)}
                    </h3>
                    {item.cartType === "listing" && <span className="eco-badge mt-1 inline-block">Second Life</span>}
                    <p className="text-amazon-success text-[12px] mt-1 font-bold">In stock</p>
                    <p className="text-[12px] text-amazon-text mt-1">Eligible for FREE Shipping</p>
                    <div className="mt-2 flex items-center gap-4">
                      <button 
                        onClick={() => removeFromCart(item.cartId)}
                        className="text-[12px] text-amazon-link hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[18px] font-bold text-amazon-text">₹{Math.floor(item.price).toLocaleString("en-IN")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Subtotal and Checkout */}
        {cart.length > 0 && (
          <div className="bg-white p-5 rounded self-start">
            <div className="text-[18px] mb-4">
              Subtotal ({cart.length} item{cart.length !== 1 ? 's' : ''}): <span className="font-bold">₹{Math.floor(calculateTotal()).toLocaleString("en-IN")}</span>
            </div>
            <button 
              onClick={handleCheckout} 
              disabled={checkingOut}
              className="w-full btn-amazon-orange py-2 text-[13px] disabled:opacity-50 rounded"
            >
              {checkingOut ? "Processing..." : "Proceed to Buy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
