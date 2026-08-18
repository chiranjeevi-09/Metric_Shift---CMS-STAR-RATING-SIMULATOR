import os
import pickle
import pandas as pd
import numpy as np

def main():
    # 1. Dataset and model paths
    _script_dir = os.path.dirname(os.path.abspath(__file__))
    _testing_dir = os.path.join(_script_dir, "Testing set")
    unseen_path = os.path.join(_testing_dir, "Unexpected_50_Unseen_Realtime_Test_Set.xlsx")
    csv_output_path = os.path.join(_testing_dir, "Formatted_Predictions_Unexpected.csv")
    
    models_dir = os.path.join(_script_dir, "models")
    preprocessor_path = os.path.join(models_dir, "preprocessor_v1.0.0.pkl")
    rf_path = os.path.join(models_dir, "random_forest_v1.0.0.pkl")
    xgb_path = os.path.join(models_dir, "xgboost_v1.0.0.pkl")

    # Verify all files are present
    for filepath in [unseen_path, preprocessor_path, rf_path, xgb_path]:
        if not os.path.exists(filepath):
            print(f"Error: Required file not found: {filepath}")
            return

    # 2. Load model binaries and data
    with open(preprocessor_path, "rb") as f:
        preprocessor = pickle.load(f)
    with open(rf_path, "rb") as f:
        rf = pickle.load(f)
    with open(xgb_path, "rb") as f:
        xgb = pickle.load(f)

    df = pd.read_excel(unseen_path)

    # Prepare features
    features = [col for col in df.columns if col not in ['patient_id', 'outcome']]
    X = df[features].copy()

    # Pre-add missingness indicator columns
    missing_cols = ['enrollment_tenure_days', 'days_since_last_service', 'days_since_last_fill']
    for col in missing_cols:
        if col in X.columns:
            X[col + '_isnan'] = X[col].isna().astype(int)
        else:
            X[col + '_isnan'] = 0

    # 3. Apply preprocessing pipeline
    X_processed = preprocessor.transform(X)

    # 4. Generate predictions
    rf_probs = rf.predict_proba(X_processed)[:, 1]
    xgb_probs = xgb.predict_proba(X_processed)[:, 1]
    
    ensemble_probs = (rf_probs + xgb_probs) / 2

    # 5. Output file generation
    results_df = df.copy()
    results_df['probability_score'] = ensemble_probs
    results_df['uncertainity_range_lower'] = np.minimum(rf_probs, xgb_probs)
    results_df['uncertainity_range_upper'] = np.maximum(rf_probs, xgb_probs)
    
    # Select only requested columns
    formatted_cols = [
        'patient_id', 'plan_id', 'care_gap', 'intervention_type', 
        'probability_score', 'uncertainity_range_lower', 'uncertainity_range_upper'
    ]
    formatted_df = results_df[formatted_cols]

    # Save to CSV
    formatted_df.to_csv(csv_output_path, index=False)

    # 6. Print Formatted Output
    print("--- FORMATTED OUTPUT START ---")
    print(formatted_df.to_csv(index=False))
    print("--- FORMATTED OUTPUT END ---")

if __name__ == '__main__':
    main()
