import React, { useEffect, useState, useCallback } from "react";
import VideoProfileUpload from "../components/VideoProfileUpload";
import VideoCall from "../components/VideoCall";
import InterestsDisplay from "../components/InterestsDisplay";
import InterestsEditor from "../components/InterestsEditor";
import ProfilePromptsDisplay from "../components/ProfilePromptsDisplay";
import ProfilePromptsEditor from "../components/ProfilePromptsEditor";
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import AudioBioPlayer from "../components/AudioBioPlayer";
import AudioBioUpload from "../components/AudioBioUpload";
import VideoBioSnippetPlayer from "../components/VideoBioSnippetPlayer";
import VideoBioSnippetUpload from "../components/VideoBioSnippetUpload";
import PersonalityQuizDisplay from "../components/PersonalityQuizDisplay";
import PersonalityQuizEditor from "../components/PersonalityQuizEditor";
import SocialMediaLinksDisplay from "../components/SocialMediaLinksDisplay";
import SocialMediaLinksEditor from "../components/SocialMediaLinksEditor";
import apiClient from '../api/apiClient';

// Badge components
const PremiumBadge = () => (
  <span className="ml-3 px-2 py-1 text-xs font-semibold text-yellow-800 bg-yellow-300 rounded-full">
    Premium
  </span>
);

const VerifiedBadge = () => (
  <span className="ml-3 px-2 py-1 text-xs font-semibold text-green-800 bg-green-300 rounded-full flex items-center">
    <svg
      className="w-4 h-4 mr-1"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
    Verified
  </span>
);

function Profile() {
  const [profile, setProfile] = useState(null);
  const [mediaSaveStatus, setMediaSaveStatus] = useState('');
  const [quizSaveStatus, setQuizSaveStatus] = useState('');
  const [socialLinksSaveStatus, setSocialLinksSaveStatus] = useState('');
  const [detailsSaveStatus, setDetailsSaveStatus] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const [editableEducation, setEditableEducation] = useState('');
  const [editableRelationshipGoals, setEditableRelationshipGoals] = useState('');
  const [editableAboutMe, setEditableAboutMe] = useState('');

  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error("Failed to logout:", error);
    }
  };

  const fetchProfile = useCallback(() => {
    apiClient.get("/api/users/me")
      .then(data => {
        setProfile(data);
        setEditableEducation(data.education || '');
        setEditableRelationshipGoals(data.relationshipGoals || '');
        setEditableAboutMe(data.aboutMe || '');
        setFetchError(null);
      })
      .catch(error => {
        console.error("Error fetching profile:", error);
        setFetchError(error.data?.message || error.message || "Failed to load profile");
        setProfile(null);
      });
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (isEditing && profile) {
      setEditableEducation(profile.education || '');
      setEditableRelationshipGoals(profile.relationshipGoals || '');
      setEditableAboutMe(profile.aboutMe || '');
    }
  }, [isEditing, profile]);

  const handleDetailsSave = async () => {
    setDetailsSaveStatus('Saving details...');
    try {
      const updatedProfile = await apiClient.put("/api/users/me", {
        education: editableEducation,
        relationshipGoals: editableRelationshipGoals,
        aboutMe: editableAboutMe,
      });
      setProfile(updatedProfile);
      setDetailsSaveStatus('Details saved successfully!');
      setTimeout(() => setDetailsSaveStatus(''), 3000);
    } catch (error) {
      console.error('Error saving details:', error);
      setDetailsSaveStatus(`Error: ${error.data?.message || error.message}`);
    }
  };

  const handlePersonalityQuizSave = async (newQuizResults) => {
    setQuizSaveStatus('Saving personality quiz...');
    try {
      const updatedProfile = await apiClient.put("/api/users/me", { personalityQuizResults: newQuizResults });
      setProfile(updatedProfile);
      setQuizSaveStatus('Personality quiz saved successfully!');
      setTimeout(() => setQuizSaveStatus(''), 3000);
    } catch (error) {
      console.error('Error saving personality quiz:', error);
      setQuizSaveStatus(`Error: ${error.data?.message || error.message}`);
    }
  };

  const handleSocialMediaLinksSave = async (newLinksData) => {
    setSocialLinksSaveStatus('Saving social media links...');
    try {
      const updatedProfile = await apiClient.put("/api/users/me", { socialMediaLinks: newLinksData });
      setProfile(updatedProfile);
      setSocialLinksSaveStatus('Social media links saved successfully!');
      setTimeout(() => setSocialLinksSaveStatus(''), 3000);
    } catch (error) {
      console.error('Error saving social media links:', error);
      setSocialLinksSaveStatus(`Error: ${error.data?.message || error.message}`);
    }
  };

  const handleMediaUploadComplete = async (fileUrl, fieldName) => {
    setMediaSaveStatus(`Saving ${fieldName}...`);
    try {
      const updatedProfile = await apiClient.put("/api/users/me", { [fieldName]: fileUrl });
      setProfile(updatedProfile);
      setMediaSaveStatus(`${fieldName} saved successfully!`);
      setTimeout(() => setMediaSaveStatus(''), 3000);
    } catch (error) {
      console.error(`Error saving ${fieldName}:`, error);
      setMediaSaveStatus(`Error: ${error.data?.message || error.message}`);
    }
  };

  const handleInterestsSaved = (updatedInterests) => {
    setProfile(prev => ({ ...prev, interests: updatedInterests }));
  };

  const handlePromptsSaved = (updatedPrompts) => {
    setProfile(prev => ({ ...prev, profilePrompts: updatedPrompts }));
  };

  if (fetchError) {
    return <p className="text-red-500 p-4">Error: {fetchError}</p>;
  }
  if (!profile) return <p className="p-4">Loading profile...</p>;

  // Determine user tier and verification for badges
  const isPremium = profile.tier === 'premium';
  const isVerified = profile.isVerified === true;

  return (
    <div className="container mx-auto p-4">
      {/* Header now only contains Edit/Logout buttons, aligned to the right */}
      <div className="flex justify-end items-center mb-6 h-10"> {/* Added h-10 for consistent height, adjust as needed */}
        {/* Name, Age, and Badges are now overlaid on the hero media */}
        <div>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-md mr-2"
          >
            {isEditing ? "View Profile" : "Edit Profile"}
          </button>
          <button
            onClick={handleLogout}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="flex flex-col space-y-6">
        {/* Hero Media Section (Video Bio Snippet) */}
        <section className="relative w-full bg-gray-800 rounded-lg overflow-hidden shadow-lg" style={{ paddingTop: '56.25%' /* 16:9 Aspect Ratio */ }}>
          <div className="absolute inset-0">
            {isEditing ? (
              <div className="w-full h-full flex items-center justify-center bg-gray-700"> {/* Added bg for uploader contrast */}
                <VideoBioSnippetUpload
                  currentVideoUrl={profile.videoBioUrl || ''}
                  onUploadComplete={handleMediaUploadComplete}
                />
              </div>
            ) : (
              profile.videoBioUrl ? (
                <VideoBioSnippetPlayer videoUrl={profile.videoBioUrl} />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-700">
                  <p className="text-white text-lg">No video snippet uploaded.</p>
                </div>
              )
            )}
          </div>
          {/* Overlay for Name, Age, and Badges */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-white">{profile.name}</h1> {/* Removed text-shadow for now, gradient should suffice */}
              {profile.age && <span className="text-xl ml-2 text-gray-200">({profile.age})</span>}
            </div>
            <div className="flex items-center mt-1">
              {isPremium && <PremiumBadge />} {/* Review badge styling for overlay if needed */}
              {isVerified && <VerifiedBadge />} {/* Review badge styling for overlay if needed */}
            </div>
          </div>
        </section>

        {!isEditing && profile.aboutMe && (
          <section>
            <h2 className="text-xl font-semibold mb-2">About Me</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{profile.aboutMe}</p>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Details</h2>
          {isEditing ? (
            <>
              <p>Name: {profile.name} (readonly)</p>
              <p>Age: {profile.age || "N/A"} (readonly)</p>
              <div className="my-2">
                <label htmlFor="education" className="block text-sm font-medium text-gray-700">Education</label>
                <input
                  id="education"
                  type="text"
                  value={editableEducation}
                  onChange={e => setEditableEducation(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div className="my-2">
                <label htmlFor="relationshipGoals" className="block text-sm font-medium text-gray-700">Relationship Goals</label>
                <input
                  id="relationshipGoals"
                  type="text"
                  value={editableRelationshipGoals}
                  onChange={e => setEditableRelationshipGoals(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div className="my-2">
                <label htmlFor="aboutMe" className="block text-sm font-medium text-gray-700">About Me (Max 200 words)</label>
                <textarea
                  id="aboutMe"
                  rows={5}
                  value={editableAboutMe}
                  onChange={e => {
                    const newText = e.target.value;
                    const words = newText.trim().split(/\\s+/);
                    if (words.length > 200) {
                      setEditableAboutMe(words.slice(0, 200).join(' '));
                    } else {
                      setEditableAboutMe(newText);
                    }
                  }}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Words: {editableAboutMe.trim().split(/\\s+/).filter(Boolean).length} / 200
                </p>
              </div>
              <button
                onClick={handleDetailsSave}
                className="mt-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm"
              >
                Save Details & About Me
              </button>
              {detailsSaveStatus && <p className="text-xs text-gray-500 mt-1">{detailsSaveStatus}</p>}
            </>
          ) : (
            <div className="mt-2 space-y-3"> {/* Increased spacing slightly */}
              <div>
                <span className="font-medium text-gray-500 mr-2">Gender:</span>
                <span className="text-gray-800">{profile.gender || "N/A"}</span>
              </div>
              <div>
                <span className="font-medium text-gray-500 mr-2">Preference:</span>
                <span className="text-gray-800">{profile.preference || "N/A"}</span>
              </div>
              <div>
                <span className="font-medium text-gray-500 mr-2">Email:</span>
                <span className="text-gray-800">{profile.email}</span>
              </div>
              <div>
                <span className="font-medium text-gray-500 mr-2">Education:</span>
                <span className="text-gray-800">{profile.education || "N/A"}</span>
              </div>
              <div>
                <span className="font-medium text-gray-500 mr-2">Relationship Goals:</span>
                <span className="text-gray-800">{profile.relationshipGoals || "N/A"}</span>
              </div>
            </div>
          )}
        </section>

        <section>
          {isEditing ? (
            <InterestsEditor
              initialInterests={profile.interests || []}
              onSave={handleInterestsSaved}
            />
          ) : (
            <InterestsDisplay interests={profile.interests || []} />
          )}
        </section>

        <section>
          {isEditing ? (
            <ProfilePromptsEditor
              initialPrompts={profile.profilePrompts || []}
              onSave={handlePromptsSaved}
            />
          ) : (
            <ProfilePromptsDisplay profilePrompts={profile.profilePrompts || []} />
          )}
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2 mt-4">Audio Bio</h2>
          {isEditing ? (
            <AudioBioUpload
              currentAudioUrl={profile.audioBioUrl || ''}
              onUploadComplete={handleMediaUploadComplete}
            />
          ) : (
            <AudioBioPlayer audioUrl={profile.audioBioUrl || ''} />
          )}
          {mediaSaveStatus && <p className="text-sm text-gray-600 mt-2">{mediaSaveStatus}</p>}
        </section>

        <section>
          {isEditing ? (
            <PersonalityQuizEditor
              currentQuizResults={profile.personalityQuizResults || {}}
              onSave={handlePersonalityQuizSave}
              statusMessage={quizSaveStatus}
              setStatusMessage={setQuizSaveStatus}
            />
          ) : (
            <PersonalityQuizDisplay quizResults={profile.personalityQuizResults || {}} />
          )}
        </section>

        <section>
          {isEditing ? (
            <SocialMediaLinksEditor
              initialLinks={profile.socialMediaLinks || {}}
              onSave={handleSocialMediaLinksSave}
              saveStatus={socialLinksSaveStatus} // Changed from statusMessage to saveStatus
              setSaveStatus={setSocialLinksSaveStatus} // Changed from setStatusMessage to setSaveStatus
            />
          ) : (
            <SocialMediaLinksDisplay socialMediaLinks={profile.socialMediaLinks || {}} />
          )}
        </section>

        <section className="mt-4">
          <h2 className="text-xl font-semibold mb-2">Video Profile</h2>
          <VideoProfileUpload
            currentVideoUrl={profile.videoProfileUrl || ''}
            onUploadComplete={handleMediaUploadComplete}
          />
        </section>

        <section className="mt-4">
          <VideoCall />
        </section>
      </div>
    </div>
  );
}

export default Profile;
