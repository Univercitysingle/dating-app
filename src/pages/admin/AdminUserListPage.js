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
  const emptyStateColumnCount = adminUser?.role === 'superadmin' ? 8 : 6;

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
      const data = await apiClient.get(`/admin/users?${queryParams.toString()}`);
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
      await apiClient.delete(`/admin/users/${userId}`);
      fetchUsers(currentPage, searchTerm, filterRole);
      alert('User deleted successfully.');
    } catch (err) {
      alert(`Error deleting user: ${err.message}`);
    }
  };

  const handleToggleVisibility = async (userId, currentVisibility) => {
    if (!window.confirm(`Are you sure you want to ${currentVisibility ? 'hide' : 'show'} this user's profile?`)) return;
    try {
      await apiClient.put(`/admin/users/${userId}`, { isProfileVisible: !currentVisibility });
      fetchUsers(currentPage, searchTerm, filterRole);
      alert('User visibility updated successfully.');
    } catch (err) {
      alert(`Error updating visibility: ${err.message}`);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (!window.confirm(`Are you sure you want to change this user's role to '${newRole}'?`)) return;
    try {
      await apiClient.put(`/admin/users/${userId}`, { role: newRole });
      fetchUsers(currentPage, searchTerm, filterRole); // Refetch to show the new role
      alert('User role updated successfully.');
    } catch (err) {
      alert(`Error updating role: ${err.message}`);
    }
  };

  const handleChat = (targetUid) => {
    if (!adminUser || !adminUser.uid) {
      alert("Your user ID is not available, cannot start chat.");
      return;
    }
    const chatId = [adminUser.uid, targetUid].sort().join('-');
    navigate(`/chat/${chatId}`);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Community administration</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">User management</h1>
          <p className="mt-2 text-sm text-slate-500">Find accounts, review profiles, and manage user access.</p>
        </div>
        <Link to="/admin/users/new" className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
          <span aria-hidden="true" className="text-lg leading-none">+</span>Create user
        </Link>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="admin-user-search" className="mb-2 block text-xs font-semibold text-slate-600">Search users</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">⌕</span>
              <input id="admin-user-search" type="search" placeholder="Search by name or email…" value={searchTerm} onChange={handleSearchChange} className="w-full pl-9" />
            </div>
          </div>
          <div className="w-full lg:w-56">
            <label htmlFor="admin-user-role" className="mb-2 block text-xs font-semibold text-slate-600">Filter by role</label>
            <select id="admin-user-role" value={filterRole} onChange={handleFilterRoleChange} className="w-full">
              <option value="">All roles</option>
              <option value="user">User</option>
              <option value="contributor">Contributor</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </div>
          {(searchTerm || filterRole) && (
            <button type="button" onClick={() => { setSearchTerm(''); setFilterRole(''); setCurrentPage(1); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Clear filters</button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-400">
          <span>{isLoading ? 'Updating results…' : `${users.length} users on this page`}</span>
          <span>Page {currentPage} of {totalPages}</span>
        </div>
      </section>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => fetchUsers(currentPage, searchTerm, filterRole)} className="font-semibold underline">Try again</button></div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div><h2 className="font-bold text-slate-900">All users</h2><p className="mt-1 text-xs text-slate-500">Account details and available actions depend on your administrator role.</p></div>
          {isLoading && <span role="status" className="text-xs font-medium text-indigo-600">Loading…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead><tr>
              <th>Name</th>
              {(adminUser?.role === 'superadmin' || adminUser?.role === 'admin') && <th>Email</th>}
              {adminUser?.role === 'superadmin' && <th>Mobile</th>}
              <th>Role</th><th>Visibility</th><th>Last active</th>
              {adminUser?.role === 'superadmin' && <th>Last login IP</th>}
              <th>Actions</th>
            </tr></thead>
            <tbody>
              {isLoading && users.length === 0 ? (
                <tr><td colSpan={emptyStateColumnCount} className="py-12 text-center"><span className="inline-flex items-center gap-3 text-sm text-slate-500"><span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />Loading user directory…</span></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={emptyStateColumnCount} className="px-5 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-500">◎</div><p className="mt-3 font-semibold text-slate-800">No users match these filters</p><p className="mt-1 text-sm text-slate-500">Try a different name, email, or role.</p></td></tr>
              ) : users.map((user) => (
                <tr key={user._id}>
                  <td><div className="flex min-w-[150px] items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold uppercase text-indigo-700">{(user.name || 'U').split(/\\s+/).map(part => part[0]).slice(0, 2).join('')}</span><span className="font-semibold text-slate-800">{user.name || 'N/A'}</span></div></td>
                  {(adminUser?.role === 'superadmin' || adminUser?.role === 'admin') && <td><span className="text-sm text-slate-500">{user.email || 'Not available'}</span></td>}
                  {adminUser?.role === 'superadmin' && <td><span className="text-sm text-slate-500">{user.mobileNumber || 'Not available'}</span></td>}
                  <td><span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{user.role}</span></td>
                  <td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${user.isProfileVisible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{user.isProfileVisible ? 'Visible' : 'Hidden'}</span></td>
                  <td><span className="whitespace-nowrap text-xs text-slate-500">{user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleDateString() : 'Not available'}</span></td>
                  {adminUser?.role === 'superadmin' && <td><span className="font-mono text-xs text-slate-500">{user.lastLoginIp || 'Not available'}</span></td>}
                  <td><div className="flex min-w-[230px] flex-wrap gap-1.5">
                    <button type="button" onClick={() => navigate(`/admin/users/${user._id}/profile`)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">View</button>
                    <button type="button" onClick={() => navigate(`/admin/users/${user._id}/edit`)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">Edit</button>
                    <button type="button" onClick={() => handleChat(user.uid)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Chat</button>
                    <button type="button" onClick={() => handleToggleVisibility(user._id, user.isProfileVisible)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">{user.isProfileVisible ? 'Hide' : 'Show'}</button>
                    {adminUser?.role === 'superadmin' && user.role === 'user' && <button type="button" onClick={() => handleRoleChange(user._id, 'admin')} className="rounded-lg border border-indigo-200 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Promote</button>}
                    {adminUser?.role === 'superadmin' && user.role === 'admin' && <button type="button" onClick={() => handleRoleChange(user._id, 'user')} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Demote</button>}
                    <button type="button" onClick={() => navigate(`/admin/reports?reportedUserUid=${user.uid}`)} className="rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50">Reports</button>
                    {adminUser?.role === 'superadmin' && <button type="button" onClick={() => handleDeleteUser(user._id)} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">Delete</button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Page <strong className="text-slate-800">{currentPage}</strong> of <strong className="text-slate-800">{totalPages}</strong></p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1 || isLoading} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Previous</button>
            <button type="button" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages || isLoading} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      </section>
    </div>
  );

};

export default AdminUserListPage;
