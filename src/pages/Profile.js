import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/apiClient';

// Import all necessary components
import InterestsDisplay from '../components/InterestsDisplay';
import InterestsEditor from '../components/InterestsEditor';
import ProfilePromptsDisplay from '../components/ProfilePromptsDisplay';
import ProfilePromptsEditor from '../components/ProfilePromptsEditor';
import AudioBioPlayer from '../components/AudioBioPlayer';
import AudioBioUpload from '../components/AudioBioUpload';
import PersonalityQuizSummary from '../components/PersonalityQuizSummary';
import PersonalityQuizEditor from '../components/PersonalityQuizEditor';
import PhotoGallery from '../components/PhotoGallery';
import PhotoEditor from '../components/PhotoEditor';
import LifestyleEditor from '../components/LifestyleEditor';
import BadgesDisplay from '../components/BadgesDisplay';
import { API_URL } from '../utils/constants';

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

const SectionCard = ({ title, onEdit, isEditing, children }) => (
    <div className="bg-neutral-100 dark:bg-neutral-800 p-6 rounded-lg shadow-sm">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-50">{title}</h2>
            {onEdit && (
                 <button onClick={onEdit} className="px-4 py-2 bg-secondary text-white rounded-md hover:bg-secondary-dark text-sm">
                    {isEditing ? 'Cancel' : 'Edit'}
                </button>
            )}
        </div>
        {children}
    </div>
);

function Profile() {
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditingPhotos, setIsEditingPhotos] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');

  // State for editable fields
  const [editableFields, setEditableFields] = useState({
      education: '',
      relationshipGoals: '',
      aboutMe: '',
  });

  // State for save statuses
  const [saveStatus, setSaveStatus] = useState({
      details: '',
      quiz: '',
      social: '',
      media: '',
      hero: '',
      lifestyle: '',
      interests: '',
      prompts: ''
  });

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      setProfile(user);
      setEditableFields({
        education: user.education || '',
        relationshipGoals: user.relationshipGoals || 'Figuring it out',
        aboutMe: user.aboutMe || '',
      });
    }
  }, [user]);

  const handleFieldChange = (e) => {
      const { id, value } = e.target;
      setEditableFields(prev => ({...prev, [id]: value}));
  }

  const handleSave = async (endpoint, data, statusKey) => {
      setSaveStatus(prev => ({...prev, [statusKey]: 'Saving...'}));
      try {
          const updatedProfile = await apiClient.put(endpoint, data);
          setProfile(updatedProfile);
          setSaveStatus(prev => ({...prev, [statusKey]: 'Saved successfully!'}));
          setTimeout(() => setSaveStatus(prev => ({...prev, [statusKey]: ''})), 3000);
          setIsEditing(false);
      } catch (error) {
          console.error(`Error saving ${statusKey}:`, error);
          setSaveStatus(prev => ({...prev, [statusKey]: `Error: ${error.data?.message || 'Failed to save'}`}));
      }
  };

  const handleDetailsSave = () => {
      handleSave('/api/users/me', editableFields, 'details');
  };

  const handleInterestsSaved = (interests) => {
      handleSave('/api/users/me', { interests }, 'interests');
  };

  const handlePromptsSaved = (prompts) => {
      handleSave('/api/users/me', { profilePrompts: prompts }, 'prompts');
  };

  const handlePersonalityQuizSave = (quizResults) => {
      handleSave('/api/users/me', { personalityQuizResults: quizResults }, 'quiz');
  };

  const handleLifestyleSave = (data) => {
      handleSave('/api/users/me', data, 'lifestyle');
  };

  const handleMediaUploadComplete = (fileUrl, fieldName) => {
      handleSave('/api/users/me', { [fieldName]: fileUrl }, 'media');
  };

  const handleHeroMediaUploadComplete = (mediaUrl) => {
    handleSave('/api/users/me', { heroMediaUrl: mediaUrl }, 'hero');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (fetchError) return <p className="text-red-500 p-4">Error: {fetchError}</p>;
  if (!profile) return <p className="p-4">Loading profile...</p>;

  const isPremium = profile.tier === 'premium';
  const isVerified = profile.isVerified === true;

  const renderContent = () => {
      switch(activeTab) {
          case 'profile':
              return (
                  <div className="space-y-6">
                      <SectionCard title="About Me" isEditing={isEditing}>
                          {isEditing ? (
                              <div>
                                 <textarea id="aboutMe" value={editableFields.aboutMe} onChange={handleFieldChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50"/>
                                 <button onClick={() => handleSave('/api/users/me', { aboutMe: editableFields.aboutMe }, 'aboutMe')} className="mt-2 px-4 py-2 bg-secondary text-white rounded-md hover:bg-secondary-dark">{saveStatus.aboutMe || 'Save'}</button>
                              </div>
                          ) : (
                              <p className="text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap">{profile.aboutMe || 'Tell us about yourself...'}</p>
                          )}
                      </SectionCard>

                      <SectionCard title="Profile Prompts" isEditing={isEditing}>
                          {isEditing ? (
                              <ProfilePromptsEditor initialPrompts={profile.profilePrompts || []} onSave={handlePromptsSaved} />
                          ) : (
                              <ProfilePromptsDisplay profilePrompts={profile.profilePrompts || []} />
                          )}
                      </SectionCard>

                       <SectionCard title="Details" isEditing={isEditing}>
                            {isEditing ? (
                                <div className="space-y-4">
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
                                    <button onClick={handleDetailsSave} className="px-4 py-2 bg-secondary text-white rounded-md hover:bg-secondary-dark">{saveStatus.details || 'Save Details'}</button>
                                </div>
                            ) : (
                                <div className="space-y-2 text-neutral-600 dark:text-neutral-300">
                                    <p><strong>Email:</strong> {profile.email}</p>
                                    <p><strong>Gender:</strong> {profile.gender}</p>
                                    <p><strong>Preference:</strong> {profile.preference}</p>
                                    <p><strong>Education:</strong> {profile.education || 'N/A'}</p>
                                    <p><strong>Relationship Goals:</strong> {profile.relationshipGoals || 'N/A'}</p>
                                </div>
                            )}
                        </SectionCard>
                        <SectionCard title="Lifestyle" isEditing={isEditing}>
                            {isEditing ? <LifestyleEditor initialLifestyle={profile.lifestyle || {}} initialBadges={profile.badges || {}} onSave={handleLifestyleSave} /> : (
                                <>
                                    <div className="space-y-2 text-neutral-600 dark:text-neutral-300">
                                        <p><strong>Pets:</strong> {profile.lifestyle?.pets || 'N/A'}</p>
                                        <p><strong>Looking For:</strong> {profile.lifestyle?.lookingFor || 'N/A'}</p>
                                        <p><strong>Religion:</strong> {profile.lifestyle?.religion || 'N/A'}</p>
                                        <p><strong>Political Leaning:</strong> {profile.lifestyle?.politicalLeaning || 'N/A'}</p>
                                    </div>
                                    <hr className="my-4" />
                                    <BadgesDisplay badges={profile.badges} />
                                </>
                            )}
                        </SectionCard>
                        <SectionCard title="Interests" isEditing={isEditing}>
                            {isEditing ? <InterestsEditor initialInterests={profile.interests || []} onSave={handleInterestsSaved} /> : <InterestsDisplay interests={profile.interests || []} />}
                        </SectionCard>
                        <SectionCard title="Personality Quiz" isEditing={isEditing}>
                            {isEditing ? <PersonalityQuizEditor currentQuizResults={profile.personalityQuizResults || {}} onSave={handlePersonalityQuizSave} /> : <PersonalityQuizSummary quizResults={profile.personalityQuizResults || {}} />}
                        </SectionCard>
                        <SectionCard title="Audio Bio" isEditing={isEditing}>
                            {isEditing ? <AudioBioUpload currentAudioUrl={profile.audioBioUrl || ''} onUploadComplete={(url) => handleMediaUploadComplete(url, 'audioBioUrl')} /> : <AudioBioPlayer audioUrl={profile.audioBioUrl || ''} />}
                        </SectionCard>
                  </div>
              );
          case 'settings':
              return (
                  <SectionCard title="Settings">
                      <button onClick={handleLogout} className="mt-4 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">Logout</button>
                  </SectionCard>
              );
          default: return null;
      }
  }

  return (
    <div className="bg-neutral-50 dark:bg-neutral-900 min-h-screen">
        <div className="container mx-auto p-4">
            <div className="relative w-full h-96 md:h-[70vh] rounded-lg overflow-hidden shadow-lg mb-6">
              <PhotoGallery photos={profile.photos || []} onEdit={() => setIsEditingPhotos(true)} />
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <h1 className="text-3xl font-bold text-white">{profile.name}, {profile.age}</h1>
                    <div className="flex items-center mt-1">
                        {isPremium && <PremiumBadge />}
                        {isVerified && <VerifiedBadge />}
                    </div>
                </div>
            </div>

            <div className="flex justify-end items-center mb-6">
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
