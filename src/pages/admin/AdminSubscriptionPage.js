import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/apiClient';
import logger from '../../utils/logger';

const AdminSubscriptionPage = () => {
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });

    const fetchUsers = useCallback(async (search, sort) => {
        setIsLoading(true);
        setError(null);
        try {
            const queryParams = new URLSearchParams({
                limit: 1000, // A high limit to get all users
                ...(search && { search }),
                sortBy: sort.key,
                sortOrder: sort.direction,
            });
            const data = await apiClient.get(`/api/admin/users?${queryParams.toString()}`);
            setUsers(data.users || []);
        } catch (err) {
            setError(err.message);
            logger.error("Fetch users error:", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        // Using a simple debounce effect for search
        const handler = setTimeout(() => {
            fetchUsers(searchTerm, sortConfig);
        }, 300);

        return () => {
            clearTimeout(handler);
        };
    }, [searchTerm, sortConfig, fetchUsers]);

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

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

            <div className="mb-4">
                <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md shadow-sm w-1/3"
                />
            </div>

            {isLoading && <p className="text-center p-4">Loading users...</p>}
            {error && <p className="text-center text-red-500 p-4">Error: {error}</p>}

            {!isLoading && !error && (
                <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    <button onClick={() => handleSort('name')} className="font-medium">
                                        Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                    </button>
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    <button onClick={() => handleSort('email')} className="font-medium">
                                        Email {sortConfig.key === 'email' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                    </button>
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    <button onClick={() => handleSort('plan')} className="font-medium">
                                        Current Plan {sortConfig.key === 'plan' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                    </button>
                                </th>
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
