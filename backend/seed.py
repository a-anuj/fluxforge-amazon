"""
Seed script — populates the SQLite database with sample data for demo/hackathon.
Run: python seed.py
"""

import sys
import os
from datetime import datetime, timezone, timedelta

# Ensure app package is importable
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from app.database import engine, SessionLocal, Base
from app.models import User, Product, Order, Return, Listing, GreenCreditTx, GreenChallenge, Redemption, Wishlist
from app.services.credit_engine import get_level


def seed():
    # Drop all tables, handling both PostgreSQL and SQLite gracefully.
    from sqlalchemy import text, inspect as sa_inspect
    db_url = str(engine.url)
    if db_url.startswith("postgresql"):
        with engine.connect() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
            conn.commit()
    else:
        # SQLite: drop every table in reverse dependency order
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    now = datetime.now(timezone.utc)

    # ── Users ─────────────────────────────────────────────────────
    users = [
        User(
            name="Harish Kumar",
            sizes="shoes:9,top:L",
            brand_prefs="Nike,boAt,Puma",
            budget_min=500, budget_max=8000,
            interests="running,fitness,electronics",
            green_credits=250, lifetime_credits=250,
            level="Sapling",
            co2_saved=18.0, ewaste_prevented=5.0, water_saved=120.0,
            products_reused=3, products_repaired=1, products_resold=1,
            city="Chennai", pincode="600001",
        ),
        User(
            name="Priya Patel",
            sizes="shoes:7,top:M",
            brand_prefs="Adidas,Noise,Wildcraft",
            budget_min=800, budget_max=12000,
            interests="yoga,travel,electronics",
            green_credits=80, lifetime_credits=120,
            level="Sapling",
            co2_saved=8.5, ewaste_prevented=1.2, water_saved=60.0,
            products_reused=1, products_repaired=0, products_resold=1,
            city="Mumbai", pincode="400015",
        ),
        User(
            name="Rohan Mehta",
            sizes="shoes:10,top:XL",
            brand_prefs="Puma,boAt,Nike",
            budget_min=1000, budget_max=15000,
            interests="running,backpacking,gadgets",
            green_credits=45, lifetime_credits=65,
            level="Seed",
            co2_saved=4.2, ewaste_prevented=0.8, water_saved=30.0,
            products_reused=1, products_repaired=0, products_resold=0,
            city="Mumbai", pincode="400053",
        ),
        User(
            name="Ananya Iyer",
            sizes="shoes:6,top:S",
            brand_prefs="Reebok,Noise,Decathlon",
            budget_min=400, budget_max=6000,
            interests="yoga,fitness,sustainable living",
            green_credits=320, lifetime_credits=450,
            level="Green Hero",
            co2_saved=28.0, ewaste_prevented=3.5, water_saved=200.0,
            products_reused=4, products_repaired=2, products_resold=2,
            city="Chennai", pincode="600018",
        ),
        User(
            name="Vikram Desai",
            sizes="shoes:8,top:M",
            brand_prefs="Nike,Wildcraft,boAt",
            budget_min=600, budget_max=10000,
            interests="running,travel,electronics",
            green_credits=15, lifetime_credits=15,
            level="Seed",
            co2_saved=1.5, ewaste_prevented=0.2, water_saved=10.0,
            products_reused=0, products_repaired=0, products_resold=0,
            city="Mumbai", pincode="400601",
        ),
        User(
            name="Admin User",
            sizes="shoes:9,top:L",
            brand_prefs="Nike",
            budget_min=1000, budget_max=10000,
            interests="electronics",
            green_credits=0, lifetime_credits=0,
            level="Seed",
            co2_saved=0.0, ewaste_prevented=0.0, water_saved=0.0,
            products_reused=0, products_repaired=0, products_resold=0,
            city="Mumbai", pincode="400001",
            is_admin=True, role="admin",
        ),
        # ── Amazon Delivery Employees (access the baseline scan feature) ──
        User(
            name="Ravi Delivery Agent",
            sizes="shoes:9,top:L",
            brand_prefs="",
            budget_min=0, budget_max=0,
            interests="",
            green_credits=120, lifetime_credits=200,
            level="Sapling",
            co2_saved=5.0, ewaste_prevented=0.5, water_saved=40.0,
            products_reused=0, products_repaired=0, products_resold=0,
            city="Mumbai", pincode="400001",
            is_admin=False, role="employee",
            employee_zone="Mumbai",
        ),
        User(
            name="Sneha Delivery Agent",
            sizes="shoes:7,top:M",
            brand_prefs="",
            budget_min=0, budget_max=0,
            interests="",
            green_credits=85, lifetime_credits=140,
            level="Sapling",
            co2_saved=3.2, ewaste_prevented=0.3, water_saved=25.0,
            products_reused=0, products_repaired=0, products_resold=0,
            city="Chennai", pincode="600015",
            is_admin=False, role="employee",
            employee_zone="Chennai",
        ),
    ]
    db.add_all(users)
    db.commit()

    # ── CDN image helper ──────────────────────────────────────────
    CDN = "https://cdn.dummyjson.com/product-images"
    def imgs(slug, count=3):
        """Return (primary_url, extra_urls_csv) for a CDN product slug.
        slug  = e.g. 'smartphones/iphone-13-pro'
        count = total images available (first is primary, rest go in image_urls)
        """
        primary = f"{CDN}/{slug}/1.webp"
        extras  = ",".join(f"{CDN}/{slug}/{i}.webp" for i in range(2, count + 1))
        return primary, extras or None

    # ── Products (with environmental impact metrics) ──────────────
    products = [
        Product(
            name="Nike Air Zoom Pegasus 40", category="running", brand="Nike",
            size="9", price=8995,
            description="Responsive cushioning for everyday runs. Breathable mesh upper with Zoom Air unit.",
            image_url=imgs("mens-shoes/nike-air-jordan-1-red-and-black", 4)[0],
            image_urls=imgs("mens-shoes/nike-air-jordan-1-red-and-black", 4)[1],
            co2_impact=14.0, ewaste_impact=0.3, water_impact=100.0,
            repair_cost_estimate=350, avg_lifespan_months=18,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="boAt Airdopes 141 TWS", category="electronics", brand="boAt",
            size="One Size", price=1299,
            description="True wireless earbuds with 42H playtime, ENx noise cancelling, and BEAST mode.",
            image_url=imgs("mobile-accessories/apple-airpods", 3)[0],
            image_urls=imgs("mobile-accessories/apple-airpods", 3)[1],
            co2_impact=25.0, ewaste_impact=0.8, water_impact=200.0,
            repair_cost_estimate=150, avg_lifespan_months=24,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Decathlon Baseball", category="sports", brand="Decathlon",
            size="One Size", price=349,
            description="Official-weight leather baseball suitable for training and casual play. Durable cork-rubber core with stitched leather cover. Standard size and feel for all age groups.",
            image_url=imgs("sports-accessories/baseball-ball", 1)[0],
            image_urls=None,
            co2_impact=1.5, ewaste_impact=0.0, water_impact=10.0,
            repair_cost_estimate=None, avg_lifespan_months=18,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Noise ColorFit Pro 5 Max", category="electronics", brand="Noise",
            size="One Size", price=3999,
            description='1.96" AMOLED display smart fitness watch with heart rate monitoring, SpO2, and 100+ sport modes. Lightweight build with a premium leather strap design.',
            image_url=imgs("mens-watches/brown-leather-belt-watch", 3)[0],
            image_urls=imgs("mens-watches/brown-leather-belt-watch", 3)[1],
            co2_impact=35.0, ewaste_impact=0.5, water_impact=300.0,
            repair_cost_estimate=250, avg_lifespan_months=30,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Puma Resolve Modern Running Shoes", category="running", brand="Puma",
            size="10", price=3499,
            description="Lightweight mesh running shoes with SoftFoam+ cushioning for all-day comfort.",
            image_url=imgs("mens-shoes/puma-future-rider-trainers", 3)[0],
            image_urls=imgs("mens-shoes/puma-future-rider-trainers", 3)[1],
            co2_impact=12.0, ewaste_impact=0.3, water_impact=80.0,
            repair_cost_estimate=250, avg_lifespan_months=15,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Wildcraft Ladies Handbag", category="bags", brand="Wildcraft",
            size="One Size", price=2499,
            description="Premium full-grain leather ladies handbag with a timeless design. Spacious interior with multiple compartments, magnetic snap closure, and comfortable shoulder strap. A versatile everyday carry for work and outings.",
            image_url=imgs("womens-bags/heshe-women's-leather-bag", 3)[0],
            image_urls=imgs("womens-bags/heshe-women's-leather-bag", 3)[1],
            co2_impact=8.0, ewaste_impact=0.0, water_impact=55.0,
            repair_cost_estimate=300, avg_lifespan_months=36,
            return_period_days=15, has_no_return_policy=False,
        ),
        Product(
            name="Apple iPhone 6", category="electronics", brand="Apple",
            size="One Size", price=14999,
            description='4.7" Retina HD display, A8 chip, Touch ID fingerprint sensor, 8MP iSight camera. A compact classic smartphone — ideal for demonstrating screen crack and back glass damage.',
            image_url=imgs("smartphones/iphone-6", 3)[0],
            image_urls=imgs("smartphones/iphone-6", 3)[1],
            co2_impact=70.0, ewaste_impact=1.2, water_impact=500.0,
            repair_cost_estimate=2500, avg_lifespan_months=36,
            return_period_days=10, has_no_return_policy=False,
        ),
        Product(
            name="Gigabyte Aorus Gaming T-Shirt", category="clothing", brand="Gigabyte",
            size="L", price=999,
            description="Cool casual gaming t-shirt with Aorus logo. Soft polyester blend, machine washable. Fabric damage and print wear show up clearly for AI textile scans.",
            image_url=imgs("mens-shirts/gigabyte-aorus-men-tshirt", 4)[0],
            image_urls=imgs("mens-shirts/gigabyte-aorus-men-tshirt", 4)[1],
            co2_impact=4.0, ewaste_impact=0.0, water_impact=45.0,
            repair_cost_estimate=None, avg_lifespan_months=12,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Man Plaid Casual Shirt", category="clothing", brand="Classic Wear",
            size="L", price=1299,
            description="Timeless versatile plaid shirt with classic pattern. Comfortable fit and casual style. Collar, button, and fabric wear are easy to assess with AI scanning.",
            image_url=imgs("mens-shirts/man-plaid-shirt", 3)[0],
            image_urls=imgs("mens-shirts/man-plaid-shirt", 3)[1],
            co2_impact=5.5, ewaste_impact=0.0, water_impact=60.0,
            repair_cost_estimate=None, avg_lifespan_months=18,
            return_period_days=10, has_no_return_policy=False,
        ), 
        Product(
            name="Blue & Black Check Shirt", category="clothing", brand="Fashion Trends",
            size="M", price=1799,
            description="Stylish Blue & Black check shirt with classic pattern. High-quality fabric suitable for casual and semi-formal occasions. AI fabric scan shows damage on the check pattern clearly.",
            image_url=imgs("mens-shirts/blue-&-black-check-shirt", 4)[0],
            image_urls=imgs("mens-shirts/blue-&-black-check-shirt", 4)[1],
            co2_impact=8.0, ewaste_impact=0.0, water_impact=90.0,
            repair_cost_estimate=100, avg_lifespan_months=36,
            return_period_days=15, has_no_return_policy=False,
        ),
        Product(
            name="Apple iPhone 13 Pro", category="electronics", brand="Apple",
            size="One Size", price=69999,
            description='6.1" Super Retina XDR ProMotion display, A15 Bionic chip, triple 12MP camera system with ProRAW. Glass back, camera module, and screen damage show well for AI condition scans.',
            image_url=imgs("smartphones/iphone-13-pro", 3)[0],
            image_urls=imgs("smartphones/iphone-13-pro", 3)[1],
            co2_impact=70.0, ewaste_impact=1.5, water_impact=520.0,
            repair_cost_estimate=4500, avg_lifespan_months=48,
            return_period_days=10, has_no_return_policy=False,
        ),
        Product(
            name="Apple iPhone 5s", category="electronics", brand="Apple",
            size="One Size", price=9999,
            description='4" Retina display, A7 chip, Touch ID fingerprint sensor, 8MP camera. A compact classic — ideal for return scanning demos showing screen crack, chassis bend, and home button wear.',
            image_url=imgs("smartphones/iphone-5s", 3)[0],
            image_urls=imgs("smartphones/iphone-5s", 3)[1],
            co2_impact=65.0, ewaste_impact=1.3, water_impact=480.0,
            repair_cost_estimate=3800, avg_lifespan_months=42,
            return_period_days=10, has_no_return_policy=False,
        ),
        Product(
            name="Apple MacBook Air M2", category="electronics", brand="Apple",
            size="One Size", price=114900,
            description='13.6" Liquid Retina display, M2 chip, fanless design, 18-hour battery. Perfect for demonstrating screen crack and chassis dent detection.',
            image_url=imgs("laptops/apple-macbook-pro-14-inch-space-grey", 3)[0],
            image_urls=imgs("laptops/apple-macbook-pro-14-inch-space-grey", 3)[1],
            co2_impact=320.0, ewaste_impact=2.5, water_impact=900.0,
            repair_cost_estimate=18000, avg_lifespan_months=60,
            return_period_days=15, has_no_return_policy=False,
        ),
        Product(
            name="Apple AirPods Max Silver", category="electronics", brand="Apple",
            size="One Size", price=59900,
            description="Premium over-ear headphones with high-fidelity audio, adaptive EQ, and active noise cancellation. Headband, earcup mesh, and Lightning port damage visible for AI assessment.",
            image_url=imgs("mobile-accessories/apple-airpods-max-silver", 3)[0],
            image_urls=imgs("mobile-accessories/apple-airpods-max-silver", 3)[1],
            co2_impact=40.0, ewaste_impact=0.8, water_impact=280.0,
            repair_cost_estimate=2200, avg_lifespan_months=36,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Asus Gaming Book 3", category="laptops", brand="Asus",
            size="One Size", price=149999,
            description='Asus Zenbook Pro dual-screen laptop with a 14.5" OLED primary display and a secondary ScreenPad Plus touch display. Powered by Intel Core i9, NVIDIA RTX graphics, and 32GB RAM — built for creators and power users.',
            image_url=imgs("laptops/asus-zenbook-pro-dual-screen-laptop", 3)[0],
            image_urls=imgs("laptops/asus-zenbook-pro-dual-screen-laptop", 3)[1],
            co2_impact=280.0, ewaste_impact=2.2, water_impact=750.0,
            repair_cost_estimate=12000, avg_lifespan_months=60,
            return_period_days=10, has_no_return_policy=False,
        ),
        Product(
            name="Amazon Echo Plus", category="electronics", brand="Amazon",
            size="One Size", price=8999,
            description="Smart speaker with built-in Alexa. Premium sound, smart home hub, 360° audio. Fabric grille tears, power port damage, and housing dents are detectable in AI scans.",
            image_url=imgs("mobile-accessories/amazon-echo-plus", 2)[0],
            image_urls=imgs("mobile-accessories/amazon-echo-plus", 2)[1],
            co2_impact=18.0, ewaste_impact=0.4, water_impact=130.0,
            repair_cost_estimate=600, avg_lifespan_months=36,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Asus Vivobook 15", category="laptops", brand="Asus",
            size="One Size", price=45000,
            description='15.6" FHD display, Intel Core i3, 8GB RAM, 512GB SSD. A sleek and lightweight laptop perfect for daily tasks, student work, and entertainment.',
            image_url=imgs("laptops/asus-zenbook-pro-dual-screen-laptop", 2)[0],
            image_urls=imgs("laptops/asus-zenbook-pro-dual-screen-laptop", 2)[1],
            co2_impact=200.0, ewaste_impact=1.8, water_impact=600.0,
            repair_cost_estimate=5000, avg_lifespan_months=48,
            return_period_days=10, has_no_return_policy=False,
        ),
        Product(
            name="Nike Air Force 1 '07", category="footwear", brand="Nike",
            size="9", price=7495,
            description="Classic low-top sneaker with leather upper and cushioned Air sole unit. White colorway shows scuffs, sole yellowing, and crease lines clearly for AI damage scans.",
            image_url=imgs("mens-shoes/nike-baseball-cleats", 4)[0],
            image_urls=imgs("mens-shoes/nike-baseball-cleats", 4)[1],
            co2_impact=14.0, ewaste_impact=0.2, water_impact=95.0,
            repair_cost_estimate=400, avg_lifespan_months=24,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name='Samsonite Ladies Handbag', category="bags", brand="Samsonite",
            size="One Size", price=4299,
            description="Structured ladies handbag in vibrant blue with a clean silhouette. Spacious main compartment, inner zip pocket, and secure top zip closure. Lightweight yet durable — ideal for daily use and travel.",
            image_url=imgs("womens-bags/blue-women's-handbag", 3)[0],
            image_urls=imgs("womens-bags/blue-women's-handbag", 3)[1],
            co2_impact=9.0, ewaste_impact=0.0, water_impact=60.0,
            repair_cost_estimate=400, avg_lifespan_months=36,
            return_period_days=15, has_no_return_policy=False,
        ),
        Product(
            name="Milton Coffee Cup", category="kitchen", brand="Milton",
            size="350 ml", price=499,
            description="Sleek black aluminium coffee cup with a premium matte finish. Lightweight and durable, suitable for hot and cold beverages. Ideal for daily use at home, office, or on the go.",
            image_url=imgs("kitchen-accessories/black-aluminium-cup", 2)[0],
            image_urls=imgs("kitchen-accessories/black-aluminium-cup", 2)[1],
            co2_impact=2.5, ewaste_impact=0.05, water_impact=20.0,
            repair_cost_estimate=None, avg_lifespan_months=36,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Prestige Cooking Stick", category="kitchen", brand="Prestige",
            size="One Size", price=299,
            description="Eco-friendly bamboo cooking stick — heat-resistant, non-scratch, and safe for all cookware including non-stick pans. Lightweight with a comfortable grip. An essential kitchen tool for everyday cooking.",
            image_url=imgs("kitchen-accessories/bamboo-spatula", 1)[0],
            image_urls=None,
            co2_impact=0.8, ewaste_impact=0.0, water_impact=5.0,
            repair_cost_estimate=None, avg_lifespan_months=24,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Philips Vegetable Chopping Board", category="kitchen", brand="Philips",
            size="One Size", price=599,
            description="Durable food-grade chopping board with a clean flat surface ideal for vegetables, fruits, and bread. Non-slip base prevents movement during use. Easy to clean and dishwasher safe.",
            image_url=imgs("kitchen-accessories/chopping-board", 1)[0],
            image_urls=None,
            co2_impact=1.2, ewaste_impact=0.0, water_impact=8.0,
            repair_cost_estimate=None, avg_lifespan_months=36,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Godrej Sofa", category="furniture", brand="Godrej",
            size="3-Seater", price=42999,
            description="Elegant three-seater sofa with premium upholstered fabric and solid wood frame. Plush cushioning for all-day comfort. A timeless living room centrepiece that blends classic craftsmanship with modern styling.",
            image_url=imgs("furniture/annibale-colombo-sofa", 3)[0],
            image_urls=imgs("furniture/annibale-colombo-sofa", 3)[1],
            co2_impact=85.0, ewaste_impact=0.3, water_impact=350.0,
            repair_cost_estimate=3500, avg_lifespan_months=120,
            return_period_days=15, has_no_return_policy=False,
        ),
        Product(
            name="Ikea Spring Bed", category="furniture", brand="Ikea",
            size="Queen / 160x200 cm", price=32999,
            description="Luxurious upholstered bed frame with a tall padded headboard and solid slatted base. Premium fabric finish in a warm neutral tone. Built for long-term durability and a restful night's sleep.",
            image_url=imgs("furniture/annibale-colombo-bed", 3)[0],
            image_urls=imgs("furniture/annibale-colombo-bed", 3)[1],
            co2_impact=120.0, ewaste_impact=0.2, water_impact=400.0,
            repair_cost_estimate=2500, avg_lifespan_months=120,
            return_period_days=30, has_no_return_policy=False,
        ),

        Product(
            name="Plain Blue T-Shirt", category="clothing", brand="Uniblu",
            size="M", price=499,
            description="A classic plain blue t-shirt with a regular fit. Comfortable, breathable, and perfect for everyday casual wear.",
            image_url="https://www.uniblu.in/cdn/shop/files/nbregular.jpg?v=1715410814",
            image_urls=None,
            co2_impact=3.5, ewaste_impact=0.0, water_impact=35.0,
            repair_cost_estimate=None, avg_lifespan_months=18,
            return_period_days=15, has_no_return_policy=False,
        ),
    ]
    db.add_all(products)
    db.commit()

    # ── Sample Orders ─────────────────────────────────────────────
    orders_data = [
        Order(user_id=1, product_id=1, status="delivered", fit_score=95.2, return_risk="low",
              is_refurbished=False, delivery_type="eco", green_credits_earned=15),
        Order(user_id=2, product_id=3, status="delivered", fit_score=75.0, return_risk="medium",
              is_refurbished=False, delivery_type="standard", green_credits_earned=0),
        Order(user_id=3, product_id=4, status="delivered", fit_score=88.5, return_risk="low",
              is_refurbished=False, delivery_type="express", green_credits_earned=0),
        Order(user_id=1, product_id=6, status="delivered", fit_score=92.0, return_risk="low",
              is_refurbished=True, delivery_type="eco", green_credits_earned=120),
        Order(user_id=4, product_id=5, status="delivered", fit_score=85.0, return_risk="low",
              is_refurbished=True, delivery_type="eco", green_credits_earned=45),
        Order(user_id=1, product_id=10, status="delivered", fit_score=90.0, return_risk="low",
              is_refurbished=False, delivery_type="standard", green_credits_earned=0),
    ]
    db.add_all(orders_data)
    db.commit()

    # ── Sample Returns ────────────────────────────────────────────
    # image_urls reference the same CDN images as the products being returned
    CDN = "https://cdn.dummyjson.com/product-images"  # already defined above but redeclare for clarity here
    return1 = Return(
        order_id=2,
        # order 2 = product 3 = Decathlon Baseball (sports-accessories/baseball-ball)
        image_urls=f"{CDN}/sports-accessories/baseball-ball/1.webp",
        condition_score=82.5, defects="Minor surface scratches on the left side",
        remaining_life_pct=78, recommended_action="resell", status="assessed",
        green_credits_earned=80,
    )
    return2 = Return(
        order_id=3,
        # order 3 = product 4 = Noise ColorFit Pro 5 Max (mens-watches/brown-leather-belt-watch)
        image_urls=f"{CDN}/mens-watches/brown-leather-belt-watch/1.webp,{CDN}/mens-watches/brown-leather-belt-watch/2.webp",
        condition_score=71.0, defects="Slight color fading on the exterior",
        remaining_life_pct=65, recommended_action="refurbish", status="assessed",
        green_credits_earned=60,
    )
    db.add_all([return1, return2])
    db.commit()

    # No pre-seeded listings. Listings must be generated from active user returns.

    # ── Green Credit Transactions (rich history for Harish) ───────
    transactions = [
        GreenCreditTx(user_id=1, amount=120, type="earned", action_type="purchase_refurbished",
                      description="Purchased refurbished: Noise ColorFit Pro 5 Max",
                      created_at=now - timedelta(days=30)),
        GreenCreditTx(user_id=1, amount=80, type="earned", action_type="resell",
                      description="Listed on ReLife: boAt Rockerz 450 Pro",
                      created_at=now - timedelta(days=20)),
        GreenCreditTx(user_id=1, amount=50, type="earned", action_type="repair",
                      description="Repaired: Trimmer (blade replacement)",
                      created_at=now - timedelta(days=10)),
        GreenCreditTx(user_id=1, amount=15, type="earned", action_type="eco_delivery",
                      description="Eco-consolidated delivery bonus",
                      created_at=now - timedelta(days=5)),
        GreenCreditTx(user_id=1, amount=15, type="earned", action_type="eco_delivery",
                      description="Eco-consolidated delivery bonus",
                      created_at=now - timedelta(days=2)),
        GreenCreditTx(user_id=2, amount=80, type="earned", action_type="resell",
                      description="Return action (resell): Wildcraft Backpack",
                      created_at=now - timedelta(days=15)),
        GreenCreditTx(user_id=2, amount=40, type="earned", action_type="purchase_refurbished",
                      description="Purchased refurbished: Yoga Mat",
                      created_at=now - timedelta(days=8)),
        GreenCreditTx(user_id=3, amount=60, type="earned", action_type="refurbish",
                      description="Return action (refurbish): boAt Airdopes",
                      created_at=now - timedelta(days=12)),
        GreenCreditTx(user_id=4, amount=100, type="earned", action_type="donate",
                      description="Donated: Old fitness tracker to school",
                      created_at=now - timedelta(days=25)),
        GreenCreditTx(user_id=4, amount=45, type="earned", action_type="purchase_refurbished",
                      description="Purchased refurbished: Decathlon Yoga Mat",
                      created_at=now - timedelta(days=18)),
        GreenCreditTx(user_id=4, amount=300, type="redeemed", action_type="redeem",
                      description="Redeemed: Plant a Tree",
                      created_at=now - timedelta(days=3)),
    ]
    db.add_all(transactions)
    db.commit()

    # ── Green Challenges ──────────────────────────────────────────
    challenges = [
        # Harish's challenges
        GreenChallenge(user_id=1, title="Keep your phone for 12 more months",
                       description="Extend your phone's life by a year and earn bonus credits",
                       reward_credits=300, status="active",
                       created_at=now - timedelta(days=5),
                       expires_at=now + timedelta(days=365)),
        GreenChallenge(user_id=1, title="Buy one refurbished product this month",
                       description="Purchase any Certified Pre-Owned item from Second Life",
                       reward_credits=100, status="active",
                       created_at=now - timedelta(days=2),
                       expires_at=now + timedelta(days=28)),
        GreenChallenge(user_id=1, title="Choose eco-delivery 3 times",
                       description="Select eco-consolidated delivery on your next 3 orders",
                       reward_credits=75, status="active",
                       created_at=now, expires_at=now + timedelta(days=60)),
        # Priya's challenges
        GreenChallenge(user_id=2, title="Donate an unused product",
                       description="Donate any product you haven't used in 6 months",
                       reward_credits=120, status="active",
                       created_at=now - timedelta(days=3),
                       expires_at=now + timedelta(days=30)),
        GreenChallenge(user_id=2, title="Repair instead of return",
                       description="Choose to repair a product instead of returning it",
                       reward_credits=80, status="active",
                       created_at=now, expires_at=now + timedelta(days=45)),
        # Ananya's completed challenge
        GreenChallenge(user_id=4, title="Reach Green Hero level",
                       description="Earn enough lifetime credits to reach Green Hero",
                       reward_credits=50, status="completed",
                       created_at=now - timedelta(days=30),
                       expires_at=now + timedelta(days=60)),
    ]
    db.add_all(challenges)
    db.commit()

    # ── Sample Redemptions ────────────────────────────────────────
    redemptions = [
        Redemption(user_id=4, type="plant_tree", credits_spent=300,
                   description="Plant a Tree", created_at=now - timedelta(days=3)),
    ]
    db.add_all(redemptions)
    db.commit()

    # ── Wishlist Entries (for radius matching demo) ───────────────
    wishlists = [
        # Harish wants running shoes — will match if Priya returns a Nike/Puma shoe nearby
        Wishlist(user_id=1, product_id=7, category="running", brand="Puma",
                 max_price=4000, radius_km=15.0,
                 created_at=now - timedelta(days=14)),
        # Harish also wants electronics
        Wishlist(user_id=1, category="electronics", brand="boAt",
                 keywords="earbuds,headphones,tws",
                 max_price=2000, radius_km=10.0,
                 created_at=now - timedelta(days=7)),
        # Priya wants a backpack — will match if Rohan returns one nearby
        Wishlist(user_id=2, category="backpacking", brand="Wildcraft",
                 max_price=2000, radius_km=10.0,
                 created_at=now - timedelta(days=21)),
        # Rohan wants Nike running shoes
        Wishlist(user_id=3, product_id=1, category="running", brand="Nike",
                 max_price=7000, radius_km=20.0,
                 created_at=now - timedelta(days=10)),
        # Ananya wants yoga/fitness gear
        Wishlist(user_id=4, category="yoga", brand="Decathlon",
                 max_price=1000, radius_km=10.0,
                 created_at=now - timedelta(days=5)),
        # Ananya also wants electronics (smartwatch)
        Wishlist(user_id=4, category="electronics", brand="Noise",
                 keywords="smartwatch,fitness tracker",
                 max_price=3000, radius_km=15.0,
                 created_at=now - timedelta(days=30)),
        # Vikram (Pune) wants Nike shoes — won't match Mumbai returns (different pincode zone)
        Wishlist(user_id=5, category="running", brand="Nike",
                 max_price=10000, radius_km=10.0,
                 created_at=now - timedelta(days=3)),
    ]
    db.add_all(wishlists)
    db.commit()

    db.close()
    print("[OK] Database seeded successfully!")
    print(f"   * {len(users)} users (customers + 2 employees + admin)")
    print(f"   * {len(products)} products with return period policies (some no-return) — includes AI demo items")
    print(f"   * {len(orders_data)} orders, 2 returns")
    print(f"   * {len(transactions)} credit transactions")
    print(f"   * {len(challenges)} green challenges")
    print(f"   * {len(redemptions)} redemptions")
    print(f"   * {len(wishlists)} wishlist entries (for radius matching)")


if __name__ == "__main__":
    seed()
