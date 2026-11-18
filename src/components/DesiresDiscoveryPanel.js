import React, { useEffect, useState } from 'react';
import apiClient from '../api/apiClient';

const GROUPS = [
  {
    key: 'relationshipIntent',
    title: 'What are you looking for?',
    description: 'Choose the kind of connection you are open to.',
    options: [
      ['long_term', 'A long-term relationship'],
      ['casual_dating', 'Casual dating'],
      ['friendship', 'Friendship and social connection'],
      ['exploring', 'Exploring without a fixed expectation']
    ]
  },
  {
    key: 'relationshipStyles',
    title: 'Relationship styles',
    description: 'Select the relationship structures you are comfortable exploring.',
    options: [
      ['monogamy', 'Monogamy'],
      ['open_relationship', 'Open relationship'],
      ['ethical_non_monogamy', 'Ethical non-monogamy'],
      ['polyamory', 'Polyamory'],
      ['partner_inclusive', 'Partner-inclusive dating'],
      ['group_connection', 'Group connections']
    ]
  },
  {
    key: 'desires',
    title: 'Desires and interests',
    description: 'A non-graphic catalogue of interests you may want to explore.',
    options: [
      ['romantic_exploration', 'Romantic exploration'],
      ['adventure', 'Adventure and spontaneity'],
      ['roleplay', 'Roleplay and imagination'],
      ['sensory_experiences', 'Sensory experiences'],
      ['power_dynamics', 'Power dynamics'],
      ['kink_aware', 'Kink-aware exploration'],
      ['shared_fantasies', 'Sharing fantasies through conversation'],
      ['playful_experimentation', 'Playful experimentation']
    ]
  },
  {
    key: 'curiosities',
    title: 'Curiosities',
    description: 'Things you are curious about. Curiosity does not mean consent or commitment.',
    options: [
      ['new_experiences', 'Trying new experiences'],
      ['nontraditional_relationships', 'Non-traditional relationship structures'],
      ['group_social_experiences', 'Group social experiences'],
      ['partner_inclusive_dating', 'Partner-inclusive dating'],
      ['roleplay', 'Roleplay and imagination'],
      ['sensory_exploration', 'Sensory exploration']
    ]
  },
  {
    key: 'boundaries',
    title: 'My boundaries',
    description: 'Let people know what matters to your comfort and privacy.',
    options: [
      ['no_unsolicited_explicit_media', 'No unsolicited explicit media'],
      ['discuss_before_escalating', 'Discuss boundaries before taking things further'],
      ['no_pressure', 'No pressure or assumptions'],
      ['privacy_first', 'Privacy comes first'],
      ['no_group_invitations', 'No group invitations'],
      ['no_partner_linking', 'No linked-partner requests']
    ]
  }
];

const EMPTY_PREFERENCES = {
  consent: false,
  relationshipIntent: [],
  relationshipStyles: [],
  desires: [],
  curiosities: [],
  boundaries: [],
  visibility: { relationshipIntent: 'private', relationshipStyles: 'private', desires: 'private', curiosities: 'private', boundaries: 'private' }
};

const DesiresDiscoveryPanel = () => {
  const [preferences, setPreferences] = useState(EMPTY_PREFERENCES);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiClient.get('/users/me/desires')
      .then(data => {
        if (!active) return;
        const next = { ...EMPTY_PREFERENCES, ...(data || {}) };
        for (const group of GROUPS) {
          if (!Array.isArray(next[group.key])) next[group.key] = [];
        }
        setPreferences(next);
        setConsent(next.consent === true);
      })
      .catch(() => {
        if (active) setError('Desires & Discovery could not be loaded. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const toggleOption = (group, value) => {
    setPreferences(current => {
      const selected = new Set(current[group]);
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
      return { ...current, [group]: Array.from(selected) };
    });
    setMessage('');
  };

  const save = async () => {
    if (!consent) {
      setError('Please confirm that you understand and agree before saving.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        consent: true,
        relationshipIntent: preferences.relationshipIntent,
        relationshipStyles: preferences.relationshipStyles,
        desires: preferences.desires,
        curiosities: preferences.curiosities,
        boundaries: preferences.boundaries,
        visibility: {
          relationshipIntent: preferences.visibility?.relationshipIntent === 'public' ? 'public' : 'private',
          relationshipStyles: preferences.visibility?.relationshipStyles === 'public' ? 'public' : 'private'
        }
      };
      const saved = await apiClient.put('/users/me/desires', payload);
      setPreferences({ ...EMPTY_PREFERENCES, ...saved });
      setConsent(true);
      setMessage('Your private preferences have been saved.');
    } catch (saveError) {
      setError(saveError?.data?.error || saveError?.message || 'Your preferences could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete these preferences and withdraw your consent?')) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiClient.delete('/users/me/desires');
      setPreferences(EMPTY_PREFERENCES);
      setConsent(false);
      setMessage('Your preferences were deleted and consent was withdrawn.');
    } catch {
      setError('Your preferences could not be deleted. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-4 text-sm text-neutral-500" role="status">Loading your private preferences</div>;

  return (
    <div className="space-y-5">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        Explore what you want, what you are curious about and what your boundaries are.
        Every selection is optional. Curiosity is not consent.
      </p>
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
        Desires, curiosities and boundaries always remain private. Relationship intent and relationship styles are private by default. You can separately choose to show either of those two categories on your profile. You can change visibility or withdraw consent at any time.
      </div>
      {GROUPS.map(group => (
        <fieldset key={group.key} className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <legend className="font-semibold text-neutral-800 dark:text-neutral-100">{group.title}</legend>
            {['relationshipIntent', 'relationshipStyles'].includes(group.key) ? (
              <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                <span>Profile visibility</span>
                <select
                  aria-label={group.title + ' profile visibility'}
                  value={preferences.visibility?.[group.key] === 'public' ? 'public' : 'private'}
                  onChange={event => setPreferences(current => ({
                    ...current,
                    visibility: { ...current.visibility, [group.key]: event.target.value }
                  }))}
                  disabled={saving}
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-600 dark:bg-neutral-800"
                >
                  <option value="private">Private</option>
                  <option value="public">Show on my profile</option>
                </select>
              </label>
            ) : (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">Always private</span>
            )}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{group.description}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {group.options.map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-start gap-2 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-700">
                <input
                  type="checkbox"
                  checked={preferences[group.key].includes(value)}
                  onChange={() => toggleOption(group.key, value)}
                  disabled={saving}
                  className="mt-0.5 rounded border-neutral-400 text-primary focus:ring-primary"
                />
                <span className="text-neutral-700 dark:text-neutral-200">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <label className="flex items-start gap-3 rounded-lg border border-neutral-300 p-3 text-sm dark:border-neutral-600">
        <input
          type="checkbox"
          checked={consent}
          onChange={event => { setConsent(event.target.checked); setError(''); }}
          disabled={saving}
          className="mt-0.5 rounded border-neutral-400 text-primary focus:ring-primary"
        />
        <span className="text-neutral-700 dark:text-neutral-200">
          I understand these are sensitive personal preferences. I voluntarily consent to saving them privately
          for future relationship discovery features. I can withdraw this consent and delete the data at any time.
        </span>
      </label>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {message && <p className="text-sm text-green-700 dark:text-green-400" role="status">{message}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={save} disabled={saving} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? 'Saving...' : 'Save private preferences'}
        </button>
        {preferences.consent && (
          <button type="button" onClick={remove} disabled={saving} className="rounded-full border border-red-300 px-5 py-2 text-sm font-semibold text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300">
            Delete preferences
          </button>
        )}
      </div>
    </div>
  );
};

export default DesiresDiscoveryPanel;
