/**
 * Lightweight API client - fetch wrapper with base URL and JSON helpers.
 */

const BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "/api" : `http://${window.location.hostname}:8000/api`);

export const getMediaUrl = (path) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const host = BASE_URL.replace(/\/api$/, "");
  return `${host}${path}`;
};

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const config = {
    headers: { "Content-Type": "application/json" },
    ...options,
  };

  const res = await fetch(url, config);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const message = typeof err.detail === "string"
      ? err.detail
      : err.message || JSON.stringify(err.detail || { status: res.status });
    const apiError = new Error(message || `API error: ${res.status}`);
    apiError.detail = err.detail;
    apiError.status = res.status;
    throw apiError;
  }

  return res.json();
}

// Users
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

// Products
export const getProducts = () => request("/products/");
export const getProduct = (id) => request(`/products/${id}`);
export const getAlternatives = (id) => request(`/products/${id}/alternatives`);
export const getProductConfidence = (id) => request(`/products/${id}/confidence`);
export const getProductImpact = (id) => request(`/products/${id}/impact`);
export const getRefurbishedAlt = (id) => request(`/products/${id}/refurbished-alternative`);
export const getSustainabilityAdvice = (id) => request(`/products/${id}/sustainability-advice`);

// Orders
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
export const vestNoReturnCredits = (orderId) =>
  request(`/orders/${orderId}/vest-credits`, { method: "POST" });

// Returns
export const createReturn = (
  orderId,
  imageUrls = [],
  conditionScore = null,
  recommendedAction = null,
  remainingLifePct = null
) =>
  request("/returns/", {
    method: "POST",
    body: JSON.stringify({
      order_id: orderId,
      image_urls: imageUrls,
      condition_score: conditionScore,
      remaining_life_pct: remainingLifePct,
      recommended_action: recommendedAction,
    }),
  });

// Listings
export const getFeed = (userId) => request(`/listings/feed?user_id=${userId}`);
export const getAllListings = () => request("/listings/all");
export const getListing = (id) => request(`/listings/${id}`);
export const purchaseListing = (listingId, userId) =>
  request(`/listings/${listingId}/purchase`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });

// Redemptions
export const getRedemptionOptions = () => request("/redemptions/options");
export const redeemCredits = (userId, type, credits) =>
  request("/redemptions/redeem", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, type, credits }),
  });
export const getRedemptions = (userId) => request(`/redemptions/history?user_id=${userId}`);

// Community Marketplace
export const getCommunityListings = (userId) =>
  request(`/community/listings${userId ? `?user_id=${userId}` : ""}`);
export const getNearbyListings = (userId) =>
  request(`/community/listings/nearby?user_id=${userId}`);
export const getCommunityListing = (id, userId) =>
  request(`/community/listings/${id}${userId ? `?user_id=${userId}` : ""}`);
export const createCommunityListing = (data) =>
  request("/community/listings", { method: "POST", body: JSON.stringify(data) });
export const buyCommunityListing = (listingId, buyerId) =>
  request(`/community/listings/${listingId}/buy?buyer_id=${buyerId}`, { method: "PUT" });
export const suggestPrice = (data) =>
  request("/community/price-suggest", { method: "POST", body: JSON.stringify(data) });
export const getNotifications = (userId) =>
  request(`/community/notifications?user_id=${userId}`);
export const getUnreadCount = (userId) =>
  request(`/community/notifications/unread-count?user_id=${userId}`);
export const markNotificationsRead = (userId) =>
  request(`/community/notifications/read?user_id=${userId}`, { method: "PUT" });
export const getLeaderboard = () => request("/community/leaderboard");
export const getCommunityPurchases = (userId) => request(`/community/purchases?user_id=${userId}`);
export const createAlert = (userId, category, pincode) =>
  request(
    `/community/alerts?user_id=${userId}&category=${encodeURIComponent(category)}${pincode ? `&pincode=${pincode}` : ""}`,
    { method: "POST" }
  );
export const getAlerts = (userId) => request(`/community/alerts?user_id=${userId}`);

// Wishlist & NearDrop
export const getWishlist = (userId) => request(`/wishlist/?user_id=${userId}`);
export const addToWishlist = (data) =>
  request("/wishlist/", { method: "POST", body: JSON.stringify(data) });
export const removeFromWishlist = (id) => request(`/wishlist/${id}`, { method: "DELETE" });
export const getWishlistMatches = (userId) => request(`/wishlist/matches?user_id=${userId}`);
export const getWishlistNotifications = (userId) =>
  request(`/wishlist/notifications?user_id=${userId}`);
export const markWishlistNotificationsRead = (userId) =>
  request(`/wishlist/notifications/read?user_id=${userId}`, { method: "POST" });
export const getProductJourney = (listingId) => request(`/wishlist/journey/${listingId}`);
export const purchaseWishlistMatch = (matchId, userId) =>
  request(`/wishlist/matches/${matchId}/purchase`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });

// Analytics
export const getDashboardMetrics = () => request("/analytics/dashboard");

export const verifyScanFingerprint = (data) =>
  request("/sustainability/fingerprint", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const verifyLiveMatch = (data) =>
  request("/sustainability/verify_live_match", {
    method: "POST",
    body: JSON.stringify(data),
  });

// Baseline Scan (Employee)
const multipartRequest = async (path, formData) => {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { method: "POST", body: formData });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const message = typeof err.detail === "string"
      ? err.detail
      : err?.detail?.message || err.message || `API error: ${res.status}`;
    const error = new Error(message);
    error.detail = err.detail;
    error.status = res.status;
    throw error;
  }

  return res.json();
};

export const submitBaselineScan = (orderId, employeeId, videoBlob, snapshotBlob) => {
  const form = new FormData();
  form.append("employee_id", employeeId);
  form.append("video", videoBlob, "scan.webm");
  if (snapshotBlob) {
    form.append("snapshot", snapshotBlob, "snapshot.jpg");
  }
  return multipartRequest(`/baseline/${orderId}/scan`, form);
};

export const submitPickupScan = (returnId, employeeId, videoBlob) => {
  const form = new FormData();
  form.append("employee_id", employeeId);
  form.append("video", videoBlob, "scan.webm");
  return multipartRequest(`/returns/${returnId}/pickup-scan`, form);
};

export const getBaselineScan = (orderId) => request(`/baseline/${orderId}`);

export const getPendingBaselineOrders = (employeeId) =>
  request(`/baseline/pending/list?employee_id=${employeeId}`);

// Virtual Try-On
export const uploadBodyPhoto = (userId, file) => {
  const form = new FormData();
  form.append("file", file);
  return multipartRequest(`/tryon/upload-photo?user_id=${userId}`, form);
};

export const getBodyPhotos = (userId) => request(`/tryon/photos?user_id=${userId}`);

export const generateTryOn = (userId, productId, bodyPhotoId) =>
  request("/tryon/generate", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      product_id: productId,
      body_photo_id: bodyPhotoId,
    }),
  });
