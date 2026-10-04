import React from 'react';

export default function AppLoadingScreen({ message = 'Loading M.V High School ERP...' }) {
  return (
    <div className="mv-app-preloader" role="status" aria-live="polite">
      <div className="mv-preloader-backdrop" />
      <div className="mv-preloader-card">
        {/* Glowing Crest / Logo */}
        <div className="mv-preloader-logo-ring">
          <img
            src="/logo.jpeg"
            alt="M.V High School Logo"
            className="mv-preloader-logo"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.parentElement?.querySelector('.mv-preloader-fallback');
              if (fallback) fallback.style.display = 'flex';
            }}
          />
          <div className="mv-preloader-fallback" style={{ display: 'none' }}>
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <div className="mv-preloader-pulse" />
        </div>

        {/* Titles */}
        <h2 className="mv-preloader-title">M.V HIGH SCHOOL</h2>
        <p className="mv-preloader-subtitle">SCHOOL MANAGEMENT SYSTEM</p>

        {/* Animated Progress Track */}
        <div className="mv-preloader-track">
          <div className="mv-preloader-bar" />
        </div>

        {/* Dynamic status caption */}
        <span className="mv-preloader-status">{message}</span>
      </div>
    </div>
  );
}
