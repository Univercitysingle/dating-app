import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext'; // Adjust as needed
// Remove the next line if you don’t use it
// import { PREDEFINED_PERSONALITY_TYPES } from '../../utils/constants';

const AVAILABLE_ROLES = ['user', 'contributor', 'admin', 'superadmin'];

const AdminUserEditPage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: adminUser } = useAuth();

  const isNewUser = !userId;
  const [userData, setUserData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user',
    isProfileVisible: true,
    education: '',
    relationshipGoals: '',
    bio: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const fetchUserData = useCallback(async () => {
    if (isNewUser || !adminUser || !adminUser.token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        headers: { 'Authorization': `Bearer ${adminUser.token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch user data');
      const data = await response.json();
      setUserData({
        name: data.name || '',
        email: data.email || '',
        role: data.role || 'user',
        isProfileVisible: data.isProfileVisible !== undefined ? data.isProfileVisible : true,
        education: data.education || '',
        relationshipGoals: data.relationshipGoals || '',
        bio: data.bio || '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [userId, isNewUser, adminUser]);

  useEffect(() => {
    if (!isNewUser) {
      fetchUserData();
    }
  }, [fetchUserData, isNewUser]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setUserData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage('');

    if (!adminUser || !adminUser.token) {
      setError("Authentication error.");
      setIsLoading(false);
      return;
    }

    const url = isNewUser ? '/api/admin/users' : `/api/admin/users/${userId}`;
    const method = isNewUser ? 'POST' : 'PUT';

    const payload = { ...userData };
    if (!isNewUser || (isNewUser && !payload.password)) {
      delete payload.password;
    }
    if (isNewUser && !payload.role) {
      payload.role = 'user';
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminUser.token}`,
        },
        body: JSON.stringify(payload),
      });
      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.message || `Failed to ${isNewUser ? 'create' : 'update'} user`);
      }
      setSuccessMessage(`User ${isNewUser ? 'created' : 'updated'} successfully!`);
      if (isNewUser && responseData._id) {
        navigate(`/admin/users/${responseData._id}/edit`);
      }
    } catch (err) {
      setError(err.message);
      console.error("Save user error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const getAssignableRoles = () => {
    if (adminUser && adminUser.role === 'superadmin') {
      return AVAILABLE_ROLES;
    }
    if (adminUser && adminUser.role === 'admin') {
      return AVAILABLE_ROLES.filter(r => r !== 'superadmin');
    }
    return [];
  };
  const assignableRoles = getAssignableRoles();

  if (isLoading && !isNewUser) return <p className="p-4 text-center">Loading user data...</p>;
  if (error && !isNewUser && !userData.email) return <p className="p-4 text-red-500 text-center">Error loading user: {error}</p>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">
        {isNewUser ? 'Create New User' : `Edit User: ${userData.name || userId}`}
      </h1>
      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded-lg p-6 space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
          <input type="text" name="name" id="name" value={userData.name} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
          <input type="email" name="email" id="email" value={userData.email} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
        </div>
        {isNewUser && (
          <div>
            <label htmlFor="password_edit" className="block text-sm font-medium text-gray-700">Password</label>
            <input type="password" name="password" id="password_edit" value={userData.password} onChange={handleChange} placeholder="Leave blank if user should set on first login" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
            <p className="text-xs text-gray-500 mt-1">If no password, 'Must Set Password' will be true unless UID provided.</p>
          </div>
        )}
        <div>
          <label htmlFor="role" className="block text-sm font-medium text-gray-700">Role</label>
          <select name="role" id="role" value={userData.role} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
            {assignableRoles.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="education" className="block text-sm font-medium text-gray-700">Education</label>
          <input type="text" name="education" id="education" value={userData.education} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
        </div>
        <div>
          <label htmlFor="relationshipGoals" className="block text-sm font-medium text-gray-700">Relationship Goals</label>
          <input type="text" name="relationshipGoals" id="relationshipGoals" value={userData.relationshipGoals} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
        </div>
        <div>
          <label htmlFor="bio" className="block text-sm font-medium text-gray-700">Bio</label>
          <textarea name="bio" id="bio" value={userData.bio} onChange={handleChange} rows="3" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"></textarea>
        </div>
        <div className="flex items-center">
          <input type="checkbox" name="isProfileVisible" id="isProfileVisible" checked={userData.isProfileVisible} onChange={handleChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"/>
          <label htmlFor="isProfileVisible" className="ml-2 block text-sm text-gray-900">Profile Visible</label>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        {successMessage && <p className="text-green-500 text-sm">{successMessage}</p>}

        <div className="flex justify-end space-x-3">
          <button type="button" onClick={() => navigate('/admin/users')} className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold px-4 py-2 rounded shadow-md">
            Cancel
          </button>
          <button type="submit" disabled={isLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded shadow-md disabled:bg-gray-400">
            {isLoading ? 'Saving...' : (isNewUser ? 'Create User' : 'Save Changes')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminUserEditPage;
