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

    # ── Products (with environmental impact metrics) ──────────────
    products = [
        Product(
            name="Nike Air Zoom Pegasus 40", category="running", brand="Nike",
            size="9", price=8995,
            description="Responsive cushioning for everyday runs. Breathable mesh upper with Zoom Air unit.",
            image_url="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400",
            co2_impact=14.0, ewaste_impact=0.3, water_impact=100.0,
            repair_cost_estimate=350, avg_lifespan_months=18,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Adidas Ultraboost Light", category="running", brand="Adidas",
            size="7", price=11999,
            description="Lightest Ultraboost ever — 30% lighter BOOST midsole for energized comfort.",
            image_url="https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=400",
            co2_impact=16.0, ewaste_impact=0.3, water_impact=120.0,
            repair_cost_estimate=400, avg_lifespan_months=20,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Wildcraft Wanderer 40L Backpack", category="backpacking", brand="Wildcraft",
            size="One Size", price=2499,
            description="Durable 40L hiking backpack with rain cover, padded straps, and multiple compartments.",
            image_url="https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400",
            co2_impact=8.0, ewaste_impact=0.2, water_impact=60.0,
            repair_cost_estimate=200, avg_lifespan_months=36,
            return_period_days=15, has_no_return_policy=False,
        ),
        Product(
            name="boAt Airdopes 141 TWS", category="electronics", brand="boAt",
            size="One Size", price=1299,
            description="True wireless earbuds with 42H playtime, ENx noise cancelling, and BEAST mode.",
            image_url="https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=400",
            co2_impact=25.0, ewaste_impact=0.8, water_impact=200.0,
            repair_cost_estimate=150, avg_lifespan_months=24,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Decathlon Yoga Mat 5mm", category="yoga", brand="Decathlon",
            size="One Size", price=799,
            description="Non-slip 5mm yoga mat with alignment lines. Eco-friendly TPE material.",
            image_url="https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=400",
            co2_impact=5.0, ewaste_impact=0.1, water_impact=30.0,
            repair_cost_estimate=None, avg_lifespan_months=36,
            return_period_days=0, has_no_return_policy=True,   # No returns — hygiene item
        ),
        Product(
            name="Noise ColorFit Pro 5 Max", category="electronics", brand="Noise",
            size="One Size", price=3999,
            description='1.96" AMOLED display fitness tracker with heart rate, SpO2, and 100+ sports modes.',
            image_url="https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=400",
            co2_impact=35.0, ewaste_impact=0.5, water_impact=300.0,
            repair_cost_estimate=250, avg_lifespan_months=30,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Puma Resolve Modern Running Shoes", category="running", brand="Puma",
            size="10", price=3499,
            description="Lightweight mesh running shoes with SoftFoam+ cushioning for all-day comfort.",
            image_url="https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400",
            co2_impact=12.0, ewaste_impact=0.3, water_impact=80.0,
            repair_cost_estimate=250, avg_lifespan_months=15,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Reebok Flexagon Energy TR 4", category="fitness", brand="Reebok",
            size="6", price=3299,
            description="Versatile training shoe with Flexweave upper and responsive cushioning.",
            image_url="https://images.unsplash.com/photo-1539185441755-769473a23570?w=400",
            co2_impact=11.0, ewaste_impact=0.3, water_impact=75.0,
            repair_cost_estimate=280, avg_lifespan_months=18,
            return_period_days=30, has_no_return_policy=False,
        ),
        Product(
            name="Wildcraft Hiking Daypack 20L", category="backpacking", brand="Wildcraft",
            size="One Size", price=1599,
            description="Compact daypack for short hikes. Water-resistant fabric with hydration sleeve.",
            image_url="https://images.unsplash.com/photo-1622260614153-03223fb72052?w=400",
            co2_impact=6.0, ewaste_impact=0.15, water_impact=45.0,
            repair_cost_estimate=120, avg_lifespan_months=30,
            return_period_days=0, has_no_return_policy=True,   # No returns — sale item
        ),
        Product(
            name="boAt Rockerz 450 Pro Headphones", category="electronics", brand="boAt",
            size="One Size", price=1799,
            description="Over-ear wireless headphones with 70H battery, 40mm drivers, and dual EQ modes.",
            image_url="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
            co2_impact=30.0, ewaste_impact=0.6, water_impact=250.0,
            repair_cost_estimate=180, avg_lifespan_months=24,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Google Pixel 6a", category="electronics", brand="Google",
            size="One Size", price=29999,
            description="5G Android smartphone with Google Tensor chip, 12.2MP dual camera, 6.1\" OLED display, and 5-year security updates.",
            image_url="https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=400",
            co2_impact=70.0, ewaste_impact=1.2, water_impact=500.0,
            repair_cost_estimate=2500, avg_lifespan_months=36,
            return_period_days=10, has_no_return_policy=False,
        ),
        Product(
            name="Basic Blue T-Shirt", category="clothing", brand="Generic",
            size="L", price=999,
            description="100% cotton basic blue t-shirt. Soft, breathable, and comfortable fit.",
            image_url="https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400",
            co2_impact=4.0, ewaste_impact=0.0, water_impact=45.0,
            repair_cost_estimate=None, avg_lifespan_months=12,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Essential Black Shirt", category="clothing", brand="Generic",
            size="L", price=1299,
            description="Classic black casual shirt. Perfect for everyday wear.",
            image_url="https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=400",
            co2_impact=5.5, ewaste_impact=0.0, water_impact=60.0,
            repair_cost_estimate=None, avg_lifespan_months=18,
            return_period_days=10, has_no_return_policy=False,
        ),
        Product(
            name="Zara Floral Summer Dress", category="clothing", brand="Zara",
            size="M", price=2990,
            description="Lightweight and breathable floral midi dress, perfect for summer days.",
            image_url="https://images.unsplash.com/photo-1618932260643-eee4a2f652a6?w=400",
            co2_impact=6.5, ewaste_impact=0.0, water_impact=40.0,
            repair_cost_estimate=None, avg_lifespan_months=24,
            return_period_days=15, has_no_return_policy=False,
        ),
        Product(
            name="Classic Grey Pants", category="clothing", brand="Generic",
            size="M", price=1799,
            description="Comfortable grey pants with an elastic waist and premium fabric.",
            image_url="https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400",
            co2_impact=8.0, ewaste_impact=0.0, water_impact=90.0,
            repair_cost_estimate=100, avg_lifespan_months=36,
            return_period_days=15, has_no_return_policy=False,
        ),
        Product(
            name="H&M Basic Cotton T-Shirt", category="clothing", brand="H&M",
            size="S", price=799,
            description="Soft, organic cotton essential t-shirt in bright yellow. Everyday comfort.",
            image_url="https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=400",
            co2_impact=4.0, ewaste_impact=0.0, water_impact=45.0,
            repair_cost_estimate=None, avg_lifespan_months=12,
            return_period_days=15, has_no_return_policy=False,
        ),
        # ── Additional demo products (AI damage-scan capable) ────────
        Product(
            name="Apple iPhone 14", category="electronics", brand="Apple",
            size="One Size", price=69999,
            description="6.1\" Super Retina XDR display, A15 Bionic chip, dual 12MP cameras, Crash Detection. A premium device showing well on camera for AI condition scans.",
            image_url="https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=400",
            co2_impact=70.0, ewaste_impact=1.5, water_impact=520.0,
            repair_cost_estimate=4500, avg_lifespan_months=48,
            return_period_days=10, has_no_return_policy=False,
        ),
        Product(
            name="Samsung Galaxy S23", category="electronics", brand="Samsung",
            size="One Size", price=54999,
            description="6.1\" Dynamic AMOLED 2X, Snapdragon 8 Gen 2, 50MP triple camera system. Compact flagship with a distinctive glass back.",
            image_url="https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=400",
            co2_impact=65.0, ewaste_impact=1.3, water_impact=480.0,
            repair_cost_estimate=3800, avg_lifespan_months=42,
            return_period_days=10, has_no_return_policy=False,
        ),
        Product(
            name="Apple MacBook Air M2", category="electronics", brand="Apple",
            size="One Size", price=114900,
            description="13.6\" Liquid Retina display, M2 chip, fanless design, 18-hour battery. Perfect for demonstrating screen crack and chassis dent detection.",
            image_url="https://images.unsplash.com/photo-1611186871525-fd7b55c20fa0?w=400",
            co2_impact=320.0, ewaste_impact=2.5, water_impact=900.0,
            repair_cost_estimate=18000, avg_lifespan_months=60,
            return_period_days=15, has_no_return_policy=False,
        ),
        Product(
            name="Sony WH-1000XM5 Headphones", category="electronics", brand="Sony",
            size="One Size", price=26990,
            description="Industry-leading noise cancelling headphones with 30-hour battery, multipoint connection, and auto-pause. Ideal for demonstrating hinge, earcup, and cable damage detection.",
            image_url="https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400",
            co2_impact=40.0, ewaste_impact=0.8, water_impact=280.0,
            repair_cost_estimate=2200, avg_lifespan_months=36,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Nikon D3500 DSLR Camera", category="electronics", brand="Nikon",
            size="One Size", price=34995,
            description="24.2MP APS-C sensor, 1500-shot battery, Beginner-friendly with Guide Mode. Shows scratches on lens, body scuffs, and LCD damage well for AI scanning.",
            image_url="https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400",
            co2_impact=85.0, ewaste_impact=1.8, water_impact=600.0,
            repair_cost_estimate=5500, avg_lifespan_months=60,
            return_period_days=10, has_no_return_policy=False,
        ),
        Product(
            name="JBL Charge 5 Bluetooth Speaker", category="electronics", brand="JBL",
            size="One Size", price=11999,
            description="Portable waterproof speaker with 20H playtime, IP67 rating, and power bank function. Cylindrical form makes scratches and dents easy to detect.",
            image_url="https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400",
            co2_impact=28.0, ewaste_impact=0.7, water_impact=190.0,
            repair_cost_estimate=800, avg_lifespan_months=30,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Logitech MX Master 3 Mouse", category="electronics", brand="Logitech",
            size="One Size", price=8995,
            description="Advanced wireless mouse with MagSpeed scroll wheel, ergonomic design, and 70-day battery. Scroll wheel wear and button damage visible clearly.",
            image_url="https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400",
            co2_impact=18.0, ewaste_impact=0.4, water_impact=130.0,
            repair_cost_estimate=600, avg_lifespan_months=36,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Nike Air Force 1 '07", category="footwear", brand="Nike",
            size="9", price=7495,
            description="Classic low-top sneaker with leather upper and cushioned Air sole unit. White-on-white colorway shows scuff and sole yellowing clearly for damage scans.",
            image_url="https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=400",
            co2_impact=14.0, ewaste_impact=0.2, water_impact=95.0,
            repair_cost_estimate=400, avg_lifespan_months=24,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Adidas Stan Smith Sneakers", category="footwear", brand="Adidas",
            size="8", price=6999,
            description="Iconic all-white leather tennis shoe with 3-stripe perforations. Pristine white surface is ideal for demonstrating AI stain and crease detection.",
            image_url="https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400",
            co2_impact=12.0, ewaste_impact=0.2, water_impact=85.0,
            repair_cost_estimate=350, avg_lifespan_months=24,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Woodland High-Ankle Boots", category="footwear", brand="Woodland",
            size="9", price=4995,
            description="Full-grain leather hiking boots with water-resistant coating and anti-slip outsole. Leather surface shows cuts, peeling, and sole separation clearly.",
            image_url="https://images.unsplash.com/photo-1520639888713-7851133b1ed0?w=400",
            co2_impact=18.0, ewaste_impact=0.2, water_impact=110.0,
            repair_cost_estimate=550, avg_lifespan_months=36,
            return_period_days=15, has_no_return_policy=False,
        ),
        Product(
            name="Levi's 511 Slim Fit Jeans", category="clothing", brand="Levi's",
            size="32x30", price=3499,
            description="Classic slim-fit jeans in mid-wash indigo denim. 99% cotton. Fabric damage, tears, and fade patterns are highly visible for AI textile assessment.",
            image_url="https://images.unsplash.com/photo-1542272604-787c3835535d?w=400",
            co2_impact=9.0, ewaste_impact=0.0, water_impact=130.0,
            repair_cost_estimate=150, avg_lifespan_months=24,
            return_period_days=15, has_no_return_policy=False,
        ),
        Product(
            name="Allen Solly Formal Shirt", category="clothing", brand="Allen Solly",
            size="L", price=1999,
            description="Wrinkle-resistant cotton-blend formal shirt in solid white. Collar staining, button damage, and fabric tears are easy to detect against the white fabric.",
            image_url="https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400",
            co2_impact=5.5, ewaste_impact=0.0, water_impact=65.0,
            repair_cost_estimate=100, avg_lifespan_months=18,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="American Tourister 68cm Spinner Trolley", category="luggage", brand="American Tourister",
            size="68cm / Medium", price=5299,
            description="Hard-shell polycarbonate trolley bag with TSA lock, 4 360° spinner wheels. Shell cracks and wheel damage are prominent in AI damage scanning.",
            image_url="https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400",
            co2_impact=22.0, ewaste_impact=0.3, water_impact=140.0,
            repair_cost_estimate=700, avg_lifespan_months=60,
            return_period_days=15, has_no_return_policy=False,
        ),
        Product(
            name="Samsonite Laptop Backpack 15.6\"", category="bags", brand="Samsonite",
            size="One Size", price=3499,
            description="Water-resistant polyester backpack with dedicated laptop sleeve, padded back panel, and USB port. Zipper damage, strap fraying, and fabric wear are easy to spot.",
            image_url="https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400",
            co2_impact=10.0, ewaste_impact=0.1, water_impact=70.0,
            repair_cost_estimate=250, avg_lifespan_months=36,
            return_period_days=15, has_no_return_policy=False,
        ),
        Product(
            name="Milton Thermosteel Flip Lid Flask 1L", category="kitchen", brand="Milton",
            size="1 Litre", price=1299,
            description="Stainless steel insulated bottle keeping beverages hot/cold for 24 hours. Dents, scratches on the steel body, and lid damage are clearly visible.",
            image_url="https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400",
            co2_impact=6.0, ewaste_impact=0.1, water_impact=50.0,
            repair_cost_estimate=None, avg_lifespan_months=60,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Prestige Induction Cooktop 2000W", category="kitchen", brand="Prestige",
            size="One Size", price=2499,
            description="Feather-touch induction cooktop with 8 pre-set cooking menus and auto-shutoff. Glass top cracks and control panel damage are ideal for AI assessment demos.",
            image_url="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400",
            co2_impact=30.0, ewaste_impact=1.0, water_impact=200.0,
            repair_cost_estimate=800, avg_lifespan_months=60,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Philips Air Fryer HD9200", category="kitchen", brand="Philips",
            size="One Size", price=6995,
            description="3.2L Rapid Air technology air fryer with 1400W, non-stick basket, and 7 pre-set programs. White plastic body shows discolouration and cracks well.",
            image_url="https://images.unsplash.com/photo-1585515320310-259814833e62?w=400",
            co2_impact=45.0, ewaste_impact=1.2, water_impact=300.0,
            repair_cost_estimate=1200, avg_lifespan_months=48,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Godrej Interio Study Chair", category="furniture", brand="Godrej",
            size="One Size", price=8999,
            description="Ergonomic mesh office/study chair with lumbar support, adjustable armrests and seat height. Fabric tears, wheel damage, and frame scratches visible for scanning.",
            image_url="https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=400",
            co2_impact=50.0, ewaste_impact=0.5, water_impact=200.0,
            repair_cost_estimate=1500, avg_lifespan_months=84,
            return_period_days=15, has_no_return_policy=False,
        ),
        Product(
            name="Ikea LACK Side Table", category="furniture", brand="Ikea",
            size="55x55 cm", price=1999,
            description="Minimalist white side table with hollow legs. Simple flat surface makes surface scratch, chip, and stain detection straightforward for AI models.",
            image_url="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400",
            co2_impact=15.0, ewaste_impact=0.1, water_impact=80.0,
            repair_cost_estimate=200, avg_lifespan_months=60,
            return_period_days=30, has_no_return_policy=False,
        ),
        Product(
            name="Cello Opalware Dinner Set (18 pcs)", category="kitchen", brand="Cello",
            size="18 Pieces", price=1799,
            description="Microwave-safe opalware dinner set — 6 quarter plates, 6 full plates, 6 veg bowls. Chips and cracks on the bright white surface are highly detectable by AI.",
            image_url="https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=400",
            co2_impact=8.0, ewaste_impact=0.3, water_impact=60.0,
            repair_cost_estimate=None, avg_lifespan_months=48,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Mi Smart Band 7", category="electronics", brand="Xiaomi",
            size="One Size", price=3499,
            description="1.62\" AMOLED display fitness band with 110+ sport modes, blood oxygen, heart rate, and 14-day battery. Band cracking and screen damage are easy to detect.",
            image_url="https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=400",
            co2_impact=22.0, ewaste_impact=0.4, water_impact=160.0,
            repair_cost_estimate=400, avg_lifespan_months=24,
            return_period_days=7, has_no_return_policy=False,
        ),
        Product(
            name="Casio G-Shock GA-2100", category="electronics", brand="Casio",
            size="One Size", price=7995,
            description="CasiOak octagonal carbon-core guard. 200m water resistance, shock resistant, world time in 48 cities. Bezel scratches and strap damage visible for returns scanning.",
            image_url="https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400",
            co2_impact=20.0, ewaste_impact=0.3, water_impact=120.0,
            repair_cost_estimate=600, avg_lifespan_months=60,
            return_period_days=7, has_no_return_policy=False,
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
    return1 = Return(
        order_id=2, image_urls="https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400",
        condition_score=82.5, defects="Minor surface scratches on the left side",
        remaining_life_pct=78, recommended_action="resell", status="assessed",
        green_credits_earned=80,
    )
    return2 = Return(
        order_id=3, image_urls="https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=400",
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
