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

const formatDiscoveryValue = (value) => String(value)
  .split('_')
  .filter(Boolean)
  .map(part => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

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
  // Only render the two explicitly public, consented categories supplied by
  // the API. Never read relationshipPreferences, desires, curiosities or
  // boundaries from a discovery profile.
  const publicDiscovery = user.relationshipDiscovery || {};
  const publicIntent = Array.isArray(publicDiscovery.relationshipIntent)
    ? publicDiscovery.relationshipIntent.filter(value => typeof value === 'string')
    : [];
  const publicStyles = Array.isArray(publicDiscovery.relationshipStyles)
    ? publicDiscovery.relationshipStyles.filter(value => typeof value === 'string')
    : [];

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

      {(publicIntent.length > 0 || publicStyles.length > 0) && (
        <DetailSection title="Shared relationship preferences">
          {publicIntent.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-sm font-semibold text-neutral-200">Relationship intentions</p>
              <div className="flex flex-wrap gap-2">
                {publicIntent.map(value => (
                  <span key={value} className="rounded-full border border-neutral-600 px-3 py-1 text-sm">
                    {formatDiscoveryValue(value)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {publicStyles.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-semibold text-neutral-200">Relationship styles</p>
              <div className="flex flex-wrap gap-2">
                {publicStyles.map(value => (
                  <span key={value} className="rounded-full border border-neutral-600 px-3 py-1 text-sm">
                    {formatDiscoveryValue(value)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </DetailSection>
      )}

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