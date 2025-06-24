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

function Profile() {
  const [profile, setProfile] = useState(null);
  const [mediaSaveStatus, setMediaSaveStatus] = useState('');
  const [quizSaveStatus, setQuizSaveStatus] = useState('');
  const [socialLinksSaveStatus, setSocialLinksSaveStatus] = useState('');
  const [detailsSaveStatus, setDetailsSaveStatus] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Editable fields for inputs
  const [editableEducation, setEditableEducation] = useState('');
  const [editableRelationshipGoals, setEditableRelationshipGoals] = useState('');
  const [editableAboutMe, setEditableAboutMe] = useState('');

  const { logout, user } = useAuth();
  const navigate = useNavigate();

  // Logout handler with redirect
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error("Failed to logout:", error);
    }
  };

  // Fetch user profile data
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

  // Initial fetch on mount
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Sync editable fields when entering edit mode or profile updates
  useEffect(() => {
    if (isEditing && profile) {
      setEditableEducation(profile.education || '');
      setEditableRelationshipGoals(profile.relationshipGoals || '');
      setEditableAboutMe(profile.aboutMe || '');
    }
  }, [isEditing, profile]);

  // Save profile details (Education, Relationship Goals, About Me)
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

  // Save personality quiz results
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

  // Save social media links
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

  // Save media URLs (audio/video uploads)
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

  // Update profile interests after editing
  const handleInterestsSaved = (updatedInterests) => {
    setProfile(prev => ({ ...prev, interests: updatedInterests }));
  };

  // Update profile prompts after editing
  const handlePromptsSaved = (updatedPrompts) => {
    setProfile(prev => ({ ...prev, profilePrompts: updatedPrompts }));
  };

  // Handle fetch error display
  if (fetchError) {
    return <p className="text-red-500 p-4">Error: {fetchError}</p>;
  }
  // Loading state
  if (!profile) return <p className="p-4">Loading profile...</p>;

  return (
    <div className="container mx-auto p-4">
      {/* Header: Name, Age, Buttons */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold inline">{profile.name}</h1>
          {profile.age && <span className="text-2xl ml-2">({profile.age})</span>}
        </div>
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
        {/* Video Bio Snippet Section */}
        <section>
          <h2 className="text-xl font-semibold mb-2">Profile Snippet</h2>
          {isEditing ? (
            <VideoBioSnippetUpload
              currentVideoUrl={profile.videoBioUrl || ''}
              onUploadComplete={handleMediaUploadComplete}
            />
          ) : (
            <VideoBioSnippetPlayer videoUrl={profile.videoBioUrl || ''} />
          )}
        </section>

        {/* About Me - View only */}
        {!isEditing && profile.aboutMe && (
          <section>
            <h2 className="text-xl font-semibold mb-2">About Me</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{profile.aboutMe}</p>
          </section>
        )}

        {/* Details Section */}
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
                    const words = newText.trim().split(/\s+/);
                    if (words.length > 200) {
                      setEditableAboutMe(words.slice(0, 200).join(' '));
                    } else {
                      setEditableAboutMe(newText);
                    }
                  }}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Words: {editableAboutMe.trim().split(/\s+/).filter(Boolean).length} / 200
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
            <div className="mt-2 space-y-2">
              <div><strong>Gender:</strong> {profile.gender || "N/A"}</div>
              <div><strong>Preference:</strong> {profile.preference || "N/A"}</div>
              <div><strong>Email:</strong> {profile.email}</div>
              <div><strong>Education:</strong> {profile.education || "N/A"}</div>
              <div><strong>Relationship Goals:</strong> {profile.relationshipGoals || "N/A"}</div>
            </div>
          )}
        </section>

        {/* Interests */}
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

        {/* Profile Prompts */}
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

        {/* Audio Bio */}
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

        {/* Personality Quiz */}
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

        {/* Social Media Links */}
        <section>
          {isEditing ? (
            <SocialMediaLinksEditor
              initialLinks={profile.socialMediaLinks || {}}
              onSave={handleSocialMediaLinksSave}
              saveStatus={socialLinksSaveStatus}
              setSaveStatus={setSocialLinksSaveStatus}
            />
          ) : (
            <SocialMediaLinksDisplay socialMediaLinks={profile.socialMediaLinks || {}} />
          )}
        </section>

        {/* Video Profile Upload */}
        <section className="mt-4">
          <h2 className="text-xl font-semibold mb-2">Video Profile</h2>
          <VideoProfileUpload
            currentVideoUrl={profile.videoProfileUrl || ''}
            onUploadComplete={handleMediaUploadComplete}
          />
        </section>

        {/* Video Call - Optional */}
        <section className="mt-4">
          <VideoCall />
        </section>
      </div>
    </div>
  );
}

export default Profile;
