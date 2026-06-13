/**
 * Lightweight API client — fetch wrapper with base URL and JSON helpers.
 */

const BASE_URL = "http://localhost:8000/api";

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const config = {
    headers: { "Content-Type": "application/json" },
    ...options,
  };

  const res = await fetch(url, config);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API error: ${res.status}`);
  }

  return res.json();
}

// ── Users ─────────────────────────────────────────────────────
export const getUsers = () => request("/users/");
export const getUser = (id) => request(`/users/${id}`);
export const updateUser = (id, data) =>
  request(`/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
export const getGreenCredits = (id) => request(`/users/${id}/green-credits`);

// ── Products ──────────────────────────────────────────────────
export const getProducts = () => request("/products/");
export const getProduct = (id) => request(`/products/${id}`);
export const getAlternatives = (id) => request(`/products/${id}/alternatives`);

// ── Orders ────────────────────────────────────────────────────
export const createOrder = (userId, productId) =>
  request("/orders/", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, product_id: productId }),
  });
export const getOrders = (userId) => request(`/orders/?user_id=${userId}`);

// ── Returns ───────────────────────────────────────────────────
export const createReturn = (orderId, imageUrls = []) =>
  request("/returns/", {
    method: "POST",
    body: JSON.stringify({ order_id: orderId, image_urls: imageUrls }),
  });

// ── Listings ──────────────────────────────────────────────────
export const getFeed = (userId) => request(`/listings/feed?user_id=${userId}`);
export const getAllListings = () => request("/listings/all");
export const getListing = (id) => request(`/listings/${id}`);
export const purchaseListing = (listingId, userId) =>
  request(`/listings/${listingId}/purchase`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
