import os
import sys
import pickle
import importlib.util
import pandas as pd
import numpy as np

# (Mock name generation removed per user request to use only raw data)

def map_friendly_gap(gap_name):
    """Map complex CMS Quality Measure names to friendly customer gap names."""
    g = str(gap_name).lower()
    if "sugar" in g or "hba1c" in g or "diabetes care" in g:
        return "HbA1c Test"
    elif "pressure" in g or "bp check" in g:
        return "BP Check"
    elif "adherence" in g or "medication refill" in g or "medication adherence" in g:
        return "Medication Refill"
    elif "kidney" in g or "renal" in g or "uacr" in g:
        return "Kidney Function Test"
    elif "statin" in g:
        return "Statin Therapy"
    elif "readmission" in g:
        return "Readmission Follow-up"
    elif "mtm" in g or "cmr" in g:
        return "CMR Session"
    return gap_name

def main():
    print("======================================================================")
    print("      END-TO-END PIPELINE: RULE ENGINE -> ML MODEL -> OPTIMIZER       ")
    print("======================================================================\n")

    # 1. Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    rule_dir = os.path.join(base_dir, "Rule based model")
    ml_dir = os.path.join(base_dir, "ML model")
    opt_dir = os.path.join(base_dir, "Optimization code")

    rule_script = os.path.join(rule_dir, "rule_based_model (1).py")
    optimizer_script = os.path.join(opt_dir, "optimizer (1).py")
    
    preprocessor_path = os.path.join(ml_dir, "models/preprocessor_v1.0.0.pkl")
    rf_path = os.path.join(ml_dir, "models/random_forest_v1.0.0.pkl")
    xgb_path = os.path.join(ml_dir, "models/xgboost_v1.0.0.pkl")

    # Check that required scripts and models exist
    for p in [rule_script, optimizer_script, preprocessor_path, rf_path, xgb_path]:
        if not os.path.exists(p):
            print(f"Error: Missing dependency file at: {p}")
            return

    # 2. Step 1: Run Rule-Based Model directly in memory
    print("--- STEP 1: Running Rule-Based Care Gap Model (In Memory) ---")
    
    # Dummy ExcelWriter context manager to mock openpyxl file writes
    class DummyWriter:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, exc_type, exc_val, exc_tb):
            pass

    # Temporarily mock pandas to_excel and ExcelWriter to avoid writing files to disk
    original_to_excel = pd.DataFrame.to_excel
    original_excel_writer = pd.ExcelWriter
    
    pd.DataFrame.to_excel = lambda *args, **kwargs: None
    pd.ExcelWriter = DummyWriter
    
    # Read and execute rule_based_model script in a custom namespace
    with open(rule_script, "r", encoding="utf-8") as f:
        rule_code = f.read()

    rule_namespace = {
        "__file__": rule_script,
        "__name__": "__main__",
    }
    
    old_cwd = os.getcwd()
    os.chdir(rule_dir)
    try:
        # Execute the script in memory
        exec(rule_code, rule_namespace)
        rule_engine_df = rule_namespace.get("output")
    except Exception as e:
        print(f"Error during Rule-Based Model execution: {e}")
        return
    finally:
        os.chdir(old_cwd)
        # Restore pandas functions
        pd.DataFrame.to_excel = original_to_excel
        pd.ExcelWriter = original_excel_writer

    if rule_engine_df is None or rule_engine_df.empty:
        print("Error: Rule engine did not return a valid DataFrame.")
        return

    print(f"Rule-based processing complete in memory. Care-gaps generated: {len(rule_engine_df)}")

    # 3. Step 2: Run ML Inference directly in memory
    print("\n--- STEP 2: Running ML Inference (In Memory) ---")
    
    print("Loading ML model binaries...")
    with open(preprocessor_path, "rb") as f:
        preprocessor = pickle.load(f)
    with open(rf_path, "rb") as f:
        rf = pickle.load(f)
    with open(xgb_path, "rb") as f:
        xgb = pickle.load(f)

    # Separate target/identifier from features
    features = [col for col in rule_engine_df.columns if col not in ['patient_id', 'outcome']]
    X = rule_engine_df[features].copy()

    # Pre-add missingness indicator columns for numerical variables
    missing_cols = ['enrollment_tenure_days', 'days_since_last_service', 'days_since_last_fill']
    for col in missing_cols:
        if col in X.columns:
            X[col + '_isnan'] = X[col].isna().astype(int)
        else:
            X[col + '_isnan'] = 0

    print("Preprocessing attributes...")
    X_processed = preprocessor.transform(X)

    # Generate probabilities using Random Forest and XGBoost ensemble
    print("Generating gap-closure probabilities...")
    rf_probs = rf.predict_proba(X_processed)[:, 1]
    xgb_probs = xgb.predict_proba(X_processed)[:, 1]
    
    ensemble_probs = (rf_probs + xgb_probs) / 2
    lower_bounds = np.minimum(rf_probs, xgb_probs)
    upper_bounds = np.maximum(rf_probs, xgb_probs)

    # Map outputs strictly in ML format
    ml_df = rule_engine_df.copy()
    ml_df['probability_score'] = ensemble_probs
    ml_df['uncertainity_range_lower'] = lower_bounds
    ml_df['uncertainity_range_upper'] = upper_bounds

    formatted_cols = [
        'patient_id', 'plan_id', 'care_gap', 'intervention_type', 
        'probability_score', 'uncertainity_range_lower', 'uncertainity_range_upper'
    ]
    ml_output_df = ml_df[formatted_cols].copy()

    # Print the ML output strictly in CSV format to the terminal
    print("\n--- FORMATTED ML OUTPUT START ---")
    print(ml_output_df.to_csv(index=False))
    print("--- FORMATTED ML OUTPUT END ---\n")

    # 4. Step 3: Run MILP Optimization in memory
    print("--- STEP 3: Running MILP Outreach Optimization (In Memory) ---")
    
    # Dynamically load the optimizer script using importlib
    spec = importlib.util.spec_from_file_location("optimizer", optimizer_script)
    opt_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(opt_mod)

    # Reconstruct the optimizer input dataframe in memory by combining predicted probabilities with metadata
    opt_input_df = pd.merge(
        ml_output_df,
        rule_engine_df[['patient_id', 'plan_id', 'care_gap', 'intervention_type', 'age', 'gender', 'measure_id', 'measure_weight', 'performance_value', 'enrollment_status']],
        on=['patient_id', 'plan_id', 'care_gap', 'intervention_type'],
        how='inner'
    )

    # Rename to match optimizer expectations
    opt_input_df = opt_input_df.rename(columns={
        'patient_id': 'member_id',
        'probability_score': 'closure_probability',
        'uncertainity_range_lower': 'uncertainty_lower',
        'uncertainity_range_upper': 'uncertainty_upper',
    })
    # Load member names from MEMBERS sheet in FILTERED_8_TABLES_WITH_NAMES.xlsx
    excel_path = os.path.join(rule_dir, "FILTERED_8_TABLES_WITH_NAMES.xlsx")
    members_df = pd.read_excel(excel_path, sheet_name="MEMBERS", engine="openpyxl")
    members_df.columns = members_df.columns.str.strip().str.lower()
    
    # Merge member_name column
    name_df = members_df[['member_id', 'member_name']].drop_duplicates()
    opt_input_df = pd.merge(opt_input_df, name_df, on='member_id', how='left')
    opt_input_df['member_name'] = opt_input_df['member_name'].fillna(opt_input_df['member_id'])
    
    opt_input_df['performance_opportunity'] = 1.0 - opt_input_df['performance_value']

    # Run optimizer stages
    print("Validating optimizer inputs...")
    opt_input_df = opt_mod.validate_data(opt_input_df)
    impact_df = opt_mod.compute_gap_impacts(opt_input_df)
    
    agg_df = opt_mod.aggregate_member_intervention(impact_df)
    scored_df = opt_mod.compute_final_score(
        agg_df,
        w_quality=opt_mod.QUALITY_WEIGHT,
        w_prob=opt_mod.PROBABILITY_WEIGHT,
    )

    eligible_members_count = len(agg_df["member_id"].unique())
    print(f"Total eligible unique members: {eligible_members_count}")
    
    # Prompt the user for maximum selected members
    try:
        user_input = input(f"Enter maximum number of members to select (1-{eligible_members_count}, default 10): ")
        max_selected_members = int(user_input)
        if max_selected_members <= 0 or max_selected_members > eligible_members_count:
            max_selected_members = min(10, eligible_members_count)
            print(f"Out of bounds. Defaulting to {max_selected_members}.")
    except ValueError:
        max_selected_members = min(10, eligible_members_count)
        print(f"Invalid input. Defaulting to {max_selected_members}.")

    print(f"\nRunning SciPy MILP Solver (limit: {max_selected_members} members)...")
    selected_df = opt_mod.build_and_solve(scored_df, max_members=max_selected_members)

    if selected_df.empty:
        print("No feasible solution found by the MILP solver.")
        return

    # Print final output list as a clean table to the terminal
    print("\n" + "=" * 187)
    print("                                                 OPTIMIZER OUTPUT – FINAL SELECTED PATIENT OUTREACH LIST                                                 ")
    print("=" * 187)
    print(f"Summary:")
    print(f"  - Total Selected Patients: {len(selected_df)}")
    print(f"  - Total Care Gaps Addressed: {selected_df['gap_count'].sum()}")
    print()

    # Define table format matching user specifications (2-line layout)
    header1 = (
        f"{'S. No.':<8} | {'Member ID':<10} | {'Member Name':<18} | {'Age':<4} | "
        f"{'Gender':<6} | {'Total Gaps (Count)':<18} | {'Care Gap(s) (Gap Name)':<45}"
    )
    header2 = (
        f"{' ':8} | {'Recommended Intervention':<25} | {'Gap Status':<10} | "
        f"{'Estimated Star Rating Improvement (Contribution)':<45}"
    )
    print(header1)
    print(header2)
    print("-" * 187)

    # Print rows
    for idx, (_, row) in enumerate(selected_df.iterrows(), start=1):
        # Use only member_name from the input data (which maps to member_id if name is not present)
        m_name = row.get('member_name', row['member_id'])
        
        # Map CMS measures to friendly names
        raw_gaps = row['care_gaps'].split("; ")
        friendly_gaps = "; ".join(sorted(list(set(map_friendly_gap(g) for g in raw_gaps))))
        
        s_no = f"{idx:<8}"
        m_id = f"{row['member_id']:<10}"
        m_name_str = f"{m_name:<18}"
        age = f"{row['age']:<4}"
        gender = f"{row['gender']:<6}"
        gaps_count = f"{row['gap_count']:<18}"
        care_gaps_str = f"{friendly_gaps:<45}"
        
        intervention = f"{row['recommended_intervention']:<25}"
        status = f"{row['gap_status']:<10}"
        contribution = f"+{row['robust_quality']:<44.4f}"

        print(f"{s_no} | {m_id} | {m_name_str} | {age} | {gender} | {gaps_count} | {care_gaps_str}")
        print(f"{' ':8} | {intervention} | {status} | {contribution}")

    print("=" * 187)
    print("Integrated Pipeline Completed Successfully!")
    print("=" * 187)

if __name__ == '__main__':
    main()
