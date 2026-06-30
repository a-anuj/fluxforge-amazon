from dotenv import load_dotenv
load_dotenv()

import requests
from app.database import SessionLocal
from app import models
from sqlalchemy import func

def verify_dashboard_values():
    print("--- Database Raw Values ---")
    db = SessionLocal()
    
    # Get raw counts from database
    total_orders = db.query(models.Order).count()
    total_returns = db.query(models.Return).count()
    
    avg_fit_score = db.query(func.avg(models.Order.fit_score)).scalar() or 0.0
    expected_satisfaction = round((avg_fit_score / 100) * 5, 1)
    
    products_resold = db.query(func.sum(models.User.products_resold)).scalar() or 0
    
    resale_returns = db.query(models.Return, models.Product).join(models.Order, models.Return.order_id == models.Order.id).join(models.Product, models.Order.product_id == models.Product.id).filter(
        models.Return.recommended_action.in_(["resell", "refurbish"])
    ).all()
    
    expected_savings = 0.0
    for ret, prod in resale_returns:
        if ret.recommended_action == "resell":
            expected_savings += (prod.price * 0.7)
        elif ret.recommended_action == "refurbish":
            expected_savings += (prod.price * 0.5)
            
    expected_savings = round(expected_savings)
    
    expected_co2 = db.query(func.sum(models.User.co2_saved)).scalar() or 0.0
    expected_return_rate = round((total_returns / total_orders * 100), 1) if total_orders > 0 else 0.0

    print(f"Total Orders: {total_orders}")
    print(f"Total Returns: {total_returns}")
    print(f"Expected Return Rate: {expected_return_rate}%")
    print(f"Expected Satisfaction: {expected_satisfaction}/5")
    print(f"Expected Cost Savings: ₹{expected_savings}")
    print(f"Expected CO2 Saved: {round(expected_co2, 1)}kg")
    
    print("\n--- Live API Response ---")
    try:
        response = requests.get("http://localhost:8000/api/analytics/dashboard")
        data = response.json()
        overall = data.get("overall", {})
        
        print(f"Return Rate (from API): {overall.get('reductionInReturnRate')}% reduction (Current month rate: {data.get('historicalTrends')[-1]['returnRate']}%)")
        print(f"Eco-Delivery Rate: {overall.get('ecoDeliveryRate')}%")
        print(f"Customer Satisfaction: {overall.get('customerSatisfaction')}/5")
        print(f"Cost Savings: ₹{overall.get('costSavingsINR')}")
        print(f"Items Resold: {overall.get('productsResold')}")
        print(f"CO2 Saved: {overall.get('carbonEmissionsSavedKg')}kg")
        
        print("\n--- Verification Result ---")
        if (overall.get('customerSatisfaction') == expected_satisfaction and 
            overall.get('costSavingsINR') == expected_savings and
            overall.get('carbonEmissionsSavedKg') == round(expected_co2, 1)):
            print("✅ SUCCESS! The Dashboard API perfectly matches the live database values.")
        else:
            print("❌ FAILED! The values do not match.")
            
    except Exception as e:
        print(f"Error fetching from API: {e}")
        print("Make sure the backend is running on port 8000 (docker compose up -d)")

if __name__ == "__main__":
    verify_dashboard_values()
