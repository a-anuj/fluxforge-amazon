import os
from dotenv import load_dotenv
load_dotenv("/home/a-anuj/Projects/fluxforge-amazon/backend/.env")

from sqlalchemy import text
from app.database import engine

with engine.begin() as conn:
    try:
        conn.execute(text("ALTER TABLE orders ADD COLUMN baseline_frame_urls VARCHAR;"))
        print("Column added successfully!")
    except Exception as e:
        print("Failed or already exists:", e)
