import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/apiClient';
import { Link } from 'react-router-dom';
import { resolvePhotoUrl } from '../utils/media';
import LoadingState from '../components/LoadingState';
import { getUserFriendlyError } from '../utils/apiErrors';

const LikesPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchLikes = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await apiClient.get('/users/likes');
            if (response?.forbidden) {
                setError('This feature is available with an eligible premium plan.');
            } else {
                const usersArray = response?.data || response;
                setUsers(Array.isArray(usersArray) ? usersArray : []);
            }
        } catch (err) {
            setError(getUserFriendlyError(err, 'We could not load your likes. Please try again.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLikes();
    }, [fetchLikes]);

    if (loading) {
        return <LoadingState spinnerOnly />;
    }

    if (error) {
        return <div className="state-panel state-error mx-4 my-8 text-center" role="alert"><p>{error}</p><button type="button" onClick={fetchLikes} className="app-primary-button mt-4 rounded-full px-5 py-2.5 text-sm font-semibold text-white">Try again</button></div>;
    }

    return (
        <div className="page-container likes-page mx-auto w-full max-w-4xl p-4 sm:p-6">
            <div className="mb-6"><p className="page-eyebrow">A LITTLE SPARK</p><h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Who likes you</h1><p className="mt-2 text-sm text-gray-500">See who is interested and start a conversation.</p></div>
            {users.length > 0 ? (
                <ul className="space-y-4">
                    {users.map(user => (
                        <li
                            key={user.likeId || user._id || user.uid || index}
                            className="like-card flex items-center justify-between gap-4 rounded-2xl p-4 sm:p-5"
                        >
                            <div className="flex min-w-0 flex-1 items-center gap-4">
                                <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-gray-100">
                                    {user.photos?.[0]?.url ? (
                                        <img
                                            src={resolvePhotoUrl(user.photos[0].url)}
                                            alt=""
                                            loading="lazy"
                                            className={`h-full w-full object-cover ${user.isBlurred ? 'blur-md scale-110' : ''}`}
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-2xl text-gray-400" aria-hidden="true">♡</div>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-gray-900">
                                        {user.isBlurred ? 'Someone likes you' : `${user.name}${user.age ? `, ${user.age}` : ''}`}
                                    </p>
                                    {!user.isBlurred && <p className="line-clamp-2 text-gray-600 text-sm">{user.bio || 'Someone would love to connect with you.'}</p>}
                                    {user.isBlurred && <p className="mt-1 text-xs font-medium text-gray-500">Unlock Premium to reveal this profile</p>}
                                </div>
                            </div>
                            <Link
                                to={user.isBlurred ? '/premium' : `/profile/${encodeURIComponent(user.uid)}`}
                                className="app-primary-button flex-shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold text-white"
                            >
                                {user.isBlurred ? 'Unlock likes' : 'View profile'}
                            </Link>
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
