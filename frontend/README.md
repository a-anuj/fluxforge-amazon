# FluxForge Frontend

React 19 application for the Amazon Circular Intelligence Platform.

---

## Overview

This is the customer-facing, employee, and admin interface for FluxForge.
It is a single-page application built with React 19 and Vite 8, styled with TailwindCSS 4,
and routed with React Router 7. Charts are rendered using Recharts. Icons use Lucide React.

The frontend communicates exclusively with the FluxForge backend REST API.
The API base URL is configured via the VITE_API_URL environment variable in production,
and defaults to http://{hostname}:8000/api in development.

---

## Project Structure

  frontend/
    src/
      App.jsx              - Root component, router setup, user context provider
      main.jsx             - React 19 entry point
      index.css            - Global styles and TailwindCSS base

      api/
        client.js          - Fetch wrapper with base URL, error handling,
                             and typed exports for all 40+ API calls

      components/
        Header.jsx         - Top navigation with user switcher, cart, notifications
        Layout.jsx         - Page shell wrapping all routes
        LiveVideoScanner.jsx - Six-phase guided video scan component
                              Streams keyframes to Bedrock fingerprint API,
                              shows adaptive motion guides and coverage feedback
        TryOnModal.jsx     - Virtual try-on modal; photo upload and IDM-VTON result display
        SustainabilityModal.jsx - Full-screen AI assessment result with condition report
        HackathonPopup.jsx - Hackathon context popup on first visit

      context/
        UserContext.jsx    - Global user state, cart state, admin mode flag,
                             switchUser, refreshUser, updateUserProfile

      pages/
        Home.jsx           - Product catalogue with category filters and hero slideshow
        ProductDetail.jsx  - Confidence card, eco-delivery, try-on, add to cart
        Orders.jsx         - Order history with fit scores and return risk badges
        NewReturn.jsx      - Full return flow: order selection, live scan, AI assessment,
                             community listing option after assessment
        Feed.jsx           - Second Life feed: wishlist-matched items and all listings
        ListingDetail.jsx  - Trust report, product journey timeline, purchase
        NearDrop.jsx       - Wishlist management and radius-matched notifications
        Profile.jsx        - Impact stats, credit wallet, challenges, redemptions
        Cart.jsx           - Cart with delivery option selection and order creation
        Dashboard.jsx      - Admin analytics with charts and KPI cards
        EmployeeScan.jsx   - Employee baseline scan for packaging and return pickups
        DeliveryDashboard.jsx - Employee work queue of pending scans

      utils/
        videoUtils.js      - captureVideoFrame, dataUrlToBlob, pickBestFrame utilities

    index.html             - HTML shell with meta tags and entry point
    vite.config.js         - Vite configuration with React plugin
    vercel.json            - Vercel SPA rewrite rule
    nginx.conf             - Nginx configuration for Docker container
    Dockerfile             - Multi-stage build: Vite build, Nginx serve
    .env.production        - Production VITE_API_URL pointing to EC2 backend

---

## Pages and Components

### Home (/)

Product catalogue with category filters. Features a rotating hero slideshow covering the
four key platform value propositions: Green Credits, AI Delivery Verification, Circular Returns,
and NearDrop Wishlist. Displays a live impact bar for the logged-in user.

### Product Detail (/products/:id)

Fetches and renders:
  - Purchase Confidence Card (return frequency, personal comfort, environmental footprint)
  - Eco-delivery option selector with CO2 and credits preview
  - Virtual try-on trigger button (opens TryOnModal)
  - Refurbished alternative banner if a second-life version exists
  - AI sustainability advice
  - Add to cart / Buy now buttons

### Orders (/orders)

Order history list with:
  - Fit score badge per order
  - Return risk indicator (low, medium, high)
  - No-return credit vesting button (calls /api/orders/{id}/vest-credits)
  - Return button linking to /returns/new?orderId=

### New Return (/returns/new)

A multi-step return flow:

Step 1 - Order selection and return reason.
Step 2 - Live Video Scan (LiveVideoScanner component):
  - Six sequential scan phases with animated motion guides
  - Real-time keyframe streaming to /api/sustainability/fingerprint
  - Live product identity check via /api/sustainability/verify_live_match
  - Coverage progress bar and adaptive next-step instructions from AI
Step 3 - Assessment submission:
  - Submits all captured frames to /api/sustainability/assess
  - Displays the full AI condition report (SustainabilityModal)
  - Shows condition score, damage origin, angle-by-angle breakdown
  - Offers community listing creation for RESALE-classified items
  - Submits the return record to /api/returns/

### Feed - Second Life (/feed)

Two tabs:
  - Matched For You: wishlist radius-matched listings at dynamic discounts
  - Browse All: all available second-life listings

Each card shows the product journey, condition badge, and discounted price.

### Listing Detail (/listings/:id)

Full trust report for a second-life listing:
  - Product provenance timeline (original purchase, return, AI assessment, listing)
  - Condition score and AI damage report
  - Environmental savings (CO2, e-waste prevented)
  - Dynamic discount explanation
  - Purchase button

### NearDrop (/neardrop)

Wishlist management:
  - Add items by category, brand, keywords, max price, and radius
  - View radius-matched notifications (items returned near you)
  - Purchase at dynamic discount
  - View full product journey before buying

### Profile (/profile)

  - Environmental impact dashboard (CO2 saved, e-waste prevented, water saved)
  - Green Credits wallet with transaction history
  - Level progress bar and next-level preview
  - Active challenges with completion buttons
  - Credit redemption options (coupons, Prime, tree planting, recycling)
  - Profile editor (sizes, brand preferences, budget range, location)

### Employee Scan (/employee-scan)

Dual-purpose scan interface for warehouse operators and delivery agents:
  - Order picker showing pending delivery or return pickup items
  - Six-phase guided LiveVideoScanner with the same motion guides used in customer returns
  - AI product identity verification at scan submission
  - Submits to /api/baseline/{order_id}/scan with snapshot and per-phase frame map
  - Advances order status from placed to delivered on success
  - Handles return pickup scans (status: return_pending)

### Delivery Dashboard (/delivery)

  - Work queue of orders pending baseline scan or return pickup
  - Filtered by employee zone
  - Start Scan button links to /employee-scan with pre-selected order
  - Stat cards: pending deliveries, return pickups

### Analytics Dashboard (/dashboard)

Admin-gated (role: admin) analytics page:
  - KPI cards: return rate reduction, AI accuracy, eco-delivery rate,
    customer satisfaction, processing time, cost savings, products resold, CO2 saved
  - Line chart: monthly return rate and AI accuracy trends
  - Bar chart: category-wise return breakdown
  - Pie chart: return reason distribution
  - Table: top 5 most-returned products
  - Bar chart: brand-wise and region-wise returns

---

## LiveVideoScanner Component

This is the most complex component in the codebase. It implements the six-phase
guided video scan used by both customers (returns) and employees (baseline).

Key behaviours:

  Phase management:
    - Sequences through 6 phases (front_anchor through detail_mark)
    - Each phase has a timer, motion animation class, and icon
    - Phase auto-advances when its duration elapses and a minimum frame count is captured

  Frame capture:
    - Uses captureVideoFrame() from videoUtils.js to sample JPEG frames at ~1 fps
    - Best frame per phase is selected via pickBestFrame() (length-proxy sharpness score)
    - All frames are stored as data URLs and sent as a phase-keyed map to the backend

  Real-time AI feedback:
    - Every 3-4 seconds, a batch of recent frames is sent to /api/sustainability/fingerprint
    - Response drives coverage feedback: confidence, coverage_score, missing_views,
      recommended_next_prompt
    - /api/sustainability/verify_live_match runs every 2-3 seconds for fast fail-fast checks
    - Hard-rejects: person/selfie detected (95% confidence), wrong category (92% confidence)

  Motion guide overlay:
    - Animated SVG ring shows phase progress
    - MotionGuide component displays phase label, icon, hint, and coverage counter
    - Motion animation classes (motion-pulse-center, motion-slide-right, etc.) drive icon animation

  Completion:
    - Returns a frames map { phase_id: best_data_url } and an array of all captured frames
    - The parent component (NewReturn or EmployeeScan) uses this data for final submission

---

## API Client (api/client.js)

A lightweight fetch wrapper that:
  - Resolves base URL from VITE_API_URL env var in production, or hostname:8000/api in dev
  - Adds Content-Type: application/json header to JSON requests
  - Parses error responses and throws typed errors with message, detail, and status
  - Exports individual named functions for all 40+ API calls
  - Provides multipartRequest for file upload endpoints (no Content-Type header)

Key exports by group:

  Users: getUsers, getUser, updateUser, getGreenCredits, getImpactStats,
         getChallenges, completeChallenge

  Products: getProducts, getProduct, getProductConfidence, getProductImpact,
            getRefurbishedAlt, getSustainabilityAdvice

  Orders: createOrder, getOrders, getDeliveryOptions, vestNoReturnCredits

  Returns: createReturn

  Listings: getFeed, getAllListings, getListing, purchaseListing

  Wishlist: getWishlist, addToWishlist, removeFromWishlist, getWishlistMatches,
            getWishlistNotifications, markWishlistNotificationsRead,
            getProductJourney, purchaseWishlistMatch

  Community: getCommunityListings, getNearbyListings, getCommunityListing,
             createCommunityListing, buyCommunityListing, suggestPrice,
             getNotifications, getUnreadCount, markNotificationsRead,
             getLeaderboard, createAlert, getAlerts

  Sustainability: verifyScanFingerprint, verifyLiveMatch

  Baseline: submitBaselineScan, submitPickupScan, getBaselineScan, getPendingBaselineOrders

  Try-On: uploadBodyPhoto, getBodyPhotos, generateTryOn

  Analytics: getDashboardMetrics

  Redemptions: getRedemptionOptions, redeemCredits, getRedemptions

---

## User Context (context/UserContext.jsx)

Global state provider wrapping the entire application:

  State: users (all), currentUser, loading, cart, isAdminMode

  Persistence:
    - currentUser ID saved to localStorage (amazon_current_user_id)
    - cart saved to localStorage (amazon_cart)

  Methods:
    - switchUser(userId): fetches user and updates context
    - refreshUser(): re-fetches the current user
    - updateUserProfile(userId, data): saves profile changes
    - addToCart(item), removeFromCart(cartId), isInCart(cartId)

  Role awareness:
    - isAdminMode is true when currentUser.role === admin
    - Used to gate the analytics dashboard and admin-only UI elements

---

## Setup and Running

### Prerequisites
  - Node.js 18 or later

### Development

  npm install
  npm run dev

  The Vite dev server starts on http://localhost:5173.
  It connects to the backend at http://{hostname}:8000/api by default.
  Run the backend separately on port 8000.

### Production Build

  npm run build

  Output is in the dist/ directory. Served by Nginx in the Docker container.

### Environment Variables

  VITE_API_URL - Full URL to the backend API (e.g. https://api.fluxforge.example.com/api)
  Set in .env.production for Vercel deployment.

---

## Dependencies

| Package              | Version   | Purpose                            |
|---|---|---|
| react                | 19.2.6    | UI framework                       |
| react-dom            | 19.2.6    | DOM rendering                      |
| react-router-dom     | 7.17.0    | Client-side routing                |
| recharts             | 2.15.4    | Dashboard charts                   |
| lucide-react         | 1.18.0    | Icon set                           |
| @reduxjs/toolkit     | 2.12.0    | State management (cart and global) |
| tailwindcss          | 4.3.1     | Utility-first CSS (dev dep)        |
| @tailwindcss/vite    | 4.3.1     | Vite plugin for TailwindCSS        |
| vite                 | 8.1.2     | Build tool and dev server          |
| @vitejs/plugin-react | 6.0.3     | Vite React fast-refresh plugin     |

---

## Deployment

### Vercel

The frontend is deployed to Vercel. vercel.json configures a catch-all rewrite
to index.html so that client-side routes work on direct navigation:

  All routes -> /index.html

Set VITE_API_URL in the Vercel project environment settings to point to the EC2 backend.

### Docker

The Dockerfile performs a multi-stage build:
  Stage 1: node:18-alpine, npm ci, vite build
  Stage 2: nginx:alpine, copy dist/, serve on port 80

  docker build -t fluxforge-frontend .
  docker run -p 80:80 fluxforge-frontend

### Nginx

nginx.conf is configured for SPA routing: all paths fall back to /index.html.
Static assets are served with a 1-year cache header.
API proxy is not included; the frontend hits the backend API URL directly.

---

## Notes for Evaluators

User Switching: The header includes a user dropdown allowing you to switch between
seeded users (customer, employee, admin) to demonstrate role-gated features without
authentication.

Employee Role: Select an employee user to access /employee-scan and /delivery.

Admin Role: Select the admin user to access /dashboard with live analytics charts.

Bedrock: AI features require valid AWS credentials. Without them, the system uses
stub values for condition scoring but the video scan flow, baseline scan, and all
database operations continue to work normally.

Try-On: Requires the IDM-VTON Hugging Face Space to be awake. The Space may have
cold-start latency of 1-2 minutes if unused.