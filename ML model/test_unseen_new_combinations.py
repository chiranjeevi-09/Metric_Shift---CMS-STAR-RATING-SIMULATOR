import os
import pickle
import pandas as pd
import numpy as np

def main():
    print("====================================================")
    print("Inference on: Unseen_50_Test_Data_New_Combinations (1)")
    print("====================================================")

    # 1. Dataset and model paths
    _script_dir = os.path.dirname(os.path.abspath(__file__))
    _testing_dir = os.path.join(_script_dir, "Testing set")
    unseen_path = os.path.join(_testing_dir, "Unseen_50_Test_Data_New_Combinations (1).xlsx")
    output_path = os.path.join(_testing_dir, "Predicted_Unseen_50_Test_Data_New_Combinations.xlsx")
    
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
    print("Loading preprocessor and trained models...")
    with open(preprocessor_path, "rb") as f:
        preprocessor = pickle.load(f)
    with open(rf_path, "rb") as f:
        rf = pickle.load(f)
    with open(xgb_path, "rb") as f:
        xgb = pickle.load(f)

    print("Loading unseen dataset...")
    df = pd.read_excel(unseen_path)
    print(f"Loaded {len(df)} rows.")

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
    print("Transforming features using preprocessor...")
    X_processed = preprocessor.transform(X)

    # 4. Generate predictions
    print("Computing soft-voting ensemble probabilities...")
    rf_probs = rf.predict_proba(X_processed)[:, 1]
    xgb_probs = xgb.predict_proba(X_processed)[:, 1]
    
    # Probability average
    ensemble_probs = (rf_probs + xgb_probs) / 2
    ensemble_preds = (ensemble_probs >= 0.5).astype(int)

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
    csv_output_path = os.path.join(_testing_dir, "Formatted_Predictions_New_Combinations.csv")
    print(f"Exporting formatted CSV to: {csv_output_path}")
    formatted_df.to_csv(csv_output_path, index=False)

    # 6. Print Formatted Output
    print("\n--- FORMATTED OUTPUT START ---")
    print(formatted_df.to_csv(index=False))
    print("--- FORMATTED OUTPUT END ---")
    print("====================================================")

if __name__ == '__main__':
    main()
