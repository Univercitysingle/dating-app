import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext'; // Adjust as needed
import { PREDEFINED_PERSONALITY_TYPES } from '../../utils/constants'; // For role enum if needed, or define roles here

// Define roles available for selection
const AVAILABLE_ROLES = ['user', 'contributor', 'admin', 'superadmin'];

const AdminUserEditPage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: adminUser } = useAuth(); // Current admin user performing the edits

  const isNewUser = !userId;
  const [userData, setUserData] = useState({
    name: '',
    email: '',
    password: '', // Only for new user creation
    role: 'user',
    isProfileVisible: true,
    education: '',
    relationshipGoals: '',
    bio: '',
    // Add other fields as necessary: interests, profilePrompts, etc.
    // For complex fields like profilePrompts (array of objects) or socialMediaLinks (Map),
    // you might need more complex input handling than simple text fields.
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
        // Ensure all relevant fields fetched are set
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

    // Prepare payload, remove password if it's empty (for updates or if not set for new user)
    const payload = { ...userData };
    if (!isNewUser || (isNewUser && !payload.password)) {
      delete payload.password;
    }

    // Ensure role is not empty if creating user
    if (isNewUser && !payload.role) {
        payload.role = 'user'; // Default role if not set
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
      if (isNewUser && responseData._id) { // If new user created, redirect to its edit page or list
        navigate(`/admin/users/${responseData._id}/edit`); // Or navigate('/admin/users')
      } else if (!isNewUser) {
        // Optionally re-fetch data after update if backend doesn't return full updated object
        // or if there are computed fields. For now, assume backend returns updated user.
        // If backend returns the updated user, we can update state:
        // setUserData(responseData); // Assuming responseData is the updated user
      }
      // No automatic redirect from edit page unless desired
    } catch (err) {
      setError(err.message);
      console.error("Save user error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Determine which roles the current admin can assign
  const getAssignableRoles = () => {
    if (adminUser && adminUser.role === 'superadmin') {
      return AVAILABLE_ROLES;
    }
    if (adminUser && adminUser.role === 'admin') {
      return AVAILABLE_ROLES.filter(r => r !== 'superadmin');
    }
    return []; // Should not happen if page is protected by AdminLayout
  };
  const assignableRoles = getAssignableRoles();


  if (isLoading && !isNewUser) return <p className="p-4 text-center">Loading user data...</p>;
  // Error for data fetching (edit mode)
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

        {/* Display general form error or success messages */}
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
