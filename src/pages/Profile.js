import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import apiClient from '../api/apiClient';
import PhotoVerificationPanel from '../components/PhotoVerificationPanel';

// Import all necessary components
import InterestsDisplay from '../components/InterestsDisplay';
import DesiresDiscoveryPanel from '../components/DesiresDiscoveryPanel';
import InterestsEditor from '../components/InterestsEditor';
import ProfilePromptsDisplay from '../components/ProfilePromptsDisplay';
import ProfilePromptsEditor from '../components/ProfilePromptsEditor';
import PhotoGallery from '../components/PhotoGallery';
import PhotoEditor from '../components/PhotoEditor';
import LifestyleEditor from '../components/LifestyleEditor';
import BadgesDisplay from '../components/BadgesDisplay';
import { API_URL } from '../utils/constants';
import SectionCard from '../components/profile/SectionCard';
import NotificationPreferencesPanel from '../components/NotificationPreferencesPanel';
import PartnerLinkPanel from '../components/PartnerLinkPanel';
import LoadingState from '../components/LoadingState';
import { getUserFriendlyError } from '../utils/apiErrors';

const countryCallingCodes = [
  { country: 'United Arab Emirates', flag: '🇦🇪', code: '+971' },
  { country: 'Sri Lanka', flag: '🇱🇰', code: '+94' },
  { country: 'India', flag: '🇮🇳', code: '+91' },
  { country: 'Pakistan', flag: '🇵🇰', code: '+92' },
  { country: 'Bangladesh', flag: '🇧🇩', code: '+880' },
  { country: 'Nepal', flag: '🇳🇵', code: '+977' },
  { country: 'Philippines', flag: '🇵🇭', code: '+63' },
  { country: 'United Kingdom', flag: '🇬🇧', code: '+44' },
  { country: 'United States', flag: '🇺🇸', code: '+1' },
  { country: 'Canada', flag: '🇨🇦', code: '+1' },
  { country: 'Australia', flag: '🇦🇺', code: '+61' },
  { country: 'New Zealand', flag: '🇳🇿', code: '+64' },
  { country: 'Saudi Arabia', flag: '🇸🇦', code: '+966' },
  { country: 'Qatar', flag: '🇶🇦', code: '+974' },
  { country: 'Kuwait', flag: '🇰🇼', code: '+965' },
  { country: 'Bahrain', flag: '🇧🇭', code: '+973' },
  { country: 'Oman', flag: '🇴🇲', code: '+968' },
  { country: 'Jordan', flag: '🇯🇴', code: '+962' },
  { country: 'Lebanon', flag: '🇱🇧', code: '+961' },
  { country: 'Egypt', flag: '🇪🇬', code: '+20' },
  { country: 'South Africa', flag: '🇿🇦', code: '+27' },
  { country: 'Nigeria', flag: '🇳🇬', code: '+234' },
  { country: 'Kenya', flag: '🇰🇪', code: '+254' },
  { country: 'Germany', flag: '🇩🇪', code: '+49' },
  { country: 'France', flag: '🇫🇷', code: '+33' },
  { country: 'Italy', flag: '🇮🇹', code: '+39' },
  { country: 'Spain', flag: '🇪🇸', code: '+34' },
  { country: 'Portugal', flag: '🇵🇹', code: '+351' },
  { country: 'Netherlands', flag: '🇳🇱', code: '+31' },
  { country: 'Belgium', flag: '🇧🇪', code: '+32' },
  { country: 'Switzerland', flag: '🇨🇭', code: '+41' },
  { country: 'Austria', flag: '🇦🇹', code: '+43' },
  { country: 'Ireland', flag: '🇮🇪', code: '+353' },
  { country: 'Sweden', flag: '🇸🇪', code: '+46' },
  { country: 'Norway', flag: '🇳🇴', code: '+47' },
  { country: 'Denmark', flag: '🇩🇰', code: '+45' },
  { country: 'Finland', flag: '🇫🇮', code: '+358' },
  { country: 'Poland', flag: '🇵🇱', code: '+48' },
  { country: 'Turkey', flag: '🇹🇷', code: '+90' },
  { country: 'Russia', flag: '🇷🇺', code: '+7' },
  { country: 'Ukraine', flag: '🇺🇦', code: '+380' },
  { country: 'China', flag: '🇨🇳', code: '+86' },
  { country: 'Japan', flag: '🇯🇵', code: '+81' },
  { country: 'South Korea', flag: '🇰🇷', code: '+82' },
  { country: 'Singapore', flag: '🇸🇬', code: '+65' },
  { country: 'Malaysia', flag: '🇲🇾', code: '+60' },
  { country: 'Indonesia', flag: '🇮🇩', code: '+62' },
  { country: 'Thailand', flag: '🇹🇭', code: '+66' },
  { country: 'Vietnam', flag: '🇻🇳', code: '+84' },
  { country: 'Hong Kong', flag: '🇭🇰', code: '+852' },
  { country: 'Mexico', flag: '🇲🇽', code: '+52' },
  { country: 'Brazil', flag: '🇧🇷', code: '+55' },
  { country: 'Argentina', flag: '🇦🇷', code: '+54' },
  { country: 'Chile', flag: '🇨🇱', code: '+56' },
  { country: 'Colombia', flag: '🇨🇴', code: '+57' },
  { country: 'Peru', flag: '🇵🇪', code: '+51' },
];

// Keep date-only profile values stable across browser time zones.
const toDateInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

const formatLocalDateInput = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

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
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditingPhotos, setIsEditingPhotos] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [mobileCountryCode, setMobileCountryCode] = useState('+971');
  const [mobileNationalNumber, setMobileNationalNumber] = useState('');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState('harassment_or_bullying');
  const [reportReason, setReportReason] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isBlockingUser, setIsBlockingUser] = useState(false);

  // State for editable fields
  const [editableFields, setEditableFields] = useState({
      education: '',
      birthday: '',
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
    let cancelled = false;

    const fetchProfile = async () => {
      try {
        const data = await apiClient.get(`/users/${userId}`);
        if (!cancelled) setProfile(data);
      } catch (error) {
        if (!cancelled) {
          setFetchError(getUserFriendlyError(error, 'We could not load this profile. Please try again.'));
        }
      }
    };

    const fetchOwnProfile = async () => {
      try {
        const data = await apiClient.get('/users/me');
        if (cancelled) return;
        setProfile(data);
        const savedMobile = typeof data.mobileNumber === 'string' ? data.mobileNumber : '';
        const matchingCallingCode = countryCallingCodes.map(item => item.code).sort((a, b) => b.length - a.length).find(code => savedMobile.startsWith(code));
        setMobileCountryCode(matchingCallingCode || '+971');
        setMobileNationalNumber(matchingCallingCode ? savedMobile.slice(matchingCallingCode.length).replace(/\D/g, '') : savedMobile.replace(/\D/g, ''));
        setEditableFields({
          education: data.education || '',
          birthday: toDateInputValue(data.birthday),
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
        if (!cancelled) {
          setFetchError(getUserFriendlyError(error, 'We could not load your profile. Please try again.'));
        }
      }
    };

    const fetchSubscriptionHistory = async () => {
      try {
        const subs = await apiClient.get('/users/me/subscriptions');
        if (!cancelled) setSubscriptions(Array.isArray(subs) ? subs : []);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch subscription history:', error);
          setSubscriptions([]);
        }
      }
    };

    if (userId) {
      fetchProfile();
    } else if (currentUser) {
      fetchOwnProfile();
      fetchSubscriptionHistory();
    }

    return () => {
      cancelled = true;
    };
  }, [userId, currentUser?.uid]);

  useEffect(() => {
    const profileUid = userId || currentUser?.uid;

    if (socket && profileUid) {
      const handleProfileUpdated = (updatedProfile) => {
        if (updatedProfile?.uid === profileUid) {
          setProfile(updatedProfile);
        }
      };
      socket.emit('subscribeToProfile', profileUid);
      socket.on('profileUpdated', handleProfileUpdated);

      return () => {
        socket.emit('unsubscribeFromProfile', profileUid);
        socket.off('profileUpdated', handleProfileUpdated);
      };
    }
  }, [socket, userId, currentUser?.uid]);

  const handleFieldChange = (e) => {
      const { id, value } = e.target;
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
      const mobileDigits = mobileNationalNumber.replace(/\D/g, '');
      if (mobileDigits.length > 0 && (mobileDigits.length < 6 || mobileDigits.length > 14)) {
          toast.error('Enter a valid mobile number or leave it unchanged.');
          return;
      }
      setSaveStatus('Saving...');
      try {
          const { birthday: draftBirthday, mobileNumber: _storedMobileNumber, ...profileUpdates } = editableFields;
          const birthdayUpdate = !profile.birthday && draftBirthday ? { birthday: draftBirthday } : {};
          if (birthdayUpdate.birthday) {
              const birthDate = new Date(`${birthdayUpdate.birthday}T00:00:00`);
              const today = new Date();
              let age = today.getFullYear() - birthDate.getFullYear();
              const month = today.getMonth() - birthDate.getMonth();
              if (month < 0 || (month === 0 && today.getDate() < birthDate.getDate())) age--;
              if (Number.isNaN(birthDate.getTime()) || age < 18 || birthDate > today) {
                  toast.error('Enter a valid date of birth. You must be at least 18 years old.');
                  setSaveStatus('');
                  return;
              }
          }
          const updatePayload = { ...profileUpdates, ...birthdayUpdate };
          // A missing legacy phone number must not block the one-time DOB recovery
          // required for age-gated features. Omit it unless the user entered a value.
          if (mobileDigits.length > 0) {
              updatePayload.mobileNumber = `${mobileCountryCode}${mobileDigits}`;
          }
          const updatedProfile = await apiClient.put('/users/me', updatePayload);
          setProfile(updatedProfile);
          setUser(updatedProfile); // Update global user state
          toast.success('Profile saved successfully!');
          setIsEditing(false);
      } catch (error) {
          logger.error(`Profile.js: Error saving profile:`, error);
          toast.error(getUserFriendlyError(error, 'Your profile changes could not be saved. Please try again.'));
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

  const handleReportSubmit = async (event) => {
    event.preventDefault();
    if (!profile?.uid || isSubmittingReport) return;
    const reason = reportReason.trim();
    if (reason.length < 10 || reason.length > 2000) {
      toast.error('Please provide at least 10 characters describing the concern.');
      return;
    }
    setIsSubmittingReport(true);
    try {
      await apiClient.post('/reports', {
        reportedUserUid: profile.uid,
        category: reportCategory,
        reason
      });
      toast.success('Thank you. Your report has been sent to our safety team.');
      setIsReportOpen(false);
      setReportReason('');
    } catch (error) {
      const status = error?.response?.status;
      if (status === 409) toast.info('You have already reported this profile recently.');
      else toast.error(getUserFriendlyError(error, 'We could not submit your report. Please try again.'));
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleBlockUser = async () => {
    if (!profile?.uid || isBlockingUser) return;
    if (!window.confirm('Block this person? They will no longer be able to contact you or appear in your discovery results.')) return;
    setIsBlockingUser(true);
    try {
      await apiClient.post(`/users/block/${encodeURIComponent(profile.uid)}`);
      toast.success('This person has been blocked.');
      navigate('/discover', { replace: true });
    } catch (error) {
      toast.error(getUserFriendlyError(error, 'We could not block this person. Please try again.'));
    } finally {
      setIsBlockingUser(false);
    }
  };

  if (fetchError) return <div className="mx-auto max-w-xl p-6 text-center" role="alert"><p className="text-red-600">{fetchError}</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-full bg-primary px-5 py-2 text-white">Try again</button></div>;
  if (!profile) return <LoadingState spinnerOnly />;

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
                                        <label htmlFor="birthday" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Date of birth</label>
                                        {profile.birthday ? (
                                            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Your date of birth is already saved and cannot be changed from this form.</p>
                                        ) : (
                                            <>
                                                <input
                                                    type="date"
                                                    id="birthday"
                                                    value={editableFields.birthday || ''}
                                                    max={formatLocalDateInput(new Date(new Date().getFullYear() - 18, new Date().getMonth(), new Date().getDate()))}
                                                    min={formatLocalDateInput(new Date(new Date().getFullYear() - 100, new Date().getMonth(), new Date().getDate()))}
                                                    onChange={handleFieldChange}
                                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50"
                                                />
                                                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">A valid adult date of birth is required for age-restricted features such as Desires & Discovery.</p>
                                            </>
                                        )}
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
                                        <div className="mt-1 grid grid-cols-[minmax(145px,0.9fr)_minmax(0,1.5fr)] gap-2">
                                            <select id="mobileCountryCode" aria-label="Country calling code" autoComplete="tel-country-code" value={mobileCountryCode} onChange={event => setMobileCountryCode(event.target.value)} className="block w-full rounded-md border-gray-300 bg-white text-sm shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50">
                                                {countryCallingCodes.map((item, index) => <option key={`${item.country}-${index}`} value={item.code}>{item.flag} {item.country} ({item.code})</option>)}
                                            </select>
                                            <input type="tel" id="mobileNumber" inputMode="numeric" autoComplete="tel-national" aria-label="Mobile number without country code" value={mobileNationalNumber} onChange={event => setMobileNationalNumber(event.target.value.replace(/\D/g, '').slice(0, 14))} placeholder="50 123 4567" className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50" maxLength="14"/>
                                        </div>
                                        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">Choose your country code and enter the number without repeating it.</p>
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
                        {isOwnProfile && (
                        <SectionCard title="Desires & Discovery">
                          <DesiresDiscoveryPanel />
                        </SectionCard>
                      )}

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

                      {isOwnProfile && <NotificationPreferencesPanel />}

                      {isOwnProfile && <div className="my-6"><PartnerLinkPanel /></div>}

                      {isOwnProfile && <PhotoVerificationPanel isVerified={profile.isVerified === true} photos={profile.photos || []} />}

                      <div className="profile-settings-group">
                          <h3>Preferences &amp; help</h3>
                          <div className="profile-settings-row profile-appearance-row">
                              <span className="profile-settings-icon" aria-hidden="true">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>
                              </span>
                              <span className="profile-settings-row-copy"><strong>Appearance</strong><span>Choose how the app looks on your device.</span></span>
                              <label className="profile-appearance-control">
                                  <span className="sr-only">App appearance</span>
                                  <select aria-label="App appearance" value={theme} onChange={(event) => setTheme(event.target.value)}>
                                      <option value="light">Light mode</option>
                                      <option value="dark">Dark mode</option>
                                  </select>
                              </label>
                          </div>
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

            <div className="flex flex-wrap justify-end items-center gap-3 mb-6">
                {!isOwnProfile && (
                    <>
                      <div className="flex space-x-3">
                        <button type="button" onClick={handleLikeBack} className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600">Like back</button>
                        <button type="button" onClick={handleDecline} className="px-6 py-2 border border-neutral-300 text-neutral-700 dark:text-neutral-200 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800">Pass</button>
                      </div>
                      <button type="button" onClick={() => setIsReportOpen(true)} className="px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-full text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">Report</button>
                      <button type="button" onClick={handleBlockUser} disabled={isBlockingUser} className="px-4 py-2 border border-red-300 text-red-700 dark:text-red-300 dark:border-red-800 rounded-full text-sm hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-60">{isBlockingUser ? 'Blocking…' : 'Block'}</button>
                    </>
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

            {isReportOpen && !isOwnProfile && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsReportOpen(false); }}>
                  <form onSubmit={handleReportSubmit} className="w-full max-w-lg rounded-2xl bg-white dark:bg-neutral-900 p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="report-profile-title">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 id="report-profile-title" className="text-xl font-semibold text-neutral-900 dark:text-white">Report this profile</h2>
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">Reports are reviewed by our safety team. Reporting does not automatically suspend an account.</p>
                      </div>
                      <button type="button" onClick={() => setIsReportOpen(false)} className="rounded-full p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Close report form">✕</button>
                    </div>
                    <label htmlFor="report-category" className="mt-5 block text-sm font-medium text-neutral-800 dark:text-neutral-200">Reason</label>
                    <select id="report-category" value={reportCategory} onChange={(event) => setReportCategory(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-300 bg-white p-3 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white">
                      <option value="spam">Spam</option>
                      <option value="inappropriate_profile_content">Inappropriate profile content</option>
                      <option value="harassment_or_bullying">Harassment or bullying</option>
                      <option value="hateful_conduct">Hateful conduct</option>
                      <option value="impersonation">Impersonation</option>
                      <option value="underage_user">Underage user</option>
                      <option value="scam_or_fraud">Scam or fraud</option>
                      <option value="other">Other</option>
                    </select>
                    <label htmlFor="report-reason" className="mt-4 block text-sm font-medium text-neutral-800 dark:text-neutral-200">What happened?</label>
                    <textarea id="report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)} minLength={10} maxLength={2000} required rows={5} className="mt-2 w-full resize-y rounded-xl border border-neutral-300 bg-white p-3 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white" placeholder="Describe the behaviour or content that concerns you." />
                    <p className="mt-1 text-right text-xs text-neutral-500">{reportReason.length}/2000</p>
                    <div className="mt-5 flex justify-end gap-3">
                      <button type="button" onClick={() => setIsReportOpen(false)} className="rounded-full border border-neutral-300 px-5 py-2 text-sm dark:border-neutral-700">Cancel</button>
                      <button type="submit" disabled={isSubmittingReport || reportReason.trim().length < 10} className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{isSubmittingReport ? 'Sending…' : 'Submit report'}</button>
                    </div>
                  </form>
                </div>
            )}

            {isEditingPhotos && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <PhotoEditor
                        photos={profile.photos || []}
                        onPhotosChange={(updatedPhotos) => {
                            setProfile(currentProfile => currentProfile
                                ? { ...currentProfile, photos: updatedPhotos }
                                : currentProfile);
                        }}
                        onSave={(updatedUser) => {
                            setProfile(currentProfile => ({
                                ...(currentProfile || {}),
                                ...updatedUser,
                                photos: Array.isArray(updatedUser?.photos)
                                    ? updatedUser.photos
                                    : currentProfile?.photos || []
                            }));
                            setIsEditingPhotos(false);
                        }}
                        onCancel={() => setIsEditingPhotos(false)}
                    />
                </div>
            )}

            {renderContent()}
            {!isOwnProfile && activeTab === 'profile' && <div className="mt-6"><PartnerLinkPanel targetUid={profile.uid} /></div>}
        </div>
    </div>
  );
}

export default Profile;
