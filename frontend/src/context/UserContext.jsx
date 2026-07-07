import { createContext, useContext, useState, useEffect } from "react";
import { getUsers, getUser, updateUser } from "../api/client";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdminMode, setIsAdminMode] = useState(false);

  useEffect(() => {
    getUsers()
      .then((data) => {
        setUsers(data);
        const savedUserId = localStorage.getItem("amazon_current_user_id");
        const savedUser = savedUserId ? data.find((user) => String(user.id) === String(savedUserId)) : null;
        if (savedUser) {
          setCurrentUser(savedUser);
        } else if (data.length > 0) {
          setCurrentUser(data[0]);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem("amazon_current_user_id", String(currentUser.id));
    setIsAdminMode(currentUser.role === "admin");
  }, [currentUser]);

  const switchUser = async (userId) => {
    const user = await getUser(userId);
    setCurrentUser(user);
    localStorage.setItem("amazon_current_user_id", String(user.id));
    setIsAdminMode(user.role === "admin");
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
    localStorage.setItem("amazon_current_user_id", String(updated.id));
    setUsers((prevUsers) =>
      prevUsers.map((u) => (u.id === userId ? updated : u))
    );
  };

  return (
    <UserContext.Provider
      value={{ 
        users, 
        currentUser, 
        switchUser, 
        refreshUser, 
        updateUserProfile, 
        loading, 
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
