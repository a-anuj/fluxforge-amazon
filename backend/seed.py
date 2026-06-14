"""
Seed script — populates the SQLite database with sample data for demo/hackathon.
Run: python seed.py
"""

import sys
import os

# Ensure app package is importable
sys.path.insert(0, os.path.dirname(__file__))

from app.database import engine, SessionLocal, Base
from app.models import User, Product, Order, Return, Listing, GreenCreditTx
from app.services.ai_assessment import assess_condition
from app.services.matching import find_best_match


def seed():
    # Drop & recreate all tables for a clean seed
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    # ── Users ─────────────────────────────────────────────────────
    users = [
        User(
            name="Aarav Sharma",
            sizes="shoes:9,top:L",
            brand_prefs="Nike,boAt,Puma",
            budget_min=500,
            budget_max=8000,
            interests="running,fitness,electronics",
            green_credits=0,
        ),
        User(
            name="Priya Patel",
            sizes="shoes:7,top:M",
            brand_prefs="Adidas,Noise,Wildcraft",
            budget_min=800,
            budget_max=12000,
            interests="yoga,travel,electronics",
            green_credits=0,
        ),
        User(
            name="Rohan Mehta",
            sizes="shoes:10,top:XL",
            brand_prefs="Puma,boAt,Nike",
            budget_min=1000,
            budget_max=15000,
            interests="running,backpacking,gadgets",
            green_credits=0,
        ),
        User(
            name="Ananya Iyer",
            sizes="shoes:6,top:S",
            brand_prefs="Reebok,Noise,Decathlon",
            budget_min=400,
            budget_max=6000,
            interests="yoga,fitness,sustainable living",
            green_credits=0,
        ),
        User(
            name="Vikram Desai",
            sizes="shoes:8,top:M",
            brand_prefs="Nike,Wildcraft,boAt",
            budget_min=600,
            budget_max=10000,
            interests="running,travel,electronics",
            green_credits=0,
        ),
    ]
    db.add_all(users)
    db.commit()

    # ── Products ──────────────────────────────────────────────────
    products = [
        Product(
            name="Nike Air Zoom Pegasus 40",
            category="running",
            brand="Nike",
            size="9",
            price=8995,
            description="Responsive cushioning for everyday runs. Breathable mesh upper with Zoom Air unit.",
            image_url="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400",
        ),
        Product(
            name="Adidas Ultraboost Light",
            category="running",
            brand="Adidas",
            size="7",
            price=11999,
            description="Lightest Ultraboost ever — 30% lighter BOOST midsole for energized comfort.",
            image_url="https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=400",
        ),
        Product(
            name="Wildcraft Wanderer 40L Backpack",
            category="backpacking",
            brand="Wildcraft",
            size="One Size",
            price=2499,
            description="Durable 40L hiking backpack with rain cover, padded straps, and multiple compartments.",
            image_url="https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400",
        ),
        Product(
            name="boAt Airdopes 141 TWS",
            category="electronics",
            brand="boAt",
            size="One Size",
            price=1299,
            description="True wireless earbuds with 42H playtime, ENx noise cancelling, and BEAST mode for low latency.",
            image_url="https://images.unsplash.com/photo-1590658268037-6bf12f032f55?w=400",
        ),
        Product(
            name="Decathlon Yoga Mat 5mm",
            category="yoga",
            brand="Decathlon",
            size="One Size",
            price=799,
            description="Non-slip 5mm yoga mat with alignment lines. Eco-friendly TPE material.",
            image_url="https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=400",
        ),
        Product(
            name="Noise ColorFit Pro 5 Max",
            category="electronics",
            brand="Noise",
            size="One Size",
            price=3999,
            description="1.96\" AMOLED display fitness tracker with heart rate, SpO2, and 100+ sports modes.",
            image_url="https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=400",
        ),
        Product(
            name="Puma Resolve Modern Running Shoes",
            category="running",
            brand="Puma",
            size="10",
            price=3499,
            description="Lightweight mesh running shoes with SoftFoam+ cushioning for all-day comfort.",
            image_url="https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400",
        ),
        Product(
            name="Reebok Flexagon Energy TR 4",
            category="fitness",
            brand="Reebok",
            size="6",
            price=3299,
            description="Versatile training shoe with Flexweave upper and responsive cushioning.",
            image_url="https://images.unsplash.com/photo-1539185441755-769473a23570?w=400",
        ),
        Product(
            name="Wildcraft Hiking Daypack 20L",
            category="backpacking",
            brand="Wildcraft",
            size="One Size",
            price=1599,
            description="Compact daypack for short hikes. Water-resistant fabric with hydration sleeve.",
            image_url="https://images.unsplash.com/photo-1622260614153-03223fb72052?w=400",
        ),
        Product(
            name="boAt Rockerz 450 Pro Headphones",
            category="electronics",
            brand="boAt",
            size="One Size",
            price=1799,
            description="Over-ear wireless headphones with 70H battery, 40mm drivers, and dual EQ modes.",
            image_url="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
        ),
    ]
    db.add_all(products)
    db.commit()

    # ── Sample Orders ─────────────────────────────────────────────
    # Product 1 (Nike Pegasus)   — 4 orders, 1 return  → score 7.5
    order1  = Order(user_id=1, product_id=1, status="delivered", fit_score=95.2, return_risk="low")
    order2  = Order(user_id=2, product_id=1, status="delivered", fit_score=60.0, return_risk="medium")
    order3  = Order(user_id=3, product_id=1, status="delivered", fit_score=88.0, return_risk="low")
    order4  = Order(user_id=4, product_id=1, status="delivered", fit_score=55.0, return_risk="high")

    # Product 2 (Adidas Ultraboost) — 3 orders, 2 returns → score 3.3 (frequently returned)
    order5  = Order(user_id=1, product_id=2, status="delivered", fit_score=70.0, return_risk="medium")
    order6  = Order(user_id=3, product_id=2, status="delivered", fit_score=52.0, return_risk="high")
    order7  = Order(user_id=5, product_id=2, status="delivered", fit_score=65.0, return_risk="medium")

    # Product 3 (Wildcraft Backpack) — 3 orders, 1 return → score 6.7
    order8  = Order(user_id=2, product_id=3, status="delivered", fit_score=75.0, return_risk="medium")
    order9  = Order(user_id=4, product_id=3, status="delivered", fit_score=80.0, return_risk="low")
    order10 = Order(user_id=5, product_id=3, status="delivered", fit_score=78.0, return_risk="low")

    # Product 4 (boAt Airdopes)  — 4 orders, 1 return → score 7.5
    order11 = Order(user_id=1, product_id=4, status="delivered", fit_score=90.0, return_risk="low")
    order12 = Order(user_id=3, product_id=4, status="delivered", fit_score=88.5, return_risk="low")
    order13 = Order(user_id=4, product_id=4, status="delivered", fit_score=85.0, return_risk="low")
    order14 = Order(user_id=5, product_id=4, status="delivered", fit_score=82.0, return_risk="low")

    # Product 5 (Decathlon Yoga Mat) — 3 orders, 0 returns → score 10.0
    order15 = Order(user_id=2, product_id=5, status="delivered", fit_score=92.0, return_risk="low")
    order16 = Order(user_id=4, product_id=5, status="delivered", fit_score=95.0, return_risk="low")
    order17 = Order(user_id=1, product_id=5, status="delivered", fit_score=88.0, return_risk="low")

    # Product 6 (Noise Smartwatch) — 2 orders, 0 returns → score 10.0
    order18 = Order(user_id=2, product_id=6, status="delivered", fit_score=80.0, return_risk="low")
    order19 = Order(user_id=4, product_id=6, status="delivered", fit_score=84.0, return_risk="low")

    # Product 7 (Puma Shoes) — 3 orders, 2 returns → score 3.3 (frequently returned)
    order20 = Order(user_id=1, product_id=7, status="delivered", fit_score=55.0, return_risk="high")
    order21 = Order(user_id=3, product_id=7, status="delivered", fit_score=50.0, return_risk="high")
    order22 = Order(user_id=5, product_id=7, status="delivered", fit_score=72.0, return_risk="medium")

    all_orders = [
        order1, order2, order3, order4, order5, order6, order7,
        order8, order9, order10, order11, order12, order13, order14,
        order15, order16, order17, order18, order19, order20, order21, order22,
    ]
    db.add_all(all_orders)
    db.commit()

    # ── Sample Returns ────────────────────────────────────────────
    # Product 1: order4 returned (size mismatch)
    ret1 = Return(
        order_id=order4.id,
        image_urls="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400",
        condition_score=88.0, defects="None — wrong size ordered",
        remaining_life_pct=95, recommended_action="resell", status="assessed",
    )
    # Product 2: order6 + order7 returned (sizing runs small)
    ret2 = Return(
        order_id=order6.id,
        image_urls="https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=400",
        condition_score=91.0, defects="Worn once — size too narrow",
        remaining_life_pct=92, recommended_action="resell", status="assessed",
    )
    ret3 = Return(
        order_id=order7.id,
        image_urls="https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=400",
        condition_score=85.0, defects="Minor sole scuff",
        remaining_life_pct=80, recommended_action="resell", status="assessed",
    )
    # Product 3: order8 returned
    ret4 = Return(
        order_id=order8.id,
        image_urls="https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400",
        condition_score=82.5, defects="Minor surface scratches on the left side",
        remaining_life_pct=78, recommended_action="resell", status="assessed",
    )
    # Product 4: order12 returned
    ret5 = Return(
        order_id=order12.id,
        image_urls="https://images.unsplash.com/photo-1590658268037-6bf12f032f55?w=400",
        condition_score=71.0, defects="Slight color fading on the exterior",
        remaining_life_pct=65, recommended_action="refurbish", status="assessed",
    )
    # Product 7 (Puma): order20 + order21 returned
    ret6 = Return(
        order_id=order20.id,
        image_urls="https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400",
        condition_score=80.0, defects="Sizing inconsistency — too tight",
        remaining_life_pct=88, recommended_action="resell", status="assessed",
    )
    ret7 = Return(
        order_id=order21.id,
        image_urls="https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400",
        condition_score=75.0, defects="Sole separation on right shoe",
        remaining_life_pct=60, recommended_action="refurbish", status="assessed",
    )

    all_returns = [ret1, ret2, ret3, ret4, ret5, ret6, ret7]
    db.add_all(all_returns)
    db.commit()

    # ── Sample Listings (auto-matched) ────────────────────────────
    listing1 = Listing(
        return_id=ret4.id,
        product_id=3,  # Wildcraft Backpack
        price=round(2499 * 0.7, 2),
        status="available",
    )
    db.add(listing1)
    db.commit()
    db.refresh(listing1)
    matched1 = find_best_match(listing1, db)
    if matched1:
        listing1.matched_user_id = matched1
        listing1.status = "matched"

    listing2 = Listing(
        return_id=ret5.id,
        product_id=4,  # boAt earbuds
        price=round(1299 * 0.5, 2),
        status="available",
    )
    db.add(listing2)
    db.commit()
    db.refresh(listing2)
    matched2 = find_best_match(listing2, db)
    if matched2:
        listing2.matched_user_id = matched2
        listing2.status = "matched"

    db.commit()

    # ── Sample Green Credit Transactions ──────────────────────────
    tx = GreenCreditTx(user_id=1, amount=20, type="earned")
    db.add(tx)
    users[0].green_credits = 20
    db.commit()

    db.close()
    print("✅ Database seeded successfully!")
    print(f"   • {len(users)} users")
    print(f"   • {len(products)} products")
    print(f"   • {len(all_orders)} orders, {len(all_returns)} returns, 2 listings")


if __name__ == "__main__":
    seed()
