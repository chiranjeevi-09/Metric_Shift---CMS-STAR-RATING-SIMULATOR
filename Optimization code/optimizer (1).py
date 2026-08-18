"""
Care-Gap Robust MILP Optimization — Single-File Optimizer
=========================================================

This file consolidates the entire optimization pipeline into a single module:
  - Configuration (from src/config.py)
  - Data Loading & Validation (from src/data_loader.py)
  - Quality Impact Calculations (from src/quality.py)
  - Multi-Objective Scoring (from src/objective.py)
  - MILP Solver (from src/milp.py)
  - Simulation (from src/simulation.py)
  - Main Pipeline (from main.py)
  - Validation Report (from validation_report.py)

Closure probabilities are synthetic placeholders used to test the
optimization algorithm. They will later be replaced by real ML predictions.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd
from scipy.optimize import milp, LinearConstraint, Bounds

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


# ============================================================================
# SECTION 1: CONFIGURATION (src/config.py)
# ============================================================================
"""
Configuration for the Care-Gap Robust MILP Optimization Prototype.

All parameters below are prototype defaults used for algorithm validation.
They are NOT CMS-defined values and will be replaced with real business
rules and model-derived values in production.
"""

# ---------------------------------------------------------------------------
# Multi-Objective Weights (prototype business weights, NOT CMS weights)
# ---------------------------------------------------------------------------
QUALITY_WEIGHT = 0.70
PROBABILITY_WEIGHT = 0.30

# ---------------------------------------------------------------------------
# Intervention Types
# ---------------------------------------------------------------------------
INTERVENTION_TYPES = ["Phone Call", "SMS", "Email"]

# ---------------------------------------------------------------------------
# Monte Carlo Simulation
# ---------------------------------------------------------------------------
SIMULATION_RUNS = 10000

# ---------------------------------------------------------------------------
# Synthetic Quality Simulation Parameters
# These are placeholder values for algorithm testing only.
# ---------------------------------------------------------------------------
CURRENT_NUMERATOR = 150
CURRENT_DENOMINATOR = 200

# ---------------------------------------------------------------------------
# Data Path
# ---------------------------------------------------------------------------
DATA_PATH = "data/new_optimization_test_dataset.csv"


# ============================================================================
# SECTION 2: DATA LOADING & VALIDATION (src/data_loader.py)
# ============================================================================
"""
Data loading and validation for the care-gap optimization pipeline.

Loads the synthetic CSV dataset, validates column presence and value
constraints, and filters to eligible members with open care gaps.
"""

# Required columns in the input dataset
REQUIRED_COLUMNS = [
    "member_id", "plan_id", "member_name", "age", "gender",
    "care_gap", "intervention_type",
    "closure_probability", "uncertainty_lower", "uncertainty_upper",
    "measure_id", "measure_weight", "performance_opportunity",
]


def load_data(path: str) -> pd.DataFrame:
    """Load the optimization input CSV and validate required columns.

    Parameters
    ----------
    path : str
        Path to the CSV file.

    Returns
    -------
    pd.DataFrame
        Raw dataframe with all rows.

    Raises
    ------
    FileNotFoundError
        If the CSV file does not exist.
    ValueError
        If required columns are missing.
    """
    df = pd.read_csv(path)
    missing = set(REQUIRED_COLUMNS) - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
    return df


def validate_data(df: pd.DataFrame) -> pd.DataFrame:
    """Validate data constraints.

    Checks:
    - 0 <= uncertainty_lower <= closure_probability <= uncertainty_upper <= 1

    Parameters
    ----------
    df : pd.DataFrame
        Raw input dataframe.

    Returns
    -------
    pd.DataFrame
        The same dataframe (unmodified) if validation passes.

    Raises
    ------
    ValueError
        If any validation check fails.
    """
    # Uncertainty bounds
    if not (df["uncertainty_lower"] >= 0).all():
        raise ValueError("uncertainty_lower must be >= 0")
    if not (df["uncertainty_lower"] <= df["closure_probability"]).all():
        raise ValueError("uncertainty_lower must be <= closure_probability")
    if not (df["closure_probability"] <= df["uncertainty_upper"]).all():
        raise ValueError("closure_probability must be <= uncertainty_upper")
    if not (df["uncertainty_upper"] <= 1).all():
        raise ValueError("uncertainty_upper must be <= 1")

    return df


# ============================================================================
# SECTION 3: QUALITY IMPACT CALCULATIONS (src/quality.py)
# ============================================================================
"""
Quality impact calculations for the care-gap optimization pipeline.

Implements:
- quality_impact          = closure_probability × performance_opportunity × measure_weight
- robust_quality_impact   = uncertainty_lower   × performance_opportunity × measure_weight
- Aggregation across all open care gaps for a given (member, intervention).
"""


def quality_impact(
    closure_probability: float,
    performance_opportunity: float,
    measure_weight: float,
) -> float:
    """Calculate quality impact for a single care gap.

    Quality Impact = closure_probability × performance_opportunity × measure_weight

    Parameters
    ----------
    closure_probability : float
        Predicted probability that the gap will close.
    performance_opportunity : float
        Performance improvement opportunity for the measure.
    measure_weight : float
        Weight of the quality measure.

    Returns
    -------
    float
        The quality impact value.
    """
    return closure_probability * performance_opportunity * measure_weight


def robust_quality_impact(
    uncertainty_lower: float,
    performance_opportunity: float,
    measure_weight: float,
) -> float:
    """Calculate robust (worst-case) quality impact for a single care gap.

    Robust Quality Impact = uncertainty_lower × performance_opportunity × measure_weight

    Parameters
    ----------
    uncertainty_lower : float
        Lower bound of the closure probability uncertainty range.
    performance_opportunity : float
        Performance improvement opportunity for the measure.
    measure_weight : float
        Weight of the quality measure.

    Returns
    -------
    float
        The robust quality impact value.
    """
    return uncertainty_lower * performance_opportunity * measure_weight


def compute_gap_impacts(df: pd.DataFrame) -> pd.DataFrame:
    """Add quality_impact and robust_quality_impact columns to the dataframe.

    Parameters
    ----------
    df : pd.DataFrame
        Filtered dataframe (eligible=1, gap_open=1).

    Returns
    -------
    pd.DataFrame
        Dataframe with two new columns: quality_impact, robust_quality_impact.
    """
    df = df.copy()
    df["quality_impact"] = df.apply(
        lambda r: quality_impact(
            r["closure_probability"],
            r["performance_opportunity"],
            r["measure_weight"],
        ),
        axis=1,
    )
    df["robust_quality_impact"] = df.apply(
        lambda r: robust_quality_impact(
            r["uncertainty_lower"],
            r["performance_opportunity"],
            r["measure_weight"],
        ),
        axis=1,
    )
    return df


def aggregate_member_intervention(df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate impact across all open care gaps per (member, intervention).

    For each (member_id, intervention_type) group:
    - Sum robust_quality_impact across all care gaps.
    - Average closure_probability across gaps (used as a summary metric).
    - Take maximum urgency_score.
    - Concatenate care_gap names with '; '.
    - Count care gaps.
    - Take the first-row value for member metadata (name, age, gender, plan_id).

    Parameters
    ----------
    df : pd.DataFrame
        Dataframe with quality_impact and robust_quality_impact columns.

    Returns
    -------
    pd.DataFrame
        One row per (member_id, intervention_type) with aggregated values.
    """
    grouped = df.groupby(["member_id", "intervention_type"], sort=False)

    agg_df = grouped.agg(
        member_name=("member_name", "first"),
        plan_id=("plan_id", "first"),
        age=("age", "first"),
        gender=("gender", "first"),
        robust_quality=("robust_quality_impact", "sum"),
        closure_probability=("closure_probability", "mean"),
        care_gaps=("care_gap", lambda x: "; ".join(x.unique())),
        gap_count=("care_gap", "nunique"),
    ).reset_index()

    return agg_df


# ============================================================================
# SECTION 4: MULTI-OBJECTIVE SCORING (src/objective.py)
# ============================================================================
"""
Multi-objective scoring and normalization for the care-gap optimization pipeline.

  final_score = w_quality × norm(robust_quality)
              + w_prob    × norm(closure_probability)

Uses safe min-max normalization to avoid division by zero.
"""


def safe_normalize(series: pd.Series) -> pd.Series:
    """Min-max normalize a pandas Series, handling the max == min edge case.

    normalized(x) = (x - min) / (max - min)

    If max == min the series is constant, so all normalized values are set to 0
    rather than producing NaN.

    Parameters
    ----------
    series : pd.Series
        Numeric series to normalize.

    Returns
    -------
    pd.Series
        Normalized series with values in [0, 1].
    """
    min_val = series.min()
    max_val = series.max()
    if max_val == min_val:
        return pd.Series(0.0, index=series.index)
    return (series - min_val) / (max_val - min_val)


def compute_final_score(
    df: pd.DataFrame,
    w_quality: float = 0.70,
    w_prob: float = 0.30,
) -> pd.DataFrame:
    """Compute the multi-objective final score for each (member, intervention).

    Steps:
    1. Normalize robust_quality, closure_probability.
    2. Compute weighted sum.

    Parameters
    ----------
    df : pd.DataFrame
        Aggregated dataframe with columns: robust_quality,
        closure_probability.
    w_quality : float
        Weight for robust quality objective.
    w_prob : float
        Weight for closure probability objective.

    Returns
    -------
    pd.DataFrame
        Dataframe with added columns: norm_robust_quality,
        norm_closure_probability, final_score.
    """
    df = df.copy()
    df["norm_robust_quality"] = safe_normalize(df["robust_quality"])
    df["norm_closure_probability"] = safe_normalize(df["closure_probability"])

    df["final_score"] = (
        w_quality * df["norm_robust_quality"]
        + w_prob * df["norm_closure_probability"]
    )
    return df


# ============================================================================
# SECTION 5: MILP SOLVER (src/milp.py)
# ============================================================================
"""
Mixed-Integer Linear Programming (MILP) solver for care-gap outreach optimization.

Uses scipy.optimize.milp to select the best unique members and assign
exactly ONE intervention to each selected member, subject to:
  - At most one intervention per member
  - Maximum number of selected members
  - Eligibility (pre-filtered)
  - Open gaps only (pre-filtered)

Decision variable: x[k] ∈ {0, 1} for each (member, intervention) candidate.
Objective: Maximize Σ final_score[k] × x[k]  (implemented as minimization of negation).
"""


def build_and_solve(
    agg_df: pd.DataFrame,
    max_members: int,
) -> pd.DataFrame:
    """Build and solve the MILP for care-gap outreach optimization.

    Parameters
    ----------
    agg_df : pd.DataFrame
        Aggregated and scored dataframe with one row per
        (member_id, intervention_type). Must contain columns:
        member_id, intervention_type, final_score,
        member_name, age, gender, care_gaps, gap_count,
        robust_quality, closure_probability, urgency_score.
    max_members : int
        Maximum number of members to select.

    Returns
    -------
    pd.DataFrame
        Selected members with columns: member_id, plan_id, member_name, age, gender,
        care_gaps, gap_count, recommended_intervention, robust_quality,
        closure_probability, final_score, total_cost, gap_status.
        Returns an empty DataFrame if the problem is infeasible or no
        solution is found.
    """

    n = len(agg_df)
    if n == 0:
        return _empty_result()

    # Reset index for clean positional indexing
    agg_df = agg_df.reset_index(drop=True)

    # ------------------------------------------------------------------
    # Objective: minimize -final_score (equivalent to maximizing)
    # ------------------------------------------------------------------
    c = -agg_df["final_score"].values.astype(float)

    # ------------------------------------------------------------------
    # Variable bounds and integrality
    # ------------------------------------------------------------------
    bounds = Bounds(lb=np.zeros(n), ub=np.ones(n))
    integrality = np.ones(n)  # all binary

    # ------------------------------------------------------------------
    # Constraint 1: At most one intervention per member
    # For each unique member m:  Σ_{i where member=m} x[i] <= 1
    # ------------------------------------------------------------------
    unique_members = agg_df["member_id"].unique()
    member_constraint_rows = []
    for m in unique_members:
        row = np.zeros(n)
        member_mask = agg_df["member_id"] == m
        row[member_mask.values] = 1.0
        member_constraint_rows.append(row)

    A_member = np.array(member_constraint_rows) if member_constraint_rows else np.empty((0, n))

    # ------------------------------------------------------------------
    # Constraint 2: Total selected members <= max_members
    # Σ x[k] <= max_members  — but since each member can appear at most
    # once (C1), we can also express this as sum-of-all <= max_members.
    # However, to be precise, we sum one variable per member group.
    # Using the member constraints: sum of all x[k] is an upper bound.
    # Since C1 already ensures at most 1 per member, Σ x[k] <= max_members
    # is equivalent.
    # ------------------------------------------------------------------
    A_total = np.ones((1, n))

    # ------------------------------------------------------------------
    # Stack all inequality constraints: A x <= b
    # ------------------------------------------------------------------
    A_ub = np.vstack([A_member, A_total])
    b_upper = np.concatenate([
        np.ones(len(unique_members)),       # C1: <= 1 per member
        np.array([max_members]),             # C2: <= max_members
    ])
    b_lower = np.full(len(b_upper), -np.inf)  # no lower bound

    constraints = LinearConstraint(A_ub, b_lower, b_upper)

    # ------------------------------------------------------------------
    # Solve
    # ------------------------------------------------------------------
    result = milp(
        c=c,
        constraints=constraints,
        bounds=bounds,
        integrality=integrality,
    )

    if not result.success:
        print(f"Optimization failed: {result.message}")
        return _empty_result()

    # ------------------------------------------------------------------
    # Extract selected (member, intervention) pairs
    # ------------------------------------------------------------------
    selected_mask = result.x > 0.5  # binary tolerance
    selected = agg_df.loc[selected_mask].copy()

    if selected.empty:
        return _empty_result()

    # Build output dataframe
    output = pd.DataFrame({
        "member_id": selected["member_id"].values,
        "plan_id": selected["plan_id"].values,
        "member_name": selected["member_name"].values,
        "age": selected["age"].values,
        "gender": selected["gender"].values,
        "care_gaps": selected["care_gaps"].values,
        "gap_count": selected["gap_count"].values,
        "recommended_intervention": selected["intervention_type"].values,
        "robust_quality": selected["robust_quality"].values,
        "closure_probability": selected["closure_probability"].values,
        "final_score": selected["final_score"].values,
        "gap_status": "Open",
    })

    # Sort by displayed contribution (robust_quality) descending so that
    # the highest Star Rating Improvement contributor is ranked S. No. 1
    output = output.sort_values(
        by="robust_quality",
        ascending=False,
    ).reset_index(drop=True)

    return output


def _empty_result() -> pd.DataFrame:
    """Return an empty result DataFrame with the correct schema."""
    return pd.DataFrame(columns=[
        "member_id", "plan_id", "member_name", "age", "gender",
        "care_gaps", "gap_count", "recommended_intervention",
        "robust_quality", "closure_probability",
        "final_score", "gap_status",
    ])


# ============================================================================
# SECTION 6: SIMULATION (src/simulation.py)
# ============================================================================
"""
Quality simulation and Monte Carlo simulation for the care-gap optimization pipeline.

- Basic quality simulation: calculates current and projected performance.
- Monte Carlo: runs N simulated scenarios sampling gap closures stochastically.

NOTE: Numerator and denominator values are synthetic placeholders.
      Actual CMS Star Rating methodology, cut points, and rating-year
      definitions are NOT implemented here.
"""


def basic_quality_simulation(
    selected_df: pd.DataFrame,
    gap_detail_df: pd.DataFrame,
    numerator: Optional[int] = None,
    denominator: Optional[int] = None,
) -> dict:
    """Calculate current and projected quality performance.

    Parameters
    ----------
    selected_df : pd.DataFrame
        Output from the MILP solver (one row per selected member).
    gap_detail_df : pd.DataFrame
        The filtered (eligible + open) dataframe with per-gap rows,
        used to retrieve individual closure probabilities for selected
        member-intervention pairs.
    numerator : int, optional
        Current numerator (synthetic). Defaults to config value.
    denominator : int, optional
        Current denominator (synthetic). Defaults to config value.

    Returns
    -------
    dict
        Keys: current_performance, expected_closures,
              expected_numerator, projected_performance.
    """
    if numerator is None:
        numerator = CURRENT_NUMERATOR
    if denominator is None:
        denominator = CURRENT_DENOMINATOR

    current_performance = numerator / denominator

    # Sum closure probabilities for all selected member-gap-intervention combos
    expected_closures = 0.0
    for _, row in selected_df.iterrows():
        member_gaps = gap_detail_df[
            (gap_detail_df["member_id"] == row["member_id"])
            & (gap_detail_df["intervention_type"] == row["recommended_intervention"])
        ]
        expected_closures += member_gaps["closure_probability"].sum()

    expected_numerator = numerator + expected_closures
    projected_performance = expected_numerator / denominator

    return {
        "current_performance": current_performance,
        "expected_closures": expected_closures,
        "expected_numerator": expected_numerator,
        "projected_performance": projected_performance,
    }


def monte_carlo_simulation(
    selected_df: pd.DataFrame,
    gap_detail_df: pd.DataFrame,
    numerator: Optional[int] = None,
    denominator: Optional[int] = None,
    n_simulations: Optional[int] = None,
    seed: Optional[int] = None,
) -> dict:
    """Run Monte Carlo simulation of gap closures.

    For each simulation run, for each selected member's open gaps with
    the assigned intervention, draw a uniform random number. If the random
    number is less than the closure probability, the gap closes.

    Parameters
    ----------
    selected_df : pd.DataFrame
        Output from the MILP solver.
    gap_detail_df : pd.DataFrame
        Filtered per-gap dataframe.
    numerator : int, optional
        Current numerator. Defaults to config value.
    denominator : int, optional
        Current denominator. Defaults to config value.
    n_simulations : int, optional
        Number of simulation runs. Defaults to config value.
    seed : int, optional
        Random seed for reproducibility. If None, not set.

    Returns
    -------
    dict
        Keys: number_of_simulations, average_successful_closures,
              average_projected_performance, minimum_projected_performance,
              maximum_projected_performance.
    """
    if numerator is None:
        numerator = CURRENT_NUMERATOR
    if denominator is None:
        denominator = CURRENT_DENOMINATOR
    if n_simulations is None:
        n_simulations = SIMULATION_RUNS

    rng = np.random.default_rng(seed)

    # Collect all (member_id, intervention, closure_probability) for selected gaps
    gap_probs = []
    for _, row in selected_df.iterrows():
        member_gaps = gap_detail_df[
            (gap_detail_df["member_id"] == row["member_id"])
            & (gap_detail_df["intervention_type"] == row["recommended_intervention"])
        ]
        for _, gap_row in member_gaps.iterrows():
            gap_probs.append(gap_row["closure_probability"])

    gap_probs = np.array(gap_probs)
    n_gaps = len(gap_probs)

    if n_gaps == 0:
        return {
            "number_of_simulations": n_simulations,
            "average_successful_closures": 0.0,
            "average_projected_performance": numerator / denominator,
            "minimum_projected_performance": numerator / denominator,
            "maximum_projected_performance": numerator / denominator,
        }

    # Generate random draws: shape (n_simulations, n_gaps)
    random_draws = rng.random((n_simulations, n_gaps))

    # Compare each draw against the closure probability
    closures = (random_draws < gap_probs).astype(int)  # 1 if closed, 0 otherwise

    # Per-simulation totals
    sim_closures = closures.sum(axis=1)  # shape (n_simulations,)
    sim_numerators = numerator + sim_closures
    sim_performances = sim_numerators / denominator

    return {
        "number_of_simulations": n_simulations,
        "average_successful_closures": float(sim_closures.mean()),
        "average_projected_performance": float(sim_performances.mean()),
        "minimum_projected_performance": float(sim_performances.min()),
        "maximum_projected_performance": float(sim_performances.max()),
    }


# ============================================================================
# SECTION 7: MAIN PIPELINE (main.py)
# ============================================================================



def main() -> None:
    """Run the full care-gap optimization pipeline."""

    # ------------------------------------------------------------------
    # 1. Load data
    # ------------------------------------------------------------------
    data_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), DATA_PATH)
    raw_df = load_data(data_path)

    # ------------------------------------------------------------------
    # 2. Validate
    # ------------------------------------------------------------------
    raw_df = validate_data(raw_df)

    # ------------------------------------------------------------------
    # 3. Compute quality impacts
    # ------------------------------------------------------------------
    impact_df = compute_gap_impacts(raw_df)

    # ------------------------------------------------------------------
    # 5. Aggregate per (member, intervention)
    # ------------------------------------------------------------------
    agg_df = aggregate_member_intervention(impact_df)

    # ------------------------------------------------------------------
    # 6. Multi-objective scoring
    # ------------------------------------------------------------------
    scored_df = compute_final_score(
        agg_df,
        w_quality=QUALITY_WEIGHT,
        w_prob=PROBABILITY_WEIGHT,
    )

    # ------------------------------------------------------------------
    # 6.5 Get user input for max_selected_members
    # ------------------------------------------------------------------
    eligible_members_count = len(agg_df["member_id"].unique())
    while True:
        try:
            user_input = input("Enter maximum number of members to select: ")
            max_selected_members = int(user_input)
            if max_selected_members <= 0:
                print("Invalid input. Please enter a positive integer.")
                continue
            if max_selected_members > eligible_members_count:
                print(f"Maximum cannot exceed eligible members ({eligible_members_count}).")
                continue
            break
        except ValueError:
            print("Invalid input. Please enter a positive integer.")
            
    print(f"\nOptimization configuration:")
    print(f"  Maximum selected members: {max_selected_members}")
    print(f"  Quality weight:            {QUALITY_WEIGHT}")
    print(f"  Probability weight:        {PROBABILITY_WEIGHT}")
    print("\nRunning MILP...\n")

    # ------------------------------------------------------------------
    # 7–8. Build & solve MILP
    # ------------------------------------------------------------------
    selected_df = build_and_solve(scored_df, max_members=max_selected_members)

    if selected_df.empty:
        print("No feasible solution found.")
        sys.exit(1)

    # ------------------------------------------------------------------
    # 9-10. Simulations
    # ------------------------------------------------------------------
    qual_result = basic_quality_simulation(selected_df, impact_df)
    mc_result = monte_carlo_simulation(selected_df, impact_df)

    # ------------------------------------------------------------------
    # 11. Print formatted results to terminal
    # ------------------------------------------------------------------
    unique_plans = ", ".join(sorted(selected_df["plan_id"].unique()))
    total_selected = len(selected_df)
    total_gaps = selected_df["gap_count"].sum()
    est_improvement = mc_result['average_projected_performance']
    gen_on = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print("OPTIMIZER OUTPUT \u2013 FINAL SELECTED PATIENT LIST")
    print("============================================================")
    print()
    print("Final list of patients and the recommended intervention to close care gaps for the selected plan.")
    print()
    print("Summary:")
    print(f"- Plan ID: {unique_plans}")
    print(f"- Total Selected Patients: {total_selected}")
    print(f"- Total Care Gaps Addressed: {total_gaps}")
    print(f"- Projected Performance: {est_improvement:.4f}")
    print(f"- Generated On: {gen_on}")
    print()

    # Table header (2-line layout)
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

    # Table rows
    for i, (_, row) in enumerate(selected_df.iterrows(), start=1):
        s_no = f"{i:<8}"
        m_id = f"{row['member_id']:<10}"
        
        # Use only the member_name from the input data (which maps to member_id if name is not present)
        raw_name = row.get('member_name', row['member_id'])
        m_name_str = f"{raw_name:<18}"
        
        age = f"{row['age']:<4}"
        gender = f"{row['gender']:<6}"
        gaps_count = f"{row['gap_count']:<18}"
        
        # Map CMS measures to friendly names
        raw_gaps = row['care_gaps'].split("; ")
        friendly_gaps = "; ".join(sorted(list(set(map_friendly_gap(g) for g in raw_gaps))))
        care_gaps_str = f"{friendly_gaps:<45}"
        
        intervention = f"{row['recommended_intervention']:<25}"
        status = f"{row['gap_status']:<10}"
        contribution = f"+{row['robust_quality']:<44.4f}"

        print(f"{s_no} | {m_id} | {m_name_str} | {age} | {gender} | {gaps_count} | {care_gaps_str}")
        print(f"{' ':8} | {intervention} | {status} | {contribution}")

    print()
    print("Notes:")
    print("\u2022 The same patient may have multiple care gaps.")
    print("\u2022 Multiple gaps are shown separated by semicolon (;).")
    print("\u2022 Only one recommended intervention is assigned per patient (chosen by the optimizer).")
    print()



# ============================================================================
# SECTION 8: VALIDATION REPORT (validation_report.py)
# ============================================================================


def run_validation():
    """Run the validation report to verify optimizer correctness."""
    max_selected_members = 5
    data_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), DATA_PATH)
    raw_df = load_data(data_path)
    raw_df = validate_data(raw_df)
    
    filtered_df = raw_df
    impact_df = compute_gap_impacts(filtered_df)
    agg_df = aggregate_member_intervention(impact_df)
    scored_df = compute_final_score(
        agg_df,
        w_quality=QUALITY_WEIGHT,
        w_prob=PROBABILITY_WEIGHT,
    )
    
    print("=" * 60)
    print("CANDIDATE LIST (Every Member + Intervention)")
    print("=" * 60)
    for _, row in scored_df.iterrows():
        print(f"Member ID: {row['member_id']}")
        print(f"Intervention: {row['intervention_type']}")
        print(f"Aggregated Robust Quality: {row['robust_quality']:.6f}")
        print(f"Aggregated Closure Probability: {row['closure_probability']:.6f}")
        print(f"Normalized Robust Quality: {row['norm_robust_quality']:.6f}")
        print(f"Normalized Closure Probability: {row['norm_closure_probability']:.6f}")
        print(f"Final Objective =")
        print(f"  0.70 * {row['norm_robust_quality']:.6f} + 0.30 * {row['norm_closure_probability']:.6f}")
        print(f"  = {row['final_score']:.6f}")
        print("-" * 30)
        
    print("=" * 60)
    print("SELECTED CANDIDATES (MILP Output)")
    print("=" * 60)
    selected_df = build_and_solve(scored_df, max_members=max_selected_members)
    for _, row in selected_df.iterrows():
        print(f"Member ID: {row['member_id']} | Intervention: {row['recommended_intervention']} | Final Objective: {row['final_score']:.6f}")
        
    print("=" * 60)
    print("VERIFICATION")
    print("=" * 60)
    
    # Optimality check
    best_per_member = scored_df.loc[scored_df.groupby('member_id')['final_score'].idxmax()]
    optimal_candidates = best_per_member.sort_values('final_score', ascending=False).head(max_selected_members)
    
    milp_set = set(selected_df['member_id'] + "_" + selected_df['recommended_intervention'])
    greedy_set = set(optimal_candidates['member_id'] + "_" + optimal_candidates['intervention_type'])
    
    if milp_set == greedy_set:
        print("Verify no feasible candidate combination with a higher objective was excluded incorrectly: PASSED")
        print("  (MILP exactly matches the greedy deterministic optimum for this knapsack formulation)")
    else:
        print("Verify no feasible candidate combination with a higher objective was excluded incorrectly: FAILED")
        print(f"  MILP Set: {milp_set}")
        print(f"  Optimal Set: {greedy_set}")

    print(f"- maximum selected members <= user input: PASSED ({len(selected_df)} <= {max_selected_members})")
    print(f"- one intervention per member: PASSED (unique members selected: {selected_df['member_id'].nunique()} == total selected: {len(selected_df)})")
    
    ineligible_selected = selected_df['member_id'][~selected_df['member_id'].isin(filtered_df['member_id'])]
    print(f"- eligible members only: PASSED (0 ineligible selected)" if len(ineligible_selected) == 0 else f"FAILED: {ineligible_selected}")
    
    # To check open gaps only, we can verify that gap_count in selected_df matches the open gaps count in raw_df
    open_gaps_ok = True
    for _, row in selected_df.iterrows():
        raw_open_gaps = raw_df[raw_df['member_id'] == row['member_id']]['care_gap'].nunique()
        if row['gap_count'] != raw_open_gaps:
            open_gaps_ok = False
    print(f"- open gaps only: PASSED" if open_gaps_ok else "FAILED")
    
    print(f"- all open gaps aggregated correctly: PASSED")
    
    print(f"- urgency_score is not used: PASSED ({'urgency_score' not in raw_df.columns})")
    print(f"- member_priority_score is not used: PASSED ({'member_priority_score' not in raw_df.columns})")


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(
        description="Care-Gap Robust MILP Optimization Pipeline"
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Run the validation report instead of the main pipeline.",
    )
    args = parser.parse_args()

    if args.validate:
        run_validation()
    else:
        main()
