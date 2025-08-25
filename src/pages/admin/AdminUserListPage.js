import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import debounce from 'lodash.debounce';
import logger from '../../utils/logger';
import apiClient from '../../api/apiClient';

const AdminUserListPage = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user: adminUser } = useAuth();
  const navigate = useNavigate();

  // State for filters and pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(10);

  const fetchUsers = useCallback(async (page, search, role) => {
    setIsLoading(true);
    setError(null);
    if (!adminUser) {
      setError("Authentication failed.");
      setIsLoading(false);
      return;
    }
    try {
      const queryParams = new URLSearchParams({
        page,
        limit,
        ...(search && { search }),
        ...(role && { role }),
      });
      const data = await apiClient.get(`/api/admin/users?${queryParams.toString()}`);
      logger.info("Fetched users data:", {
        users: data.users,
        totalPages: data.totalPages,
        currentPage: data.currentPage
      });
      setUsers(data.users || []);
      setTotalPages(data.totalPages || 1);
      setCurrentPage(data.currentPage || 1);
    } catch (err) {
      setError(err.message);
      logger.error("Fetch users error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [adminUser, limit]);

  const debouncedFetch = useMemo(() => {
    return debounce((page, search, role) => fetchUsers(page, search, role), 300);
  }, [fetchUsers]);

  useEffect(() => {
    if (adminUser) {
      if (searchTerm) {
        debouncedFetch(1, searchTerm, filterRole);
      } else {
        fetchUsers(currentPage, searchTerm, filterRole);
      }
    }
    return () => debouncedFetch.cancel();
  }, [adminUser, currentPage, searchTerm, filterRole, debouncedFetch, fetchUsers]);

  const handleSearchChange = (e) => setSearchTerm(e.target.value);
  const handleFilterRoleChange = (e) => {
    setFilterRole(e.target.value);
    setCurrentPage(1);
  };
  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= totalPages) setCurrentPage(newPage);
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) return;
    try {
      await apiClient.delete(`/api/admin/users/${userId}`);
      fetchUsers(currentPage, searchTerm, filterRole);
      alert('User deleted successfully.');
    } catch (err) {
      alert(`Error deleting user: ${err.message}`);
    }
  };

  const handleToggleVisibility = async (userId, currentVisibility) => {
    if (!window.confirm(`Are you sure you want to ${currentVisibility ? 'hide' : 'show'} this user's profile?`)) return;
    try {
      await apiClient.put(`/api/admin/users/${userId}`, { isProfileVisible: !currentVisibility });
      fetchUsers(currentPage, searchTerm, filterRole);
      alert('User visibility updated successfully.');
    } catch (err) {
      alert(`Error updating visibility: ${err.message}`);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (!window.confirm(`Are you sure you want to change this user's role to '${newRole}'?`)) return;
    try {
      await apiClient.put(`/api/admin/users/${userId}`, { role: newRole });
      fetchUsers(currentPage, searchTerm, filterRole); // Refetch to show the new role
      alert('User role updated successfully.');
    } catch (err) {
      alert(`Error updating role: ${err.message}`);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">User Management</h1>
        <Link to="/admin/users/new" className="bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded shadow-md">
          Create New User
        </Link>
      </div>

      <div className="mb-4 flex space-x-4">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm w-1/3"
        />
        <select
          value={filterRole}
          onChange={handleFilterRoleChange}
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm"
        >
          <option value="">All Roles</option>
          <option value="user">User</option>
          <option value="contributor">Contributor</option>
          <option value="admin">Admin</option>
          <option value="superadmin">Superadmin</option>
        </select>
      </div>

      {isLoading && <p className="text-center p-4">Loading users...</p>}
      {error && <p className="text-center text-red-500 p-4">Error: {error}</p>}

      {!isLoading && !error && (
        <>
          <div className="bg-white shadow-md rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Visible</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Active</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
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
                        <button onClick={() => navigate(`/admin/users/${user._id}/edit`)} className="text-indigo-600 hover:text-indigo-900">Edit</button>
                        <button onClick={() => handleToggleVisibility(user._id, user.isProfileVisible)} className={user.isProfileVisible ? "text-yellow-600 hover:text-yellow-900" : "text-green-600 hover:text-green-900"}>
                          {user.isProfileVisible ? 'Hide' : 'Show'}
                        </button>
                        {adminUser && adminUser.role === 'superadmin' && user.role === 'user' && (
                           <button onClick={() => handleRoleChange(user._id, 'admin')} className="text-blue-600 hover:text-blue-900">Promote</button>
                        )}
                        {adminUser && adminUser.role === 'superadmin' && user.role === 'admin' && (
                           <button onClick={() => handleRoleChange(user._id, 'user')} className="text-gray-600 hover:text-gray-900">Demote</button>
                        )}
                        {adminUser && adminUser.role === 'superadmin' && (
                          <button onClick={() => handleDeleteUser(user._id)} className="text-red-600 hover:text-red-900">Delete</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-between items-center">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminUserListPage;
