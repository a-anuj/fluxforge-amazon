# Product Overview

FluxForge — internally branded the **"Amazon Green Credits Ecosystem"** (the FastAPI `title` set in `backend/app/main.py`) — is a circular-commerce and Green Credits sustainability platform. It turns product returns into an opportunity to reuse, refurbish, and resell goods, and rewards customers for sustainable behavior with an in-app credit currency.

## Domain summary

The domain is circular commerce: instead of treating a returned product as waste, FluxForge assesses its condition and routes it back into circulation through reselling, refurbishing, or peer-to-peer community resale. Sustainable actions (buying refurbished, reselling, repairing, donating, recycling, choosing eco delivery) earn users **Green Credits**, which they can redeem for tangible benefits. The platform also tracks environmental impact metrics (CO₂ saved, e-waste prevented, water saved) across users and products.

## User roles

There are three user roles, backed by the `User.role` field in `backend/app/models.py` (a string, default `"customer"`):

- **customer** — shops, returns products, earns and redeems Green Credits, lists items in the community marketplace, and uses virtual try-on.
- **employee** — captures the delivery baseline scan of an order (multi-angle images at delivery) and works delivery zones.
- **admin** — administrative access; on the frontend, admin mode derives from `currentUser.role === "admin"`.

## Return lifecycle flow

The end-to-end return journey:

1. **Purchase** — a customer places an `Order`. The order status starts as `"placed"` and is shown to the customer as "Order Received".
2. **Return** — the customer clicks "Return or Replace" directly on the Orders page. This calls `POST /api/returns/` and immediately sets `Order.status = "returned"` and `Return.status = "completed"`. No delivery scan or employee action is required.
3. **Outcome** — the `create_return` endpoint assigns a disposition action (`resell`, `refurbish`, `recycle`, `donate`, etc.) either from the caller or via the `assess_condition()` stub fallback, awards Green Credits, and forfeits any pending no-return loyalty credits.

**Video scan feature — removed, pending rebuild.**  
The pre-packaging baseline scan (employee captures multi-angle delivery images) and the return-phase live video assessment (customer scans returned item) have been **removed from the active return flow**. The underlying code is preserved — `backend/app/routers/baseline.py`, `backend/app/services/ai_assessment.py`, `frontend/src/pages/EmployeeScan.jsx`, `frontend/src/pages/NewReturn.jsx`, and `frontend/src/components/LiveVideoScanner` — but none of it is gating returns. When this feature is rebuilt from scratch, the gate (`order.status == "delivered"` check in `create_return`) and the pickup-scan finalization step will be reintroduced.

The `baseline_scan_*` fields still exist on the `Order` model (`baseline_scan_urls`, `baseline_scan_at`, `baseline_scan_employee_id`, `baseline_frame_urls`) and the baseline/employee endpoints are still mounted, but they are not part of the customer-facing return journey until the rebuild is complete.

**AI assessment note:** `backend/app/services/ai_assessment.py` (`assess_condition()`) returns mock data. It is the single integration point for a future real vision model (e.g. AWS Bedrock / Claude Vision).

## Green Credits earn-and-redeem flow

Users earn and redeem the in-app Green Credits currency:

- **Earn** — sustainable actions create a `GreenCreditTx` (transaction) record; `GreenChallenge` entries offer additional reward credits for completing sustainability challenges.
- **Redeem** — users spend credits via a `Redemption`, whose type is one of `discount`, `prime`, or `donation`.

## Community resale + wishlist-match flow

FluxForge supports peer-to-peer resale alongside the return pipeline:

- **Community resale** — users list items for sale directly to other users through `CommunityListing` (with AI-assisted condition summaries and price suggestions).
- **Wishlist matching** — users register desired items as `Wishlist` entries (with a matching radius in km). When a return becomes available nearby, radius-based matching produces a `WishlistMatch` and sends a `WishlistNotification` to the interested user, enabling a local, low-logistics handoff.

## Virtual try-on flow

Customers can preview apparel on themselves before buying:

- A user uploads a body/selfie photo, stored as a `UserBodyPhoto`.
- A virtual try-on image is generated and cached in `TryOnCache` (to avoid redundant GPU calls), served through the `tryon` router (`backend/app/routers/tryon.py`).
