import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastContainer } from 'react-toastify/unstyled';
import 'react-toastify/dist/ReactToastify.css';
import Login from './pages/Login';
import Register from './pages/Register';
import LandingPage from './pages/LandingPage';
import Profile from './pages/Profile';
import Chat from './pages/Chat';
import Onboarding from './pages/Onboarding';
import SetInitialPasswordPage from './pages/SetInitialPasswordPage';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import AdminUserListPage from './pages/admin/AdminUserListPage';
import AdminUserEditPage from './pages/admin/AdminUserEditPage';
import AdminUserProfileViewPage from './pages/admin/AdminUserProfileViewPage';
import AdminReportsPage from './pages/admin/AdminReportsPage';
import AdminPhotoVerificationsPage from './pages/admin/AdminPhotoVerificationsPage';
import AdminReportDetailPage from './pages/admin/AdminReportDetailPage';
import AdminAnalyticsPage from './pages/admin/AdminAnalyticsPage';
import AdminTransactionsPage from './pages/admin/AdminTransactionsPage';
import AdminStorePurchasesPage from './pages/admin/AdminStorePurchasesPage';
import AdminSupportTicketListPage from './pages/admin/AdminSupportTicketListPage';
import AdminSupportTicketDetailPage from './pages/admin/AdminSupportTicketDetailPage';
import SwipeDeck from './pages/SwipeDeck';
import LikesPage from './pages/LikesPage';
import ConversationsPage from './pages/ConversationsPage';
import SubscriptionPage from './pages/SubscriptionPage';
import SupportPage from './pages/SupportPage';
import SupportTicketDetailPage from './pages/SupportTicketDetailPage';
import StorePage from './pages/StorePage';
import DarkFantasyPage from './pages/DarkFantasyPage';
import MainLayout from './components/MainLayout';
import FAQPage from './pages/legal/FAQPage';
import SafetyTipsPage from './pages/legal/SafetyTipsPage';
import TermsPage from './pages/legal/TermsPage';
import CookiePolicyPage from './pages/legal/CookiePolicyPage';
import PrivacySettingsPage from './pages/legal/PrivacySettingsPage';
import IncomingCallMonitor from './components/IncomingCallMonitor';
import LoadingState from './components/LoadingState';
import PUBLIC_ROUTE_SEO from './config/seoRoutes';

function PrivateRoute({ children }) {
  const { user, isLoading } = useAuth();

  // --- START DIAGNOSTIC LOGGING ---
  console.log('%cPrivateRoute Check:', 'color: green; font-weight: bold;', {
    isLoading,
    isUserPresent: !!user,
    isOnboardingComplete: user ? user.isOnboardingComplete : 'N/A',
  });
  // --- END DIAGNOSTIC LOGGING ---

  if (isLoading) {
    console.log('PrivateRoute Decision: Rendering loading screen.');
    return (
      <LoadingState title="Checking your session" message="Securely reconnecting you to Hart2Hart." slowMessage="Your connection is taking longer than expected. We are still checking your session." />
    );
  }

  if (!user) {
    console.log('PrivateRoute Decision: No user found, redirecting to /login.');
    return <Navigate to="/login" replace />;
  }

  if (user.isOnboardingComplete === false) {
    console.log('PrivateRoute Decision: Onboarding is not complete, redirecting to /onboarding.');
    return <Navigate to="/onboarding" replace />;
  }

  console.log('PrivateRoute Decision: User is authenticated and onboarded, rendering children.');
  return children;
}

function PublicHomeRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="app-loading-screen"><LoadingState title="Welcome to Hart2Hart" message="Preparing your experience." /></div>
    );
  }

  return user ? <Navigate to="/discover" replace /> : <LandingPage />;
}



function RouteSeoMetadata() {
  const { pathname } = useLocation();

  React.useEffect(() => {
    const route = PUBLIC_ROUTE_SEO[pathname];
    const isPublic = Boolean(route);
    const metadata = route || {
      title: 'Private Account Area | Hart2Hart',
      description: 'This Hart2Hart page is available to account holders.',
    };
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    const canonicalOrigin = canonicalLink
      ? new URL(canonicalLink.href).origin
      : window.location.origin;
    const canonicalUrl = canonicalOrigin + pathname;

    document.title = metadata.title;

    const setMeta = (selector, attribute, key, value) => {
      let element = document.head.querySelector(selector);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
      }
      element.setAttribute('content', value);
    };

    setMeta('meta[name="description"]', 'name', 'description', metadata.description);
    setMeta('meta[name="robots"]', 'name', 'robots', isPublic
      ? 'index, follow, max-image-preview:large'
      : 'noindex, nofollow, noarchive');
    setMeta('meta[property="og:title"]', 'property', 'og:title', metadata.title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', metadata.description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', metadata.title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', metadata.description);

    if (canonicalLink) canonicalLink.href = canonicalUrl;
  }, [pathname]);

  return null;
}

function AdminRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <LoadingState title="Opening your admin workspace" message="Verifying access and loading your dashboard." />
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isAdminOrSuperAdmin =
    user.role === 'admin' || user.role === 'superadmin';
  if (!isAdminOrSuperAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}


function SuperAdminRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingState title="Verifying superadmin access" message="Checking your administrator permissions." />;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'superadmin') return <Navigate to="/unauthorized" replace />;
  return children;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <RouteSeoMetadata />
          <SocketProvider>
            <IncomingCallMonitor />
            <ToastContainer
              position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
          />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route
              path="/set-initial-password"
              element={<SetInitialPasswordPage />}
            />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            {/* Static Legal Pages */}
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/safety" element={<SafetyTipsPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/cookies" element={<CookiePolicyPage />} />
            <Route path="/privacy-settings" element={<PrivacySettingsPage />} />

            {/* User-facing protected routes with MainLayout */}
            <Route
              element={
                <PrivateRoute>
                  <MainLayout />
                </PrivateRoute>
              }
            >
              <Route path="/discover" element={<SwipeDeck />} />
              <Route path="/likes" element={<LikesPage />} />
              <Route path="/conversations" element={<ConversationsPage />} />
              <Route path="/matches" element={<ConversationsPage />} />
              <Route path="/chat/:chatId" element={<Chat />} />
              <Route path="/profile/:userId" element={<Profile />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/premium" element={<SubscriptionPage />} />
              <Route path="/manage-subscription" element={<SubscriptionPage />} />
              <Route path="/support" element={<SupportPage />} />
              <Route path="/support/tickets/:ticketId" element={<SupportTicketDetailPage />} />
              <Route path="/store" element={<StorePage />} />
              <Route path="/dark-fantasy" element={<DarkFantasyPage />} />
            </Route>

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="users" element={<AdminUserListPage />} />
              <Route path="users/new" element={<AdminUserEditPage />} />
              <Route path="users/:userId/edit" element={<AdminUserEditPage />} />
              <Route path="users/:userId/profile" element={<AdminUserProfileViewPage />} />
              <Route path="reports" element={<AdminReportsPage />} />
              <Route path="verifications" element={<SuperAdminRoute><AdminPhotoVerificationsPage /></SuperAdminRoute>} />
              <Route path="reports/:reportId" element={<AdminReportDetailPage />} />
              <Route path="analytics" element={<AdminAnalyticsPage />} />
              <Route path="transactions" element={<AdminTransactionsPage />} />
              <Route path="purchases" element={<AdminStorePurchasesPage />} />
              <Route path="support-tickets" element={<AdminSupportTicketListPage />} />
              <Route path="support-tickets/:ticketId" element={<AdminSupportTicketDetailPage />} />
            </Route>

            {/* Default route */}
            <Route path="/" element={<PublicHomeRoute />} />
            <Route path="*" element={<Navigate to="/discover" />} />

          </Routes>
        </SocketProvider>
      </Router>
    </AuthProvider>
  </ThemeProvider>
  );
}

export default App;
