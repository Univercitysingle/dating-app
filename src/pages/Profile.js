import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import apiClient from '../api/apiClient';

// Import all necessary components
import InterestsDisplay from '../components/InterestsDisplay';
import InterestsEditor from '../components/InterestsEditor';
import ProfilePromptsDisplay from '../components/ProfilePromptsDisplay';
import ProfilePromptsEditor from '../components/ProfilePromptsEditor';
import PhotoGallery from '../components/PhotoGallery';
import PhotoEditor from '../components/PhotoEditor';
import LifestyleEditor from '../components/LifestyleEditor';
import BadgesDisplay from '../components/BadgesDisplay';
import { API_URL } from '../utils/constants';
import { validateMobileNumber } from '../utils/helpers';
import SectionCard from '../components/profile/SectionCard';

// Reusable components
const PremiumBadge = () => (
  <span className="ml-2 px-2 py-1 text-xs font-semibold text-accent-dark bg-accent rounded-full">Premium</span>
);

const VerifiedBadge = () => (
  <span className="ml-2 px-2 py-1 text-xs font-semibold text-green-800 bg-green-300 rounded-full flex items-center">
    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
    Verified
  </span>
);

function Profile() {
  const { userId } = useParams();
  const { user: currentUser, logout, setUser } = useAuth();
  const { socket } = useSocket();
  const { theme, toggleTheme } = useTheme();
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditingPhotos, setIsEditingPhotos] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [suggestedCountryCode, setSuggestedCountryCode] = useState('');

  // State for editable fields
  const [editableFields, setEditableFields] = useState({
      education: '',
      relationshipGoals: '',
      bio: '',
      personalityType: '',
      interests: [],
      profilePrompts: [],
      lifestyle: {},
      badges: {},
      familyStatus: '',
      siblings: '',
  });

  // State for save statuses
  const [saveStatus, setSaveStatus] = useState('');
  const [subscriptions, setSubscriptions] = useState([]);


  const navigate = useNavigate();

  useEffect(() => {
    const logger = console; // Using console for component-level logs for now
    logger.log(`Profile.js: useEffect triggered. Deps: userId=${userId}, currentUser.uid=${currentUser?.uid}`);

    const fetchProfile = async () => {
        logger.log(`Profile.js: Fetching profile for userId: ${userId}`);
        try {
            const data = await apiClient.get(`/users/${userId}`);
            setProfile(data);
        } catch (error) {
            setFetchError(error.message || 'Failed to fetch profile.');
        }
    };

    const fetchOwnProfile = async () => {
        logger.log("Profile.js: Fetching own profile (/users/me).");
        try {
            const data = await apiClient.get('/users/me');
            logger.log("Profile.js: Successfully fetched own profile.", data);
            setProfile(data);
            setEditableFields({
                education: data.education || '',
                relationshipGoals: data.relationshipGoals || 'Figuring it out',
                bio: data.bio || '',
                personalityType: data.personalityType || '',
                interests: data.interests || [],
                profilePrompts: data.profilePrompts || [],
                lifestyle: data.lifestyle || {},
                badges: data.badges || {},
                sexualOrientation: data.sexualOrientation || '',
                mobileNumber: data.mobileNumber || '',
                familyStatus: data.familyStatus || '',
                siblings: data.siblings || '',
            });
        } catch (error) {
            setFetchError(error.message || 'Failed to fetch own profile.');
        }
    };

    const fetchSubscriptionHistory = async () => {
        try {
            const subs = await apiClient.get('/users/me/subscriptions');
            if (Array.isArray(subs)) {
                setSubscriptions(subs);
            } else {
                setSubscriptions([]);
            }
        } catch (error) {
            console.error('Failed to fetch subscription history:', error);
            setSubscriptions([]); // Ensure it's an array on error too
        }
    };

    if (userId) {
        fetchProfile();
    } else if (currentUser) {
        fetchOwnProfile();
        fetchSubscriptionHistory();
        apiClient.get('/geolocation').then(geo => {
            const countryCodeMapping = {
                'US': '+1',
                'GB': '+44',
                'IN': '+91',
                // Add more mappings as needed
            };
            const code = countryCodeMapping[geo.country];
            if (code) {
                setSuggestedCountryCode(code);
            }
        }).catch(err => console.error('Could not fetch geolocation for country code suggestion.', err));
    }
  }, [userId, currentUser?.uid]);

  useEffect(() => {
    const profileUid = userId || currentUser?.uid;

    if (socket && profileUid) {
      socket.emit('subscribeToProfile', profileUid);
      socket.on('profileUpdated', (updatedProfile) => {
        if (updatedProfile.uid === profileUid) {
          setProfile(updatedProfile);
        }
      });

      return () => {
        socket.emit('unsubscribeFromProfile', profileUid);
        socket.off('profileUpdated');
      };
    }
  }, [socket, userId, currentUser?.uid]);

  const handleFieldChange = (e) => {
      const { id, value } = e.target;
      if (id === 'mobileNumber') {
          const mobileValue = validateMobileNumber(value);
          if (mobileValue.length > 16) {
              return;
          }
          setEditableFields(prev => ({...prev, [id]: mobileValue}));
          return;
      }
      if (id === 'relationshipGoals' && value !== 'Long-term relationship') {
        setEditableFields(prev => ({
          ...prev,
          [id]: value,
          familyStatus: '',
          siblings: '',
        }));
      } else {
        setEditableFields(prev => ({...prev, [id]: value}));
      }
  }

  const handleSaveAll = async () => {
      const logger = console;
      logger.log("Profile.js: handleSaveAll called.");
      if (!editableFields.mobileNumber) {
          toast.error('Mobile number is required.');
          return;
      }
      setSaveStatus('Saving...');
      logger.log("Profile.js: Saving profile data...", editableFields);
      try {
          const updatedProfile = await apiClient.put('/users/me', editableFields);
          logger.log("Profile.js: Successfully saved profile. API response:", updatedProfile);
          setProfile(updatedProfile);
          setUser(updatedProfile); // Update global user state
          toast.success('Profile saved successfully!');
          setIsEditing(false);
      } catch (error) {
          logger.error(`Profile.js: Error saving profile:`, error);
          toast.error(`Error: ${error.data?.message || 'Failed to save'}`);
      } finally {
          setSaveStatus('');
      }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleLikeBack = async () => {
    try {
      await apiClient.post('/swipe/like', { userId: profile.uid });
      navigate('/matches');
    } catch (error) {
      console.error('Error liking back:', error);
    }
  };

  const handleDecline = async () => {
    try {
      await apiClient.post('/swipe/pass', { userId: profile.uid });
      navigate('/matches');
    } catch (error) {
      console.error('Error declining:', error);
    }
  };

  if (fetchError) return <p className="text-red-500 p-4">Error: {fetchError}</p>;
  if (!profile) return <p className="p-4">Loading profile...</p>;

  const isOwnProfile = !userId || (currentUser && currentUser.uid === userId);
  // Contact details are private on other users' profiles; only the profile owner or superadmin may view them.
  const canViewSensitiveContact = Boolean(isOwnProfile || currentUser?.role === 'superadmin');
  const isPremium = profile.plan === 'premium';
  const isVerified = profile.isVerified === true;

  const renderContent = () => {
      switch(activeTab) {
          case 'profile':
              return (
                  <div className="space-y-6">
                      <SectionCard title="About Me">
                          {isEditing ? (
                              <div>
                                 <textarea id="bio" value={editableFields.bio} onChange={handleFieldChange} maxLength="75" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50"/>
                                 <p className="text-sm text-gray-500 mt-2">{editableFields.bio.length}/75 characters</p>
                              </div>
                          ) : (
                              <p className="text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap">{profile.bio || 'Tell us about yourself...'}</p>
                          )}
                      </SectionCard>

                      <SectionCard title="Profile Prompts">
                          {isEditing ? (
                              <ProfilePromptsEditor initialPrompts={editableFields.profilePrompts} onChange={(profilePrompts) => setEditableFields(prev => ({...prev, profilePrompts}))} />
                          ) : (
                              <ProfilePromptsDisplay profilePrompts={profile.profilePrompts || []} />
                          )}
                      </SectionCard>

                       <SectionCard title="Details">
                            {isEditing ? (
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Name</label>
                                        <input type="text" id="name" value={profile.name} disabled className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50"/>
                                    </div>
                                    <div>
                                        <label htmlFor="age" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Age</label>
                                        <input type="text" id="age" value={profile.age} disabled className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50"/>
                                    </div>
                                    <div>
                                        <label htmlFor="gender" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Gender</label>
                                        <input type="text" id="gender" value={profile.gender} disabled className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50"/>
                                    </div>
                                    <div>
                                        <label htmlFor="education" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Education</label>
                                        <input type="text" id="education" value={editableFields.education} onChange={handleFieldChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50"/>
                                    </div>
                                    <div>
                                        <label htmlFor="relationshipGoals" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Relationship Goals</label>
                                        <select
                                            id="relationshipGoals"
                                            value={editableFields.relationshipGoals}
                                            onChange={handleFieldChange}
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50"
                                        >
                                            <option value="Long-term relationship">Long-term relationship</option>
                                            <option value="Long-term, open to short">Long-term, open to short</option>
                                            <option value="Short-term, open to long">Short-term, open to long</option>
                                            <option value="Short-term fun">Short-term fun</option>
                                            <option value="New friends">New friends</option>
                                            <option value="Figuring it out">Figuring it out</option>
                                        </select>
                                    </div>
                                    {editableFields.relationshipGoals === 'Long-term relationship' && (
                                        <>
                                            <div>
                                                <label htmlFor="familyStatus" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Family Status</label>
                                                <select
                                                    id="familyStatus"
                                                    value={editableFields.familyStatus}
                                                    onChange={handleFieldChange}
                                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50"
                                                >
                                                    <option value="">Select...</option>
                                                    <option value="I don't have kids and don't want them">I don't have kids and don't want them</option>
                                                    <option value="I don't have kids and want them">I don't have kids and want them</option>
                                                    <option value="I have kids and don't want more">I have kids and don't want more</option>
                                                    <option value="I have kids and want more">I have kids and want more</option>
                                                    <option value="Not sure yet">Not sure yet</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label htmlFor="siblings" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Siblings</label>
                                                <input type="text" id="siblings" value={editableFields.siblings} onChange={handleFieldChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50"/>
                                            </div>
                                        </>
                                    )}
                                    <div>
                                        <label htmlFor="mobileNumber" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Mobile Number</label>
                                        <div className="mt-1 flex rounded-md shadow-sm">
                                            {suggestedCountryCode && (
                                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                                                    {suggestedCountryCode}
                                                </span>
                                            )}
                                            <input type="tel" id="mobileNumber" value={editableFields.mobileNumber} onChange={handleFieldChange} className="block w-full rounded-none rounded-r-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50" maxLength="16"/>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2 text-neutral-600 dark:text-neutral-300">
                                    <p><strong>Name:</strong> {profile.name}</p>
                                    <p><strong>Age:</strong> {profile.age}</p>
                                    {canViewSensitiveContact && <p><strong>Email:</strong> {profile.email || 'N/A'}</p>}
                                    <p><strong>Gender:</strong> {profile.gender}</p>
                                    <p><strong>Education:</strong> {profile.education || 'N/A'}</p>
                                    <p><strong>Relationship Goals:</strong> {profile.relationshipGoals || 'N/A'}</p>
                                    {profile.relationshipGoals === 'Long-term relationship' && (
                                        <>
                                            <p><strong>Family Status:</strong> {profile.familyStatus || 'N/A'}</p>
                                            <p><strong>Siblings:</strong> {profile.siblings || 'N/A'}</p>
                                        </>
                                    )}
                                    {canViewSensitiveContact && <p><strong>Mobile Number:</strong> {profile.mobileNumber || 'N/A'}</p>}
                                </div>
                            )}
                        </SectionCard>
                        <SectionCard title="Lifestyle">
                            {isEditing ? <LifestyleEditor initialLifestyle={editableFields.lifestyle} initialBadges={editableFields.badges} initialSexualOrientation={editableFields.sexualOrientation} onChange={({lifestyle, badges, sexualOrientation}) => setEditableFields(prev => ({...prev, lifestyle, badges, sexualOrientation}))} /> : (
                                <>
                                    <div className="space-y-2 text-neutral-600 dark:text-neutral-300">
                                        <p><strong>Pets:</strong> {profile.lifestyle?.pets || 'N/A'}</p>
                                        <p><strong>Looking For:</strong> {profile.lifestyle?.lookingFor || 'N/A'}</p>
                                    {profile.lifestyle?.lookingFor === 'Casual (FWB)' && (
                                      <p><strong>Sexual Orientation:</strong> {profile.sexualOrientation || 'N/A'}</p>
                                    )}
                                        <p><strong>Religion:</strong> {profile.lifestyle?.religion || 'N/A'}</p>
                                        <p><strong>Political Leaning:</strong> {profile.lifestyle?.politicalLeaning || 'N/A'}</p>
                                    </div>
                                    <hr className="my-4" />
                                    {profile.badges && Object.keys(profile.badges).length > 0 && <BadgesDisplay badges={profile.badges} />}
                                </>
                            )}
                        </SectionCard>
                        <SectionCard title="Interests">
                            {isEditing ? <InterestsEditor initialInterests={editableFields.interests} onChange={(interests) => setEditableFields(prev => ({...prev, interests}))} /> : <InterestsDisplay interests={profile.interests || []} />}
                        </SectionCard>
                        <SectionCard title="Personality Type">
                          {isEditing ? (
                            <select
                              id="personalityType"
                              value={editableFields.personalityType || ''}
                              onChange={handleFieldChange}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50"
                            >
                              <option value="">Select your personality type</option>
                              {[
                                'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
                                'ISTP', 'ISFP', 'INFP', 'INTP',
                                'ESTP', 'ESFP', 'ENFP', 'ENTP',
                                'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
                              ].map(type => <option key={type} value={type}>{type}</option>)}
                            </select>
                          ) : (
                            <p className="text-neutral-600 dark:text-neutral-300">{profile.personalityType || 'N/A'}</p>
                          )}
                        </SectionCard>
                        {isEditing && isOwnProfile && (
                            <div className="flex justify-end mt-6">
                                <button onClick={handleSaveAll} className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600" disabled={saveStatus === 'Saving...'}>
                                    {saveStatus === 'Saving...' ? 'Saving...' : 'Save All Changes'}
                                </button>
                            </div>
                        )}
                  </div>
              );
          case 'settings':
              return (
                  <section className="profile-settings" aria-labelledby="profile-settings-title">
                      <div className="profile-settings-heading">
                          <div>
                              <p className="profile-settings-eyebrow">YOUR ACCOUNT</p>
                              <h2 id="profile-settings-title">Settings</h2>
                              <p>Manage your membership, preferences, and account.</p>
                          </div>
                          <span className="profile-settings-heading-icon" aria-hidden="true">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3"/><path strokeLinecap="round" strokeLinejoin="round" d="m19.4 15 .1.1 1.1.9-1.2 2.1-1.4-.5a7.8 7.8 0 0 1-1.7 1l-.2 1.5h-2.4l-.3-1.5a7.8 7.8 0 0 1-1.7-1l-1.4.5-1.2-2.1 1.2-1a7.5 7.5 0 0 1 0-2l-1.2-1 1.2-2.1 1.4.5a7.8 7.8 0 0 1 1.7-1l.3-1.5h2.4l.2 1.5a7.8 7.8 0 0 1 1.7 1l1.4-.5 1.2 2.1-1.1 1a7.5 7.5 0 0 1 0 2Z" transform="translate(-1 -1)"/></svg>
                          </span>
                      </div>

                      <div className="profile-settings-group">
                          <h3>Membership</h3>
                          <div className="profile-settings-row">
                              <span className="profile-settings-icon profile-settings-icon-membership" aria-hidden="true">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5 12 3l9 5.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5z"/><path d="M8 21v-7h8v7M7 9h.01M12 9h.01M17 9h.01"/></svg>
                              </span>
                              <div className="profile-settings-row-copy">
                                  <strong>{isPremium ? 'Premium membership' : 'Basic membership'}</strong>
                                  <span>{isPremium ? 'Review your subscription and billing options.' : 'Unlock more ways to connect with Premium.'}</span>
                              </div>
                              <button type="button" className="profile-settings-row-action" onClick={() => navigate(isPremium ? '/manage-subscription' : '/premium')}>
                                  {isPremium ? 'Manage' : 'Explore Premium'}
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                              </button>
                          </div>
                      </div>

                      {isOwnProfile && (
                          <div className="profile-settings-group profile-settings-subscription-history">
                              <h3>Subscription history</h3>
                              <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                                  Current plan: <strong>{isPremium ? 'Premium' : 'Basic'}</strong>. Past and incomplete checkout attempts are shown below.
                              </p>
                              {subscriptions.length > 0 ? (
                                  <ul className="space-y-3">
                                      {subscriptions.map((sub, index) => (
                                          <li key={sub._id || `${sub.plan || 'subscription'}-${sub.createdAt || index}`} className="profile-settings-row">
                                              <div className="profile-settings-row-copy">
                                                  <strong className="capitalize">{sub.plan || 'Subscription'} plan</strong>
                                                  <span>
                                                      Status: {sub.status === 'cancelled' && sub.cancellationReason === 'payment_timeout'
                                                          ? 'Cancelled — payment not completed'
                                                          : (sub.status || 'Unknown')}
                                                  </span>
                                                  {sub.cancellationReason === 'payment_timeout' && (
                                                      <span>This checkout was automatically cancelled because payment was not completed within 30 minutes. You can start a new subscription if you still want Premium.</span>
                                                  )}
                                                  {sub.endDate && (
                                                      <span>Expires on: {new Date(sub.endDate).toLocaleDateString()}</span>
                                                  )}
                                                  {sub.status === 'rejected' && sub.rejectionReason && (
                                                      <span className="text-red-600">Reason: {sub.rejectionReason}</span>
                                                  )}
                                              </div>
                                          </li>
                                      ))}
                                  </ul>
                              ) : (
                                  <p className="text-sm text-neutral-500 dark:text-neutral-400">No subscription history found.</p>
                              )}
                          </div>
                      )}

                      <div className="profile-settings-group">
                          <h3>Preferences &amp; help</h3>
                          <button type="button" className="profile-settings-row profile-settings-row-button" onClick={toggleTheme}>
                              <span className="profile-settings-icon" aria-hidden="true">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>
                              </span>
                              <span className="profile-settings-row-copy"><strong>Appearance</strong><span>Choose how the app looks on your device.</span></span>
                              <span className="profile-settings-value">{theme === 'dark' ? 'Dark' : 'Light'} mode</span>
                              <svg className="profile-settings-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
                          </button>
                          <button type="button" className="profile-settings-row profile-settings-row-button" onClick={() => navigate('/support')}>
                              <span className="profile-settings-icon" aria-hidden="true">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><path d="M4 13h3v6H6a2 2 0 0 1-2-2zM20 13h-3v6h1a2 2 0 0 0 2-2zM17 19a5 5 0 0 1-5 2"/></svg>
                              </span>
                              <span className="profile-settings-row-copy"><strong>Help &amp; support</strong><span>Get help with your account or report an issue.</span></span>
                              <svg className="profile-settings-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
                          </button>
                      </div>

                      <div className="profile-settings-group profile-settings-account">
                          <h3>Account</h3>
                          <div className="profile-settings-row">
                              <span className="profile-settings-icon profile-settings-icon-logout" aria-hidden="true">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg>
                              </span>
                              <span className="profile-settings-row-copy"><strong>Sign out</strong><span>Sign out of this device when you’re finished.</span></span>
                              <button type="button" className="profile-settings-logout" onClick={handleLogout}>Log out</button>
                          </div>
                      </div>
                  </section>
              );
          default: return null;
      }
  }

  return (
    <div className="profile-page min-h-screen">
        <div className="page-container mx-auto w-full max-w-5xl p-4 sm:p-6">
            <div className="profile-hero relative mb-6 h-80 w-full overflow-hidden rounded-3xl md:h-[min(70vh,680px)]">
              <PhotoGallery photos={profile.photos || []} onEdit={isOwnProfile ? () => setIsEditingPhotos(true) : null} />
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <h1 className="text-3xl font-bold text-white">{profile.name}, {profile.age}</h1>
                    <div className="flex items-center mt-1">
                        {isPremium && <PremiumBadge />}
                        {isVerified && <VerifiedBadge />}
                    </div>
                </div>
            </div>

            <div className="flex justify-end items-center mb-6">
                {!isOwnProfile && (
                    <div className="flex space-x-4">
                        <button onClick={handleLikeBack} className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600">Accept</button>
                        <button onClick={handleDecline} className="px-6 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">Decline</button>
                    </div>
                )}
              {isOwnProfile && (
                <div className="relative">
                    <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700" aria-label="menu">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                    </button>
                    {isMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-neutral-800 rounded-md shadow-lg z-20">
                        {isEditing ? (
                        <button
                            onClick={() => {
                            setIsEditing(false);
                            setIsMenuOpen(false);
                            }}
                            className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                        >
                            View Profile
                        </button>
                        ) : (
                        <button
                            onClick={() => {
                            setIsEditing(true);
                            setIsMenuOpen(false);
                            }}
                            className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                        >
                            Edit Profile
                        </button>
                        )}
                        <button
                        onClick={() => {
                            setActiveTab('settings');
                            setIsMenuOpen(false);
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                        >
                        Settings
                        </button>
                    </div>
                    )}
                </div>
              )}
            </div>

            {isEditingPhotos && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <PhotoEditor
                        photos={profile.photos || []}
                        onSave={(updatedUser) => {
                            setProfile(updatedUser);
                            setIsEditingPhotos(false);
                        }}
                        onCancel={() => setIsEditingPhotos(false)}
                    />
                </div>
            )}

            {renderContent()}
        </div>
    </div>
  );
}

export default Profile;
