import React, { useState, useEffect } from 'react';
import styles from './ApplicantStatus.module.css';

// Maps statuses to display content and colored UI pills
const presentationConfig = {
  ACTIVE:     { pill: styles['pill-active'],   title: 'Session Active',       desc: 'Your application is actively being processed.' },
  PENDING_ACKNOWLEDGEMENT: { pill: styles['pill-pending'], title: 'Pending Confirmation', desc: 'Promoted! Confirm your slot now.' },
  WAITLIST:   { pill: styles['pill-waitlist'], title: 'Currently Waitlisted', desc: 'Awaiting capacity.' },
  HIRED:      { pill: styles['pill-active'],   title: 'Hired!',               desc: 'Congratulations on joining the team.' },
  REJECTED:   { pill: styles['pill-error'],    title: 'Not Selected',         desc: 'Thank you for your interest.' },
  WITHDRAWN:  { pill: styles['pill-error'],    title: 'Withdrawn',            desc: 'Application has been withdrawn.' }
};

export default function CandidatePortal() {
  const [candidateId, setCandidateId] = useState('');
  const [pipelineData, setPipelineData] = useState(null);
  const [sysError, setSysError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [countdownString, setCountdownString] = useState('');
  const [ackConfirmed, setAckConfirmed] = useState(false);
  
  // Timer calculations
  const [progressPct, setProgressPct] = useState(0);

  const fetchCandidateStatus = async (idToFetch, showLoad = true) => {
    if (!idToFetch) return;
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(idToFetch)) {
      setSysError('Invalid ID format. Please enter a valid Applicant UUID.');
      setPipelineData(null);
      return;
    }

    if (showLoad) setIsSyncing(true);
    setSysError(null);
    setAckConfirmed(false);
    
    try {
      const resp = await fetch(`/api/applicants/${idToFetch}/status`);
      if (!resp.ok) throw new Error(await resp.text());
      setPipelineData(await resp.json());
    } catch (err) {
      setSysError(err.message || 'Verification failed');
      setPipelineData(null);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePortalCheck = (e) => {
    e.preventDefault();
    fetchCandidateStatus(candidateId);
  };

  const confirmWaitlistPromotion = async () => {
    setIsSyncing(true);
    try {
      const resp = await fetch(`/api/applicants/${candidateId}/acknowledge`, { method: 'PATCH' });
      if (!resp.ok) throw new Error(await resp.text());
      setAckConfirmed(true);
      await fetchCandidateStatus(candidateId, false);
    } catch (err) {
      setSysError(err.message || 'Acknowledgment failed to process.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Dedicated ring-timer effect block
  useEffect(() => {
    if (!pipelineData || pipelineData.status !== 'PENDING_ACKNOWLEDGEMENT') return;

    const tickDown = () => {
      const expiry = new Date(pipelineData.promoted_at).getTime() + pipelineData.decayMS;
      const current = Date.now();
      const diff = expiry - current;

      if (diff <= 0) {
        setCountdownString('0s');
        setProgressPct(100);
        setTimeout(() => fetchCandidateStatus(candidateId, false), 2000);
      } else {
        const secs = Math.ceil(diff / 1000);
        setCountdownString(`${secs}s`);
        setProgressPct(100 - (diff / pipelineData.decayMS) * 100);
      }
    };

    tickDown();
    const ticker = setInterval(tickDown, 1000);
    return () => clearInterval(ticker);
  }, [pipelineData, candidateId]);

  // Circumference for the SVG ring
  const circleRatio = 2 * Math.PI * 60;
  const strokeOffset = circleRatio - ((100 - progressPct) / 100) * circleRatio;

  return (
    <article style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div className={styles['vibrancy-panel']}>
        <h2 style={{ marginBottom: '0.5rem' }}>Candidate Portal</h2>
        <p className={styles['input-label']} style={{ marginBottom: '1.5rem' }}>Provide your unique ID to trace your pipeline position.</p>
        
        <form onSubmit={handlePortalCheck} style={{ display: 'flex', gap: '1rem' }}>
          <input className={styles['base-input']} style={{ flex: 1 }}
            placeholder="Applicant ID..." value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)} required />
          <button className={styles['action-btn']} disabled={isSyncing}>Check</button>
        </form>
      </div>

      {sysError && <div className={`${styles['msg-alert']} ${styles['msg-err']}`} style={{ marginTop: '1.5rem' }}>{sysError}</div>}
      {ackConfirmed && <div className={`${styles['msg-alert']} ${styles['msg-ok']}`} style={{ marginTop: '1.5rem' }}>Pipeline spot successfully secured!</div>}

      {pipelineData && (
        <section className={`${styles['vibrancy-panel']} ${styles['anim-slide']}`} style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          
          <div style={{ marginBottom: '2rem' }}>
            <span className={`${styles['status-pill']} ${presentationConfig[pipelineData.status]?.pill}`}>
              {pipelineData.status.replace('_', ' ')}
            </span>
          </div>

          {pipelineData.status === 'WAITLIST' && (
            <div>
              <div style={{ fontSize: '5rem', fontWeight: 800, color: 'var(--token-waitlist)', lineHeight: 1 }}>#{pipelineData.queue_position}</div>
              <p className={styles['input-label']} style={{ marginTop: '1rem' }}>Queue Position</p>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--sub-text)' }}>
                {pipelineData.applicants_ahead > 0 ? `${pipelineData.applicants_ahead} people waiting before you.` : "You're at the front of the line!"}
              </p>
            </div>
          )}

          {pipelineData.status === 'PENDING_ACKNOWLEDGEMENT' && (
            <div>
              <h3 style={{ color: 'var(--token-pending)', marginBottom: '1rem' }}>Slot Unlocked!</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--sub-text)' }}>You must claim this position before the ring closes.</p>
              
              <div className={styles['timer-ring-container']}>
                <svg className={styles['timer-svg']} viewBox="0 0 140 140">
                  <circle className={styles['timer-track']} cx="70" cy="70" r="60" />
                  <circle className={styles['timer-progress']} cx="70" cy="70" r="60" strokeDasharray={circleRatio} strokeDashoffset={strokeOffset} />
                </svg>
                <div className={styles['timer-text']}>{countdownString}</div>
              </div>

              <button className={styles['action-btn']} onClick={confirmWaitlistPromotion} disabled={isSyncing || progressPct === 100}>
                Confirm Pipeline Position
              </button>
            </div>
          )}

          {['ACTIVE', 'HIRED', 'REJECTED', 'WITHDRAWN'].includes(pipelineData.status) && (
            <div>
              <br/>
              <h3>{presentationConfig[pipelineData.status]?.title}</h3>
              <p style={{ color: 'var(--sub-text)', marginTop: '0.5rem' }}>{presentationConfig[pipelineData.status]?.desc}</p>
              <br/>
            </div>
          )}

          <div style={{ marginTop: '2.5rem' }}>
            <span className={styles['input-label']} style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => fetchCandidateStatus(candidateId, false)}>↻ Refresh View</span>
          </div>
        </section>
      )}
    </article>
  );
}
