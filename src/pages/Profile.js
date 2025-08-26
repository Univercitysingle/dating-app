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
import PersonalityQuizDisplay from '../components/PersonalityQuizDisplay';
import PersonalityQuizEditor from '../components/PersonalityQuizEditor';
import SocialMediaLinksDisplay from '../components/SocialMediaLinksDisplay';
import SocialMediaLinksEditor from '../components/SocialMediaLinksEditor';
import HeroCaptureSection from '../components/HeroCaptureSection';
import PhotoGallery from '../components/PhotoGallery';
import PhotoEditor from '../components/PhotoEditor';

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

const SectionCard = ({ title, children }) => (
    <div className="bg-neutral-100 dark:bg-neutral-800 p-6 rounded-lg shadow-sm">
        <h2 className="text-xl font-bold mb-4 text-neutral-800 dark:text-neutral-50">{title}</h2>
        {children}
    </div>
);

function Profile() {
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
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
  });

  const { logout } = useAuth();
  const navigate = useNavigate();

  const fetchProfile = useCallback(() => {
    apiClient.get('/api/users/me')
      .then((data) => {
        setProfile(data);
        setEditableFields({
            education: data.education || '',
            relationshipGoals: data.relationshipGoals || '',
            aboutMe: data.aboutMe || '',
        });
        setFetchError(null);
      })
      .catch((error) => {
        console.error('Error fetching profile:', error);
        setFetchError(error.data?.message || 'Failed to load profile');
      });
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

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

  const handleSocialMediaLinksSave = (links) => {
      handleSave('/api/users/me', { socialMediaLinks: links }, 'social');
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
                      <PhotoGallery photos={profile.photos || []} onEdit={() => setIsEditingPhotos(true)} />
                      {!isEditing && profile.aboutMe && (
                        <SectionCard title="About Me">
                            <p className="text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap">{profile.aboutMe}</p>
                        </SectionCard>
                      )}
                       <SectionCard title="Details">
                            {isEditing ? (
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="aboutMe" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">About Me</label>
                                        <textarea id="aboutMe" value={editableFields.aboutMe} onChange={handleFieldChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50"/>
                                    </div>
                                    <div>
                                        <label htmlFor="education" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Education</label>
                                        <input type="text" id="education" value={editableFields.education} onChange={handleFieldChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50"/>
                                    </div>
                                    <div>
                                        <label htmlFor="relationshipGoals" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Relationship Goals</label>
                                        <input type="text" id="relationshipGoals" value={editableFields.relationshipGoals} onChange={handleFieldChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-50"/>
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
                        <SectionCard title="Interests">
                            {isEditing ? <InterestsEditor initialInterests={profile.interests || []} onSave={handleInterestsSaved} /> : <InterestsDisplay interests={profile.interests || []} />}
                        </SectionCard>
                        <SectionCard title="Profile Prompts">
                            {isEditing ? <ProfilePromptsEditor initialPrompts={profile.profilePrompts || []} onSave={handlePromptsSaved} /> : <ProfilePromptsDisplay profilePrompts={profile.profilePrompts || []} />}
                        </SectionCard>
                        <SectionCard title="Personality Quiz">
                            {isEditing ? <PersonalityQuizEditor currentQuizResults={profile.personalityQuizResults || {}} onSave={handlePersonalityQuizSave} /> : <PersonalityQuizDisplay quizResults={profile.personalityQuizResults || {}} />}
                        </SectionCard>
                        <SectionCard title="Social Media">
                            {isEditing ? <SocialMediaLinksEditor initialLinks={profile.socialMediaLinks || {}} onSave={handleSocialMediaLinksSave} /> : <SocialMediaLinksDisplay socialMediaLinks={profile.socialMediaLinks || {}} />}
                        </SectionCard>
                        <SectionCard title="Audio Bio">
                            {isEditing ? <AudioBioUpload currentAudioUrl={profile.audioBioUrl || ''} onUploadComplete={(url) => handleMediaUploadComplete(url, 'audioBioUrl')} /> : <AudioBioPlayer audioUrl={profile.audioBioUrl || ''} />}
                        </SectionCard>
                  </div>
              );
          case 'media':
              return (
                  <div className="space-y-6">
                      <SectionCard title="Profile Media">
                          <HeroCaptureSection onUploadComplete={handleHeroMediaUploadComplete} />
                          {saveStatus.hero && <p className="text-sm mt-2">{saveStatus.hero}</p>}
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
            <div className="relative w-full h-64 md:h-80 rounded-lg overflow-hidden shadow-lg mb-6">
                <img src={profile.heroMediaUrl || 'https://placehold.co/800x400?text=Your+Hero+Image'} alt="Hero" className="w-full h-full object-cover"/>
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-neutral-900/60 to-transparent">
                    <h1 className="text-3xl font-bold text-neutral-50">{profile.name}, {profile.age}</h1>
                    <div className="flex items-center mt-1">
                        {isPremium && <PremiumBadge />}
                        {isVerified && <VerifiedBadge />}
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center mb-6">
                <div className="flex space-x-1 bg-neutral-200 dark:bg-neutral-700 rounded-lg p-1">
                    <button onClick={() => setActiveTab('profile')} className={`px-4 py-2 text-sm font-medium rounded-md ${activeTab === 'profile' ? 'bg-neutral-50 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-50' : 'text-neutral-600 dark:text-neutral-300'}`}>Profile</button>
                    <button onClick={() => setActiveTab('media')} className={`px-4 py-2 text-sm font-medium rounded-md ${activeTab === 'media' ? 'bg-neutral-50 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-50' : 'text-neutral-600 dark:text-neutral-300'}`}>Media</button>
                    <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 text-sm font-medium rounded-md ${activeTab === 'settings' ? 'bg-neutral-50 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-50' : 'text-neutral-600 dark:text-neutral-300'}`}>Settings</button>
                </div>
                <button onClick={() => setIsEditing(!isEditing)} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark">
                    {isEditing ? 'View Profile' : 'Edit Profile'}
                </button>
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
