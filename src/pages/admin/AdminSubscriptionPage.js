import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/apiClient';
import logger from '../../utils/logger';

const AdminSubscriptionPage = () => {
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });
    const [pendingSlips, setPendingSlips] = useState([]);
    const [isLoadingSlips, setIsLoadingSlips] = useState(false);
    const [reviewingSlipId, setReviewingSlipId] = useState(null);

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
            const data = await apiClient.get(`/admin/users?${queryParams.toString()}`);
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

    const fetchPendingSlips = useCallback(async () => {
        setIsLoadingSlips(true);
        try {
            const data = await apiClient.get('/admin/subscriptions/pending');
            setPendingSlips(Array.isArray(data) ? data : []);
        } catch (err) {
            logger.error("Fetch pending bank slips error:", err);
            setPendingSlips([]);
        } finally {
            setIsLoadingSlips(false);
        }
    }, []);

    useEffect(() => {
        fetchPendingSlips();
    }, [fetchPendingSlips]);

    const handleBankSlipAction = async (subscription, action) => {
        let reason;
        if (action === 'reject') {
            reason = window.prompt('Reason for rejecting this bank slip:');
            if (!reason || !reason.trim()) return;
        } else if (!window.confirm('Approve this bank-slip subscription?')) {
            return;
        }
        setReviewingSlipId(subscription._id);
        try {
            await apiClient.post(`/admin/subscriptions/${subscription._id}/${action}`, action === 'reject' ? { reason } : {});
            await fetchPendingSlips();
            alert(action === 'approve' ? 'Bank slip approved.' : 'Bank slip rejected.');
            if (action === 'approve') fetchUsers(searchTerm, sortConfig);
        } catch (err) {
            alert(`Bank-slip review failed: ${err.message}`);
        } finally {
            setReviewingSlipId(null);
        }
    };

    const handleViewBankSlip = async (key) => {
        const popup = window.open('', '_blank');
        if (!popup) {
            alert('Please allow pop-ups to view the bank slip.');
            return;
        }
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/api/admin/bank-slips/${encodeURIComponent(key)}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!response.ok) throw new Error('Unable to load the private bank slip.');
            const objectUrl = URL.createObjectURL(await response.blob());
            popup.location.href = objectUrl;
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        } catch (err) {
            popup.close();
            alert(err.message || 'Unable to open bank slip.');
        }
    };

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
            await apiClient.put(`/admin/users/${userId}/subscription`, { plan: newPlan });
            // Refetch users to show the updated plan
            fetchUsers(searchTerm, sortConfig);
            alert('User subscription updated successfully.');
        } catch (err) {
            alert(`Error updating subscription: ${err.message}`);
        }
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-semibold text-gray-800 mb-6">Subscription Management</h1>

            <section className="bg-white shadow-md rounded-lg p-4 mb-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-800">Pending bank-slip subscriptions</h2>
                    <button onClick={fetchPendingSlips} className="px-3 py-2 border rounded-md" disabled={isLoadingSlips}>
                        {isLoadingSlips ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>
                {isLoadingSlips ? <p>Loading pending bank slips…</p> : pendingSlips.length === 0 ? <p className="text-sm text-gray-500">No pending bank slips.</p> : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50"><tr>
                                <th className="px-3 py-2 text-left text-xs uppercase">User</th>
                                <th className="px-3 py-2 text-left text-xs uppercase">Plan</th>
                                <th className="px-3 py-2 text-left text-xs uppercase">Submitted</th>
                                <th className="px-3 py-2 text-left text-xs uppercase">Bank slip</th>
                                <th className="px-3 py-2 text-left text-xs uppercase">Review</th>
                            </tr></thead>
                            <tbody className="divide-y divide-gray-200">
                                {pendingSlips.map(subscription => (
                                    <tr key={subscription._id}>
                                        <td className="px-3 py-3 text-sm">
                                            <div>{subscription.user?.name || 'Unknown user'}</div>
                                            <div className="text-gray-500">{subscription.user?.email || ''}</div>
                                        </td>
                                        <td className="px-3 py-3 text-sm">{subscription.planId || subscription.plan} ({subscription.durationDays || '?'} days)</td>
                                        <td className="px-3 py-3 text-sm">{subscription.createdAt ? new Date(subscription.createdAt).toLocaleString() : '—'}</td>
                                        <td className="px-3 py-3 text-sm">
                                            <button onClick={() => handleViewBankSlip(subscription.bankSlipUrl)} className="underline text-blue-700">View private image</button>
                                        </td>
                                        <td className="px-3 py-3 text-sm whitespace-nowrap">
                                            <button onClick={() => handleBankSlipAction(subscription, 'approve')} disabled={reviewingSlipId === subscription._id} className="px-3 py-1 mr-2 rounded bg-green-600 text-white disabled:opacity-50">Approve</button>
                                            <button onClick={() => handleBankSlipAction(subscription, 'reject')} disabled={reviewingSlipId === subscription._id} className="px-3 py-1 rounded bg-red-600 text-white disabled:opacity-50">Reject</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

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
