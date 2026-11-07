import React, { useEffect, useState } from 'react';
import './admin-ux.css';
import { Navigate, NavLink, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const navigation = [
  { label: 'Overview', to: '/admin/dashboard', icon: '◫', section: 'WORKSPACE' },
  { label: 'User management', to: '/admin/users', icon: '◎' },
  { label: 'Photo verification', to: '/admin/verifications', icon: '▧', superadminOnly: true },
  { label: 'Reports & safety', to: '/admin/reports', icon: '⚑' },
  { label: 'Analytics', to: '/admin/analytics', icon: '▥', section: 'OPERATIONS' },
  { label: 'Payment review', to: '/admin/purchases', icon: '◇' },
  { label: 'Transactions', to: '/admin/transactions', icon: '⇄' },
  { label: 'Support tickets', to: '/admin/support-tickets', icon: '▤' },
];

const pageTitles = [
  ['/admin/dashboard', 'Overview'],
  ['/admin/users', 'User management'],
  ['/admin/verifications', 'Photo verification'],
  ['/admin/reports', 'Reports & safety'],
  ['/admin/analytics', 'Analytics'],
  ['/admin/purchases', 'Payment review'],
  ['/admin/transactions', 'Transactions'],
  ['/admin/support-tickets', 'Support tickets'],
];

const AdminLayout = () => {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarMinimized, setSidebarMinimized] = useState(false);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isMobileMenuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-indigo-600" />
          <p className="text-sm font-medium text-slate-600">Preparing your admin workspace…</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const isAdminOrSuperAdmin = user.role === 'admin' || user.role === 'superadmin';
  if (!isAdminOrSuperAdmin) return <Navigate to="/unauthorized" replace />;

  const visibleNavigation = navigation.filter((item) => !item.superadminOnly || user.role === 'superadmin');
  const currentPage = [...pageTitles]
    .sort((a, b) => b[0].length - a[0].length)
    .find(([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  const pageTitle = currentPage?.[1] || 'Admin workspace';
  const initials = (user.displayName || user.name || user.email || 'A')
    .split(/[\\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  const renderNavigation = (mobile = false) => (
    <nav aria-label="Admin navigation" className="space-y-1">
      {visibleNavigation.map((item) => (
        <React.Fragment key={item.to}>
          {item.section && (
            <p className={`px-3 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 ${isSidebarMinimized && !mobile ? 'text-center' : ''}`}>
              {isSidebarMinimized && !mobile ? '•' : item.section}
            </p>
          )}
          <NavLink
            to={item.to}
            end={item.to === '/admin/dashboard'}
            title={isSidebarMinimized && !mobile ? item.label : undefined}
            className={({ isActive }) =>
              `group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-950 ${
                isActive
                  ? 'bg-indigo-500/15 text-white shadow-sm ring-1 ring-inset ring-indigo-400/20'
                  : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
              }`
            }
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-base text-current transition group-hover:bg-white/10" aria-hidden="true">{item.icon}</span>
            {(!isSidebarMinimized || mobile) && <span className="truncate">{item.label}</span>}
            {(!isSidebarMinimized || mobile) && item.to === '/admin/reports' && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-400" aria-label="Safety reports" />}
          </NavLink>
        </React.Fragment>
      ))}
    </nav>
  );

  const sidebar = (mobile = false) => (
    <div className="flex h-full flex-col bg-[#101629] text-white">
      <div className={`flex h-[76px] items-center border-b border-white/[0.08] px-5 ${isSidebarMinimized && !mobile ? 'justify-center' : 'gap-3'}`}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-600 text-lg font-black shadow-lg shadow-indigo-950/40">D</div>
        {(!isSidebarMinimized || mobile) && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-wide text-white">DateMe</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Control center</p>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-3">{renderNavigation(mobile)}</div>
      <div className="border-t border-white/[0.08] p-3">
        <div className={`mb-3 flex items-center gap-3 rounded-xl bg-white/[0.05] p-3 ${isSidebarMinimized && !mobile ? 'justify-center' : ''}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-xs font-bold text-white">{initials || 'A'}</span>
          {(!isSidebarMinimized || mobile) && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{user.displayName || user.name || user.email}</p>
              <p className="mt-0.5 text-[10px] capitalize text-slate-400">{user.role === 'superadmin' ? 'Super administrator' : 'Administrator'}</p>
            </div>
          )}
        </div>
        <button type="button" onClick={handleLogout} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-400 ${isSidebarMinimized && !mobile ? 'justify-center' : ''}`}>
          <span aria-hidden="true">↪</span>
          {(!isSidebarMinimized || mobile) && 'Sign out'}
        </button>
        {!mobile && (
          <button type="button" onClick={() => setSidebarMinimized((value) => !value)} aria-label={isSidebarMinimized ? 'Expand sidebar' : 'Collapse sidebar'} className="mt-2 flex w-full items-center justify-center rounded-lg py-2 text-xs text-slate-500 transition hover:bg-white/[0.06] hover:text-white">
            {isSidebarMinimized ? '»' : 'Collapse menu  «'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900 lg:flex">
      <aside className={`relative z-30 hidden shrink-0 transition-[width] duration-300 lg:block ${isSidebarMinimized ? 'w-[88px]' : 'w-[272px]'}`}>
        <div className="fixed inset-y-0 left-0 h-screen" style={{ width: isSidebarMinimized ? 88 : 272 }}>
          {sidebar(false)}
        </div>
      </aside>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <button type="button" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" />
          <aside className="absolute inset-y-0 left-0 w-[min(86vw,300px)] shadow-2xl">{sidebar(true)}</aside>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 lg:hidden">☰</button>
            <div className="min-w-0">
              <div className="hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 sm:flex">
                <span>Admin workspace</span><span>/</span><span className="text-indigo-600">DateMe</span>
              </div>
              <h1 className="truncate text-base font-bold tracking-tight text-slate-900 sm:mt-0.5 sm:text-lg">{pageTitle}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold text-slate-700">{user.displayName || user.name || 'Administrator'}</p>
              <p className="mt-0.5 text-[10px] capitalize text-slate-400">{user.role}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100">{initials || 'A'}</span>
          </div>
        </header>
        <main id="admin-main" className="admin-ux w-full flex-1 px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
          <div className="mx-auto w-full max-w-[1600px]"><Outlet /></div>
        </main>
        <footer className="border-t border-slate-200/70 px-4 py-4 text-center text-[11px] text-slate-400 sm:px-7 lg:px-9">
          DateMe administration · Secure operations workspace
        </footer>
      </div>
    </div>
  );
};

export default AdminLayout;
