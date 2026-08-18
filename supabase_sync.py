import os
import uuid
import pandas as pd
import numpy as np
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

def get_supabase_client() -> Client:
    """Initialize and return Supabase client."""
    if not SUPABASE_URL or not SUPABASE_KEY or "your-project" in SUPABASE_URL:
        raise ValueError("Supabase credentials missing! Please set SUPABASE_URL and SUPABASE_KEY in .env file.")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

# Table Mapping: Excel Sheet Name -> Supabase Table Name
TABLE_MAPPING = {
    "PLANS": "plans",
    "PLAN_BENEFITS": "plan_benefits",
    "MEMBERS": "members",
    "MEMBER_ENROLLMENT": "member_enrollment",
    "MEMBER_HISTORY": "member_history",
    "CMS_MEASURES": "cms_measures",
    "PLAN_MEASURE_PERFORMANCE": "plan_measure_performance",
    "PART_D_MEDICATION_HISTORY": "part_d_medication_history"
}

# Primary keys per table for upserts
PRIMARY_KEYS = {
    "plans": "plan_id",
    "plan_benefits": "benefit_id",
    "members": "member_condition_id",
    "member_enrollment": "enrollment_id",
    "member_history": "history_id",
    "cms_measures": "measure_id",
    "plan_measure_performance": "performance_id",
    "part_d_medication_history": "rx_history_id"
}

TABLE_COLUMNS = {
    "plans": {"plan_id", "contract_id", "plan_name", "organization_name", "plan_type", "state", "overall_star_rating", "part_c_star_rating", "part_d_star_rating"},
    "plan_benefits": {"benefit_id", "plan_id", "part", "benefit_category", "service_name", "coverage_status", "frequency_limit", "benefit_year"},
    "members": {"member_condition_id", "member_id", "member_name", "date_of_birth", "age", "gender", "condition", "condition_code"},
    "member_enrollment": {"enrollment_id", "member_id", "plan_id", "enrollment_start_date", "enrollment_end_date", "enrollment_status"},
    "member_history": {"history_id", "member_id", "service_name", "test_name", "service_date", "status", "result", "event_type", "result_value", "result_unit", "intervention_type", "action_date", "completion_date", "outcome"},
    "cms_measures": {"measure_id", "official_measure_id", "measure_name", "part", "domain", "measure_type", "rating_year", "description", "eligibility_rule", "numerator_definition", "denominator_definition", "exclusion_rule", "weight", "active"},
    "plan_measure_performance": {"performance_id", "plan_id", "measure_id", "rating_year", "denominator", "numerator", "performance_value", "measure_star", "weight"},
    "part_d_medication_history": {"rx_history_id", "member_id", "medication_name", "ndc_code", "prescription_id", "pharmacy_id", "fill_date", "days_supply", "quantity_dispensed", "refill_number", "claim_status", "amount_paid", "member_copay"}
}

DATE_COLUMNS = {
    'date_of_birth', 'enrollment_start_date', 'enrollment_end_date',
    'service_date', 'action_date', 'completion_date', 'fill_date'
}

def clean_df_for_json(df: pd.DataFrame) -> list:
    """Clean DataFrame for JSON serialization (convert NaN/NaT to None, format dates to ISO YYYY-MM-DD)."""
    df = df.copy()
    # Clean column headers
    df.columns = df.columns.astype(str).str.strip().str.lower()
    
    # Process date columns
    for col in df.columns:
        if col in DATE_COLUMNS or 'date' in col:
            parsed_dates = pd.to_datetime(df[col], errors='coerce', format='mixed')
            df[col] = parsed_dates.dt.strftime('%Y-%m-%d')
        elif pd.api.types.is_datetime64_any_dtype(df[col]):
            df[col] = df[col].dt.strftime('%Y-%m-%d')

    # Replace NaN, NaT, Inf with None
    records = df.to_dict(orient='records')
    cleaned_records = []
    for row in records:
        cleaned_row = {}
        for k, v in row.items():
            if pd.isna(v) or v is np.nan or str(v) == 'NaT' or str(v) == 'nan' or str(v) == 'None':
                cleaned_row[k] = None
            else:
                cleaned_row[k] = v
        cleaned_records.append(cleaned_row)
    return cleaned_records

def detect_table_for_df(df: pd.DataFrame) -> str:
    """Detect which of the 8 Supabase tables a single-sheet or CSV dataframe belongs to based on column names."""
    cols = set(df.columns.astype(str).str.strip().str.lower())
    
    if 'history_id' in cols or 'intervention_type' in cols or 'action_date' in cols or 'completion_date' in cols or 'outcome' in cols:
        return 'member_history'
    elif 'member_condition_id' in cols or 'date_of_birth' in cols or 'condition_code' in cols:
        return 'members'
    elif 'enrollment_id' in cols or 'enrollment_start_date' in cols:
        return 'member_enrollment'
    elif 'benefit_id' in cols or 'benefit_category' in cols:
        return 'plan_benefits'
    elif 'rx_history_id' in cols or 'ndc_code' in cols or 'medication_name' in cols:
        return 'part_d_medication_history'
    elif 'official_measure_id' in cols or 'numerator_definition' in cols:
        return 'cms_measures'
    elif 'performance_id' in cols or 'measure_star' in cols:
        return 'plan_measure_performance'
    elif 'contract_id' in cols or 'organization_name' in cols:
        return 'plans'
    elif 'member_id' in cols and 'status' in cols:
        return 'member_history'
    return 'member_history'

def sync_excel_to_supabase(excel_path: str, batch_size: int = 500) -> dict:
    """Read an 8-sheet Excel file and upsert all sheets into Supabase tables."""
    client = get_supabase_client()
    xl = pd.ExcelFile(excel_path)
    stats = {}

    for sheet_name, table_name in TABLE_MAPPING.items():
        if sheet_name not in xl.sheet_names:
            print(f"Warning: Sheet {sheet_name} not found in {excel_path}")
            continue

        df = pd.read_excel(xl, sheet_name=sheet_name)
        records = clean_df_for_json(df)
        
        if not records:
            stats[table_name] = 0
            continue

        pk = PRIMARY_KEYS.get(table_name)
        print(f"Upserting {len(records)} records into Supabase table '{table_name}'...")
        
        # Batch insert/upsert
        total_inserted = 0
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            res = client.table(table_name).upsert(batch, on_conflict=pk).execute()
            total_inserted += len(batch)

        stats[table_name] = total_inserted
        print(f"[OK] Successfully synced {total_inserted} rows to '{table_name}'.")

    return stats

def sync_uploaded_file_to_supabase(file_path: str) -> str:
    """Sync any uploaded file (full 8-sheet Excel, 1-sheet Excel, or CSV) to Supabase, then export full 8-sheet workbook."""
    client = get_supabase_client()
    is_excel = file_path.endswith('.xlsx') or file_path.endswith('.xls')
    
    if is_excel:
        xl = pd.ExcelFile(file_path)
        sheet_names = xl.sheet_names
        has_multi_sheets = any(s in TABLE_MAPPING for s in sheet_names)
        
        if has_multi_sheets:
            print(f"Uploaded file '{file_path}' contains standard multi-sheet tables. Upserting to Supabase...")
            sync_excel_to_supabase(file_path)
        else:
            print(f"Uploaded file '{file_path}' has single sheet '{sheet_names[0]}'. Processing table detection...")
            df = pd.read_excel(xl, sheet_name=sheet_names[0])
            _sync_single_df_to_supabase(client, df)
    else:
        # CSV file
        print(f"Uploaded file '{file_path}' is CSV. Reading and detecting table...")
        df = pd.read_csv(file_path)
        _sync_single_df_to_supabase(client, df)

    # Export complete merged 8-sheet dataset from Supabase back to file_path
    print(f"Exporting complete merged 8-table dataset from Supabase to '{file_path}' for pipeline execution...")
    export_supabase_to_excel(file_path)
    return file_path

def _sync_single_df_to_supabase(client: Client, df: pd.DataFrame):
    """Helper to process and upsert a single DataFrame (single-sheet Excel or CSV) into its matched Supabase table."""
    df = df.copy()
    df.columns = df.columns.astype(str).str.strip().str.lower()
    
    table_name = detect_table_for_df(df)
    pk = PRIMARY_KEYS[table_name]
    valid_cols = TABLE_COLUMNS[table_name]
    
    # Auto-generate primary key if omitted in uploaded partial file
    if pk not in df.columns:
        prefix = pk[:3].upper()
        df[pk] = [f"{prefix}_UPD_{uuid.uuid4().hex[:8]}" for _ in range(len(df))]

    # Filter columns to valid database schema columns
    matched_cols = [c for c in df.columns if c in valid_cols]
    filtered_df = df[matched_cols].copy()
    
    records = clean_df_for_json(filtered_df)
    if records:
        print(f"Upserting {len(records)} records into matched Supabase table '{table_name}'...")
        client.table(table_name).upsert(records, on_conflict=pk).execute()
        print(f"[OK] Synced {len(records)} records to table '{table_name}'.")

def export_supabase_to_excel(output_path: str) -> str:
    """Fetch data from all 8 Supabase tables and write to an 8-sheet Excel file."""
    client = get_supabase_client()
    
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        for sheet_name, table_name in TABLE_MAPPING.items():
            res = client.table(table_name).select("*").execute()
            records = res.data
            
            if records:
                df = pd.DataFrame(records)
                # Drop supabase internal metadata column if present
                if 'created_at' in df.columns:
                    df = df.drop(columns=['created_at'])
            else:
                df = pd.DataFrame()

            # Upper case columns to match original schema expectation
            df.columns = df.columns.str.upper()
            df.to_excel(writer, sheet_name=sheet_name, index=False)
            print(f"Exported {len(df)} rows for sheet '{sheet_name}'.")

    print(f"[OK] Exported full database from Supabase to: {output_path}")
    return output_path

if __name__ == '__main__':
    print("Testing Supabase connection...")
    try:
        c = get_supabase_client()
        print("Connected to Supabase!")
    except Exception as e:
        print(f"Error: {e}")
