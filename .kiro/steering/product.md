# Product Overview

FluxForge — internally branded the **"Amazon Green Credits Ecosystem"** (the FastAPI `title` set in `backend/app/main.py`) — is a circular-commerce and Green Credits sustainability platform. It turns product returns into an opportunity to reuse, refurbish, and resell goods, and rewards customers for sustainable behavior with an in-app credit currency.

## Domain summary

The domain is circular commerce: instead of treating a returned product as waste, FluxForge assesses its condition and routes it back into circulation through reselling, refurbishing, or peer-to-peer community resale. Sustainable actions (buying refurbished, reselling, repairing, donating, recycling, choosing eco delivery) earn users **Green Credits**, which they can redeem for tangible benefits. The platform also tracks environmental impact metrics (CO₂ saved, e-waste prevented, water saved) across users and products.

## User roles

There are three user roles, backed by the `User.role` field in `backend/app/models.py` (a string, default `"customer"`):

- **customer** — shops, returns products, earns and redeems Green Credits, lists items in the community marketplace, and uses virtual try-on.
- **employee** — works delivery zones (baseline scan feature is dormant; see return lifecycle).
- **admin** — administrative access; on the frontend, admin mode derives from `currentUser.role === "admin"`.

## Return lifecycle flow

The end-to-end return journey:

1. **Purchase** — a customer places an `Order`. The order status starts as `"placed"` and is shown to the customer as "Order Received".
2. **Return** — the customer clicks "Return or Replace" directly on the Orders page. This calls `POST /api/returns/` and immediately sets `Order.status = "returned"` and `Return.status = "completed"`. No delivery scan or employee action is required.
3. **Outcome** — the `create_return` endpoint assigns a disposition action (`resell`, `refurbish`, `recycle`, `donate`, etc.) either from the caller or via the `assess_condition()` stub fallback, awards Green Credits, and forfeits any pending no-return loyalty credits.

**Video scan feature — removed, pending rebuild.**
The pre-packaging baseline scan and the return-phase live video assessment have been **removed from the active return flow**. The underlying code is preserved — `backend/app/routers/baseline.py`, `backend/app/services/ai_assessment.py`, `frontend/src/pages/EmployeeScan.jsx`, `frontend/src/pages/NewReturn.jsx`, and `frontend/src/components/LiveVideoScanner` — but none of it is gating returns. When this feature is rebuilt from scratch, the gate (`order.status == "delivered"` check in `create_return`) and the pickup-scan finalization step will be reintroduced.

**Return AI (Nova Pro):** The `NewReturn.jsx` page now implements a simplified 3-step return flow (select item → upload photo → done) using `POST /api/returns/with-photo`. The photo is sent to Nova Pro for condition assessment. The old `assess_condition()` stub is still the fallback for the direct `POST /api/returns/` endpoint.

## Green Credits earn-and-redeem flow

Users earn and redeem the in-app Green Credits currency:

- **Earn** — sustainable actions create a `GreenCreditTx` (transaction) record; `GreenChallenge` entries offer additional reward credits for completing sustainability challenges.
- **Redeem** — users spend credits via a `Redemption`, whose type is one of `discount`, `prime`, or `donation`.

## Community resale — split listing flow

The community resale feature (`/feed`) has a dedicated listing creation page at **`/community/sell`** (`frontend/src/pages/SellItem.jsx`). This replaces the old single-form modal.

The flow splits at the first step based on purchase origin:

### Amazon-purchased path
1. Seller selects which Amazon order they're selling from their order history (pre-filled product data, no form typing).
2. Sets condition, price (AI suggestion available), description, local pickup toggle.
3. Uploads a product photo — Bedrock Nova Lite verifies it matches the listing.
4. Listing created with `purchase_source = "amazon"`, `amazon_order_id` attached. Buyers see **"Amazon Verified Purchase"** badge.

### Non-Amazon-purchased path
1. Seller enters product title, category, brand.
2. Uploads purchase invoice/bill — **5-gate verification** runs:
   - Gate 1/2: File type + size check
   - Gate 3: Nova Pro OCR + semantic match (extracts product name, store, date, total, serial/IMEI)
   - Gate 4: Confidence hard gate — `low` confidence blocks the listing; `medium` passes with a warning
   - Gate 5: Price cross-validation — asking price vs extracted invoice total (block if >5× invoice price)
   - Gate 6: Serial/IMEI cross-check for electronics — if an identifier was found in the invoice, Nova Pro checks whether the same number is visible in the product photo
3. Sets condition, price, description.
4. Uploads product photo — Bedrock Nova Lite condition verification.
5. Listing created with `purchase_source = "non_amazon"`, all invoice extraction fields stored. Buyers see **"Invoice Verified"** badge.

All validation results (extracted data, price flag, serial match) are surfaced to the seller in real time.

The `/feed` page itself shows three tabs: **All** (Amazon Certified Pre-Owned + community listings), **Community**, and **Leaderboard** (ranked by e-waste prevented).

## NearDrop wishlist flow

Users add products to a wishlist with a radius and max price. The **NearDrop page** (`/neardrop`) has been redesigned:

- **"+ Add to Wishlist"** opens a full-screen `ProductPicker` — same 2-column product grid as the home screen, with live search and category pills. Each card has a "📍 Watch" button.
- Tapping Watch opens a `WatchConfigModal` bottom sheet with two sliders (max price defaulting to 80% of retail, and radius in km).
- After adding, the user lands on the **"My Wishlist" tab** which now shows a proper product-card grid (image, name, price) with a NearDrop metrics strip below each card (max price with implied discount %, radius, keywords, Remove button).

When a return becomes available nearby, radius-based matching produces a `WishlistMatch` and sends a `WishlistNotification`.

## Virtual try-on flow

Customers can preview apparel on themselves before buying:

- A user uploads a body/selfie photo, stored as a `UserBodyPhoto`.
- A virtual try-on image is generated and cached in `TryOnCache` (to avoid redundant GPU calls), served through the `tryon` router (`backend/app/routers/tryon.py`).
