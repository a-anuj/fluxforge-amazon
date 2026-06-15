import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    print("No DATABASE_URL")
    exit(1)

engine = create_engine(DB_URL)
with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE community_listings ADD COLUMN ai_condition_summary TEXT;"))
        conn.commit()
        print("Column added successfully!")
    except Exception as e:
        print("Error or already exists:", e)
