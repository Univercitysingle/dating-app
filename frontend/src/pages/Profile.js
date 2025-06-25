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

  // States for image gallery
  const [profileImages, setProfileImages] = useState([]); // Stores S3 URLs from profile.images
  const [selectedFiles, setSelectedFiles] = useState([]); // Files selected for upload
  const [imagePreviews, setImagePreviews] = useState([]); // ObjectURLs for previewing selectedFiles
  const [imageUploadStatus, setImageUploadStatus] = useState('');

  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const MAX_PROFILE_IMAGES = 5; // As per guide: "Upload photos to S3 (max 5)"

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    const currentTotalImages = profileImages.length + selectedFiles.length;
    const remainingSlots = MAX_PROFILE_IMAGES - currentTotalImages;

    if (remainingSlots <= 0) {
      setImageUploadStatus(`You can upload a maximum of ${MAX_PROFILE_IMAGES} images.`);
      return;
    }

    const newFiles = files.slice(0, remainingSlots);
    const newPreviews = newFiles.map(file => URL.createObjectURL(file));

    setSelectedFiles(prev => [...prev, ...newFiles]);
    setImagePreviews(prev => [...prev, ...newPreviews]);
    setImageUploadStatus(`${newFiles.length} image(s) selected. ${MAX_PROFILE_IMAGES - (currentTotalImages + newFiles.length)} slots remaining.`);
    event.target.value = null; // Reset file input
  };

  const removeSelectedFile = (indexToRemove) => {
    URL.revokeObjectURL(imagePreviews[indexToRemove]); // Clean up object URL
    setSelectedFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    setImagePreviews(prev => prev.filter((_, index) => index !== indexToRemove));
    const currentTotalImages = profileImages.length + selectedFiles.length -1;
    setImageUploadStatus(`${MAX_PROFILE_IMAGES - currentTotalImages} slots remaining.`);
  };

  // This function will modify profileImages state directly.
  // The actual save/API call will persist this modified list.
  const removeProfileImage = (indexToRemove) => {
    setProfileImages(prev => prev.filter((_, index) => index !== indexToRemove));
    const currentTotalImages = profileImages.length -1 + selectedFiles.length;
    setImageUploadStatus(`${MAX_PROFILE_IMAGES - currentTotalImages} slots remaining.`);
     // TODO: Later, when saving, this modified profileImages array will be sent to backend.
     // Backend would then know which images are kept. S3 object deletion is a separate concern.
  };

  const getPresignedS3Url = async (file) => {
    try {
      const response = await apiClient.post("/api/s3/upload-url", {
        fileName: file.name,
        fileType: file.type,
      });
      return response.url; // Assuming response is { url: "..." }
    } catch (error) {
      console.error("Error getting presigned URL:", error);
      throw error; // Re-throw to be caught by caller
    }
  };

  const handleSaveImages = async () => {
    if (selectedFiles.length === 0 && profileImages.length === (profile.images ? profile.images.length : 0)) {
      // No new files to upload and no existing images removed (client-side)
      setImageUploadStatus("No changes to save.");
      setTimeout(() => setImageUploadStatus(''), 3000);
      return;
    }

    setIsLoading(true); // Consider a specific isLoading for image uploads if needed
    setImageUploadStatus("Uploading images...");

    const uploadedImageUrls = [];
    try {
      for (const file of selectedFiles) {
        const presignedUrl = await getPresignedS3Url(file);
        const imageUrl = await uploadFileToS3(presignedUrl, file);
        uploadedImageUrls.push(imageUrl);
      }

      // Current profileImages state already reflects any client-side removals.
      // Combine them with newly uploaded URLs.
      const finalImageUrls = [...profileImages, ...uploadedImageUrls].slice(0, MAX_PROFILE_IMAGES);

      // Update backend
      const updatedProfile = await apiClient.put("/api/users/me", { images: finalImageUrls });

      setProfile(updatedProfile); // Update full profile state
      setProfileImages(updatedProfile.images || []); // Re-sync from backend response
      setSelectedFiles([]);
      setImagePreviews(prev => { // Clean up ObjectURLs for previews that were uploaded
        prev.forEach(url => URL.revokeObjectURL(url));
        return [];
      });
      setImageUploadStatus("Images saved successfully!");

    } catch (error) {
      console.error("Error saving images:", error);
      setImageUploadStatus(`Error saving images: ${error.message || 'Please try again.'}`);
    } finally {
      setIsLoading(false); // Reset general loading state
      setTimeout(() => setImageUploadStatus(''), 5000); // Keep status a bit longer for errors
    }
  };

  const uploadFileToS3 = async (presignedUrl, file) => {
    try {
      await fetch(presignedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });
      return presignedUrl.split("?")[0]; // Return the base URL
    } catch (error) {
      console.error("Error uploading file to S3:", error);
      throw error; // Re-throw to be caught by caller
    }
  };


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
        setProfileImages(data.images || []); // Initialize profileImages
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
      // When entering edit mode, ensure profileImages is synced from the latest profile data.
      // Also clear any pending selections if the user toggles edit mode off and on.
      setProfileImages(profile.images || []);
      setSelectedFiles([]);
      setImagePreviews([]);
      setImageUploadStatus('');
    } else {
      // When exiting edit mode (or on unmount if was in edit mode), clear selections and previews, and revoke ObjectURLs
      imagePreviews.forEach(url => URL.revokeObjectURL(url)); // Revoke existing previews
      setSelectedFiles([]);
      setImagePreviews([]);
      setImageUploadStatus('');
    }

    // Cleanup function for when the component unmounts or isEditing/profile changes
    return () => {
      if (isEditing) { // Only if it was in edit mode, previews might exist
        imagePreviews.forEach(url => URL.revokeObjectURL(url));
      }
    };
  }, [isEditing, profile]); // imagePreviews is not in dependency array to avoid loop with its own cleanup

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
        {/* Image Gallery / Hero Section */}
        <section className="relative w-full bg-gray-200 dark:bg-gray-800 rounded-lg overflow-hidden shadow-lg">
          {/* Main Image Display */}
          <div className="relative w-full bg-gray-300 dark:bg-gray-700" style={{ paddingTop: '133.33%' /* 3:4 Aspect Ratio */ }}>
            <div className="absolute inset-0">
              {!isEditing && profileImages && profileImages.length > 0 ? (
                <img
                  src={profileImages[0]}
                  alt={`${profile.name}'s primary profile visual`}
                  className="w-full h-full object-cover"
                />
              ) : !isEditing ? (
                <div className="w-full h-full flex items-center justify-center">
                  <p className="text-gray-500 dark:text-gray-400">No photos yet.</p>
                </div>
              ) : null /* Placeholder for image upload UI in edit mode */}
            </div>
          </div>

          {/* Thumbnails/Placeholders for other images - View Mode Only */}
          {!isEditing && (
            <div className="absolute bottom-16 left-0 right-0 p-2"> {/* Positioned above the Name/Age overlay */}
              <div className="flex justify-center space-x-2">
                {Array.from({ length: MAX_PROFILE_IMAGES }).map((_, index) => (
                  <div
                    key={index}
                    className={`w-10 h-10 rounded-md overflow-hidden border-2 ${index === 0 && profileImages.length > 0 ? 'border-white' : 'border-transparent'} bg-gray-400 dark:bg-gray-600`}
                  >
                    {profileImages && profileImages[index] ? (
                      <img src={profileImages[index]} alt={`Thumb ${index + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-white"> {/* Placeholder for empty slot */}
                        {index + 1}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overlay for Name, Age, and Badges - View Mode Only */}
          {!isEditing && (
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
              <div className="flex items-center">
                <h1 className="text-2xl font-bold text-white">{profile.name}</h1>
                {profile.age && <span className="text-xl ml-2 text-gray-200">({profile.age})</span>}
              </div>
              <div className="flex items-center mt-1">
                {isPremium && <PremiumBadge />}
                {isVerified && <VerifiedBadge />}
              </div>
            </div>
          )}
           {/* Image Uploader UI - Edit Mode Only */}
           {isEditing && (
            <div className="absolute inset-0 p-4 bg-gray-700 bg-opacity-90 overflow-y-auto">
              <div className="grid grid-cols-3 gap-4">
                {/* Display existing profile images with remove button */}
                {profileImages.map((url, index) => (
                  <div key={`existing-${index}`} className="relative group">
                    <img src={url} alt={`Profile ${index + 1}`} className="w-full h-32 object-cover rounded-md" />
                    <button
                      onClick={() => removeProfileImage(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove image"
                    >
                      X
                    </button>
                  </div>
                ))}
                {/* Display previews of newly selected files with remove button */}
                {imagePreviews.map((previewUrl, index) => (
                  <div key={`preview-${index}`} className="relative group">
                    <img src={previewUrl} alt={`Preview ${index + 1}`} className="w-full h-32 object-cover rounded-md" />
                    <button
                      onClick={() => removeSelectedFile(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove selected image"
                    >
                      X
                    </button>
                  </div>
                ))}
                {/* Placeholder/Add button for remaining slots */}
                {(profileImages.length + selectedFiles.length) < MAX_PROFILE_IMAGES && ( // Use selectedFiles.length here
                  <label htmlFor="imageUpload" className="w-full h-32 bg-gray-600 rounded-md flex items-center justify-center cursor-pointer hover:bg-gray-500">
                    <span className="text-gray-300 text-2xl">+</span>
                    <input
                      id="imageUpload"
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </label>
                )}
              </div>
              {imageUploadStatus && <p className="text-center text-sm text-yellow-400 mt-3">{imageUploadStatus}</p>}
              {(selectedFiles.length > 0 || profileImages.length !== (profile.images ? profile.images.length : 0)) && (
                <button
                  onClick={handleSaveImages}
                  disabled={isLoading}
                  className="mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-md disabled:bg-gray-400"
                >
                  {isLoading ? "Saving..." : "Save Photos"}
                </button>
              )}
            </div>
          )}
        </section>

        {/* Conditional rendering for VideoBioSnippet if it's a separate feature now */}
        {profile.videoBioUrl && !isEditing && (
          <section>
            <h2 className="text-xl font-semibold mb-2">Profile Snippet</h2>
            <VideoBioSnippetPlayer videoUrl={profile.videoBioUrl} />
          </section>
        )}
        {isEditing && ( // Show uploader for video snippet in edit mode if it's a separate field
           <section>
             <h2 className="text-xl font-semibold mb-2">Profile Snippet</h2>
             <VideoBioSnippetUpload
                currentVideoUrl={profile.videoBioUrl || ''}
                onUploadComplete={handleMediaUploadComplete}
             />
           </section>
        )}


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
