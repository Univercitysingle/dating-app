import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import SuperLikeNotification from './SuperLikeNotification';
import ProfileDetailView from './profile/ProfileDetailView';
import { resolvePhotoUrl, resolveWorkerPhotoUrl } from '../utils/media';

const SwipeCard = ({ user, onVote, onSwipe, style, superLike }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [exitX, setExitX] = useState(0);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-30, 30]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);

  useEffect(() => {
    if (!isExpanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsExpanded(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExpanded]);

  if (!user) {
    return null;
  }

  const { name, age, photos } = user;
  const rawImageSources =
    photos && photos.length > 0
      ? photos.map(photo => typeof photo === 'string' ? photo : photo?.url).filter(Boolean)
      : ['https://placehold.co/400x600?text=Profile+Image'];
  const imageSources = rawImageSources.map(resolvePhotoUrl);
  const workerFallbackUrl = resolveWorkerPhotoUrl(rawImageSources[currentImageIndex]);

  const handleDragEnd = (event, info) => {
    if (info.offset.x > 100) {
      setExitX(300);
      onVote(user.uid, 'right');
    } else if (info.offset.x < -100) {
      setExitX(-300);
      onVote(user.uid, 'left');
    }
  };

  const changeImage = (direction) => {
    setCurrentImageIndex((prevIndex) => {
      if (direction === 'next') {
        return (prevIndex + 1) % imageSources.length;
      } else {
        return (prevIndex - 1 + imageSources.length) % imageSources.length;
      }
    });
  };

  return (
    <>
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragEnd={handleDragEnd}
      onTap={() => setIsExpanded(true)}
      onAnimationComplete={onSwipe}
      exit={{ x: exitX, opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      style={{ x, rotate, ...style }}
      className="absolute w-full h-full cursor-grab"
      whileTap={{ cursor: 'grabbing' }}
    >
      <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-card bg-neutral-800 border border-neutral-700">
        <motion.div
            style={{ opacity: likeOpacity }}
            className="absolute top-1/4 left-8 text-6xl font-extrabold text-green-500 border-4 border-green-500 p-4 rounded-xl -rotate-24 transform"
        >
            LIKE
        </motion.div>
        <motion.div
            style={{ opacity: nopeOpacity }}
            className="absolute top-1/4 right-8 text-6xl font-extrabold text-red-500 border-4 border-red-500 p-4 rounded-xl rotate-24 transform"
        >
            NOPE
        </motion.div>

        {superLike && <SuperLikeNotification />}

        <motion.div className="w-full h-full overflow-y-auto">
            <div className="relative w-full h-full">
                <img
                    src={imageSources[currentImageIndex]}
                    alt={name ? `${name}'s profile photo` : 'User profile photo'}
                    loading={currentImageIndex === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    draggable={false}
                    onError={(event) => {
                      const image = event.currentTarget;
                      if (workerFallbackUrl && image.src !== workerFallbackUrl) {
                        image.src = workerFallbackUrl;
                        return;
                      }
                      image.onerror = null;
                      image.src = '/logo.jpg';
                    }}
                    className="profile-card-photo h-full w-full object-cover"
                />

                {/* Navigation Areas */}
                <div className="absolute inset-0 flex">
                    <button
                    type="button"
                    aria-label="Previous profile photo"
                    className="h-full w-1/2 bg-transparent"
                    onClick={(event) => { event.stopPropagation(); changeImage('prev'); }}
                    />
                    <button
                    type="button"
                    aria-label="Next profile photo"
                    className="h-full w-1/2 bg-transparent"
                    onClick={(event) => { event.stopPropagation(); changeImage('next'); }}
                    />
                </div>

                {/* Image Indicators */}
                <div className="absolute top-2 left-2 right-2 flex space-x-1 z-10">
                    {imageSources.map((_, index) => (
                    <div key={index} className="h-1 flex-1 rounded-full bg-neutral-50/50">
                        <div
                        className={`h-full rounded-full ${
                            index === currentImageIndex ? 'bg-neutral-50' : ''
                        }`}
                        style={{
                            width: '100%',
                            transform: `scaleX(${index === currentImageIndex ? 1 : 0})`,
                            transformOrigin: 'left',
                            transition: 'transform 0.3s ease-in-out',
                        }}
                        />
                    </div>
                    ))}
                </div>

                {/* Info button */}
                <div className="absolute top-4 right-4 z-10">
                    <button type="button" onClick={(event) => { event.stopPropagation(); setIsExpanded(true); }} className="rounded-full bg-black/35 p-2 text-neutral-50 opacity-90 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white" aria-label="View full profile details">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </button>
                </div>

                {/* Basic Info Overlay */}
                <div className="discover-card-caption absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-neutral-950/95 via-neutral-900/35 to-transparent h-1/2 flex flex-col justify-end">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      {user.verified && <span className="discover-profile-badge"><span aria-hidden="true">✓</span> Verified</span>}
                      {user.relationshipGoals && <span className="discover-profile-badge">{user.relationshipGoals}</span>}
                    </div>
                    <h3 className="text-3xl font-extrabold text-neutral-50">
                      {name || 'Unknown User'}{age ? <span className="ml-2 font-semibold">{age}</span> : null}
                    </h3>
                    {(user.occupation || user.location) && (
                      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-white/90">
                        {user.occupation && <span>{user.occupation}</span>}
                        {user.occupation && user.location && <span aria-hidden="true">·</span>}
                        {user.location && <span>{typeof user.location === 'string' ? user.location : user.location?.city || user.location?.name || ''}</span>}
                      </p>
                    )}
                    {user.bio && <p className="mt-2 line-clamp-2 max-w-[34ch] text-sm leading-relaxed text-white/85">{user.bio}</p>}
                    <p className="mt-3 text-[11px] font-semibold tracking-wide text-white/75">TAP THE CARD FOR MORE DETAILS</p>
                </div>
            </div>

            {/* Details are presented in a full-screen accessible overlay below, not clipped inside the swipe card. */}
        </motion.div>
      </div>
    </motion.div>
    {isExpanded && typeof document !== 'undefined' && createPortal(
      <div
        className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-5"
        role="presentation"
        onMouseDown={(event) => { if (event.target === event.currentTarget) setIsExpanded(false); }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-label={`Full profile for ${name || 'user'}`}
          className="relative flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden bg-neutral-900 text-white shadow-2xl sm:h-[min(90dvh,900px)] sm:rounded-3xl sm:border sm:border-neutral-700"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/75 to-transparent p-4">
            <span className="rounded-full bg-black/35 px-3 py-1 text-xs font-semibold tracking-wide text-white/90">PROFILE</span>
            <button type="button" onClick={() => setIsExpanded(false)} aria-label="Close profile details" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-2xl text-white hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-white">×</button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="relative h-[55vh] min-h-[330px] max-h-[560px] bg-neutral-800 sm:h-[460px]">
              <img
                src={imageSources[currentImageIndex]}
                alt={name ? `${name}'s profile photo` : 'User profile photo'}
                className="h-full w-full object-cover"
                decoding="async"
                onError={(event) => {
                  const image = event.currentTarget;
                  if (workerFallbackUrl && image.src !== workerFallbackUrl) { image.src = workerFallbackUrl; return; }
                  image.onerror = null;
                  image.src = '/logo.jpg';
                }}
              />
              <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-neutral-950 via-neutral-950/45 to-transparent" />
              {imageSources.length > 1 && <>
                <button type="button" aria-label="Previous profile photo" onClick={() => changeImage('prev')} className="absolute inset-y-16 left-0 w-1/3 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white" />
                <button type="button" aria-label="Next profile photo" onClick={() => changeImage('next')} className="absolute inset-y-16 right-0 w-1/3 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white" />
                <div className="absolute left-4 right-4 top-16 flex gap-1.5">
                  {imageSources.map((_, index) => <div key={index} className={`h-1 flex-1 rounded-full ${index === currentImageIndex ? 'bg-white' : 'bg-white/40'}`} />)}
                </div>
              </>}
              <div className="absolute inset-x-0 bottom-0 p-6 pb-8">
                <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{name || 'Unknown User'}{age ? <span className="ml-2 font-medium">{age}</span> : null}</h2>
                {user.location && <p className="mt-2 flex items-center gap-2 text-sm text-white/85"><span aria-hidden="true">⌖</span>{typeof user.location === 'string' ? user.location : user.location?.city || user.location?.name || ''}</p>}
                {user.occupation && <p className="mt-1 text-sm text-white/85">{user.occupation}</p>}
              </div>
            </div>
            <ProfileDetailView user={user} />
          </div>
          <footer className="z-10 flex shrink-0 items-center justify-center gap-5 border-t border-neutral-700 bg-neutral-900 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={() => { setIsExpanded(false); onVote(user.uid, 'left'); }} className="flex h-14 w-14 items-center justify-center rounded-full border border-red-400/40 bg-neutral-800 text-2xl text-red-400 shadow-lg transition hover:scale-105 hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-400" aria-label="Pass on this profile">×</button>
            <span className="text-xs text-neutral-400">Not for me</span>
            <button type="button" onClick={() => { setIsExpanded(false); onVote(user.uid, 'right'); }} className="flex h-14 w-14 items-center justify-center rounded-full bg-pink-600 text-2xl text-white shadow-lg transition hover:scale-105 hover:bg-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-300" aria-label={`Like ${name || 'this profile'}`}>♥</button>
            <span className="text-xs text-neutral-400">Like</span>
          </footer>
        </section>
      </div>,
      document.body
    )}
    </>
  );
};

SwipeCard.propTypes = {
    user: PropTypes.shape({
        _id: PropTypes.string.isRequired,
        name: PropTypes.string,
        age: PropTypes.number,
        photos: PropTypes.arrayOf(PropTypes.shape({
            url: PropTypes.string.isRequired,
        })),
        bio: PropTypes.string,
        interests: PropTypes.arrayOf(PropTypes.string),
        profilePrompts: PropTypes.array,
        lifestyle: PropTypes.object,
        badges: PropTypes.object,
        education: PropTypes.string,
        relationshipGoals: PropTypes.string,
    }),
    onVote: PropTypes.func.isRequired,
    onSwipe: PropTypes.func.isRequired,
    style: PropTypes.object,
};

export default SwipeCard;