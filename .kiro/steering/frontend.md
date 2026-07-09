---
inclusion: fileMatch
fileMatchPattern: 'frontend/**'
---

# Frontend Contributor Guide

Task-oriented guidance for working in the FluxForge React 19 + Vite frontend under `frontend/`. Use these recipes and conventions so new pages, routes, and API calls follow the patterns already in the codebase.

## Add a page

Create a PascalCase component file in `frontend/src/pages/` and give it a **default export**:

```jsx
// frontend/src/pages/MyFeature.jsx
export default function MyFeature() {
  return <div>My feature</div>;
}
```

## Register a route

Add a `<Route>` inside the `<Routes>` block in `frontend/src/App.jsx`:

```jsx
import MyFeature from "./pages/MyFeature";
<Route path="/my-feature" element={<MyFeature />} />
```

**Current routes:**

| Path | Page | Notes |
|---|---|---|
| `/` | `Home` | Product grid, hero slideshow, category dropdown |
| `/products/:id` | `ProductDetail` | Multi-angle gallery, buy box, related products |
| `/orders` | `Orders` | One-click return flow |
| `/returns/new` | `NewReturn` | 3-step Nova Pro photo-based return |
| `/feed` | `Feed` | Circular Commerce marketplace |
| `/community/sell` | `SellItem` | Dedicated multi-step listing page (Amazon vs non-Amazon split) |
| `/listings/:id` | `ListingDetail` | Trust & transparency report |
| `/profile` | `Profile` | Green Credits dashboard |
| `/neardrop` | `NearDrop` | Wishlist + product-card grid + WatchConfigModal |
| `/dashboard` | `Dashboard` | Admin KPI dashboard |
| `/employee-scan` | `EmployeeScan` | Dormant baseline scan UI |
| `/delivery` | `DeliveryDashboard` | Dormant delivery agent UI |

## Add an API function

Add a **named export** in `frontend/src/api/client.js` using the `request(path, options)` wrapper. `BASE_URL` already includes `/api`, so paths start **after** `/api`:

```js
export const getMyThings = (userId) => request(`/mything/?user_id=${userId}`);
export const createMyThing = (data) =>
  request("/mything/", { method: "POST", body: JSON.stringify(data) });
```

For multipart/file uploads, use raw `fetch` with `FormData` (not `request`) — see `verifyInvoice` in `client.js` as the pattern.

## Key API functions

| Function | Endpoint | Notes |
|---|---|---|
| `createReturn(orderId, ...)` | `POST /returns/` | One-click return; no scan required |
| `createReturnWithPhoto(orderId, photoFile)` | `POST /returns/with-photo` | Nova Pro photo-based return |
| `createCommunityListing(data)` | `POST /community/listings` | Includes provenance fields |
| `verifyInvoice(file, title, category, brand, askingPrice, productPhoto?)` | `POST /community/verify-invoice` | Multi-gate invoice verification; returns `InvoiceVerifyResponse` |
| `getOrders(userId)` | `GET /orders/` | Used by SellItem Amazon path picker |
| `getProduct(id)` | `GET /products/:id` | Used by SellItem + NearDrop |

## `client.js` conventions

- **`request(path, options)`** — JSON fetch wrapper. Throws `Error` with `.status` and `.detail` on failure.
- **`BASE_URL`** — `VITE_API_URL` → `/api` (prod) → `http://{hostname}:8000/api` (dev).
- **`getApiBaseUrl()`** — returns resolved `BASE_URL`.
- **`getMediaUrl(path)`** — prepends host for relative S3/media paths.
- **File uploads** — use raw `fetch` + `FormData`, not `request`. Pattern: see `verifyInvoice`.

## `UserContext` usage

Global user state lives in `frontend/src/context/UserContext.jsx`. The **cart has been removed**.

Values exposed by `useUser()`:

- `users`, `currentUser`, `switchUser(userId)`, `refreshUser`, `updateUserProfile(userId, data)`
- `loading`
- `isAdminMode`, `setIsAdminMode`

The header uses a **responsive layout**. On mobile, navigation links and the user switcher are moved inside a **hamburger menu drawer** (`showMobileMenu` state) to preserve space. The user switcher itself is **click-based** (not hover-only) and uses outside-click detection (`mousedown` + `touchstart`) along with body scroll locking when the mobile menu is open.

## Key UI patterns

### Home page (`Home.jsx`)
- **2-column mobile grid** (`grid-cols-2`), 3-col `sm:`, 4-col `xl:`
- **Category dropdown** — Amazon-style with emoji icons, active orange border highlight, outside-click close
- **"See more results"** — 10 products per page, `visibleCount` state, resets on filter change
- Product cards have responsive image height (`h-[160px] sm:h-[240px]`) and scaled typography

### ProductDetail (`ProductDetail.jsx`)
- **Multi-angle image gallery** — `allImages` array built from `product.image_url` + `product.image_urls` CSV. Prev/Next arrows visible on mobile, counter pill, thumbnail strip. `activeImg` state resets on product navigation.
- **`CreditInfoBadge`** — click-to-open popup, uses `position: fixed` + `getBoundingClientRect()` to avoid mobile viewport clipping. Closes on `touchstart` + `mousedown` + scroll.

### SellItem (`/community/sell`)
- Full dedicated page — **not a modal**.
- Sticky dark top bar with step name + back chevron.
- Animated progress bar (4 dot-nodes: Source → Order/Invoice → Photo → Details).
- Two paths: `STEPS.amazon = ["path","pick","photo","details","done"]` and `STEPS.non_amazon = ["path","invoice","photo","details","done"]`.
- `go(step)` / `back()` navigation helpers.
- Invoice drop zone and photo drop zone both support drag-and-drop (`onDragOver` + `onDrop`) with `dragActive` visual state. No `capture="environment"` on file inputs — allows gallery picker.
- Photo zone shows a thumbnail preview using `URL.createObjectURL(imageFile)`.
- "Next" button disabled if `invoiceResult?.price_flag_severity === "block"`.

### NearDrop (`NearDrop.jsx`)
- **ProductPicker** — full-screen overlay, 2-col product grid, live search, category pills.
- **WatchConfigModal** — bottom sheet on mobile, centered on desktop. Two sliders: max price (default 80% of retail) and radius.
- **My Wishlist tab** — product-card grid with NearDrop metrics strip (max price with implied discount %, radius, remove button). Cross-references `products` array via `item.product_id` for full product data.
- After successful add: closes picker + config sheet, switches to `"wishlist"` tab.

## Styling with Tailwind CSS 4

Styling uses Tailwind CSS 4 via the `@tailwindcss/vite` plugin. Imported via `frontend/src/index.css` with `@import "tailwindcss";`. Amazon theme tokens are in a `@theme` block in that file. Write utility classes directly in JSX — no separate config file.
