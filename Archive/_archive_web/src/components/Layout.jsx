import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, ArrowLeftRight, PieChart, Target, Wallet, Plus } from 'lucide-react';

export default function Layout({ children, onAddClick }) {
    const location = useLocation();

    return (
        <div className="app-layout">
            <header className="app-header">
                <h1>💎 FinanceFlow</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                </div>
            </header>

            <main className="app-content">
                {children}
            </main>

            <button className="fab-button" onClick={onAddClick} aria-label="Add transaction">
                <Plus size={26} strokeWidth={2.5} />
            </button>

            <nav className="bottom-nav">
                <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
                    <LayoutDashboard size={22} />
                    <span>Home</span>
                </NavLink>
                <NavLink to="/transactions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <ArrowLeftRight size={22} />
                    <span>History</span>
                </NavLink>
                <NavLink to="/charts" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <PieChart size={22} />
                    <span>Charts</span>
                </NavLink>
                <NavLink to="/budget" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Target size={22} />
                    <span>Budget</span>
                </NavLink>
                <NavLink to="/assets" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Wallet size={22} />
                    <span>Assets</span>
                </NavLink>
            </nav>
        </div>
    );
}
