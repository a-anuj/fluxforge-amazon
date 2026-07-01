import { createContext, useContext, useState, useEffect } from "react";
import { getUsers, getUser, updateUser } from "../api/client";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [isAdminMode, setIsAdminMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("amazon_cart");
    if (saved) setCart(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("amazon_cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    getUsers()
      .then((data) => {
        setUsers(data);
        if (data.length > 0) {
          setCurrentUser(data[0]);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const switchUser = async (userId) => {
    const user = await getUser(userId);
    setCurrentUser(user);
  };

  const refreshUser = async () => {
    if (currentUser) {
      const user = await getUser(currentUser.id);
      setCurrentUser(user);
    }
  };

  const updateUserProfile = async (userId, data) => {
    const updated = await updateUser(userId, data);
    setCurrentUser(updated);
    setUsers((prevUsers) =>
      prevUsers.map((u) => (u.id === userId ? updated : u))
    );
  };

  const addToCart = (item) => setCart(prev => [...prev, item]);
  const removeFromCart = (cartId) => setCart(prev => prev.filter(i => i.cartId !== cartId));
  const isInCart = (cartId) => cart.some(i => i.cartId === cartId);

  return (
    <UserContext.Provider
      value={{ 
        users, 
        currentUser, 
        switchUser, 
        refreshUser, 
        updateUserProfile, 
        loading, 
        cart, 
        addToCart, 
        removeFromCart, 
        isInCart,
        isAdminMode,
        setIsAdminMode
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
