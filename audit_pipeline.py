import os
import pandas as pd
import numpy as np

def main():
    print("====================================================")
    print("Pipeline Verification & Audit Report")
    print("====================================================")

    # 1. Define Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    rule_output_path = os.path.join(base_dir, "Rule based model/CORRECTED_RULE_ENGINE_34_ATTRIBUTES.xlsx")
    ml_output_path = os.path.join(base_dir, "ML model/Testing set/Formatted_ML_Pipeline_Output.csv")
    raw_tables_path = os.path.join(base_dir, "Rule based model/FILTERED_8_TABLES_UPDATED.xlsx")

    # Check file existence
    files_ok = True
    for path in [rule_output_path, ml_output_path, raw_tables_path]:
        if not os.path.exists(path):
            print(f"Error: Missing file: {path}")
            files_ok = False
    if not files_ok:
        return

    # Load Data
    print("Loading datasets for auditing...")
    rule_df = pd.read_excel(rule_output_path)
    ml_df = pd.read_csv(ml_output_path)
    
    excel_file = pd.ExcelFile(raw_tables_path)
    members_df = pd.read_excel(raw_tables_path, sheet_name="MEMBERS")
    
    # 2. RULE ENGINE AUDIT
    print("\n--- 1. Rule-Based Care Gap Engine Audits ---")
    
    # Check A: Row Count Consistency
    print(f"  A. Rule Engine Output Shape: {rule_df.shape[0]} rows, {rule_df.shape[1]} columns")
    if rule_df.shape[1] == 34:
        print("     [Pass] Generated exactly 34 columns for ML model consumption.")
    else:
        print(f"     [Fail] Columns count is {rule_df.shape[1]}, expected 34.")

    # Check B: Key Mapping Check (Members -> Care Gaps)
    missing_members = set(rule_df['patient_id']).difference(set(members_df['member_id']))
    print(f"  B. Patients in Care Gaps but missing in MEMBERS: {len(missing_members)}")
    if len(missing_members) == 0:
        print("     [Pass] All patient IDs map back to valid registered members.")
    else:
        print("     [Warning] Found orphaned patients in care gaps!")

    # Check C: Rule Logic Check (Diabetes Measures)
    # Patients with Diabetes condition must only have C12, C13, D08, D12 measures
    diabetes_gaps = rule_df[rule_df['condition'] == 'Diabetes']
    invalid_diabetes_measures = diabetes_gaps[~diabetes_gaps['measure_id'].isin(['C12', 'C13', 'D08', 'D12'])]
    print(f"  C. Invalid measures assigned to Diabetes patients: {len(invalid_diabetes_measures)}")
    if len(invalid_diabetes_measures) == 0:
        print("     [Pass] Care gaps assigned to Diabetes patients strictly follow clinical matching rules.")
    else:
        print("     [Fail] Found incorrect measures mapped to Diabetes patients.")

    # 3. INTERFACE INTEGRITY AUDIT
    print("\n--- 2. Rule Engine to ML Model Interface Audits ---")
    
    # Check A: Patient Mapping Check
    rule_patients = set(rule_df['patient_id'])
    ml_patients = set(ml_df['patient_id'])
    print(f"  A. Row Count match: Rule Engine = {len(rule_df)} vs ML predictions = {len(ml_df)}")
    if len(rule_df) == len(ml_df):
        print("     [Pass] The ML model processed exactly 100% of the rule engine care gaps.")
    else:
        print("     [Fail] Row count mismatch between Rule Engine and ML model!")
        
    mismatched_p = rule_patients.symmetric_difference(ml_patients)
    print(f"  B. Mismatched Patient IDs: {len(mismatched_p)}")
    if len(mismatched_p) == 0:
        print("     [Pass] Perfect patient ID mapping between Rule Engine and ML output.")
    else:
        print("     [Fail] Patient IDs do not align between datasets!")

    # 4. ML MODEL AUDIT
    print("\n--- 3. ML Model Prediction Audits ---")
    
    # Check A: Null values check
    null_count = ml_df.isna().sum().sum()
    print(f"  A. Null/NaN values in ML Output: {null_count}")
    if null_count == 0:
        print("     [Pass] Zero NaN values found in predictions.")
    else:
        print("     [Fail] ML predictions contain missing values!")

    # Check B: Mathematical bounds check (lower <= score <= upper)
    out_of_bounds = ((ml_df['probability_score'] < 0) | (ml_df['probability_score'] > 1)).sum()
    invalid_bounds = ((ml_df['uncertainity_range_lower'] > ml_df['probability_score']) | 
                      (ml_df['probability_score'] > ml_df['uncertainity_range_upper'])).sum()
    print(f"  B. Out-of-bounds probabilities (not 0-1): {out_of_bounds}")
    print(f"  C. Invalid uncertainty bounds (lower > score or score > upper): {invalid_bounds}")
    if out_of_bounds == 0 and invalid_bounds == 0:
        print("     [Pass] All probability scores and uncertainty ranges are mathematically valid.")
    else:
        print("     [Fail] Found invalid prediction ranges!")

    # Check D: Cohort Differentiator Check (Adherence check)
    # We join medication adherence from the rule engine output back to predictions
    joined = ml_df.merge(rule_df[['patient_id', 'measure_id', 'care_gap', 'medication_adherence_rate', 'enrollment_status']], 
                         on=['patient_id', 'care_gap'], how='inner')
    
    high_adh = joined[joined['medication_adherence_rate'] >= 0.8]
    low_adh = joined[joined['medication_adherence_rate'] < 0.8]
    
    print("\n--- 4. ML Predictive Cohort Sanity Check ---")
    if len(high_adh) > 0:
        print(f"  High Medication Adherence (Count: {len(high_adh)}) | Mean Predicted Prob: {high_adh['probability_score'].mean():.4f}")
    if len(low_adh) > 0:
        print(f"  Low Medication Adherence  (Count: {len(low_adh)}) | Mean Predicted Prob: {low_adh['probability_score'].mean():.4f}")
        
    active_m = joined[joined['enrollment_status'] == 'Active']
    inactive_m = joined[joined['enrollment_status'] != 'Active']
    if len(active_m) > 0:
        print(f"  Active Patients           (Count: {len(active_m)}) | Mean Predicted Prob: {active_m['probability_score'].mean():.4f}")
    if len(inactive_m) > 0:
        print(f"  Inactive Patients         (Count: {len(inactive_m)}) | Mean Predicted Prob: {inactive_m['probability_score'].mean():.4f}")
        
    print("====================================================")

if __name__ == '__main__':
    main()
