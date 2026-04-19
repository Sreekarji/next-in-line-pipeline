import React, { useState, useEffect } from 'react';
import styles from './Dashboard.module.css';

function StepCompany({ onNext, onLogin }) {
  // Provisioning state
  const [vendorName, setVendorName] = useState('');
  const [loadState, setLoadState] = useState(false);
  const [err, setErr] = useState('');
  
  // Login state
  const [loginJobId, setLoginJobId] = useState('');
  const [loginApiKey, setLoginApiKey] = useState('');

  const submitCompany = async (e) => {
    e.preventDefault();
    setLoadState(true); setErr('');
    try {
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: vendorName })
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json();
      onNext({ companyName: vendorName, apiKey: payload.api_key });
    } catch (ex) {
      setErr('Company registration failed. Ensure backend service is active.');
    } finally {
      setLoadState(false);
    }
  };

  return (
    <article className={`${styles['vibrancy-panel']} ${styles['anim-slide']}`} style={{ maxWidth: 500, margin: '2rem auto' }}>
      <h2>Sign Up your Company</h2>
      <p className={styles['input-label']} style={{ marginBottom: '1.5rem' }}>Create your organizational namespace.</p>
      <form onSubmit={submitCompany} className={styles['input-stack']}>
        <label className={styles['input-label']}>Company Identifying Name</label>
        <input className={styles['base-input']} value={vendorName} onChange={e => setVendorName(e.target.value)} required />
        {err && <div className={`${styles['msg-alert']} ${styles['msg-err']}`}>{err}</div>}
        <button className={styles['action-btn']} disabled={loadState} style={{ marginTop: '0.5rem' }}>
          {loadState ? 'Provisioning...' : 'Provision Workspace'}
        </button>
      </form>

      <hr style={{ border: 'none', borderTop: '1px solid var(--panel-border)', margin: '2.5rem 0' }} />
      
      <h2>Returning Admin Login</h2>
      <p className={styles['input-label']} style={{ marginBottom: '1.5rem' }}>Monitor an existing pipeline queue.</p>
      <form onSubmit={(e) => {
        e.preventDefault();
        onLogin({ apiKey: loginApiKey, jobId: loginJobId });
      }} className={styles['input-stack']}>
        <label className={styles['input-label']}>Existing Job ID</label>
        <input className={styles['base-input']} value={loginJobId} onChange={e => setLoginJobId(e.target.value)} required />
        <label className={styles['input-label']} style={{ marginTop: '0.5rem' }}>Admin API Key</label>
        <input className={styles['base-input']} type="password" value={loginApiKey} onChange={e => setLoginApiKey(e.target.value)} required />
        <button className={styles['action-btn']} style={{ marginTop: '0.5rem', background: 'transparent', border: '1px solid var(--primary-accent)' }}>
          Access Workspace
        </button>
      </form>
    </article>
  );
}

function StepJob({ companyName, apiKey, onFinish }) {
  const [title, setTitle] = useState('');
  const [capacity, setCapacity] = useState(5);
  const [loadState, setLoadState] = useState(false);

  const buildJob = async (e) => {
    e.preventDefault();
    setLoadState(true);
    try {
      const resp = await fetch('/api/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ title, capacity })
      });
      const data = await resp.json();
      onFinish({ jobId: data.id });
    } finally {
      setLoadState(false);
    }
  };

  return (
    <article className={`${styles['vibrancy-panel']} ${styles['anim-slide']}`} style={{ maxWidth: 500, margin: '2rem auto' }}>
      <h2>Configure Pipeline</h2>
      <p className={styles['input-label']} style={{ marginBottom: '1.5rem' }}>Set the volume limitations for your new hiring pipeline.</p>
      
      <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: 8, marginBottom: '1.5rem', border: '1px solid var(--primary-accent)' }}>
        <p className={styles['input-label']}>Save this API Key securely:</p>
        <code style={{ color: 'var(--primary-accent)', wordBreak: 'break-all', fontFamily: 'monospace' }}>{apiKey}</code>
      </div>

      <form onSubmit={buildJob} className={styles['input-stack']}>
        <label className={styles['input-label']}>Pipeline Role Title</label>
        <input className={styles['base-input']} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Frontend Associate" required />
        
        <label className={styles['input-label']} style={{ marginTop: '0.5rem' }}>Active Evaluation Capacity</label>
        <input type="number" min="1" className={styles['base-input']} value={capacity} onChange={e => setCapacity(Number(e.target.value))} required />
        
        <button className={styles['action-btn']} disabled={loadState} style={{ marginTop: '0.5rem' }}>
          Deploy Constraints & Launch
        </button>
      </form>
    </article>
  );
}

function SystemInterface({ sessionData, terminateSession }) {
  const [activeTab, setActiveTab] = useState('pipeline');
  const [pipelineState, setPipelineState] = useState(null);
  
  // Test apply state
  const [testForm, setTestForm] = useState({ name: '', email: '' });
  const [applyResp, setApplyResp] = useState(null);

  const pullState = async () => {
    try {
      const res = await fetch(`/api/jobs/${sessionData.jobId}/pipeline`, { headers: { 'x-api-key': sessionData.apiKey }});
      if (res.ok) {
        setPipelineState(await res.json());
      } else if (res.status === 401 || res.status === 404) {
        terminateSession();
      } else {
        setPipelineState({ fetchError: true, status: res.status });
      }
    } catch (e) { 
      console.error('Failed state poll', e); 
      setPipelineState({ fetchError: true, networkError: true });
    }
  };

  useEffect(() => {
    pullState();
    const iv = setInterval(pullState, 15000);
    return () => clearInterval(iv);
  }, []);

  const issueTestApplication = async (e) => {
    e.preventDefault();
    try {
      const req = await fetch(`/api/jobs/${sessionData.jobId}/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(testForm)
      });
      const data = await req.json();
      setApplyResp(data);
      setTestForm({ name: '', email: '' });
      pullState();
    } catch (e) {
      console.error('Failed to submit application test payload:', e);
    }
  };

  const dispatchStatusUpdate = async (id, status) => {
    try {
      await fetch(`/api/applicants/${id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-api-key': sessionData.apiKey },
        body: JSON.stringify({ status })
      });
      pullState();
    } catch (e) {
      console.error('Failed to dispatch status update:', e);
    }
  };

  if (!pipelineState) {
    return (
      <div style={{ textAlign: 'center', marginTop: '3rem' }} className={styles['anim-slide']}>
        <div style={{ marginBottom: '1rem' }}>Warming up pipeline connections...</div>
        <button onClick={terminateSession} className={styles['action-btn']} style={{ background: 'transparent', border: '1px solid var(--panel-border)', color: 'var(--sub-text)' }}>
          Abort Session
        </button>
      </div>
    );
  }

  if (pipelineState.fetchError) {
    return (
      <div style={{ textAlign: 'center', marginTop: '3rem' }} className={styles['anim-slide']}>
        <div className={styles['msg-alert']} style={{ marginBottom: '1rem' }}>
          Connection error to pipeline. The backend may be offline or unreachable.
        </div>
        <button onClick={terminateSession} className={styles['action-btn']} style={{ background: 'transparent', border: '1px solid var(--panel-border)', color: 'var(--sub-text)' }}>
          Abort Session
        </button>
      </div>
    );
  }

  return (
    <div className={styles['anim-slide']}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2>Evaluation Operations</h2>
          <p className={styles['input-label']}>Monitoring traffic for ID: {sessionData.jobId}</p>
        </div>
        <button className={styles['action-btn']} onClick={terminateSession} style={{ background: 'transparent', border: '1px solid var(--panel-border)', color: 'var(--sub-text)' }}>Terminate Link</button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--panel-border)', marginBottom: '2rem' }}>
        <div className={`${styles['nav-item']} ${activeTab === 'pipeline' ? styles['active'] : ''}`} style={{ paddingBottom: '0.5rem', cursor: 'pointer' }} onClick={() => setActiveTab('pipeline')}>Pipeline State</div>
        <div className={`${styles['nav-item']} ${activeTab === 'inject' ? styles['active'] : ''}`} style={{ paddingBottom: '0.5rem', cursor: 'pointer' }} onClick={() => setActiveTab('inject')}>Inject Data</div>
      </div>

      {activeTab === 'pipeline' && (
        <section className={styles['vibrancy-panel']}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--panel-border)' }}>
            <div>
              <p className={styles['input-label']}>Active Capacity Utilization</p>
              <h1 style={{ color: 'var(--primary-accent)' }}>{pipelineState.active.length} / {pipelineState.job.active_capacity}</h1>
            </div>
          </div>
          
          <h3 style={{ marginBottom: '1rem' }}>Active & Pending Segment</h3>
          <div className={styles['data-grid']}>
            {pipelineState.active.length === 0 && pipelineState.pending.length === 0 && (
              <div className={styles['msg-alert']} style={{ background: 'rgba(255,255,255,0.05)' }}>No currently active candidates.</div>
            )}
            
            {pipelineState.active.map(c => (
              <div className={styles['data-row']} key={c.id}>
                <span className={styles['row-pos']}>—</span>
                <div>
                  <div className={styles['row-title']}>{c.name}</div>
                  <div className={styles['row-sub']}>{c.email}</div>
                </div>
                <span className={`${styles['status-pill']} ${styles['pill-active']}`}>ACTIVE</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => dispatchStatusUpdate(c.id, 'HIRED')} style={{ background: 'rgba(16,185,129,0.2)', border: 'none', color: '#10b981', padding: '0.3rem 0.6rem', borderRadius: 6, cursor: 'pointer' }}>Hire</button>
                  <button onClick={() => dispatchStatusUpdate(c.id, 'REJECTED')} style={{ background: 'rgba(239,68,68,0.2)', border: 'none', color: '#ef4444', padding: '0.3rem 0.6rem', borderRadius: 6, cursor: 'pointer' }}>Reject</button>
                </div>
              </div>
            ))}

            {pipelineState.pending.map(c => (
              <div className={styles['data-row']} key={c.id}>
                <span className={styles['row-pos']}>—</span>
                <div>
                  <div className={styles['row-title']}>{c.name}</div>
                  <div className={styles['row-sub']}>{c.email}</div>
                </div>
                <span className={`${styles['status-pill']} ${styles['pill-pending']}`}>PENDING</span>
                <div>Awaiting Ack</div>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: '2.5rem', marginBottom: '1rem' }}>Holding Queue Segment</h3>
          <div className={styles['data-grid']}>
            {pipelineState.waitlist.length === 0 && (
              <div className={styles['msg-alert']} style={{ background: 'rgba(255,255,255,0.05)' }}>The holding queue is empty.</div>
            )}
            {pipelineState.waitlist.map(c => (
              <div className={styles['data-row']} key={c.id}>
                <span className={styles['row-pos']}>#{c.queue_position}</span>
                <div>
                  <div className={styles['row-title']}>{c.name}</div>
                  <div className={styles['row-sub']}>{c.email}</div>
                </div>
                <span className={`${styles['status-pill']} ${styles['pill-waitlist']}`}>WAITLIST</span>
                <span className={styles['row-id']}>{c.id.substring(0,8)}...</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'inject' && (
        <section className={styles['vibrancy-panel']} style={{ maxWidth: 500 }}>
          <h3 style={{ marginBottom: '1.5rem' }}>Simulate Incoming Payload</h3>
          <form onSubmit={issueTestApplication} className={styles['input-stack']}>
            <label className={styles['input-label']}>Candidate Identifier Name</label>
            <input className={styles['base-input']} value={testForm.name} onChange={e => setTestForm({ ...testForm, name: e.target.value })} required />
            <label className={styles['input-label']} style={{ marginTop: '0.5rem' }}>Email Routing Address</label>
            <input type="email" className={styles['base-input']} value={testForm.email} onChange={e => setTestForm({ ...testForm, email: e.target.value })} required />
            <button className={styles['action-btn']} style={{ marginTop: '1rem' }}>Push Application Payload</button>
          </form>

          {applyResp && (
            <div className={`${styles['msg-alert']} ${styles['msg-ok']}`} style={{ marginTop: '1.5rem' }}>
              <strong>Insertion Success!</strong><br />
              Generated Reference Key: <code>{applyResp.applicant.id}</code><br/>
              Assigned State: {applyResp.status}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default function WorkspaceDirector() {
  const [flowPosition, setFlowPosition] = useState('connect');
  const [session, setSession] = useState(null);

  useEffect(() => {
    const mem = localStorage.getItem('__org_session');
    if (mem) {
      try {
        const stored = JSON.parse(mem);
        if (stored.jobId && stored.apiKey) {
          setSession(stored); setFlowPosition('operational'); return;
        }
      } catch (e) {}
    }
    setFlowPosition('company');
  }, []);

  const endSession = () => { localStorage.removeItem('__org_session'); setSession(null); setFlowPosition('company'); };

  if (flowPosition === 'connect') return null;
  if (flowPosition === 'company') return <StepCompany 
    onNext={s => { setSession(s); setFlowPosition('job'); }} 
    onLogin={s => { localStorage.setItem('__org_session', JSON.stringify(s)); setSession(s); setFlowPosition('operational'); }}
  />;
  if (flowPosition === 'job') return <StepJob companyName={session.companyName} apiKey={session.apiKey} onFinish={j => { const all = { ...session, ...j }; localStorage.setItem('__org_session', JSON.stringify(all)); setSession(all); setFlowPosition('operational'); }} />;
  
  return <SystemInterface sessionData={session} terminateSession={endSession} />;
}
