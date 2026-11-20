import React, { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../api/apiClient';
import { Link } from 'react-router-dom';
import { resolvePhotoUrl, resolveWorkerPhotoUrl, PLACEHOLDER_IMAGE } from '../utils/media';
import LoadingState from '../components/LoadingState';
import { getUserFriendlyError } from '../utils/apiErrors';

const LikesPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const requestSequence = useRef(0);
    const hasUsers = useRef(false);
    hasUsers.current = users.length > 0;

    const fetchLikes = useCallback(async ({ silent = false } = {}) => {
        const sequence = ++requestSequence.current;
        if (!silent) {
            setLoading(true);
            setError(null);
        }
        try {
            const response = await apiClient.get('/users/likes');
            if (sequence !== requestSequence.current) return;
            if (response?.forbidden) {
                setUsers([]);
                setError('This feature is available with an eligible premium plan.');
            } else {
                const usersArray = response?.data || response;
                setUsers(Array.isArray(usersArray) ? usersArray : []);
            }
        } catch (err) {
            if (sequence !== requestSequence.current) return;
            // Keep the last successful list visible during a background refresh failure.
            setError(getUserFriendlyError(
                err,
                hasUsers.current
                    ? 'Your likes are shown from the last update. We could not refresh them just now.'
                    : 'We could not load your likes. Please try again.'
            ));
        } finally {
            if (sequence === requestSequence.current && !silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLikes();
        const refreshIfVisible = () => {
            if (document.visibilityState === 'visible') fetchLikes({ silent: true });
        };
        const intervalId = window.setInterval(refreshIfVisible, 30000);
        document.addEventListener('visibilitychange', refreshIfVisible);
        window.addEventListener('focus', refreshIfVisible);
        return () => {
            requestSequence.current += 1;
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', refreshIfVisible);
            window.removeEventListener('focus', refreshIfVisible);
        };
    }, [fetchLikes]);

    if (loading) {
        return <LoadingState spinnerOnly />;
    }

    if (error && users.length === 0) {
        return <div className="state-panel state-error mx-4 my-8 text-center" role="alert"><p>{error}</p><button type="button" onClick={fetchLikes} className="app-primary-button mt-4 rounded-full px-5 py-2.5 text-sm font-semibold text-white">Try again</button></div>;
    }

    return (
        <div className="page-container likes-page mx-auto w-full max-w-4xl p-4 sm:p-6">
            <header className="likes-heading mb-7 sm:mb-9"><p className="page-eyebrow">A LITTLE SPARK</p><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">People who like you</h1><p className="mt-2 text-sm text-gray-500">A little interest can be the beginning of something lovely.</p></div><span className="likes-total">{users.length} {users.length === 1 ? "like" : "likes"}</span></div></header>
            {error && users.length > 0 && (
                <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
                    Your likes are shown from the last update. We could not refresh them just now.
                </p>
            )}
            {users.length > 0 ? (
                <ul className="space-y-4">
                    {users.map((user, index) => (
                        <li
                            key={user.likeId || user._id || user.uid || index}
                            className="like-card flex items-center justify-between gap-4 rounded-2xl p-4 sm:p-5"
                        >
                            <div className="flex min-w-0 flex-1 items-center gap-4">
                                <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-gray-100">
                                    {(typeof user.photos?.[0] === "string" ? user.photos[0] : user.photos?.[0]?.url) ? (
                                        <img
                                            src={resolvePhotoUrl(typeof user.photos[0] === "string" ? user.photos[0] : user.photos[0].url)}
                                            alt={user.isBlurred ? "Hidden profile photo" : `${user.name || "Member"} profile`}
                                            loading="lazy"
                                            onError={(event) => {
                                                const image = event.currentTarget;
                                                const value = typeof user.photos?.[0] === "string" ? user.photos[0] : user.photos?.[0]?.url;
                                                const fallback = value ? resolveWorkerPhotoUrl(value) : PLACEHOLDER_IMAGE;
                                                if (fallback && image.src !== fallback) image.src = fallback;
                                                else if (image.src !== PLACEHOLDER_IMAGE) image.src = PLACEHOLDER_IMAGE;
                                            }}
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
                <div className="likes-empty"><div className="likes-empty-art" aria-hidden="true">♡</div><p className="page-eyebrow">GOOD THINGS TAKE TIME</p><h2>Your next connection could be around the corner.</h2><p>Keep your profile genuine, add a few great photos and explore people who share your interests.</p><Link to="/discover" className="app-primary-button likes-empty-action">Explore people</Link></div>
            )}
        </div>
    );
};

export default LikesPage;
