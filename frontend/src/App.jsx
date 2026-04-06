import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  Activity, Server, Clock, GitBranch, Code,
  PlayCircle, Zap, CheckCircle, XCircle, Loader,
  Wifi, WifiOff, TrendingUp, Timer, Rocket
} from 'lucide-react';
import './index.css';

// ─── Socket.IO URL — auto-detect prod vs dev ────────────────────
const SOCKET_URL = import.meta.env.PROD ? '' : 'http://localhost:10000';
const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:10000';

// ─── Relative Time Helper ────────────────────────────────────────
function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString)) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Status Icon Component ───────────────────────────────────────
function StatusIcon({ status }) {
  if (status === 'success') return <CheckCircle size={16} className="status-icon-success" />;
  if (status === 'failed') return <XCircle size={16} className="status-icon-failed" />;
  return <Loader size={16} className="status-icon-pending spin" />;
}

// ─── Toast Component ─────────────────────────────────────────────
function Toast({ toast, onRemove }) {
  return (
    <div className={`toast toast-${toast.type} toast-enter`} onClick={() => onRemove(toast.id)}>
      <StatusIcon status={toast.type} />
      <span>{toast.message}</span>
    </div>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────
function Skeleton({ width, height }) {
  return <div className="skeleton" style={{ width: width || '100%', height: height || '1.2rem' }} />;
}

function StatCardSkeleton() {
  return (
    <div className="glass-card stat-card">
      <Skeleton width="60%" height="1rem" />
      <Skeleton width="40%" height="2.5rem" />
      <Skeleton width="80%" height="0.8rem" />
    </div>
  );
}

function PipelineSkeleton() {
  return (
    <div className="pipeline-item">
      <div className="pipeline-info">
        <Skeleton width="20px" height="20px" />
        <div style={{ flex: 1 }}>
          <Skeleton width="70%" height="1rem" />
          <Skeleton width="40%" height="0.7rem" />
        </div>
      </div>
      <Skeleton width="60px" height="1rem" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ─── MAIN APP ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
function App() {
  const [apiStatus, setApiStatus] = useState(null);
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [triggering, setTriggering] = useState(false);
  const [newIds, setNewIds] = useState(new Set());
  const socketRef = useRef(null);
  const toastIdRef = useRef(0);

  // ─── Toast Helpers ───────────────────────────────────────────
  const addToast = useCallback((message, type = 'success') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ─── Fetch Data ──────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/status`).then(r => r.json()),
      fetch(`${API_BASE}/api/deployments`).then(r => r.json())
    ])
      .then(([statusData, deploymentsData]) => {
        setApiStatus(statusData);
        setDeployments(deploymentsData);
        setLoading(false);
      })
      .catch(err => {
        console.error('API Error:', err);
        setApiStatus({ status: 'error', project: 'Unknown', version: '0.0.0', stats: { totalDeployments: 0, successRate: 0, avgBuildTime: 0, latestCommit: 'N/A' } });
        setLoading(false);
      });
  }, []);

  // ─── Socket.IO Connection ────────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('new_deployment', (deployment) => {
      // Prepend the new deployment and highlight it
      setDeployments(prev => [deployment, ...prev].slice(0, 20));
      setNewIds(prev => new Set(prev).add(deployment.id));
      addToast(
        `${deployment.status === 'success' ? 'Deployed' : 'Failed'}: ${deployment.commitMsg}`,
        deployment.status
      );

      // Re-fetch stats to keep dashboard numbers current
      fetch(`${API_BASE}/api/status`)
        .then(r => r.json())
        .then(data => setApiStatus(data))
        .catch(() => {});

      // Remove highlight after animation
      setTimeout(() => {
        setNewIds(prev => {
          const next = new Set(prev);
          next.delete(deployment.id);
          return next;
        });
      }, 2000);
    });

    return () => socket.disconnect();
  }, [addToast]);

  // ─── Trigger Test Deployment ─────────────────────────────────
  const triggerDeploy = async () => {
    setTriggering(true);
    try {
      await fetch(`${API_BASE}/api/deployments/trigger`, { method: 'POST' });
    } catch (err) {
      addToast('Failed to trigger deployment', 'failed');
    }
    setTriggering(false);
  };

  // ─── Computed Stats ──────────────────────────────────────────
  const stats = apiStatus?.stats || {};

  // ─── RENDER ──────────────────────────────────────────────────
  return (
    <div className="app-container fade-in">
      {/* ── Toast Container ────────────────────────────────────── */}
      <div className="toast-container">
        {toasts.map(t => <Toast key={t.id} toast={t} onRemove={removeToast} />)}
      </div>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="header">
        <div className="logo-container">
          <Activity size={28} />
          Nexus CI/CD
        </div>
        <div className="header-right">
          <div className={`connection-badge ${connected ? 'conn-live' : 'conn-off'}`}>
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {connected ? 'Live' : 'Offline'}
          </div>
          <div className={`status-badge ${apiStatus?.status === 'healthy' ? 'status-healthy' : 'status-error'} fade-in delay-1`}>
            <div className="status-dot"></div>
            {loading ? 'Connecting...' : (apiStatus?.status === 'healthy' ? 'API Connected' : 'API Error')}
          </div>
        </div>
      </header>

      {/* ── Stats Row ──────────────────────────────────────────── */}
      <div className="stats-grid">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <div className="glass-card stat-card fade-in delay-1">
              <div className="card-title"><Rocket size={18} /> Total Deploys</div>
              <div className="card-value">{stats.totalDeployments || 0}</div>
              <div className="card-subtitle">Across all pipelines</div>
            </div>
            <div className="glass-card stat-card fade-in delay-2">
              <div className="card-title"><TrendingUp size={18} /> Success Rate</div>
              <div className="card-value">
                <span className={stats.successRate >= 80 ? 'text-success' : stats.successRate >= 50 ? 'text-warning' : 'text-error'}>
                  {stats.successRate || 0}%
                </span>
              </div>
              <div className="card-subtitle">Pipeline reliability</div>
            </div>
            <div className="glass-card stat-card fade-in delay-3">
              <div className="card-title"><Timer size={18} /> Avg Build</div>
              <div className="card-value">{stats.avgBuildTime || 0}<span className="card-unit">s</span></div>
              <div className="card-subtitle">Mean deployment time</div>
            </div>
            <div className="glass-card stat-card fade-in delay-4">
              <div className="card-title"><Server size={18} /> Environment</div>
              <div className="card-value status-online">{apiStatus?.status === 'healthy' ? 'Online' : 'Down'}</div>
              <div className="card-subtitle">v{apiStatus?.version || '0.0.0'}</div>
            </div>
          </>
        )}
      </div>

      {/* ── Pipeline Feed ──────────────────────────────────────── */}
      <div className="glass-card pipeline-card fade-in delay-3">
        <div className="pipeline-header">
          <div className="card-title" style={{ marginBottom: 0 }}>
            <Activity size={20} />
            Recent Pipelines
          </div>
          <button
            className={`trigger-btn ${triggering ? 'trigger-loading' : ''}`}
            onClick={triggerDeploy}
            disabled={triggering}
            id="trigger-deploy-btn"
          >
            <Zap size={16} />
            {triggering ? 'Deploying...' : 'Trigger Deploy'}
          </button>
        </div>

        <div className="pipeline-list">
          {loading ? (
            <>
              <PipelineSkeleton />
              <PipelineSkeleton />
              <PipelineSkeleton />
              <PipelineSkeleton />
            </>
          ) : deployments.length === 0 ? (
            <div className="pipeline-empty">
              <Rocket size={32} />
              <p>No deployments yet. Trigger one above!</p>
            </div>
          ) : (
            deployments.map(dep => (
              <div
                className={`pipeline-item ${newIds.has(dep.id) ? 'pipeline-new' : ''}`}
                key={dep.id}
              >
                <div className="pipeline-info">
                  <div className={`pipeline-status-icon status-bg-${dep.status}`}>
                    <StatusIcon status={dep.status} />
                  </div>
                  <div className="pipeline-details">
                    <div className="pipeline-name">{dep.commitMsg || 'No commit message'}</div>
                    <div className="pipeline-meta">
                      <span className="pipeline-branch">
                        <GitBranch size={12} />
                        {dep.project?.repository || 'unknown'}
                      </span>
                      <span className="pipeline-time-label">
                        <Clock size={12} />
                        {timeAgo(dep.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="pipeline-right">
                  {dep.duration != null && (
                    <div className="pipeline-duration">
                      <PlayCircle size={14} />
                      {dep.duration}s
                    </div>
                  )}
                  <div className={`pipeline-badge badge-${dep.status}`}>
                    {dep.status}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="footer">
        <span>Nexus CI/CD Dashboard</span>
        <span className="footer-dot">·</span>
        <span>Built with React, Express, Prisma & Socket.IO</span>
      </footer>
    </div>
  );
}

export default App;
