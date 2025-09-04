import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import { Link, useNavigate } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
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
                const response = await apiClient.get('/api/users/likes');
                if (response.forbidden) {
                    setError(response.error || 'This feature is for premium users only.');
                } else {
                    setUsers(response);
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
        return <MainLayout><div className="text-center">Loading...</div></MainLayout>;
    }

    if (error) {
        return <MainLayout><div className="text-center text-red-500">{error}</div></MainLayout>;
    }

    return (
        <MainLayout>
            <div className="container mx-auto p-4">
                <h1 className="text-2xl font-bold mb-4">Who Likes You (Debug View)</h1>
                {users.length > 0 ? (
                    <ul>
                        {users.map(user => (
                            <li key={user.uid}>{user.name}</li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-center">No users found.</p>
                )}
            </div>
        </MainLayout>
    );
};

export default LikesPage;
