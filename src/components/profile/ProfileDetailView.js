import React from 'react';
import InterestsDisplay from '../InterestsDisplay';
import ProfilePromptsDisplay from '../ProfilePromptsDisplay';
import BadgesDisplay from '../BadgesDisplay';

const DetailSection = ({ title, children }) => {
  if (!children) return null;
  return (
    <div className="py-4 border-b border-neutral-700">
      <h4 className="font-bold text-lg text-neutral-200 mb-2">{title}</h4>
      <div className="text-neutral-300">{children}</div>
    </div>
  );
};

const ProfileDetailView = ({ user }) => {
  if (!user) return null;

  const {
    bio,
    interests,
    profilePrompts,
    lifestyle,
    badges,
    education,
    relationshipGoals,
  } = user;

  return (
    <div className="bg-neutral-800 text-neutral-100 p-6 pt-4">
      <DetailSection title="About Me">
        <p>{bio || 'No bio yet.'}</p>
      </DetailSection>

      <DetailSection title="Interests">
        <InterestsDisplay interests={interests || []} />
      </DetailSection>

      <DetailSection title="Profile Prompts">
        <ProfilePromptsDisplay profilePrompts={profilePrompts || []} />
      </DetailSection>

      <DetailSection title="Details">
        <p><strong>Education:</strong> {education || 'N/A'}</p>
        <p><strong>Relationship Goals:</strong> {relationshipGoals || 'N/A'}</p>
      </DetailSection>

      <DetailSection title="Lifestyle">
        <p><strong>Pets:</strong> {lifestyle?.pets || 'N/A'}</p>
        <p><strong>Looking For:</strong> {lifestyle?.lookingFor || 'N/A'}</p>
        <p><strong>Religion:</strong> {lifestyle?.religion || 'N/A'}</p>
        <p><strong>Political Leaning:</strong> {lifestyle?.politicalLeaning || 'N/A'}</p>
        {badges && Object.keys(badges).length > 0 && (
          <div className="mt-4">
            <BadgesDisplay badges={badges} />
          </div>
        )}
      </DetailSection>
    </div>
  );
};

export default ProfileDetailView;