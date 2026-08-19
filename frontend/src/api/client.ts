import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

export interface PipelineStageState {
  status: 'pending' | 'running' | 'completed' | 'failed';
  message: string;
}

export interface PipelineJob {
  status: 'queued' | 'processing_rules' | 'processing_ml' | 'processing_opt' | 'completed' | 'failed';
  error: string | null;
  stages: {
    upload: PipelineStageState;
    rules: PipelineStageState;
    ml: PipelineStageState;
    opt: PipelineStageState;
  };
}

export interface DashboardMetrics {
  summary: {
    total_plans: number;
    total_members: number;
    open_care_gaps: number;
    cms_measures: number;
  };
  gaps_by_plan: { plan_id: string; gaps: number }[];
  plan_performances: { plan_id: string; plan_name: string; rating: number }[];
  improvement_trend: { year: number; rating: number }[];
}

export interface PlanDetails {
  summary: {
    total_members: number;
    open_care_gaps: number;
    total_care_gaps: number;
    plan_rating: number;
  };
  gaps_by_status: { name: string; value: number }[];
  resolved_over_time: { year: number; resolved: number }[];
  improvement_trend: { year: number; rating: number }[];
  details: {
    plan_id: string;
    plan_name: string;
    contract_id: string;
    plan_type: string;
    county: string;
    rating_year: number;
    start_date: string;
  };
}

export interface MemberRecord {
  member_id: string;
  member_name: string;
  dob: string;
  age: number;
  gender: string;
  condition: string;
  plan_id: string;
}

export interface MembersResponse {
  records: MemberRecord[];
  pagination: {
    total_records: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export interface MemberDetails {
  member_id: string;
  member_name: string;
  overall_priority: 'High' | 'Medium' | 'Low';
  priority_score: number;
  details: {
    health_plan: string;
    dob: string;
    age: number;
    gender: string;
    conditions: string;
    address: string;
    phone: string;
    email: string;
    enrollment_date: string;
    plan_type: string;
  };
  gaps_summary: {
    open_care_gaps: number;
    closed_care_gaps: number;
    high_priority_gaps: number;
  };
  care_gaps: {
    care_gap_name: string;
    measure_id: string;
    plan_id?: string;
    status: 'Open' | 'Closed';
  }[];
}

export interface CMSMeasuresResponse {
  summary: {
    total_measures: number;
    high_priority_measures: number;
    rating_year: number;
  };
  records: {
    part: string;
    measure_id: string;
    measure_name: string;
    measure_type: string;
    domain: string;
    measure_id_value: string;
    description: string;
  }[];
}

export interface OptimizationRecord {
  s_no: number;
  member_id: string;
  member_name: string;
  age: number;
  gender: string;
  gap_count: number;
  care_gaps: string;
  recommended_intervention: string;
  gap_status: string;
  contribution: string;
}

export interface OptimizationResponse {
  records: OptimizationRecord[];
  summary: {
    total_selected: number;
    total_gaps: number;
    previous_rating?: number;
    projected_rating?: number;
    total_star_gain?: number;
    increase_percentage?: number;
  };
}

export interface PlanStateDetail {
  plan_id: string;
  plan_name: string;
  members: number;
  care_gaps: number;
  star_rating: number;
}

export interface StateLocationData {
  state_code: string;
  state_name: string;
  total_plans: number;
  total_members: number;
  open_care_gaps: number;
  closed_care_gaps: number;
  average_rating: number;
  resolution_rate: string;
  plans: PlanStateDetail[];
}

export type LocationsResponse = Record<string, StateLocationData>;

// --- API FUNCTIONS ---

export const uploadDataset = async (file: File): Promise<{ job_id: string; status: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<{ job_id: string; status: string }>('/api/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

const resolveJobId = (jobId?: string): string => {
  if (jobId && typeof jobId === 'string' && jobId.trim() && jobId !== 'undefined' && jobId !== 'null') {
    return jobId.trim();
  }
  const stored = localStorage.getItem('ma_star_job_id');
  if (stored && stored.trim()) {
    return stored.trim();
  }
  return 'default';
};

export const getPipelineStatus = async (jobId: string): Promise<PipelineJob> => {
  const validId = resolveJobId(jobId);
  const response = await apiClient.get<PipelineJob>(`/api/pipeline/${validId}`);
  return response.data;
};

export const getDashboardData = async (jobId: string, planId?: string): Promise<DashboardMetrics> => {
  const validId = resolveJobId(jobId);
  const params = planId ? { plan_id: planId } : {};
  const response = await apiClient.get<DashboardMetrics>(`/api/dashboard/${validId}`, { params });
  return response.data;
};

export const getPlanData = async (jobId: string, planId: string): Promise<PlanDetails> => {
  const validId = resolveJobId(jobId);
  const response = await apiClient.get<PlanDetails>(`/api/plans/${validId}/${planId}`);
  return response.data;
};

export const listMembers = async (
  jobId: string,
  params: {
    page: number;
    limit: number;
    search?: string;
    plan_id?: string;
    gender?: string;
    min_age?: number;
    max_age?: number;
  }
): Promise<MembersResponse> => {
  const validId = resolveJobId(jobId);
  const response = await apiClient.get<MembersResponse>(`/api/members/${validId}`, { params });
  return response.data;
};

export const getMemberDetails = async (jobId: string, memberId: string): Promise<MemberDetails> => {
  const validId = resolveJobId(jobId);
  const response = await apiClient.get<MemberDetails>(`/api/members/${validId}/${memberId}`);
  return response.data;
};

export const listMeasures = async (jobId: string): Promise<CMSMeasuresResponse> => {
  const validId = resolveJobId(jobId);
  const response = await apiClient.get<CMSMeasuresResponse>(`/api/measures/${validId}`);
  return response.data;
};

export const runOptimization = async (jobId: string, planId: string, maxMembers: number): Promise<OptimizationResponse> => {
  const validId = resolveJobId(jobId);
  const formData = new URLSearchParams();
  formData.append('plan_id', planId);
  formData.append('max_members', String(maxMembers));
  const response = await apiClient.post<OptimizationResponse>(`/api/optimize/${validId}`, formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return response.data;
};

export const getLocationsData = async (jobId: string): Promise<LocationsResponse> => {
  const validId = resolveJobId(jobId);
  const response = await apiClient.get<LocationsResponse>(`/api/location/${validId}`);
  return response.data;
};

export const getDownloadUrl = (jobId: string): string => {
  const validId = resolveJobId(jobId);
  return `${API_BASE_URL}/api/download/${validId}`;
};
