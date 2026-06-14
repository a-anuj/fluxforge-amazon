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
export const getImpactStats = (id) => request(`/users/${id}/impact-stats`);
export const getChallenges = (id) => request(`/users/${id}/challenges`);
export const completeChallenge = (userId, challengeId) =>
  request(`/users/${userId}/challenges/${challengeId}/complete`, {
    method: "POST",
  });

// ── Products ──────────────────────────────────────────────────
export const getProducts = () => request("/products/");
export const getProduct = (id) => request(`/products/${id}`);
export const getAlternatives = (id) => request(`/products/${id}/alternatives`);
export const getProductConfidence = (id) => request(`/products/${id}/confidence`);
export const getProductImpact = (id) => request(`/products/${id}/impact`);
export const getRefurbishedAlt = (id) => request(`/products/${id}/refurbished-alternative`);
export const getSustainabilityAdvice = (id) => request(`/products/${id}/sustainability-advice`);

// ── Orders ────────────────────────────────────────────────────
export const createOrder = (userId, productId, isRefurbished = false, deliveryType = "standard") =>
  request("/orders/", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      product_id: productId,
      is_refurbished: isRefurbished,
      delivery_type: deliveryType,
    }),
  });
export const getOrders = (userId) => request(`/orders/?user_id=${userId}`);
export const getDeliveryOptions = (category = "electronics") =>
  request(`/orders/delivery-options?category=${category}`);

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

// ── Redemptions ───────────────────────────────────────────────
export const getRedemptionOptions = () => request("/redemptions/options");
export const redeemCredits = (userId, type, credits) =>
  request("/redemptions/redeem", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, type, credits }),
  });
export const getRedemptions = (userId) => request(`/redemptions/history?user_id=${userId}`);
