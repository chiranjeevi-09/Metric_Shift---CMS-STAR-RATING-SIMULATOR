import os
import sys
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

from supabase_sync import (
    get_supabase_client,
    sync_excel_to_supabase,
    export_supabase_to_excel,
    SUPABASE_URL,
    SUPABASE_KEY
)

def run_setup(excel_file: str = "FILTERED_8_TABLES_FINAL (1).xlsx"):
    print("=========================================================")
    print("      SUPABASE SCHEMA CREATION & INITIAL SEEDING         ")
    print("=========================================================")

    if not SUPABASE_URL or "your-project" in SUPABASE_URL or not SUPABASE_KEY or "your-supabase" in SUPABASE_KEY:
        print("\n❌ ERROR: Supabase credentials are not set in .env file.")
        print("Please edit the .env file and set:")
        print("  SUPABASE_URL=https://<your-project-id>.supabase.co")
        print("  SUPABASE_KEY=<your-service-role-or-anon-key>\n")
        return False

    try:
        client = get_supabase_client()
        print(f"Connected to Supabase project at: {SUPABASE_URL}")
    except Exception as e:
        print(f"❌ Failed to connect to Supabase: {e}")
        return False

    if not os.path.exists(excel_file):
        print(f"❌ Input Excel file '{excel_file}' not found.")
        return False

    print(f"\n1. Reading schema and data from '{excel_file}'...")
    xl = pd.ExcelFile(excel_file)
    print(f"   Found 8 sheets: {xl.sheet_names}")

    print("\n2. Uploading dataset to Supabase tables...")
    try:
        stats = sync_excel_to_supabase(excel_file)
        print("\n=========================================================")
        print("SUCCESS! All 8 tables created and seeded in Supabase:")
        print("=========================================================")
        for table, count in stats.items():
            print(f"  * {table:25} : {count:6} rows uploaded")
        print("=========================================================\n")
        return True
    except Exception as e:
        print(f"\n[Error] Failed uploading dataset to Supabase: {e}")
        print("\nNote: Make sure the 8 tables have been created in your Supabase SQL Editor.")
        print("You can copy-paste the provided `schema.sql` into the Supabase SQL Editor.")
        return False

if __name__ == "__main__":
    file_arg = sys.argv[1] if len(sys.argv) > 1 else "FILTERED_8_TABLES_FINAL (1).xlsx"
    run_setup(file_arg)
