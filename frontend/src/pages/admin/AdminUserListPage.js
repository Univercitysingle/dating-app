import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext'; // Adjust path as needed

const AdminUserListPage = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  // TODO: Add pagination state: const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, limit: 10 });
  const { user: adminUser } = useAuth(); // Get the admin user object
  const navigate = useNavigate();

  const fetchUsers = useCallback(async () => {
    // const { currentPage, limit } = pagination; // For pagination
    setIsLoading(true);
    setError(null);
    if (!adminUser || !adminUser.token) { // Check for adminUser and its token
      setError("Authentication token not found or user not available.");
      setIsLoading(false);
      return;
    }
    try {
      // const response = await fetch(`/api/admin/users?page=${currentPage}&limit=${limit}`, {
      const response = await fetch(`/api/admin/users`, { // Simplified without frontend pagination controls for now
        headers: {
          'Authorization': `Bearer ${adminUser.token}`, // Use token from adminUser object
        },
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to fetch users');
      }
      const data = await response.json();
      setUsers(data.users || []); // Assuming backend returns { users: [], ... }
      // setPagination({ currentPage: data.currentPage, totalPages: data.totalPages, limit });
    } catch (err) {
      setError(err.message);
      console.error("Fetch users error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [adminUser]); // Dependency on adminUser (which includes token)

  useEffect(() => {
    if (adminUser) { // Fetch users only if adminUser (and thus token) is available
        fetchUsers();
    }
  }, [fetchUsers, adminUser]);

  const handleToggleVisibility = async (userId, currentVisibility) => {
    if (!confirm(`Are you sure you want to ${currentVisibility ? 'hide' : 'show'} this user's profile?`)) return;
    if (!adminUser || !adminUser.token) {
        alert("Authentication error. Cannot perform action.");
        return;
    }
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminUser.token}`, // Use token from adminUser object
        },
        body: JSON.stringify({ isProfileVisible: !currentVisibility }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to update visibility');
      }
      // Refresh user list or update locally
      fetchUsers();
      alert('User visibility updated successfully.');
    } catch (err) {
      // setError(err.message); // Setting error state here might be too disruptive for a single action failing
      alert(`Error updating visibility: ${err.message}`);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) return;
    if (!adminUser || !adminUser.token) {
        alert("Authentication error. Cannot perform action.");
        return;
    }
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminUser.token}`, // Use token from adminUser object
        },
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to delete user');
      }
      fetchUsers(); // Refresh user list
      alert('User deleted successfully.');
    } catch (err) {
      // setError(err.message);
      alert(`Error deleting user: ${err.message}`);
    }
  };

  if (isLoading) return <p className="text-center p-4">Loading users...</p>;
  if (error) return <p className="text-center text-red-500 p-4">Error: {error}</p>;

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">User Management</h1>
        <Link
          to="/admin/users/new"
          className="bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded shadow-md"
        >
          Create New User
        </Link>
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Visible</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Active</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.length === 0 ? (
              <tr><td colSpan="6" className="px-6 py-4 text-center text-sm text-gray-500">No users found.</td></tr>
            ) : (
              users.map(user => (
                <tr key={user._id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.name || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.role}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.isProfileVisible ? 'Yes' : 'No'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => navigate(`/admin/users/${user._id}/edit`)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleVisibility(user._id, user.isProfileVisible)}
                      className={user.isProfileVisible ? "text-yellow-600 hover:text-yellow-900" : "text-green-600 hover:text-green-900"}
                    >
                      {user.isProfileVisible ? 'Hide' : 'Show'}
                    </button>
                    {adminUser && adminUser.role === 'superadmin' && (
                      <button
                        onClick={() => handleDeleteUser(user._id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {/* TODO: Add pagination controls here if implementing */}
    </div>
  );
};

export default AdminUserListPage;
