import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LikesPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();

    const handleChat = (targetUid) => {
        if (!currentUser || !currentUser.uid) {
            alert("Your user ID is not available, cannot start chat.");
            return;
        }
        const chatId = [currentUser.uid, targetUid].sort().join('-');
        navigate(`/chat/${chatId}`);
    };

    useEffect(() => {
        const fetchLikes = async () => {
            try {
                const response = await apiClient.get('/users/likes');
                console.log("Likes API raw response:", response);

                if (response.forbidden) {
                    setError(response.error || 'This feature is for premium users only.');
                } else {
                    // ✅ Ensure we set the actual data array
                    const usersArray = response.data || response;
                    setUsers(Array.isArray(usersArray) ? usersArray : []);
                }
            } catch (err) {
                setError(err.message || 'An error occurred');
            } finally {
                setLoading(false);
            }
        };

        fetchLikes();
    }, []);

    if (loading) {
        return <div className="state-panel mx-4 my-8 text-center">Loading people who liked you…</div>;
    }

    if (error) {
        return <div className="state-panel state-error mx-4 my-8 text-center" role="alert">{error}</div>;
    }

    return (
        <div className="page-container likes-page mx-auto w-full max-w-4xl p-4 sm:p-6">
            <div className="mb-6"><p className="page-eyebrow">A LITTLE SPARK</p><h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Who likes you</h1><p className="mt-2 text-sm text-gray-500">See who is interested and start a conversation.</p></div>
            {users.length > 0 ? (
                <ul className="space-y-4">
                    {users.map(user => (
                        <li
                            key={user._id || user.uid}
                            className="like-card flex items-center justify-between gap-4 rounded-2xl p-4 sm:p-5"
                        >
                            <div className="min-w-0">
                                <p className="truncate font-semibold text-gray-900">{user.name}</p>
                                <p className="text-gray-600 text-sm">{user.bio}</p>
                            </div>
                            <button
                                onClick={() => handleChat(user.uid)}
                                className="app-primary-button flex-shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold text-white"
                            >
                                Chat
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="empty-state rounded-2xl p-10 text-center"><p className="text-lg font-semibold text-gray-800">No likes to show just yet</p><p className="mt-2 text-sm text-gray-500">Keep your profile fresh and check back soon.</p></div>
            )}
        </div>
    );
};

export default LikesPage;
