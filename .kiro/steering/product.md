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

1. **Purchase** — a customer places an `Order`.
2. **Delivery baseline scan** — at delivery, an employee captures multi-angle images of the product. These are stored on the `Order` in the `baseline_scan_*` fields (for example `baseline_scan_urls`, `baseline_scan_at`, `baseline_scan_employee_id`). This baseline is later compared against return photos.
3. **Return** — the customer initiates a return, recorded as a `Return` model tied to the order.
4. **AI assessment** — the returned product's condition is evaluated in `backend/app/services/ai_assessment.py` via `assess_condition()`, producing a condition score, defects, remaining-life percentage, and a recommended action. **Note:** this module is currently a stub that returns mock data — it is the single integration point for a future real vision model (e.g. AWS Bedrock / Claude Vision).
5. **Outcome** — based on the assessment, the item is routed to a resell or refurbish outcome (recommended actions include `resell`, `refurbish`, `exchange`, `donate`, `recycle`).

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
