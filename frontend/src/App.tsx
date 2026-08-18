import React, { useState, useEffect } from 'react';
import {
  HashRouter as Router,
  Routes,
  Route,
  Link,
  useNavigate,
  useParams,
  useLocation
} from 'react-router-dom';
import {
  Home,
  Activity,
  FileSpreadsheet,
  Users,
  CheckSquare,
  UploadCloud,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Download,
  Search,
  ChevronRight,
  ChevronLeft,
  Menu
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  uploadDataset,
  getPipelineStatus,
  getDashboardData,
  getPlanData,
  listMembers,
  getMemberDetails,
  listMeasures,
  runOptimization
} from './api/client';
import type {
  PipelineJob,
  DashboardMetrics,
  PlanDetails,
  MembersResponse,
  MemberDetails,
  CMSMeasuresResponse,
  OptimizationResponse
} from './api/client';
import logoImg from '../Metric shift logo.png';

// Global state for active Job ID (stored in localStorage)
const getStoredJobId = () => localStorage.getItem('ma_star_job_id') || '';
const setStoredJobId = (jobId: string) => {
  if (jobId) {
    localStorage.setItem('ma_star_job_id', jobId);
  } else {
    localStorage.removeItem('ma_star_job_id');
  }
};

// --- HELPER COMPONENT: STAR RATING ---
const StarRating: React.FC<{ rating: number }> = ({ rating }) => {
  const stars = [1, 2, 3, 4, 5];

  return (
    <div className="stars" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }} title={`Rating: ${rating}`}>
      {stars.map((starIndex) => {
        const fillPercent = Math.max(0, Math.min(100, (rating - (starIndex - 1)) * 100));
        const gradientId = `star-grad-${starIndex}-${Math.round(rating * 10)}`;

        return (
          <svg key={starIndex} width="16" height="16" viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset={`${fillPercent}%`} stopColor="#f59e0b" />
                <stop offset={`${fillPercent}%`} stopColor="#cbd5e1" />
              </linearGradient>
            </defs>
            <path
              fill={`url(#${gradientId})`}
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            />
          </svg>
        );
      })}
    </div>
  );
};

// --- GLOBAL SIDEBAR COMPONENT ---
interface SidebarProps {
  activeJobId: string;
  collapsed: boolean;
}

const NavigationSidebar: React.FC<SidebarProps> = ({ activeJobId, collapsed }) => {
  const location = useLocation();
  const path = location.pathname;

  const menuItems = [
    { name: 'Home', path: '/dashboard', icon: Home, disabled: !activeJobId },
    { name: 'Optimization', path: '/optimization', icon: Activity, disabled: !activeJobId },
    { name: 'Plans', path: '/plans', icon: FileSpreadsheet, disabled: !activeJobId },
    { name: 'Members', path: '/members', icon: Users, disabled: !activeJobId },
    { name: 'CMS Measure', path: '/cms-measures', icon: CheckSquare, disabled: !activeJobId }
  ];

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo" style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '10px',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          border: '1.5px solid rgba(255, 255, 255, 0.15)',
          flexShrink: 0
        }}>
          <img 
            src={logoImg} 
            alt="Metric Shift" 
            style={{ 
              height: '100%', 
              width: 'auto', 
              objectFit: 'cover', 
              objectPosition: 'left',
              transform: 'scale(1.4) translateX(2px)'
            }} 
          />
        </div>
        <div>
          <span className="logo-text" style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', display: 'block', lineHeight: 1.2 }}>
            Metric Shift
          </span>
          <span className="logo-sub" style={{ fontSize: '9px', opacity: 0.8, display: 'block', marginTop: '2px', lineHeight: 1.2, color: '#00e5ff' }}>
            Care Gap Detection and<br />.Star Rating Simulator.
          </span>
        </div>
      </div>
      <ul className="sidebar-menu">
        {menuItems.map((item) => {
          const isActive = path === item.path || (item.path !== '/' && path.startsWith(item.path));
          return (
            <li
              key={item.name}
              className={`sidebar-item ${isActive ? 'active' : ''} ${item.disabled ? 'disabled-link' : ''}`}
            >
              {item.disabled ? (
                <a style={{ opacity: 0.4, cursor: 'not-allowed' }} title="Please upload an Excel dataset first">
                  <item.icon size={18} />
                  <span>{item.name}</span>
                </a>
              ) : (
                <Link to={item.path}>
                  <item.icon size={18} />
                  <span>{item.name}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
};

// --- GLOBAL HEADER COMPONENT ---
interface HeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: string[];
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (c: boolean) => void;
}

const NavigationHeader: React.FC<HeaderProps> = ({
  title,
  subtitle,
  breadcrumbs = [],
  sidebarCollapsed,
  setSidebarCollapsed
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchVal, setSearchVal] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchVal.trim()) {
      navigate(`/members?search=${encodeURIComponent(searchVal.trim())}`);
    }
  };

  const triggerUploadClick = () => {
    document.getElementById('global-file-upload-input')?.click();
  };

  const isHomePage = location.pathname === '/' || location.pathname === '/dashboard';
  const showSearch = location.pathname.startsWith('/members') || location.pathname.startsWith('/optimization');

  return (
    <header className="header">
      <div className="header-left">
        <button 
          className="header-btn menu-toggle" 
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          style={{ display: 'flex', marginRight: '12px' }}
          title="Toggle Navigation Sidebar"
        >
          <Menu size={20} />
        </button>
        <div className="header-title-container">
          {breadcrumbs.length > 0 && (
            <div className="breadcrumbs">
              {breadcrumbs.map((bc, idx) => (
                <React.Fragment key={idx}>
                  <span>{bc}</span>
                  {idx < breadcrumbs.length - 1 && <span className="breadcrumbs-separator">&gt;</span>}
                </React.Fragment>
              ))}
            </div>
          )}
          <h1 className="header-title" style={{ fontSize: '20px', margin: 0, lineHeight: 1.2 }}>
            {title}
          </h1>
          {subtitle && <span className="header-subtitle" style={{ marginTop: '2px' }}>{subtitle}</span>}
        </div>
      </div>
      <div className="header-right">
        {isHomePage && (
          <button 
            className="btn btn-primary" 
            onClick={triggerUploadClick}
            style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <UploadCloud size={14} />
            <span>Upload Dataset</span>
          </button>
        )}
        {showSearch && (
          <form onSubmit={handleSearch} className="global-search">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search member, plan, measure..."
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
            />
          </form>
        )}
        <div className="profile-area">
          <div className="profile-info">
            <span className="profile-name">Admin User</span>
            <span className="profile-role">Administrator</span>
          </div>
          <div className="avatar">AD</div>
        </div>
      </div>
    </header>
  );
};

// --- UPLOAD PAGE ---
interface UploadPageProps {
  onUploadSuccess: (jobId: string) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (c: boolean) => void;
}

const UploadPage: React.FC<UploadPageProps> = ({ onUploadSuccess, sidebarCollapsed, setSidebarCollapsed }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('Please upload a valid Excel file (.xlsx or .xls).');
        setFile(null);
      }
    }
  };

  const handleUploadSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const response = await uploadDataset(file);
      onUploadSuccess(response.job_id);
      navigate(`/pipeline/${response.job_id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload dataset. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', width: '100%' }}>
      <NavigationHeader 
        title="Upload Dataset" 
        subtitle="Import members data to begin care gap optimization" 
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
      />
      <div className="card" style={{ marginTop: '24px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Excel Import Engine</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px' }}>
          Upload your Excel dataset containing Medicare Advantage plans, CMS measures, member demographics, and history records to launch the processing pipeline.
        </p>

        <div
          className="upload-dropzone"
          onClick={() => document.getElementById('file-upload-input-page')?.click()}
        >
          <UploadCloud className="upload-icon" />
          <div>
            <p style={{ fontWeight: 600, fontSize: '15px' }}>
              {file ? file.name : 'Click to browse files or drag and drop here'}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              Supports Excel Workbooks (.xlsx, .xls) up to 25MB
            </p>
          </div>
          <input
            id="file-upload-input-page"
            type="file"
            accept=".xlsx, .xls"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {error && (
          <div className="pipeline-stage failed" style={{ marginTop: '20px', gap: '12px' }}>
            <AlertTriangle className="stage-icon failed" />
            <span style={{ fontSize: '14px', color: 'var(--color-danger)' }}>{error}</span>
          </div>
        )}

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          {file && (
            <button className="btn btn-secondary" onClick={() => setFile(null)} disabled={loading}>
              Clear
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleUploadSubmit}
            disabled={!file || loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="stage-icon running" />
                <span>Uploading...</span>
              </>
            ) : (
              <span>Start Pipeline</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- PIPELINE PROCESSING PAGE ---
const PipelinePage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const [jobState, setJobState] = useState<PipelineJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!jobId) return;

    const checkStatus = async () => {
      try {
        const status = await getPipelineStatus(jobId);
        setJobState(status);

        if (status.status === 'completed') {
          setStoredJobId(jobId);
          // Fetch final processed summary data dynamically
          const data = await getDashboardData(jobId);
          setMetrics(data);
        } else if (status.status === 'failed') {
          setError(status.error || 'Execution pipeline failed.');
        }
      } catch (err: any) {
        setError('Error fetching pipeline status.');
      }
    };

    checkStatus();
    const interval = setInterval(() => {
      if (jobState?.status !== 'completed' && jobState?.status !== 'failed') {
        checkStatus();
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [jobId, jobState?.status]);

  const stages = [
    { key: 'upload', label: 'File Upload' },
    { key: 'rules', label: 'Rule-Based Model' },
    { key: 'ml', label: 'ML Model Inference' },
    { key: 'opt', label: 'MILP Optimization' }
  ];

  const getStageStatus = (key: string) => {
    if (!jobState) return 'pending';
    if (key === 'upload') return 'completed';
    
    const stage = jobState.stages[key as keyof typeof jobState.stages];
    return stage?.status || 'pending';
  };

  const getStageMessage = (key: string) => {
    if (!jobState) return 'Waiting';
    if (key === 'upload') return 'File uploaded successfully';
    
    const stage = jobState.stages[key as keyof typeof jobState.stages];
    return stage?.message || 'Waiting';
  };

  return (
    <div className="pipeline-screen card" style={{ maxWidth: '640px', margin: '40px auto' }}>
      <div className="pipeline-header">
        <h2 className="pipeline-title">Processing Your Dataset</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: '4px' }}>
          Job ID: {jobId}
        </p>
      </div>

      <div className="pipeline-stages">
        {stages.map((stage) => {
          const status = getStageStatus(stage.key);
          const message = getStageMessage(stage.key);
          
          return (
            <div key={stage.key} className={`pipeline-stage ${status === 'running' ? 'running' : ''}`}>
              <div className={`stage-icon ${status}`}>
                {status === 'completed' && <CheckCircle size={16} />}
                {status === 'failed' && <AlertTriangle size={16} />}
                {status === 'running' && <Loader2 size={16} className="stage-icon running" />}
                {status === 'pending' && <span style={{ fontSize: '10px' }}>●</span>}
              </div>
              <div className="stage-info">
                <span className="stage-name">{stage.label}</span>
                <span className="stage-message">{message}</span>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="pipeline-stage failed" style={{ marginTop: '20px', gap: '12px' }}>
          <AlertTriangle className="stage-icon failed" />
          <span style={{ fontSize: '14px', color: 'var(--color-danger)' }}>{error}</span>
        </div>
      )}

      {jobState?.status === 'completed' && metrics && (
        <div className="card" style={{ marginTop: '24px', backgroundColor: 'var(--color-success-light)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '20px' }}>
          <h4 style={{ color: 'var(--color-success)', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={18} />
            <span>Pipeline Completed Successfully!</span>
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px', textAlign: 'left', color: 'var(--color-text-dark)' }}>
            <div><strong>Total Active Plans:</strong> {metrics.summary.total_plans}</div>
            <div><strong>Total Members Processed:</strong> {metrics.summary.total_members.toLocaleString()}</div>
            <div><strong>Open Care Gaps:</strong> {metrics.summary.open_care_gaps.toLocaleString()}</div>
            <div><strong>CMS Quality Measures:</strong> {metrics.summary.cms_measures}</div>
          </div>
        </div>
      )}

      {jobState?.status === 'completed' && (
        <div style={{ marginTop: '32px', textAlign: 'center' }}>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            View Dashboard Results
          </button>
        </div>
      )}

      {jobState?.status === 'failed' && (
        <div style={{ marginTop: '32px', textAlign: 'center' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/upload')}>
            Retry Upload
          </button>
        </div>
      )}
    </div>
  );
};

// --- HOME DASHBOARD ---
interface DashboardProps {
  jobId: string;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (c: boolean) => void;
}

const HomeDashboard: React.FC<DashboardProps> = ({ jobId, sidebarCollapsed, setSidebarCollapsed }) => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [planId, setPlanId] = useState('P001');
  const [loading, setLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(false);

  useEffect(() => {
    const fetchInitialMetrics = async () => {
      setLoading(true);
      try {
        const data = await getDashboardData(jobId, 'P001');
        setMetrics(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialMetrics();
  }, [jobId]);

  const handlePlanChange = async (newPlanId: string) => {
    setPlanId(newPlanId);
    setTrendLoading(true);
    try {
      const data = await getDashboardData(jobId, newPlanId);
      if (metrics) {
        setMetrics({
          ...metrics,
          improvement_trend: data.improvement_trend
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTrendLoading(false);
    }
  };

  if (loading) {
    return <div className="empty-state"><Loader2 className="stage-icon running" /><span>Loading analytics...</span></div>;
  }

  if (!metrics) {
    return <div className="empty-state">No dashboard analytics found.</div>;
  }

  return (
    <div>
      <NavigationHeader 
        title="Home Dashboard" 
        subtitle="Care Gap Detection & Star Rating Simulator" 
        breadcrumbs={['Metric Shift']} 
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
      />

      {/* Title Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-dark)', margin: 0 }}>Clinical Performance Overview</h2>
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="card summary-card">
          <div className="card-icon-container" style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
            <FileSpreadsheet />
          </div>
          <div className="card-info">
            <span className="card-label">Total Plans</span>
            <span className="card-value">{metrics.summary.total_plans}</span>
            <span className="card-subtext">Medicare Advantage Plans</span>
          </div>
        </div>

        <div className="card summary-card">
          <div className="card-icon-container" style={{ backgroundColor: 'var(--color-success-light)', color: 'var(--color-success)' }}>
            <Users />
          </div>
          <div className="card-info">
            <span className="card-label">Total Members</span>
            <span className="card-value">{metrics.summary.total_members.toLocaleString()}</span>
            <span className="card-subtext">Enrolled Members</span>
          </div>
        </div>

        <div className="card summary-card">
          <div className="card-icon-container" style={{ backgroundColor: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>
            <AlertTriangle />
          </div>
          <div className="card-info">
            <span className="card-label">Open Care Gaps</span>
            <span className="card-value">{metrics.summary.open_care_gaps.toLocaleString()}</span>
            <span className="card-subtext">Care Gaps Identified</span>
          </div>
        </div>

        <div className="card summary-card">
          <div className="card-icon-container" style={{ backgroundColor: 'var(--color-purple-light)', color: 'var(--color-purple)' }}>
            <CheckSquare />
          </div>
          <div className="card-info">
            <span className="card-label">CMS Measures</span>
            <span className="card-value">{metrics.summary.cms_measures}</span>
            <span className="card-subtext">Quality Measure Specifications</span>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="dashboard-grid-2">
        <div className="card">
          <h3 className="card-title">Care Gaps by Plan</h3>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.gaps_by_plan}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="plan_id" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="gaps" fill="#8884d8" radius={[4, 4, 0, 0]} label={{ position: 'top' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Plan Performance (Star Rating)</h3>
          <div className="table-container" style={{ border: 'none', marginTop: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Plan ID</th>
                  <th>Plan Name</th>
                  <th>Star Rating</th>
                  <th>Rating Value</th>
                </tr>
              </thead>
              <tbody>
                {metrics.plan_performances.map((perf) => (
                  <tr key={perf.plan_id}>
                    <td style={{ fontWeight: 600 }}>{perf.plan_id}</td>
                    <td>{perf.plan_name}</td>
                    <td><StarRating rating={perf.rating} /></td>
                    <td style={{ fontWeight: 700 }}>{perf.rating.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Plan Trend Graph with Inline Plan Selector */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 className="card-title" style={{ margin: 0 }}>Plan Star Rating Trend</h3>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px', display: 'block' }}>
              Historical and projected Star Rating performance for selected plan
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-dark)' }}>Select Plan:</label>
            <select
              className="form-select"
              style={{ width: '260px', padding: '6px 12px', fontSize: '13px' }}
              value={planId}
              onChange={(e) => handlePlanChange(e.target.value)}
            >
              {metrics.plan_performances.map((p) => (
                <option key={p.plan_id} value={p.plan_id}>
                  {p.plan_id} - {p.plan_name}
                </option>
              ))}
            </select>
            {trendLoading && <Loader2 size={16} className="stage-icon running" />}
          </div>
        </div>

        <div style={{ height: '320px', position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics.improvement_trend} margin={{ top: 25, right: 35, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="colorRating" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e52e8" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#1e52e8" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" />
              <YAxis domain={[2.0, 5.0]} />
              <Tooltip />
              <Area type="monotone" dataKey="rating" stroke="#1e52e8" fillOpacity={1} fill="url(#colorRating)" label={{ position: 'top' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// --- PLANS PAGE ---
interface PageProps {
  jobId: string;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (c: boolean) => void;
}

const PlansPage: React.FC<PageProps> = ({ jobId, sidebarCollapsed, setSidebarCollapsed }) => {
  const [planId, setPlanId] = useState('P001');
  const [data, setData] = useState<PlanDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlanData = async () => {
      setLoading(true);
      try {
        const details = await getPlanData(jobId, planId);
        setData(details);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPlanData();
  }, [jobId, planId]);

  if (loading) {
    return <div className="empty-state"><Loader2 className="stage-icon running" /><span>Loading plan profiles...</span></div>;
  }

  if (!data) {
    return <div className="empty-state">No plan details found.</div>;
  }

  return (
    <div>
      <NavigationHeader 
        title="Plans" 
        subtitle="Detailed quality and enrollment configurations" 
        breadcrumbs={['Home', 'Plans']} 
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
      />

      <div className="card" style={{ marginBottom: '24px', padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Select Plan:</span>
          <select
            className="form-select"
            style={{ width: '240px' }}
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
          >
            <option value="P001">P001 - Chronic Heart Failure Plan</option>
            <option value="P002">P002 - Cardiovascular Disorders Plan</option>
            <option value="P003">P003 - Diabetes Mellitus Plan</option>
            <option value="P004">P004 - Complex CHF Plan</option>
            <option value="P005">P005 - Stroke & Cardio Plan</option>
          </select>
        </div>
      </div>

      <div className="summary-grid">
        <div className="card summary-card">
          <div className="card-icon-container" style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
            <Users />
          </div>
          <div className="card-info">
            <span className="card-label">Total Members</span>
            <span className="card-value">{data.summary.total_members.toLocaleString()}</span>
            <span className="card-subtext">Enrolled Members</span>
          </div>
        </div>

        <div className="card summary-card">
          <div className="card-icon-container" style={{ backgroundColor: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>
            <AlertTriangle />
          </div>
          <div className="card-info">
            <span className="card-label">Open Care Gaps</span>
            <span className="card-value">{data.summary.open_care_gaps.toLocaleString()}</span>
            <span className="card-subtext">Members with Open Gaps</span>
          </div>
        </div>

        <div className="card summary-card">
          <div className="card-icon-container" style={{ backgroundColor: 'var(--color-purple-light)', color: 'var(--color-purple)' }}>
            <CheckSquare />
          </div>
          <div className="card-info">
            <span className="card-label">Care Gaps</span>
            <span className="card-value">{data.summary.total_care_gaps.toLocaleString()}</span>
            <span className="card-subtext">Total Gaps Identified</span>
          </div>
        </div>

        <div className="card summary-card">
          <div className="card-icon-container" style={{ backgroundColor: 'var(--color-success-light)', color: 'var(--color-success)' }}>
            <Activity />
          </div>
          <div className="card-info">
            <span className="card-label">Plan Rating</span>
            <div className="card-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{data.summary.plan_rating.toFixed(1)}</span>
              <StarRating rating={data.summary.plan_rating} />
            </div>
            <span className="card-subtext">Overall Star Rating</span>
          </div>
        </div>
      </div>

      <div className="dashboard-grid-2">
        <div className="card">
          <h3 className="card-title">Care Gaps by Status</h3>
          <div style={{ height: '300px', display: 'flex', justifyContent: 'center' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.gaps_by_status}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="var(--color-danger)" />
                  <Cell fill="var(--color-success)" />
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Care Gaps Resolved Over Time</h3>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.resolved_over_time}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="year" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="resolved" fill="#1e52e8" radius={[4, 4, 0, 0]} label={{ position: 'top' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="dashboard-grid-2" style={{ marginBottom: '24px' }}>
        <div className="card">
          <h3 className="card-title">Star Rating Improvement Over Time</h3>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.improvement_trend}>
                <defs>
                  <linearGradient id="colorRatingPlan" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="year" />
                <YAxis domain={[2.0, 5.0]} />
                <Tooltip />
                <Area type="monotone" dataKey="rating" stroke="#10b981" fillOpacity={1} fill="url(#colorRatingPlan)" label={{ position: 'top' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Plan Details</h3>
          <div className="table-container" style={{ border: 'none', marginTop: 0 }}>
            <table className="data-table">
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>Plan ID</td>
                  <td style={{ fontWeight: 700 }}>{data.details.plan_id}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>Plan Name</td>
                  <td>{data.details.plan_name}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>Contract ID</td>
                  <td>{data.details.contract_id}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>Plan Type</td>
                  <td>{data.details.plan_type}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>County</td>
                  <td>{data.details.county}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>Rating Year</td>
                  <td>{data.details.rating_year}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>Start Date</td>
                  <td>{data.details.start_date}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- MEMBERS PAGE ---
const MembersPage: React.FC<PageProps> = ({ jobId, sidebarCollapsed, setSidebarCollapsed }) => {
  const [data, setData] = useState<MembersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [planId, setPlanId] = useState('');
  const [gender, setGender] = useState('');
  const [search, setSearch] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');

  const loc = useLocation();
  
  const fetchMembers = async (currentPage = 1) => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams(loc.search);
      const searchParam = queryParams.get('search') || search;
      
      const res = await listMembers(jobId, {
        page: currentPage,
        limit: 10,
        plan_id: planId || undefined,
        gender: gender || undefined,
        search: searchParam || undefined,
        min_age: minAge ? parseInt(minAge) : undefined,
        max_age: maxAge ? parseInt(maxAge) : undefined
      });
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const queryParams = new URLSearchParams(loc.search);
    const searchParam = queryParams.get('search');
    if (searchParam) {
      setSearch(searchParam);
    }
    fetchMembers(page);
  }, [jobId, page, loc.search]);

  const handleApplyFilters = () => {
    setPage(1);
    fetchMembers(1);
  };

  const handleClearFilters = () => {
    setPlanId('');
    setGender('');
    setMinAge('');
    setMaxAge('');
    setSearch('');
    setPage(1);
    window.history.pushState({}, '', window.location.pathname);
    
    setTimeout(() => {
      fetchMembers(1);
    }, 100);
  };

  if (loading && !data) {
    return <div className="empty-state"><Loader2 className="stage-icon running" /><span>Loading members...</span></div>;
  }

  return (
    <div>
      <NavigationHeader 
        title="Members" 
        subtitle="Patient demographic and clinical registry" 
        breadcrumbs={['Home', 'Members']} 
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
      />

      {/* Filter panel */}
      <div className="filter-panel">
        <div className="form-group">
          <label className="form-label">Plan ID</label>
          <select className="form-select" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">All Plans</option>
            <option value="P001">P001</option>
            <option value="P002">P002</option>
            <option value="P003">P003</option>
            <option value="P004">P004</option>
            <option value="P005">P005</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Gender</label>
          <select className="form-select" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">All Genders</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Min Age</label>
          <input
            type="number"
            className="form-input"
            placeholder="Min Age"
            value={minAge}
            onChange={(e) => setMinAge(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Max Age</label>
          <input
            type="number"
            className="form-input"
            placeholder="Max Age"
            value={maxAge}
            onChange={(e) => setMaxAge(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Search Name/ID</label>
          <input
            type="text"
            className="form-input"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-actions">
          <button className="btn btn-secondary" onClick={handleClearFilters}>
            Clear
          </button>
          <button className="btn btn-primary" onClick={handleApplyFilters}>
            Apply
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 className="card-title">Member Directory</h3>
        
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="stage-icon running" style={{ margin: '0 auto' }} /></div>
        ) : !data || data.records.length === 0 ? (
          <div className="empty-state">No members matched the criteria.</div>
        ) : (
          <>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Member ID</th>
                    <th>Name</th>
                    <th>DOB</th>
                    <th>Age</th>
                    <th>Gender</th>
                    <th>Condition</th>
                    <th>Health Plan</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((member, index) => (
                    <tr key={`${member.member_id}-${member.plan_id}-${index}`}>
                      <td style={{ fontWeight: 600 }}>{member.member_id}</td>
                      <td style={{ textTransform: 'capitalize' }}>{member.member_name}</td>
                      <td>{member.dob}</td>
                      <td>{member.age}</td>
                      <td>{member.gender}</td>
                      <td>{member.condition}</td>
                      <td><span className="status-badge closed" style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>{member.plan_id}</span></td>
                      <td>
                        <Link to={`/members/${member.member_id}`} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="pagination">
              <button
                className="page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft size={16} />
              </button>
              
              {Array.from({ length: data.pagination.total_pages }, (_, i) => i + 1)
                .slice(Math.max(0, page - 3), Math.min(data.pagination.total_pages, page + 2))
                .map((p) => (
                  <button
                    key={p}
                    className={`page-btn ${p === page ? 'active' : ''}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}

              <button
                className="page-btn"
                onClick={() => setPage((p) => Math.min(data.pagination.total_pages, p + 1))}
                disabled={page === data.pagination.total_pages}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// --- MEMBER DETAILS PAGE ---
const MemberDetailsPage: React.FC<PageProps> = ({ jobId, sidebarCollapsed, setSidebarCollapsed }) => {
  const { memberId } = useParams<{ memberId: string }>();
  const [data, setData] = useState<MemberDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlanForGaps, setSelectedPlanForGaps] = useState<string>('ALL');
  const navigate = useNavigate();

  useEffect(() => {
    if (!memberId) return;
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const details = await getMemberDetails(jobId, memberId);
        setData(details);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [jobId, memberId]);

  if (loading) {
    return <div className="empty-state"><Loader2 className="stage-icon running" /><span>Loading member profile...</span></div>;
  }

  if (!data) {
    return <div className="empty-state">Member profile details not found.</div>;
  }

  const enrolledPlans = data.details.health_plan
    ? data.details.health_plan.split(',').map((p) => p.trim())
    : [];

  const filteredGaps = data.care_gaps.filter((gap) => {
    if (selectedPlanForGaps === 'ALL') return true;
    return !gap.plan_id || gap.plan_id === selectedPlanForGaps;
  });

  return (
    <div>
      <NavigationHeader 
        title="Member Details" 
        subtitle="Clinical and priority care-gap chart" 
        breadcrumbs={['Home', 'Members', 'Member Details']} 
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
      />

      <div style={{ marginBottom: '20px' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/members')}>
          ← Back to Members
        </button>
      </div>

      {/* Main card */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div className="avatar" style={{ width: '64px', height: '64px', fontSize: '24px' }}>
              {data.member_name.split(' ').map((n) => n[0]).join('').toUpperCase()}
            </div>
            <div>
              <h2 style={{ fontSize: '22px', textTransform: 'capitalize', marginBottom: '4px' }}>{data.member_name}</h2>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>ID: {data.member_id}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Overall Priority</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span className={`priority-badge ${data.overall_priority.toLowerCase()}`}>{data.overall_priority}</span>
              <span style={{ fontSize: '18px', fontWeight: 800 }}>{data.priority_score}% score</span>
            </div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '24px 0' }} />

        <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Patient Details</h3>
        <div className="dashboard-grid-2" style={{ gap: '40px' }}>
          <div>
            <table className="data-table" style={{ border: 'none' }}>
              <tbody>
                <tr>
                  <td style={{ border: 'none', padding: '8px 0', color: 'var(--color-text-muted)', fontWeight: 500 }}>Member ID</td>
                  <td style={{ border: 'none', padding: '8px 0', fontWeight: 600 }}>{data.member_id}</td>
                </tr>
                <tr>
                  <td style={{ border: 'none', padding: '8px 0', color: 'var(--color-text-muted)', fontWeight: 500 }}>Health Plan (Enrolled)</td>
                  <td style={{ border: 'none', padding: '8px 0', fontWeight: 600 }}>{data.details.health_plan}</td>
                </tr>
                <tr>
                  <td style={{ border: 'none', padding: '8px 0', color: 'var(--color-text-muted)', fontWeight: 500 }}>Date of Birth</td>
                  <td style={{ border: 'none', padding: '8px 0', fontWeight: 600 }}>{data.details.dob}</td>
                </tr>
                <tr>
                  <td style={{ border: 'none', padding: '8px 0', color: 'var(--color-text-muted)', fontWeight: 500 }}>Age</td>
                  <td style={{ border: 'none', padding: '8px 0', fontWeight: 600 }}>{data.details.age}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <table className="data-table" style={{ border: 'none' }}>
              <tbody>
                <tr>
                  <td style={{ border: 'none', padding: '8px 0', color: 'var(--color-text-muted)', fontWeight: 500 }}>Gender</td>
                  <td style={{ border: 'none', padding: '8px 0', fontWeight: 600 }}>{data.details.gender}</td>
                </tr>
                <tr>
                  <td style={{ border: 'none', padding: '8px 0', color: 'var(--color-text-muted)', fontWeight: 500 }}>Chronic Conditions</td>
                  <td style={{ border: 'none', padding: '8px 0', fontWeight: 600 }}>{data.details.conditions}</td>
                </tr>
                <tr>
                  <td style={{ border: 'none', padding: '8px 0', color: 'var(--color-text-muted)', fontWeight: 500 }}>Enrollment Date</td>
                  <td style={{ border: 'none', padding: '8px 0', fontWeight: 600 }}>{data.details.enrollment_date}</td>
                </tr>
                <tr>
                  <td style={{ border: 'none', padding: '8px 0', color: 'var(--color-text-muted)', fontWeight: 500 }}>Plan Type</td>
                  <td style={{ border: 'none', padding: '8px 0', fontWeight: 600 }}>{data.details.plan_type}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="dashboard-grid-2" style={{ marginBottom: '24px' }}>
        <div className="card">
          <h3 className="card-title">Care Gap Summary</h3>
          <div style={{ display: 'flex', gap: '20px', marginTop: '12px' }}>
            <div className="card" style={{ flex: 1, backgroundColor: 'var(--color-danger-light)', border: '1px solid rgba(239, 68, 68, 0.2)', textAlign: 'center', padding: '16px' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-danger)', fontWeight: 700, textTransform: 'uppercase' }}>Open Care Gaps</span>
              <h4 style={{ fontSize: '32px', color: 'var(--color-danger)', margin: '8px 0' }}>{data.gaps_summary.open_care_gaps}</h4>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>High Priority: {data.gaps_summary.high_priority_gaps}</span>
            </div>
            <div className="card" style={{ flex: 1, backgroundColor: 'var(--color-success-light)', border: '1px solid rgba(16, 185, 129, 0.2)', textAlign: 'center', padding: '16px' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-success)', fontWeight: 700, textTransform: 'uppercase' }}>Closed Care Gaps</span>
              <h4 style={{ fontSize: '32px', color: 'var(--color-success)', margin: '8px 0' }}>{data.gaps_summary.closed_care_gaps}</h4>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Closed This Year</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 className="card-title" style={{ margin: 0 }}>Gaps in Selected Plan</h3>
            {enrolledPlans.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Select Plan:</label>
                <select
                  className="form-select"
                  style={{ width: '130px', padding: '4px 8px', fontSize: '12px' }}
                  value={selectedPlanForGaps}
                  onChange={(e) => setSelectedPlanForGaps(e.target.value)}
                >
                  <option value="ALL">All Plans</option>
                  {enrolledPlans.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="table-container" style={{ border: 'none', marginTop: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Care Gap Name</th>
                  <th>Measure ID</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredGaps.map((gap, index) => (
                  <tr key={index}>
                    <td style={{ fontWeight: 600 }}>{gap.care_gap_name}</td>
                    <td>{gap.measure_id}</td>
                    <td>
                      <span className={`status-badge ${gap.status.toLowerCase()}`}>
                        {gap.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- CMS MEASURES PAGE ---
const CMSMeasuresPage: React.FC<PageProps> = ({ jobId, sidebarCollapsed, setSidebarCollapsed }) => {
  const [data, setData] = useState<CMSMeasuresResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMeasures = async () => {
      setLoading(true);
      try {
        const res = await listMeasures(jobId);
        setData(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMeasures();
  }, [jobId]);

  if (loading) {
    return <div className="empty-state"><Loader2 className="stage-icon running" /><span>Loading measures list...</span></div>;
  }

  if (!data) {
    return <div className="empty-state">CMS measures not found.</div>;
  }

  return (
    <div>
      <NavigationHeader 
        title="CMS Measures" 
        subtitle="Quality specifications registry" 
        breadcrumbs={['Home', 'CMS Measures']} 
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
      />

      <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="card summary-card">
          <div className="card-icon-container" style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
            <CheckSquare />
          </div>
          <div className="card-info">
            <span className="card-label">Total Measures</span>
            <span className="card-value">{data.summary.total_measures}</span>
            <span className="card-subtext">Quality measures specification</span>
          </div>
        </div>

        <div className="card summary-card">
          <div className="card-icon-container" style={{ backgroundColor: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>
            <AlertTriangle />
          </div>
          <div className="card-info">
            <span className="card-label">High Priority Measures</span>
            <span className="card-value">{data.summary.high_priority_measures}</span>
            <span className="card-subtext">Require attention</span>
          </div>
        </div>

        <div className="card summary-card">
          <div className="card-icon-container" style={{ backgroundColor: 'var(--color-purple-light)', color: 'var(--color-purple)' }}>
            <Activity />
          </div>
          <div className="card-info">
            <span className="card-label">Rating Year</span>
            <span className="card-value">{data.summary.rating_year}</span>
            <span className="card-subtext">CMS Evaluation Schedule</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 className="card-title">CMS Quality Measures Registry</h3>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>Part</th>
                <th>Measure ID</th>
                <th>Measure Name</th>
                <th>Measure Type</th>
                <th>Domain</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((measure, index) => (
                <tr key={index}>
                  <td>
                    <span className="status-badge closed" style={{ backgroundColor: measure.part === 'C' ? 'var(--color-primary-light)' : 'var(--color-success-light)', color: measure.part === 'C' ? 'var(--color-primary)' : 'var(--color-success)' }}>
                      {measure.part}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{measure.measure_id}</td>
                  <td>{measure.measure_name}</td>
                  <td>{measure.measure_type}</td>
                  <td>{measure.domain}</td>
                  <td style={{ fontSize: '12px', color: 'var(--color-text-muted)', maxWidth: '300px' }}>
                    {measure.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// --- OPTIMIZATION PAGE ---
const OptimizationPage: React.FC<PageProps> = ({ jobId, sidebarCollapsed, setSidebarCollapsed }) => {
  const [planId, setPlanId] = useState('P001');
  const [maxMembersInput, setMaxMembersInput] = useState<string>('15');
  const [planTotalMembers, setPlanTotalMembers] = useState<number | null>(null);
  const [results, setResults] = useState<OptimizationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlanMembers = async () => {
      try {
        const planDetails = await getPlanData(jobId, planId);
        if (planDetails && planDetails.summary) {
          setPlanTotalMembers(planDetails.summary.total_members);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchPlanMembers();
  }, [jobId, planId]);

  const handleOptimize = async () => {
    const parsedVal = parseInt(maxMembersInput, 10);
    const maxAllowed = planTotalMembers || 10000;
    
    if (isNaN(parsedVal) || parsedVal < 1 || parsedVal > maxAllowed) {
      setError(`Please enter a valid member count between 1 and ${maxAllowed.toLocaleString()}.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await runOptimization(jobId, planId, parsedVal);
      setResults(res);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to execute outreach optimization. Try again.');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadBoth = () => {
    // 1. Trigger Excel download
    const linkExcel = document.createElement('a');
    linkExcel.href = `/api/download/${jobId}/Optimal_Patient_Outreach_Campaign.xlsx`;
    linkExcel.download = 'Optimal_Patient_Outreach_Campaign.xlsx';
    document.body.appendChild(linkExcel);
    linkExcel.click();
    document.body.removeChild(linkExcel);

    // 2. Trigger PDF download
    setTimeout(() => {
      const linkPdf = document.createElement('a');
      linkPdf.href = `/api/download-pdf/${jobId}/Optimal_Patient_Outreach_Campaign.pdf`;
      linkPdf.download = 'Optimal_Patient_Outreach_Campaign.pdf';
      document.body.appendChild(linkPdf);
      linkPdf.click();
      document.body.removeChild(linkPdf);
    }, 400);
  };

  return (
    <div>
      <NavigationHeader 
        title="Outreach Optimization" 
        subtitle="Solve optimal candidate selection using Mixed-Integer Linear Programming" 
        breadcrumbs={['Home', 'Optimization']} 
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
      />

      {/* Control panel */}
      <div className="filter-panel" style={{ gridTemplateColumns: '2fr 1.5fr 1fr' }}>
        <div className="form-group">
          <label className="form-label">Select Plan</label>
          <select className="form-select" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="P001">P001 - Chronic Heart Failure & Diabetes Mellitus Plan</option>
            <option value="P002">P002 - Cardiovascular Disorders & Chronic Heart Failure Plan</option>
            <option value="P003">P003 - Cardiovascular Disorders & Diabetes Mellitus Plan</option>
            <option value="P004">P004 - Complex CHF, Diabetes & Cardiovascular Plan</option>
            <option value="P005">P005 - Cardiovascular Disorders & Stroke Plan</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Member Outreach Budget Limit</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              className="form-input"
              style={{ width: '85px' }}
              value={maxMembersInput}
              min={1}
              max={planTotalMembers || 10000}
              onChange={(e) => setMaxMembersInput(e.target.value)}
            />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-dark)', whiteSpace: 'nowrap' }}>
              / {planTotalMembers ? planTotalMembers.toLocaleString() : '...'} Total Members
            </span>
          </div>
        </div>

        <div className="filter-actions" style={{ width: '100%' }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', height: '42px' }}
            onClick={handleOptimize}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="stage-icon running" />
                <span>Solving MILP...</span>
              </>
            ) : (
              <span>OPTIMIZE</span>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="pipeline-stage failed" style={{ marginBottom: '24px', gap: '12px' }}>
          <AlertTriangle className="stage-icon failed" />
          <span style={{ fontSize: '14px', color: 'var(--color-danger)' }}>{error}</span>
        </div>
      )}

      {results && (
        <>
          {/* Projected Star Rating Impact Card */}
          {results.summary.previous_rating !== undefined && (
            <div className="card" style={{ marginBottom: '24px', backgroundColor: 'var(--bg-card)' }}>
              <h3 className="card-title" style={{ marginBottom: '16px' }}>Projected Star Rating Impact</h3>
              <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                
                {/* Previous Baseline Rating */}
                <div className="card summary-card" style={{ border: '1px solid var(--color-border)' }}>
                  <div className="card-info">
                    <span className="card-label">Previous Plan Rating</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}>
                      <span className="card-value" style={{ fontSize: '24px' }}>
                        {results.summary.previous_rating.toFixed(1)}
                      </span>
                      <StarRating rating={results.summary.previous_rating} />
                    </div>
                    <span className="card-subtext">Baseline Rating</span>
                  </div>
                </div>

                {/* Projected Rating After Outreach */}
                <div className="card summary-card" style={{ border: '1px solid var(--color-success)', backgroundColor: 'var(--color-success-light)' }}>
                  <div className="card-info">
                    <span className="card-label" style={{ color: 'var(--color-success)', fontWeight: 700 }}>Projected Star Rating</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}>
                      <span className="card-value" style={{ fontSize: '24px', color: 'var(--color-success)' }}>
                        {results.summary.projected_rating?.toFixed(1)}
                      </span>
                      <StarRating rating={results.summary.projected_rating || 0} />
                    </div>
                    <span className="card-subtext" style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                      If Selected {results.summary.total_selected} Outreaches Complete
                    </span>
                  </div>
                </div>

                {/* Star Gain & Percent Increase */}
                <div className="card summary-card" style={{ border: '1px solid var(--color-primary-light)' }}>
                  <div className="card-info">
                    <span className="card-label">Star Rating Increase</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '6px 0' }}>
                      <span className="card-value" style={{ fontSize: '24px', color: 'var(--color-primary)' }}>
                        +{results.summary.total_star_gain?.toFixed(2)} Stars
                      </span>
                    </div>
                    <span className="status-badge closed" style={{ display: 'inline-block', width: 'fit-content', backgroundColor: 'var(--color-success-light)', color: 'var(--color-success)', fontWeight: 700 }}>
                      +{results.summary.increase_percentage}% Increase
                    </span>
                  </div>
                </div>

              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Optimal Outreach List</h3>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Selected {results.summary.total_selected} patients addressing {results.summary.total_gaps} gaps.
              </p>
            </div>
            <button 
              onClick={handleDownloadBoth}
              className="btn btn-secondary" 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
            >
              <Download size={16} />
              <span>Download Report (PDF & Excel)</span>
            </button>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>S.No.</th>
                  <th>Member ID</th>
                  <th>Member Name</th>
                  <th>Age</th>
                  <th>Gender</th>
                  <th>Total Gaps</th>
                  <th>Care Gap(s) (Gap Name)</th>
                  <th>Recommended Intervention</th>
                  <th>Gap Status</th>
                  <th>Estimated Star Rating Improvement</th>
                </tr>
              </thead>
              <tbody>
                {results.records.map((rec) => {
                  const intervText = (!rec.recommended_intervention || ['none', 'nan', 'no intervention', 'null', ''].includes(rec.recommended_intervention.toLowerCase()))
                    ? 'No previous intervention - Phone'
                    : rec.recommended_intervention;

                  return (
                    <tr key={rec.s_no}>
                      <td>{rec.s_no}</td>
                      <td style={{ fontWeight: 600 }}>{rec.member_id}</td>
                      <td style={{ textTransform: 'capitalize' }}>{rec.member_name}</td>
                      <td>{rec.age}</td>
                      <td>{rec.gender}</td>
                      <td style={{ fontWeight: 700 }}>{rec.gap_count}</td>
                      <td>{rec.care_gaps}</td>
                      <td>
                        <span className="status-badge closed" style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                          {intervText}
                        </span>
                      </td>
                      <td>
                        <span className="status-badge open">
                          {rec.gap_status}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--color-success)' }}>
                        {rec.contribution}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )}

      {!results && !loading && (
        <div className="card empty-state" style={{ padding: '60px', marginBottom: '24px' }}>
          <Activity className="empty-state-icon" />
          <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-dark)', marginBottom: '8px' }}>Optimization Results Empty</h4>
          <p style={{ maxWidth: '400px', fontSize: '13px' }}>
            Choose a plan and click the Optimize button to run the backend linear solver and select candidate outreaches.
          </p>
        </div>
      )}
    </div>
  );
};

// --- MAIN ROUTER & APP ---
// --- LANDING PAGE COMPONENT ---
const LandingPage: React.FC<{ onOpenDashboard: () => void }> = ({ onOpenDashboard }) => {
  const scrollToSection = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="landing-page">
      <header className="wrap nav">
        <a className="logo" href="#" onClick={(e) => e.preventDefault()} style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
          <img src={logoImg} alt="Metric Shift" style={{ height: '42px', width: 'auto' }} />
          <span style={{ fontSize: '22px', fontWeight: 800, color: '#0B3B3A', letterSpacing: '-0.02em' }}>
            Metric Shift
          </span>
        </a>
        <nav className="menu">
          <a href="#features" onClick={(e) => scrollToSection(e, 'features')}>Features</a>
          <a href="#workflow" onClick={(e) => scrollToSection(e, 'workflow')}>Workflow</a>
          <a href="#audience" onClick={(e) => scrollToSection(e, 'audience')}>Who it's for</a>
        </nav>
        <button className="nav-btn" onClick={onOpenDashboard}>
          Open Dashboard →
        </button>
      </header>

      <main>
        <section className="wrap hero">
          <div className="hero-grid">
            <div>
              <div className="eyebrow">Medicare Advantage Quality Intelligence</div>
              <h1>Turn care gaps into <span>measurable impact.</span></h1>
              <p className="hero-text">
                Metric Shift brings star-rating tracking, care-gap prioritization,
                intervention optimization, and impact simulation into one quality command center.
              </p>
              <div className="actions">
                <button className="btn primary" onClick={onOpenDashboard}>
                  Open the Dashboard
                </button>
                <button className="btn secondary" onClick={(e) => scrollToSection(e, 'features')}>
                  Explore Features
                </button>
              </div>
              <div className="stats">
                <div className="stat"><strong>Real-time</strong><small>Quality monitoring</small></div>
                <div className="stat"><strong>5</strong><small>Total Plans</small></div>
                <div className="stat"><strong>360°</strong><small>Member & measure view</small></div>
              </div>
            </div>

            <div className="preview">
              <div className="preview-top">
                <div className="preview-title">Metric Shift · Quality Command Center</div>
              </div>
              <div className="kpis">
                <div className="kpi"><label>Current Rating</label><strong>3.5 ★</strong></div>
                <div className="kpi"><label>Projected</label><strong className="up">4.0 ★</strong></div>
                <div className="kpi"><label>Priority Gaps</label><strong>248</strong></div>
              </div>
              <div className="chart">
                <div className="bar" style={{ height: '38%' }}></div>
                <div className="bar" style={{ height: '55%' }}></div>
                <div className="bar" style={{ height: '48%' }}></div>
                <div className="bar" style={{ height: '73%' }}></div>
                <div className="bar" style={{ height: '61%' }}></div>
                <div className="bar" style={{ height: '84%' }}></div>
                <div className="bar" style={{ height: '76%' }}></div>
              </div>
              <div className="preview-row">
                <div className="mini-card"><b>Care-gap closure</b>82% <div className="progress"><i style={{ width: '82%' }}></i></div></div>
                <div className="mini-card"><b>Optimization impact</b>+0.5 ★ <div className="progress"><i style={{ width: '76%' }}></i></div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="wrap section" id="features">
          <div className="section-head">
            <div className="eyebrow">Core Features</div>
            <h2>Everything needed to shift the metric</h2>
            <p>From finding the right members to predicting the quality impact, Metric Shift keeps the complete decision flow in one place.</p>
          </div>

          <div className="features">
            <article className="card">
              <div className="icon">▤</div>
              <h3>Star Rating Tracking</h3>
              <p>Monitor measure performance and understand how close each measure is to the next star cut point.</p>
            </article>
            <article className="card">
              <div className="icon">◎</div>
              <h3>Care Gap Prioritization</h3>
              <p>Find open gaps and prioritize members based on where intervention can create the greatest value.</p>
            </article>
            <article className="card">
              <div className="icon">⚙</div>
              <h3>Intervention Optimization</h3>
              <p>Select measures, capacity, and expected closure rates to identify an effective intervention strategy.</p>
            </article>
            <article className="card">
              <div className="icon">↗</div>
              <h3>Impact Simulation</h3>
              <p>Run what-if scenarios and compare current versus projected star-rating outcomes before acting.</p>
            </article>
            <article className="card">
              <div className="icon">♙</div>
              <h3>Member Insights</h3>
              <p>Drill into individual members, care gaps, conditions, outreach information, and intervention history.</p>
            </article>
          </div>
        </section>

        <section className="wrap section" id="workflow">
          <div className="flow-section">
            <div className="section-head">
              <div className="eyebrow">How Metric Shift Works</div>
              <h2>From data to quality improvement</h2>
              <p>A simple workflow that connects measurement, prioritization, optimization, and action.</p>
            </div>
            <div className="flow">
              <div className="step"><div className="step-num">01</div><h3>Track</h3><p>Monitor star measures and current performance.</p></div>
              <div className="step"><div className="step-num">02</div><h3>Identify</h3><p>Find members with actionable care gaps.</p></div>
              <div className="step"><div className="step-num">03</div><h3>Prioritize</h3><p>Rank gaps by potential quality impact.</p></div>
              <div className="step"><div className="step-num">04</div><h3>Optimize</h3><p>Select the best intervention strategy.</p></div>
              <div className="step"><div className="step-num">05</div><h3>Simulate</h3><p>Project the star-rating shift before outreach.</p></div>
            </div>
          </div>
        </section>

        <section className="wrap section" id="audience">
          <div className="section-head">
            <div className="eyebrow">Built For</div>
            <h2>Teams closest to the quality score</h2>
          </div>
          <div className="audience">
            <div className="aud"><div className="icon">◎</div><h3>Program Analysts</h3><p>Monitor measures, contracts, performance, and cut-point proximity.</p></div>
            <div className="aud"><div className="icon">✚</div><h3>Care Management</h3><p>Prioritize members and focus outreach on the gaps that matter most.</p></div>
            <div className="aud"><div className="icon">◫</div><h3>Quality & Analytics</h3><p>Model scenarios, evaluate outcomes, and connect interventions to quality improvement.</p></div>
          </div>
        </section>

        <section className="wrap">
          <div className="cta">
            <div>
              <div className="eyebrow" style={{ color: '#BFE7DF', margin: 0 }}>Ready to move the metric?</div>
              <h2>See where your star rating can shift.</h2>
              <p>Open the command center and explore the full Metric Shift workflow.</p>
            </div>
            <button className="btn primary" onClick={onOpenDashboard}>
              Open Dashboard →
            </button>
          </div>
        </section>
      </main>

      <footer className="wrap">
        <span>© 2026 Metric Shift · Medicare Advantage Quality Intelligence</span>
        <span>Track · Prioritize · Optimize · Simulate</span>
      </footer>
    </div>
  );
};

// --- MAIN ROUTER & APP ---
const AppContent: React.FC = () => {
  const [activeJobId, setActiveJobId] = useState<string>(getStoredJobId());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const location = useLocation();
  const navigate = useNavigate();

  const isLandingPage = location.pathname === '/';

  const handleOpenDashboard = () => {
    if (activeJobId) {
      navigate('/dashboard');
    } else {
      navigate('/upload');
    }
  };

  const handleUploadSuccess = (jobId: string) => {
    setActiveJobId(jobId);
    setStoredJobId(jobId);
  };

  const handleGlobalFileUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const res = await uploadDataset(file);
      handleUploadSuccess(res.job_id);
      navigate(`/pipeline/${res.job_id}`);
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || 'Failed to upload dataset.');
      navigate('/upload');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Hidden global dataset file input */}
      <input
        id="global-file-upload-input"
        type="file"
        accept=".xlsx, .xls"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleGlobalFileUpload(e.target.files[0]);
          }
        }}
      />

      {!isLandingPage && (
        <NavigationSidebar activeJobId={activeJobId} collapsed={sidebarCollapsed} />
      )}
      
      <main className={`main-content ${isLandingPage ? 'landing-fullscreen' : sidebarCollapsed ? 'collapsed' : ''}`}>
        {uploading && (
          <div className="empty-state" style={{ padding: '60px' }}>
            <Loader2 className="stage-icon running" style={{ width: '32px', height: '32px' }} />
            <span style={{ marginTop: '12px', fontWeight: 600 }}>Uploading Excel Dataset...</span>
          </div>
        )}
        
        {uploadError && !uploading && (
          <div className="pipeline-stage failed" style={{ margin: '20px 0', gap: '12px' }}>
            <AlertTriangle className="stage-icon failed" />
            <span style={{ fontSize: '14px', color: 'var(--color-danger)' }}>{uploadError}</span>
          </div>
        )}

        <Routes>
          <Route path="/" element={<LandingPage onOpenDashboard={handleOpenDashboard} />} />
          <Route 
            path="/upload" 
            element={
              <UploadPage 
                onUploadSuccess={handleUploadSuccess} 
                sidebarCollapsed={sidebarCollapsed} 
                setSidebarCollapsed={setSidebarCollapsed} 
              />
            } 
          />
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          
          <Route 
            path="/dashboard" 
            element={
              activeJobId ? (
                <HomeDashboard 
                  jobId={activeJobId} 
                  sidebarCollapsed={sidebarCollapsed} 
                  setSidebarCollapsed={setSidebarCollapsed} 
                />
              ) : (
                <UploadPage 
                  onUploadSuccess={handleUploadSuccess} 
                  sidebarCollapsed={sidebarCollapsed} 
                  setSidebarCollapsed={setSidebarCollapsed} 
                />
              )
            } 
          />
          <Route 
            path="/optimization" 
            element={
              activeJobId ? (
                <OptimizationPage 
                  jobId={activeJobId} 
                  sidebarCollapsed={sidebarCollapsed} 
                  setSidebarCollapsed={setSidebarCollapsed} 
                />
              ) : (
                <UploadPage 
                  onUploadSuccess={handleUploadSuccess} 
                  sidebarCollapsed={sidebarCollapsed} 
                  setSidebarCollapsed={setSidebarCollapsed} 
                />
              )
            } 
          />
          <Route 
            path="/plans" 
            element={
              activeJobId ? (
                <PlansPage 
                  jobId={activeJobId} 
                  sidebarCollapsed={sidebarCollapsed} 
                  setSidebarCollapsed={setSidebarCollapsed} 
                />
              ) : (
                <UploadPage 
                  onUploadSuccess={handleUploadSuccess} 
                  sidebarCollapsed={sidebarCollapsed} 
                  setSidebarCollapsed={setSidebarCollapsed} 
                />
              )
            } 
          />
          <Route 
            path="/members" 
            element={
              activeJobId ? (
                <MembersPage 
                  jobId={activeJobId} 
                  sidebarCollapsed={sidebarCollapsed} 
                  setSidebarCollapsed={setSidebarCollapsed} 
                />
              ) : (
                <UploadPage 
                  onUploadSuccess={handleUploadSuccess} 
                  sidebarCollapsed={sidebarCollapsed} 
                  setSidebarCollapsed={setSidebarCollapsed} 
                />
              )
            } 
          />
          <Route 
            path="/members/:memberId" 
            element={
              activeJobId ? (
                <MemberDetailsPage 
                  jobId={activeJobId} 
                  sidebarCollapsed={sidebarCollapsed} 
                  setSidebarCollapsed={setSidebarCollapsed} 
                />
              ) : (
                <UploadPage 
                  onUploadSuccess={handleUploadSuccess} 
                  sidebarCollapsed={sidebarCollapsed} 
                  setSidebarCollapsed={setSidebarCollapsed} 
                />
              )
            } 
          />
          <Route 
            path="/cms-measures" 
            element={
              activeJobId ? (
                <CMSMeasuresPage 
                  jobId={activeJobId} 
                  sidebarCollapsed={sidebarCollapsed} 
                  setSidebarCollapsed={setSidebarCollapsed} 
                />
              ) : (
                <UploadPage 
                  onUploadSuccess={handleUploadSuccess} 
                  sidebarCollapsed={sidebarCollapsed} 
                  setSidebarCollapsed={setSidebarCollapsed} 
                />
              )
            } 
          />
        </Routes>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App;
