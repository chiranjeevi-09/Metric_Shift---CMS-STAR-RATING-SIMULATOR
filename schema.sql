-- ============================================================
-- SUPABASE SCHEMA FOR MEDICARE STAR RATING OPTIMIZATION (8 TABLES)
-- Copy and paste this ENTIRE script into Supabase SQL Editor and click RUN
-- ============================================================

-- 1. PLANS
CREATE TABLE IF NOT EXISTS plans (
    plan_id VARCHAR(50) PRIMARY KEY,
    contract_id VARCHAR(50),
    plan_name TEXT,
    organization_name TEXT,
    plan_type VARCHAR(50),
    state VARCHAR(10),
    overall_star_rating NUMERIC(3,2),
    part_c_star_rating NUMERIC(3,2),
    part_d_star_rating NUMERIC(3,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. PLAN_BENEFITS
CREATE TABLE IF NOT EXISTS plan_benefits (
    benefit_id VARCHAR(50) PRIMARY KEY,
    plan_id VARCHAR(50),
    part VARCHAR(10),
    benefit_category TEXT,
    service_name TEXT,
    coverage_status VARCHAR(50),
    frequency_limit TEXT,
    benefit_year INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. MEMBERS
CREATE TABLE IF NOT EXISTS members (
    member_condition_id VARCHAR(50) PRIMARY KEY,
    member_id VARCHAR(50),
    member_name TEXT,
    date_of_birth DATE,
    age INT,
    gender VARCHAR(10),
    condition TEXT,
    condition_code VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. MEMBER_ENROLLMENT
CREATE TABLE IF NOT EXISTS member_enrollment (
    enrollment_id VARCHAR(50) PRIMARY KEY,
    member_id VARCHAR(50),
    plan_id VARCHAR(50),
    enrollment_start_date DATE,
    enrollment_end_date DATE,
    enrollment_status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. MEMBER_HISTORY
CREATE TABLE IF NOT EXISTS member_history (
    history_id VARCHAR(50) PRIMARY KEY,
    member_id VARCHAR(50),
    service_name TEXT,
    test_name TEXT,
    service_date DATE,
    status VARCHAR(50),
    result TEXT,
    event_type VARCHAR(50),
    result_value NUMERIC(10,2),
    result_unit VARCHAR(50),
    intervention_type VARCHAR(50),
    action_date DATE,
    completion_date DATE,
    outcome VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. CMS_MEASURES
CREATE TABLE IF NOT EXISTS cms_measures (
    measure_id VARCHAR(50) PRIMARY KEY,
    official_measure_id VARCHAR(50),
    measure_name TEXT,
    part VARCHAR(10),
    domain TEXT,
    measure_type VARCHAR(50),
    rating_year INT,
    description TEXT,
    eligibility_rule TEXT,
    numerator_definition TEXT,
    denominator_definition TEXT,
    exclusion_rule TEXT,
    weight NUMERIC(5,2),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. PLAN_MEASURE_PERFORMANCE
CREATE TABLE IF NOT EXISTS plan_measure_performance (
    performance_id VARCHAR(50) PRIMARY KEY,
    plan_id VARCHAR(50),
    measure_id VARCHAR(50),
    rating_year INT,
    denominator INT,
    numerator INT,
    performance_value NUMERIC(6,4),
    measure_star NUMERIC(3,2),
    weight NUMERIC(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. PART_D_MEDICATION_HISTORY
CREATE TABLE IF NOT EXISTS part_d_medication_history (
    rx_history_id VARCHAR(50) PRIMARY KEY,
    member_id VARCHAR(50),
    medication_name TEXT,
    ndc_code VARCHAR(50),
    prescription_id VARCHAR(50),
    pharmacy_id VARCHAR(50),
    fill_date DATE,
    days_supply INT,
    quantity_dispensed INT,
    refill_number INT,
    claim_status VARCHAR(50),
    amount_paid NUMERIC(10,2),
    member_copay NUMERIC(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- DISABLE ROW LEVEL SECURITY (RLS) FOR FULL APP API ACCESS
-- ============================================================
ALTER TABLE plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE plan_benefits DISABLE ROW LEVEL SECURITY;
ALTER TABLE members DISABLE ROW LEVEL SECURITY;
ALTER TABLE member_enrollment DISABLE ROW LEVEL SECURITY;
ALTER TABLE member_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE cms_measures DISABLE ROW LEVEL SECURITY;
ALTER TABLE plan_measure_performance DISABLE ROW LEVEL SECURITY;
ALTER TABLE part_d_medication_history DISABLE ROW LEVEL SECURITY;
