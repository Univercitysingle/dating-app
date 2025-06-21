import React, { useEffect, useState, useCallback } from "react";
import VideoProfileUpload from "../components/VideoProfileUpload";
import VideoCall from "../components/VideoCall";
import InterestsDisplay from "../components/InterestsDisplay";
import InterestsEditor from "../components/InterestsEditor";
import ProfilePromptsDisplay from "../components/ProfilePromptsDisplay";
import ProfilePromptsEditor from "../components/ProfilePromptsEditor";
import AudioBioPlayer from "../components/AudioBioPlayer";
import AudioBioUpload from "../components/AudioBioUpload";
import VideoBioSnippetPlayer from "../components/VideoBioSnippetPlayer";
import VideoBioSnippetUpload from "../components/VideoBioSnippetUpload";
import PersonalityQuizDisplay from "../components/PersonalityQuizDisplay";
import PersonalityQuizEditor from "../components/PersonalityQuizEditor";
import SocialMediaLinksDisplay from "../components/SocialMediaLinksDisplay";
import SocialMediaLinksEditor from "../components/SocialMediaLinksEditor";
import apiClient from '../api/apiClient'; // Import apiClient

function Profile() {
  const [profile, setProfile] = useState(null);
  const [mediaSaveStatus, setMediaSaveStatus] = useState(''); // For saving URL to profile
  const [quizSaveStatus, setQuizSaveStatus] = useState(''); // For saving personality quiz
  const [socialLinksSaveStatus, setSocialLinksSaveStatus] = useState(''); // For social media links
  const [isEditing, setIsEditing] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // States for directly editable fields
  const [editableEducation, setEditableEducation] = useState('');
  const [editableRelationshipGoals, setEditableRelationshipGoals] = useState('');
  const [detailsSaveStatus, setDetailsSaveStatus] = useState('');

  const fetchProfile = useCallback(() => {
    // apiClient handles token internally from localStorage if available
    // No need to manually get user from localStorage here for the token
    apiClient.get("/api/users/me")
      .then(data => {
        setProfile(data);
        setEditableEducation(data.education || '');
        setEditableRelationshipGoals(data.relationshipGoals || '');
        setFetchError(null);
      })
      .catch(error => {
        console.error("Error fetching profile:", error);
        setFetchError(error.data?.message || error.message);
        setProfile(null);
      });
  }, []);

  useEffect(() => {
    fetchProfile();
    // The editable fields (editableEducation, editableRelationshipGoals) are now primarily set
    // in two places:
    // 1. Directly within fetchProfile's .then() block after initial data load.
    // 2. In the useEffect hook that depends on [isEditing, profile] for subsequent syncs.
  }, [fetchProfile]); // fetchProfile is stable due to useCallback with empty deps.

  const handleInterestsSaved = (updatedInterests) => {
    setProfile(prevProfile => ({ ...prevProfile, interests: updatedInterests }));
    // setIsEditing(false); // Keep editing mode if user wants to edit multiple sections
  };

  const handlePromptsSaved = (updatedPrompts) => {
    setProfile(prevProfile => ({ ...prevProfile, profilePrompts: updatedPrompts }));
    // setIsEditing(false);
  };

  const handleMediaUploadComplete = async (fileUrl, fieldName) => {
    setMediaSaveStatus('Saving URL to profile...');
    // apiClient handles token, but a general check for app readiness/auth context might still be useful
    // For now, we assume apiClient handles absence of token gracefully (it does, by not sending Auth header)
    try {
      const updatedProfile = await apiClient.put("/api/users/me", { [fieldName]: fileUrl });
      setProfile(updatedProfile);
      setMediaSaveStatus(`${fieldName} saved successfully!`);
      setTimeout(() => setMediaSaveStatus(''), 3000);
    } catch (error) {
      console.error(`Error saving ${fieldName} URL:`, error);
      setMediaSaveStatus(`Error: ${error.data?.message || error.message}`);
    }
  };

  const handlePersonalityQuizSave = async (newQuizResults) => {
    setQuizSaveStatus('Saving personality type...');
    try {
      const updatedProfile = await apiClient.put("/api/users/me", { personalityQuizResults: newQuizResults });
      setProfile(updatedProfile);
      setQuizSaveStatus('Personality type saved successfully!');
      setTimeout(() => setQuizSaveStatus(''), 3000);
    } catch (error) {
      console.error('Error saving personality type:', error);
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

  const handleDetailsSave = async () => {
    setDetailsSaveStatus('Saving details...');
    const detailsToUpdate = {
      education: editableEducation,
      relationshipGoals: editableRelationshipGoals,
    };
    try {
      const updatedProfile = await apiClient.put("/api/users/me", detailsToUpdate);
      setProfile(updatedProfile);
      setDetailsSaveStatus('Details saved successfully!');
      setTimeout(() => setDetailsSaveStatus(''), 3000);
    } catch (error) {
      console.error('Error saving details:', error);
      setDetailsSaveStatus(`Error: ${error.data?.message || error.message}`);
    }
  };

  useEffect(() => {
    if (isEditing && profile) {
      setEditableEducation(profile.education || '');
      setEditableRelationshipGoals(profile.relationshipGoals || '');
    }
  }, [isEditing, profile]);


  if (fetchError) {
    return <p className="text-red-500 p-4">Error: {fetchError}</p>;
  }
  if (!profile) return <p className="p-4">Loading profile...</p>;

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{profile.name}</h1>
        <button
          onClick={() => {
            setIsEditing(!isEditing);
            if (!isEditing && profile) { // Entering edit mode
              setEditableEducation(profile.education || '');
              setEditableRelationshipGoals(profile.relationshipGoals || '');
            }
          }}
          className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-md"
        >
          {isEditing ? "View Profile" : "Edit Profile"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Details</h2>
            {isEditing ? (
              <>
                <p>Name: {profile.name} (Display only for now)</p>
                <p>Age: {profile.age || "N/A"} (Display only for now)</p>
                {/* Education Input */}
                <div className="my-2">
                  <label htmlFor="education" className="block text-sm font-medium text-gray-700">Education</label>
                  <input
                    type="text"
                    name="education"
                    id="education"
                    value={editableEducation}
                    onChange={(e) => setEditableEducation(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
                {/* Relationship Goals Input */}
                <div className="my-2">
                  <label htmlFor="relationshipGoals" className="block text-sm font-medium text-gray-700">Relationship Goals</label>
                  <input
                    type="text"
                    name="relationshipGoals"
                    id="relationshipGoals"
                    value={editableRelationshipGoals}
                    onChange={(e) => setEditableRelationshipGoals(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
                <button
                  onClick={handleDetailsSave}
                  className="mt-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm"
                >
                  Save Details
                </button>
                {detailsSaveStatus && <p className="text-xs text-gray-500 mt-1">{detailsSaveStatus}</p>}
              </>
            ) : (
              <>
                <p>Age: {profile.age || "N/A"}</p>
                <p>Gender: {profile.gender || "N/A"}</p>
                <p>Preference: {profile.preference || "N/A"}</p>
                <p>Email: {profile.email}</p>
                <p>Education: {profile.education || "N/A"}</p>
                <p>Relationship Goals: {profile.relationshipGoals || "N/A"}</p>
              </>
            )}
          </div>
           {/* Keep other editors separate as they are more complex */}
          {isEditing ? (
            <InterestsEditor
              initialInterests={profile.interests || []}
              onSave={handleInterestsSaved}
            />
          ) : (
            <InterestsDisplay interests={profile.interests || []} />
          )}

          {isEditing ? (
            <ProfilePromptsEditor
              initialPrompts={profile.profilePrompts || []}
              onSave={handlePromptsSaved}
            />
          ) : (
            <ProfilePromptsDisplay profilePrompts={profile.profilePrompts || []} />
          )}

          {/* Media Players and Uploaders */}
          {isEditing ? (
            <>
              <AudioBioUpload
                currentAudioUrl={profile.audioBioUrl || ''}
                onUploadComplete={handleMediaUploadComplete}
              />
              <VideoBioSnippetUpload
                currentVideoUrl={profile.videoBioUrl || ''}
                onUploadComplete={handleMediaUploadComplete}
              />
            </>
          ) : (
            <>
              <AudioBioPlayer audioUrl={profile.audioBioUrl || ''} />
              <VideoBioSnippetPlayer videoUrl={profile.videoBioUrl || ''} />
            </>
          )}
          {mediaSaveStatus && <p className="text-sm text-gray-600 mt-2">{mediaSaveStatus}</p>}

          {/* Personality Quiz Display and Editor */}
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

          {/* Social Media Links Display and Editor */}
          {isEditing ? (
            <SocialMediaLinksEditor
              currentLinks={profile.socialMediaLinks || {}} // Pass as object, editor handles Map conversion
              onSave={handleSocialMediaLinksSave}
              statusMessage={socialLinksSaveStatus}
              setStatusMessage={setSocialLinksSaveStatus}
            />
          ) : (
            <SocialMediaLinksDisplay socialMediaLinks={profile.socialMediaLinks || {}} />
          )}
        </div>

        <div className="md:col-span-2 space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Profile Video</h2>
            <VideoProfileUpload />
          </div>
          {profile.plan === "premium" && (
            <div>
              <h2 className="text-xl font-semibold">Premium Feature</h2>
              <VideoCall />
            </div>
          )}
          {/* Other new profile sections will go here */}
        </div>
      </div>
    </div>
  );
}

export default Profile;
