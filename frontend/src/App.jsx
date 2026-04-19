import React from 'react';
import styles from './App.module.css';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './Dashboard';
import ApplicantStatus from './ApplicantStatus';
import './index.css';

// Reusable top navigation menu
function TopNavigation() {
  const location = useLocation();
  return (
    <header className={styles['top-nav']}>
      <div className={styles['brand-logo']}>Next<span>InLine</span> System</div>
      <div className={styles['nav-links']}>
        <Link to="/" className={`${styles['nav-item']} ${location.pathname === '/' ? styles['active'] : ''}`}>Pipeline Workspace</Link>
        <Link to="/status" className={`${styles['nav-item']} ${location.pathname === '/status' ? styles['active'] : ''}`}>Candidate Portal</Link>
      </div>
    </header>
  );
}

// Main application router wrapper
export default function Application() {
  return (
    <BrowserRouter>
      <section className={`${styles['main-wrapper']} ${styles['anim-slide']}`}>
        <TopNavigation />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/status" element={<ApplicantStatus />} />
        </Routes>
      </section>
    </BrowserRouter>
  );
}
