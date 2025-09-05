import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/apiClient';
import logger from '../../utils/logger';

const AdminSubscriptionPage = () => {
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Fetch all users - for simplicity, not implementing pagination for now
            const data = await apiClient.get('/api/admin/users?limit=1000'); // A high limit to get all users
            setUsers(data.users || []);
        } catch (err) {
            setError(err.message);
            logger.error("Fetch users error:", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handlePlanChange = async (userId, newPlan) => {
        if (!window.confirm(`Are you sure you want to change this user's plan to '${newPlan}'?`)) return;
        try {
            await apiClient.put(`/api/admin/users/${userId}/subscription`, { plan: newPlan });
            // Refetch users to show the updated plan
            fetchUsers();
            alert('User subscription updated successfully.');
        } catch (err) {
            alert(`Error updating subscription: ${err.message}`);
        }
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-semibold text-gray-800 mb-6">Subscription Management</h1>

            {isLoading && <p className="text-center p-4">Loading users...</p>}
            {error && <p className="text-center text-red-500 p-4">Error: {error}</p>}

            {!isLoading && !error && (
                <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Plan</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Change Plan</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {users.map(user => (
                                <tr key={user._id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.plan}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <select
                                            defaultValue={user.plan}
                                            onChange={(e) => handlePlanChange(user._id, e.target.value)}
                                            className="px-3 py-1 border border-gray-300 rounded-md shadow-sm"
                                        >
                                            <option value="basic">Basic</option>
                                            <option value="premium">Premium</option>
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default AdminSubscriptionPage;
