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
                <h1 className="text-2xl font-bold mb-4">Who Likes You</h1>
                {users.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {users.map(user => (
                            <div key={user.uid} className="relative bg-white rounded-lg shadow-md overflow-hidden">
                                {user.isBlurred ? (
                                    <div className="relative">
                                        <img src={user.photoUrl || 'https://via.placeholder.com/150'} alt="A potential match" className="w-full h-48 object-cover filter blur-md" />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                                            <Link to="/premium" className="text-white font-bold text-lg">Upgrade to see</Link>
                                        </div>
                                    </div>
                                ) : (
                                    <Link to={`/profile/${user.uid}`}>
                                        <img src={user.photos[0]?.url || 'https://via.placeholder.com/150'} alt={user.name} className="w-full h-48 object-cover" />
                                    <div>
                                        <Link to={`/profile/${user.uid}`}>
                                            <img src={user.photos[0]?.url || 'https://via.placeholder.com/150'} alt={user.name} className="w-full h-48 object-cover" />
                                            <div className="p-4">
                                                <h2 className="text-lg font-semibold">{user.name}</h2>
                                                <p className="text-gray-600">{user.age} years old</p>
                                            </div>
                                        </Link>
                                        <div className="p-4">
                                            <button onClick={() => handleChat(user.uid)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded shadow-md">
                                                Chat
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {user.likeType === 'superlike' && !user.isBlurred && (
                                    <div className="absolute top-2 right-2 bg-blue-500 text-white p-1 rounded-full text-xs">
                                        Superlike
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-center">No one has liked you yet. Keep swiping!</p>
                )}
            </div>
        </MainLayout>
    );
};

export default LikesPage;
