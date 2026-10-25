import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/apiClient';
import InterestsDisplay from '../../components/InterestsDisplay';
import ProfilePromptsDisplay from '../../components/ProfilePromptsDisplay';
import PhotoGallery from '../../components/PhotoGallery';
import BadgesDisplay from '../../components/BadgesDisplay';

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
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-50">{title}</h2>
        </div>
        {children}
    </div>
);

function AdminUserProfileViewPage() {
  const [profile, setProfile] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const { userId } = useParams();
  const { user: adminUser } = useAuth();

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const data = await apiClient.get(`/admin/users/${userId}`);
        setProfile(data);
      } catch (error) {
        setFetchError(error.message);
      }
    };

    if (userId) {
      fetchUserProfile();
    }
  }, [userId]);

  if (fetchError) return <p className="text-red-500 p-4">Error: {fetchError}</p>;
  if (!profile) return <p className="p-4">Loading profile...</p>;

  const isPremium = profile.tier === 'premium';
  const isVerified = profile.isVerified === true;

  return (
    <div className="bg-neutral-50 dark:bg-neutral-900 min-h-screen">
        <div className="container mx-auto p-4">
            <div className="relative w-full h-96 md:h-[70vh] rounded-lg overflow-hidden shadow-lg mb-6">
              <PhotoGallery photos={profile.photos || []} />
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <h1 className="text-3xl font-bold text-white">{profile.name}, {profile.age}</h1>
                    <div className="flex items-center mt-1">
                        {isPremium && <PremiumBadge />}
                        {isVerified && <VerifiedBadge />}
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <SectionCard title="About Me">
                  <p className="text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap">{profile.bio || 'Tell us about yourself...'}</p>
                </SectionCard>

                <SectionCard title="Profile Prompts">
                  <ProfilePromptsDisplay profilePrompts={profile.profilePrompts || []} />
                </SectionCard>

                 <SectionCard title="Details">
                    <div className="space-y-2 text-neutral-600 dark:text-neutral-300">
                        {adminUser?.role === 'superadmin' && (
                          <>
                            <p><strong>Email:</strong> {profile.email || 'N/A'}</p>
                            <p><strong>Mobile Number:</strong> {profile.mobileNumber || profile.phoneNumber || 'N/A'}</p>
                          </>
                        )}
                        <p><strong>Gender:</strong> {profile.gender}</p>
                        <p><strong>Preference:</strong> {profile.preference}</p>
                        <p><strong>Education:</strong> {profile.education || 'N/A'}</p>
                        <p><strong>Relationship Goals:</strong> {profile.relationshipGoals || 'N/A'}</p>
                    </div>
                  </SectionCard>
                  <SectionCard title="Lifestyle">
                      <div className="space-y-2 text-neutral-600 dark:text-neutral-300">
                          <p><strong>Pets:</strong> {profile.lifestyle?.pets || 'N/A'}</p>
                          <p><strong>Looking For:</strong> {profile.lifestyle?.lookingFor || 'N/A'}</p>
                          <p><strong>Religion:</strong> {profile.lifestyle?.religion || 'N/A'}</p>
                          <p><strong>Political Leaning:</strong> {profile.lifestyle?.politicalLeaning || 'N/A'}</p>
                      </div>
                      <hr className="my-4" />
                      <BadgesDisplay badges={profile.badges} />
                  </SectionCard>
                  <SectionCard title="Interests">
                      <InterestsDisplay interests={profile.interests || []} />
                  </SectionCard>
                  <SectionCard title="Personality Type">
                    <p className="text-neutral-600 dark:text-neutral-300">{profile.personalityType || 'N/A'}</p>
                  </SectionCard>
            </div>
        </div>
    </div>
  );
}

export default AdminUserProfileViewPage;
