import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UserProvider } from "./context/UserContext";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import ProductDetail from "./pages/ProductDetail";
import Orders from "./pages/Orders";
import NewReturn from "./pages/NewReturn";
import Feed from "./pages/Feed";
import ListingDetail from "./pages/ListingDetail";
import Profile from "./pages/Profile";
import Cart from "./pages/Cart";

export default function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/returns/new" element={<NewReturn />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/listings/:id" element={<ListingDetail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/cart" element={<Cart />} />
          </Route>
        </Routes>
      </UserProvider>
    </BrowserRouter>
  );
}
