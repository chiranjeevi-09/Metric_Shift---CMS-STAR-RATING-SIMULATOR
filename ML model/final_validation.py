import os
import pickle
import pandas as pd
import numpy as np

def main():
    print("====================================================")
    print("Medicare Advantage ML Model Final Validation")
    print("====================================================")

    # 1. File paths
    _script_dir = os.path.dirname(os.path.abspath(__file__))
    _testing_dir = os.path.join(_script_dir, "Testing set")
    input_path = os.path.join(_testing_dir, "FINAL_Validation_50x3_Intervention_Test_Set.xlsx")
    candidate_csv_path = os.path.join(_testing_dir, "FINAL_Validation_150_Candidate_Predictions.csv")
    candidate_xlsx_path = os.path.join(_testing_dir, "FINAL_Validation_150_Candidate_Predictions.xlsx")
    recommendation_csv_path = os.path.join(_testing_dir, "FINAL_Validation_50_Recommendations.csv")
    recommendation_xlsx_path = os.path.join(_testing_dir, "FINAL_Validation_50_Recommendations.xlsx")
    
    models_dir = os.path.join(_script_dir, "models")
    preprocessor_path = os.path.join(models_dir, "preprocessor_v1.0.0.pkl")
    rf_path = os.path.join(models_dir, "random_forest_v1.0.0.pkl")
    xgb_path = os.path.join(models_dir, "xgboost_v1.0.0.pkl")

    # Verify files
    for path in [input_path, preprocessor_path, rf_path, xgb_path]:
        if not os.path.exists(path):
            print(f"Error: Missing file: {path}")
            return

    # 2. Load preprocessor and model binaries
    print("Loading models and preprocessor...")
    with open(preprocessor_path, "rb") as f:
        preprocessor = pickle.load(f)
    with open(rf_path, "rb") as f:
        rf = pickle.load(f)
    with open(xgb_path, "rb") as f:
        xgb = pickle.load(f)

    # Load 150-row validation dataset
    print("Loading validation dataset...")
    df = pd.read_excel(input_path)
    print(f"Loaded dataset. Shape: {df.shape}")
    if len(df) != 150:
        print(f"Warning: Expected 150 rows, but loaded {len(df)} rows.")

    # 3. Preprocess Features
    features = [col for col in df.columns if col not in ['patient_id', 'outcome']]
    X = df[features].copy()

    # Pre-add missingness indicator columns for numerical variables
    missing_cols = ['enrollment_tenure_days', 'days_since_last_service', 'days_since_last_fill']
    for col in missing_cols:
        if col in X.columns:
            X[col + '_isnan'] = X[col].isna().astype(int)
        else:
            X[col + '_isnan'] = 0

    print("Running preprocessing pipeline...")
    X_processed = preprocessor.transform(X)

    # 4. Run Inference (RF + XGBoost Soft-Voting Ensemble)
    print("Running model inference...")
    rf_probs = rf.predict_proba(X_processed)[:, 1]
    xgb_probs = xgb.predict_proba(X_processed)[:, 1]
    
    ensemble_probs = (rf_probs + xgb_probs) / 2
    lower_bounds = np.minimum(rf_probs, xgb_probs)
    upper_bounds = np.maximum(rf_probs, xgb_probs)

    # Compile candidate predictions
    candidates_df = df.copy()
    candidates_df['probability_score'] = ensemble_probs
    candidates_df['uncertainity_range_lower'] = lower_bounds
    candidates_df['uncertainity_range_upper'] = upper_bounds
    candidates_df['uncertainty_width'] = upper_bounds - lower_bounds

    # Save candidates
    print(f"Saving 150 candidate predictions to:\n  CSV: {candidate_csv_path}\n  Excel: {candidate_xlsx_path}")
    candidates_df.to_csv(candidate_csv_path, index=False)
    candidates_df.to_excel(candidate_xlsx_path, index=False)

    # 5. Extract Optimal Recommendations (Argmax probability per patient context)
    print("Selecting optimal intervention for each patient...")
    
    # We group by the unique patient context: patient_id, plan_id, care_gap
    # Each unique context has 3 rows representing Phone Call, SMS, and Email
    recommendation_rows = []
    grouped = candidates_df.groupby(['patient_id', 'plan_id', 'care_gap'])
    
    correct_selections = 0
    incorrect_selections = 0
    
    for (patient_id, plan_id, care_gap), group in grouped:
        # Find index of max probability in this group
        max_idx = group['probability_score'].idxmax()
        selected_row = group.loc[max_idx].copy()
        
        # Verify argmax index manually
        probs_dict = group.set_index('intervention_type')['probability_score'].to_dict()
        selected_type = selected_row['intervention_type']
        max_prob_type = max(probs_dict, key=probs_dict.get)
        
        if selected_type == max_prob_type:
            correct_selections += 1
        else:
            incorrect_selections += 1
            
        recommendation_rows.append(selected_row)
        
    recommendations_df = pd.DataFrame(recommendation_rows)
    
    # Save recommendations
    print(f"Saving 50 recommendations to:\n  CSV: {recommendation_csv_path}\n  Excel: {recommendation_xlsx_path}")
    columns_to_keep = [
        'patient_id', 'plan_id', 'care_gap', 'intervention_type', 
        'probability_score', 'uncertainity_range_lower', 'uncertainity_range_upper'
    ]
    recommendations_df[columns_to_keep].to_csv(recommendation_csv_path, index=False)
    recommendations_df[columns_to_keep].to_excel(recommendation_xlsx_path, index=False)

    # 6. Statistics Calculations
    total_candidates = len(candidates_df)
    total_patients = len(recommendations_df)
    
    cand_probs = candidates_df['probability_score']
    mean_prob = cand_probs.mean()
    med_prob = cand_probs.median()
    min_prob = cand_probs.min()
    max_prob = cand_probs.max()
    std_prob = cand_probs.std()
    
    # Counts of selections
    selection_counts = recommendations_df['intervention_type'].value_counts().to_dict()
    phone_selections = selection_counts.get('Phone Call', 0)
    sms_selections = selection_counts.get('SMS', 0)
    email_selections = selection_counts.get('Email', 0)

    # Confidence brackets
    # Low confidence: 0.40 <= prob <= 0.60
    # High confidence: prob > 0.80 or prob < 0.20
    # Medium confidence: all others
    def get_confidence_bracket(prob):
        if 0.40 <= prob <= 0.60:
            return 'Low'
        elif prob > 0.80 or prob < 0.20:
            return 'High'
        else:
            return 'Medium'
            
    cand_conf = cand_probs.apply(get_confidence_bracket).value_counts().to_dict()
    rec_conf = recommendations_df['probability_score'].apply(get_confidence_bracket).value_counts().to_dict()
    
    # Uncertainty stats
    cand_widths = candidates_df['uncertainty_width']
    mean_width = cand_widths.mean()
    min_width = cand_widths.min()
    max_width = cand_widths.max()
    
    consistency_pct = (correct_selections / total_patients) * 100.0

    # 7. Print Scores Report
    print("\n================ FINAL VALIDATION REPORT ================")
    print(f"Total Patients Evaluated:                         {total_patients}")
    print(f"Total Candidate Predictions:                      {total_candidates}")
    print(f"Probability Score stats (Candidates):")
    print(f"  Mean:                                           {mean_prob:.4f}")
    print(f"  Median:                                         {med_prob:.4f}")
    print(f"  Minimum:                                        {min_prob:.4f}")
    print(f"  Maximum:                                        {max_prob:.4f}")
    print(f"  Std Dev:                                        {std_prob:.4f}")
    print(f"Intervention Recommendation Selections:")
    print(f"  Phone Call:                                     {phone_selections} ({phone_selections/total_patients*100:.1f}%)")
    print(f"  SMS:                                            {sms_selections} ({sms_selections/total_patients*100:.1f}%)")
    print(f"  Email:                                          {email_selections} ({email_selections/total_patients*100:.1f}%)")
    print(f"Confidence Brackets Breakdown (Candidates):")
    print(f"  High Confidence:                                {cand_conf.get('High', 0)}")
    print(f"  Medium Confidence:                              {cand_conf.get('Medium', 0)}")
    print(f"  Low Confidence (0.40 <= prob <= 0.60):          {cand_conf.get('Low', 0)}")
    print(f"Confidence Brackets Breakdown (Recommendations):")
    print(f"  High Confidence:                                {rec_conf.get('High', 0)}")
    print(f"  Medium Confidence:                              {rec_conf.get('Medium', 0)}")
    print(f"  Low Confidence (0.40 <= prob <= 0.60):          {rec_conf.get('Low', 0)}")
    print(f"Uncertainty Width stats (Candidates):")
    print(f"  Mean Width:                                     {mean_width:.4f}")
    print(f"  Min Width:                                      {min_width:.4f}")
    print(f"  Max Width:                                      {max_width:.4f}")
    print(f"Ensemble Selection Verification:")
    print(f"  Correct Max-Probability Selections:             {correct_selections}")
    print(f"  Incorrect Selections:                           {incorrect_selections}")
    print(f"  Intervention-Selection Consistency %:            {consistency_pct:.2f}%")
    print("=========================================================")

    # 8. Potential Problems Checking
    print("\n--- Diagnostic Quality Checks ---")
    
    # A. Are probabilities suspiciously high?
    high_prob_pct = (cand_probs > 0.85).mean() * 100
    print(f"  A. Predictions with probability > 0.85:         {high_prob_pct:.1f}%")
    
    # B. Are Phone/SMS/Email probabilities different?
    # We calculate the average standard deviation within patient groups
    patient_std = candidates_df.groupby(['patient_id', 'plan_id', 'care_gap'])['probability_score'].std()
    mean_patient_std = patient_std.mean()
    print(f"  B. Avg Probability StdDev within Patient Context: {mean_patient_std:.4f}")
    
    # C. Selection concentration
    max_selection_pct = max(phone_selections, sms_selections, email_selections) / total_patients * 100
    print(f"  C. Maximum Selection Concentration:             {max_selection_pct:.1f}%")
    
    # D. Uncertainty boundaries validation
    valid_bounds = ((candidates_df['uncertainity_range_lower'] <= candidates_df['probability_score']) &
                    (candidates_df['probability_score'] <= candidates_df['uncertainity_range_upper']) &
                    (candidates_df['uncertainity_range_lower'] <= candidates_df['uncertainity_range_upper'])).all()
    print(f"  D. Lower bound <= Probability <= Upper bound:    {valid_bounds}")
    
    # E. Invalid / Out-of-bounds checks
    nans = candidates_df[['probability_score', 'uncertainity_range_lower', 'uncertainity_range_upper']].isna().sum().sum()
    out_of_bounds = ((cand_probs < 0) | (cand_probs > 1)).sum()
    print(f"  E. NaNs, Negatives, or >1 Probabilities:        {nans + out_of_bounds}")

    # 9. Cohort Analysis on candidates (150 rows)
    print("\n--- Cohort Behavioral Analysis (on Candidates) ---")
    
    cohorts = {
        'Short Tenure (<30 days)': df['enrollment_tenure_days'] < 30,
        'Active Enrollment': df['enrollment_status'] == 'Active',
        'Inactive Enrollment': df['enrollment_status'] != 'Active',
        'Low Medication Adherence (<0.8)': df['medication_adherence_rate'] < 0.8,
        'High Medication Adherence (>=0.8)': df['medication_adherence_rate'] >= 0.8,
        'Sparse Intervention History (==0)': df['previous_intervention_count'] == 0,
        'Heavy Intervention History (>0)': df['previous_intervention_count'] > 0,
        'Low Performance Value (<0.5)': df['performance_value'] < 0.5,
        'Stale Service History (>365 days)': df['days_since_last_service'] > 365
    }

    for name, mask in cohorts.items():
        sub_df = candidates_df[mask]
        count = len(sub_df)
        if count > 0:
            m_prob = sub_df['probability_score'].mean()
            std_p = sub_df['probability_score'].std()
            print(f"  Cohort: {name:36} | Count: {count:3} | Mean Prob: {m_prob:.4f} | StdDev: {std_p:.4f}")
        else:
            print(f"  Cohort: {name:36} | Count:   0 | Mean Prob: N/A")

if __name__ == '__main__':
    main()
