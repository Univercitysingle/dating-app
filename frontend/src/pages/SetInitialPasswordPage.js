import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const SetInitialPasswordPage = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const { tempAuthInfo, completePasswordSetupAndLogin, user, logout } =
    useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // If there's no temporary auth info, or if a regular user is already logged in,
    // redirect away from this page.
    if (!tempAuthInfo || (user && !tempAuthInfo?.user?.uid === user.uid)) {
      // A user might be logged in but not the one needing password setup
      // Or tempAuthInfo might be cleared after successful setup & refresh
      console.warn(
        'Redirecting from set-initial-password: No tempAuthInfo or user mismatch.'
      );
      navigate('/');
    }
    // Retrieve from localStorage if context is empty (e.g. after refresh)
    // This part is tricky because AuthContext might re-initialize tempAuthInfo from localStorage itself.
    // For simplicity, primary reliance is on AuthContext state.
  }, [tempAuthInfo, user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!tempAuthInfo || !tempAuthInfo.token || !tempAuthInfo.user) {
      setError('Session information is missing. Please try logging in again.');
      // Consider logging out or redirecting more forcefully
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/set-initial-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tempAuthInfo.token}`,
        },
        body: JSON.stringify({ newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || data.error || 'Failed to set password.'
        );
      }

      setSuccessMessage(
        data.message || 'Password set successfully! Redirecting...'
      );

      // The backend currently doesn't return the user object or a new token on this specific call.
      // It just returns { message: "..." }.
      // So, we need to use the user info from tempAuthInfo and the same token.
      // If the role or other details were to change server-side, this would need adjustment.
      // Assuming the old token remains valid for now.
      // The `completePasswordSetupAndLogin` in AuthContext will handle updating the main user state.
      // It expects the full user profile and the API token.
      completePasswordSetupAndLogin(tempAuthInfo.user, tempAuthInfo.token);

      setTimeout(() => {
        // Navigate based on role, or to a generic post-login page
        if (
          tempAuthInfo.user.role === 'admin' ||
          tempAuthInfo.user.role === 'superadmin'
        ) {
          navigate('/admin/dashboard'); // Or wherever admin should go
        } else {
          navigate('/'); // Default page for other roles
        }
      }, 2000);
    } catch (err) {
      setError(err.message);
      console.error('Set initial password error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle case where user might try to access this page directly without tempAuthInfo
  if (!tempAuthInfo && !isLoading) {
    // This check might be too aggressive if AuthContext is still loading.
    // A better check might be after AuthContext.isLoading is false and tempAuthInfo is still null.
    // For now, this is a simple guard.
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <p className="text-red-500">
          No pending password setup. Redirecting to login...
        </p>
        {/* setTimeout(() => navigate('/login'), 2000); // Can cause issues if rendered multiple times */}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-700">
          Set Your Initial Password
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="newPassword"
              className="block text-sm font-medium text-gray-700"
            >
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700"
            >
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          {successMessage && (
            <p className="text-green-500 text-sm text-center">
              {successMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
          >
            {isLoading ? 'Setting Password...' : 'Set Password'}
          </button>
        </form>
        <button
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          className="w-full mt-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        >
          Cancel and Logout
        </button>
      </div>
    </div>
  );
};

export default SetInitialPasswordPage;
