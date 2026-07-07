---
inclusion: fileMatch
fileMatchPattern: 'frontend/**'
---

# Frontend Contributor Guide

Task-oriented guidance for working in the FluxForge React 19 + Vite frontend under `frontend/`. Use these recipes and conventions so new pages, routes, and API calls follow the patterns already in the codebase.

## Add a page

Create a PascalCase component file in `frontend/src/pages/` (for example `MyFeature.jsx`) and give it a **default export**. This mirrors the existing pages such as `Home`, `ProductDetail`, `Orders`, `Dashboard`, and `EmployeeScan`.

```jsx
// frontend/src/pages/MyFeature.jsx
export default function MyFeature() {
  return <div>My feature</div>;
}
```

## Register a route

Add a `<Route path=... element={<Page/>} />` inside the `<Routes>` block in `frontend/src/App.jsx`. `App.jsx` imports `BrowserRouter`, `Routes`, and `Route` from `react-router-dom`, and the route table is nested inside a shared layout route (`<Route element={<Layout />}>`) wrapped by `<BrowserRouter>` and `<UserProvider>`.

```jsx
// inside frontend/src/App.jsx, within <Routes><Route element={<Layout />}> ... </Route></Routes>
import MyFeature from "./pages/MyFeature";

<Route path="/my-feature" element={<MyFeature />} />
```

Place the new `<Route>` alongside the existing entries (`/`, `/products/:id`, `/orders`, `/returns/new`, `/feed`, `/listings/:id`, `/profile`, `/neardrop`, `/cart`, `/dashboard`, `/employee-scan`, `/delivery`) so it inherits the shared `Layout`.

## Add an API function

Add a **named export** in `frontend/src/api/client.js` that calls the `request(path, options)` wrapper (or `multipartRequest` for file uploads). Paths passed to `request` start **after** `/api`, because `BASE_URL` already includes the `/api` prefix.

```js
// frontend/src/api/client.js
export const getMyThings = (userId) => request(`/mything/?user_id=${userId}`);

export const createMyThing = (data) =>
  request("/mything/", {
    method: "POST",
    body: JSON.stringify(data),
  });
```

Follow the existing grouping and naming style in `client.js` (for example `getUsers`, `createOrder`, `getFeed`, `redeemCredits`).

## `client.js` conventions

`frontend/src/api/client.js` centralizes all HTTP access:

- **`request(path, options)`** — a `fetch` wrapper. It sets `Content-Type: application/json` by default and spreads in any `options` you pass. On a non-OK response it throws an `Error` decorated with `.status` (the HTTP status) and `.detail` (the parsed error detail from the response body), so callers can branch on those fields.
- **`BASE_URL` resolution** — uses `VITE_API_URL` if set; otherwise `/api` in a production build; otherwise `http://{window.location.hostname}:8000/api` in development. This means the dev frontend auto-targets port `8000` on the current hostname unless `VITE_API_URL` is provided.
- **`getApiBaseUrl()`** — returns the resolved `BASE_URL`.
- **`getMediaUrl(path)`** — returns an absolute URL for a relative media path. It returns `path` unchanged if it already starts with `http`, and otherwise strips the trailing `/api` from `BASE_URL` and prepends the resulting host. Use it whenever you render server-provided media/image paths.
- **`multipartRequest(path, formData)` + `FormData`** — used for file uploads instead of `request`. It posts a `FormData` body without a JSON `Content-Type`. Existing uploads include the baseline scan (`submitBaselineScan`) and the try-on body photo (`uploadBodyPhoto`).

## `UserContext` usage

Global user and cart state lives in `frontend/src/context/UserContext.jsx`.

- Wrap the app in `<UserProvider>` (already done in `App.jsx`).
- Consume the context in components via the `useUser()` hook. It throws if used outside a `UserProvider`.

Values exposed by `useUser()`:

- `users` — the list of available users.
- `currentUser` — the currently selected user.
- `switchUser(userId)` — fetches and switches to another user.
- `refreshUser` — reloads the current user from the API.
- `updateUserProfile(userId, data)` — updates a user profile and refreshes state.
- `loading` — true while the initial user list is loading.
- Cart helpers: `cart`, `addToCart(item)`, `removeFromCart(cartId)`, `isInCart(cartId)`.
- `isAdminMode` / `setIsAdminMode` — admin mode derives from `currentUser.role === "admin"`.

Persistence: the cart is stored in `localStorage` under `amazon_cart`, and the selected user id under `amazon_current_user_id`.

```jsx
import { useUser } from "../context/UserContext";

function Example() {
  const { currentUser, switchUser, addToCart, isAdminMode } = useUser();
  // ...
}
```

## Styling with Tailwind CSS 4

Styling uses Tailwind CSS 4 via the `@tailwindcss/vite` plugin (declared in `frontend/package.json` devDependencies alongside `tailwindcss`). Tailwind is imported through `frontend/src/index.css` with `@import "tailwindcss";`, and the Amazon theme tokens are defined there in a `@theme` block. No separate `tailwind.config` content array is required for v4 — write utility classes directly in JSX.
