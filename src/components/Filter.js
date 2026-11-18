import React, { useEffect, useState } from 'react';
import apiClient from '../api/apiClient';

const DEFAULTS = {
  minAge: 18,
  maxAge: 100,
  maxDistance: 100,
  lookingFor: '',
  sexualOrientation: '',
  preference: 'everyone',
};

const SelectField = ({ id, label, value, onChange, options, hint }) => (
  <div className="filter-field">
    <label htmlFor={id} className="filter-label">{label}</label>
    <select id={id} name={id} value={value} onChange={onChange} className="filter-select">
      {options.map(([optionValue, optionLabel]) => (
        <option key={optionValue || 'any'} value={optionValue}>{optionLabel}</option>
      ))}
    </select>
    {hint && <p className="filter-hint">{hint}</p>}
  </div>
);

const Filter = ({ onApply, onClose = () => {}, initialFilters = {} }) => {
  const [minAge, setMinAge] = useState(initialFilters.minAge ?? DEFAULTS.minAge);
  const [maxAge, setMaxAge] = useState(initialFilters.maxAge ?? DEFAULTS.maxAge);
  const [maxDistance, setMaxDistance] = useState(initialFilters.maxDistance ?? DEFAULTS.maxDistance);
  const [lookingFor, setLookingFor] = useState(initialFilters.lookingFor || DEFAULTS.lookingFor);
  const [sexualOrientation, setSexualOrientation] = useState(initialFilters.sexualOrientation || DEFAULTS.sexualOrientation);
  const [preference, setPreference] = useState(initialFilters.preference || DEFAULTS.preference);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locationStale, setLocationStale] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  useEffect(() => {
    let active = true;
    apiClient.get('/users/me/location').then(status => {
      if (active) { setLocationEnabled(status?.enabled === true); setLocationStale(status?.stale === true); }
    }).catch(() => {
      if (active) setLocationEnabled(false);
    });
    return () => { active = false; };
  }, []);

  const enableLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage('This browser does not support GPS location.');
      return;
    }
    setLocationBusy(true);
    setLocationMessage('');
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        await apiClient.put('/users/me/location', {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy
        });
        setLocationEnabled(true);
        setLocationStale(false);
        setLocationMessage('Your current location is enabled for distance-based discovery. It is never shown as a pin or exact address.');
      } catch (error) {
        setLocationMessage(error?.data?.error || error?.message || 'Your location could not be saved.');
      } finally {
        setLocationBusy(false);
      }
    }, error => {
      const messages = {
        1: 'Location permission was denied. You can enable it in your browser settings.',
        2: 'Your current location is unavailable. Try again when GPS is available.',
        3: 'Location request timed out. Please try again.'
      };
      setLocationMessage(messages[error.code] || 'Could not read your current location.');
      setLocationBusy(false);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  };

  const disableLocation = async () => {
    setLocationBusy(true);
    setLocationMessage('');
    try {
      await apiClient.delete('/users/me/location');
      setLocationEnabled(false);
      setLocationStale(false);
      setLocationMessage('Location sharing is off. Distance filtering is disabled.');
    } catch (error) {
      setLocationMessage(error?.data?.error || error?.message || 'Location sharing could not be disabled.');
    } finally {
      setLocationBusy(false);
    }
  };

  const resetFilters = () => {
    setMinAge(DEFAULTS.minAge);
    setMaxAge(DEFAULTS.maxAge);
    setMaxDistance(DEFAULTS.maxDistance);
    setLookingFor(DEFAULTS.lookingFor);
    setSexualOrientation(DEFAULTS.sexualOrientation);
    setPreference(DEFAULTS.preference);
  };

  const handleApply = (event) => {
    event.preventDefault();
    if (locationEnabled && locationStale) {
      setLocationMessage('Your saved location is more than 24 hours old. Refresh it before using distance filters.');
      return;
    }
    const filters = {
      minAge,
      maxAge,
      ...(locationEnabled ? { maxDistance: Number(maxDistance) } : {}),
      lookingFor,
      preference,
    };
    if (lookingFor === 'Casual (FWB)' && sexualOrientation) {
      filters.sexualOrientation = sexualOrientation;
    }
    onApply(filters);
  };

  const handleMinAgeChange = (event) => {
    const value = Number(event.target.value);
    setMinAge(Math.min(value, maxAge));
  };

  const handleMaxAgeChange = (event) => {
    const value = Number(event.target.value);
    setMaxAge(Math.max(value, minAge));
  };

  const activeCount = [
    minAge !== DEFAULTS.minAge || maxAge !== DEFAULTS.maxAge,
    locationEnabled && maxDistance !== DEFAULTS.maxDistance,
    Boolean(lookingFor),
    Boolean(sexualOrientation),
    preference !== DEFAULTS.preference,
  ].filter(Boolean).length;

  return (
    <section className="discover-filter-panel" role="dialog" aria-modal="true" aria-labelledby="filter-title">
      <header className="discover-filter-header">
        <div>
          <p className="page-eyebrow">MAKE IT YOURS</p>
          <h2 id="filter-title">Your preferences</h2>
          <p className="filter-intro">A few details can help you find people who feel like a better fit.</p>
        </div>
        <button type="button" className="filter-close" onClick={onClose} aria-label="Close filters">×</button>
      </header>

      <form onSubmit={handleApply}>
        <div className="discover-filter-content">
          <section className="filter-section" aria-labelledby="who-to-see-title">
            <div className="filter-section-heading">
              <h3 id="who-to-see-title">Who would you like to see?</h3>
              <span>Show me</span>
            </div>
            <SelectField
              id="preference"
              label="Show me"
              value={preference}
              onChange={(event) => setPreference(event.target.value)}
              options={[["everyone", "Everyone"], ["Female", "Women"], ["Male", "Men"], ["Other", "Other gender identities"]]}
              hint="You can change this any time."
            />
          </section>

          <section className="filter-section" aria-labelledby="age-distance-title">
            <div className="filter-section-heading">
              <h3 id="age-distance-title">The basics</h3>
              <span>Age and distance</span>
            </div>
            <div className="filter-field">
              <div className="filter-range-heading">
                <label htmlFor="min-age" className="filter-label">Age range</label>
                <output>{minAge}–{maxAge === 100 ? '100+' : maxAge}</output>
              </div>
              <div className="filter-range-pair">
                <div>
                  <label htmlFor="min-age" className="filter-range-caption">From</label>
                  <input id="min-age" aria-label="Minimum age" type="range" min="18" max="100" value={minAge} onChange={handleMinAgeChange} />
                </div>
                <div>
                  <label htmlFor="max-age" className="filter-range-caption">To</label>
                  <input id="max-age" aria-label="Maximum age" type="range" min="18" max="100" value={maxAge} onChange={handleMaxAgeChange} />
                </div>
              </div>
            </div>
            <div className="filter-field filter-distance-field">
              <div className="filter-range-heading">
                <label htmlFor="max-distance" className="filter-label">Maximum distance</label>
                <output>Up to {maxDistance} km</output>
              </div>
              <input id="max-distance" aria-label="Maximum distance" type="range" min="1" max="100" value={maxDistance} onChange={(event) => setMaxDistance(Number(event.target.value))} />
              <div className="mt-3 space-y-2">
                <p className="text-xs text-neutral-500">Use your device's GPS to filter by distance. Your exact coordinates are stored privately and are not displayed to other members.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={enableLocation} disabled={locationBusy} className="rounded-full border border-primary px-4 py-2 text-sm font-medium text-primary disabled:opacity-50">
                    {locationBusy ? 'Updating location...' : locationEnabled ? 'Refresh my location' : 'Use my current location'}
                  </button>
                  {locationEnabled && <button type="button" onClick={disableLocation} disabled={locationBusy} className="rounded-full border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50">Turn off</button>}
                </div>
                {locationMessage && <p className="text-xs text-neutral-600" role="status">{locationMessage}</p>}
                {!locationEnabled && <p className="text-xs text-amber-700">Enable location to apply this distance filter. Without it, discovery will not use GPS distance.</p>}
                {locationStale && <p className="text-xs text-amber-700">Your last GPS update is older than 24 hours. Refresh it before applying distance filters.</p>}
              </div>
              <div className="filter-range-scale"><span>1 km</span><span>100 km</span></div>
            </div>
          </section>

          <section className="filter-section" aria-labelledby="intent-title">
            <div className="filter-section-heading">
              <h3 id="intent-title">What brings you here?</h3>
              <span>Connection</span>
            </div>
            <SelectField
              id="lookingFor"
              label="I'm looking for"
              value={lookingFor}
              onChange={(event) => setLookingFor(event.target.value)}
              options={[
                ['', 'Open to anything'],
                ['Relationship', 'A relationship'],
                ['Casual (FWB)', 'Something casual'],
                ['Friendship', 'New friends'],
                ["Don't know yet", 'Still figuring it out'],
              ]}
            />
            {lookingFor === 'Casual (FWB)' && (
              <SelectField
                id="sexualOrientation"
                label="Orientation"
                value={sexualOrientation}
                onChange={(event) => setSexualOrientation(event.target.value)}
                options={[
                  ['', 'No preference'],
                  ['Straight / Heterosexual', 'Straight / Heterosexual'],
                  ['Gay (Homosexual - Male)', 'Gay'],
                  ['Lesbian (Homosexual - Female)', 'Lesbian'],
                  ['Bisexual (Bi)', 'Bisexual'],
                  ['Pansexual', 'Pansexual'],
                  ['Asexual', 'Asexual'],
                  ['Queer', 'Queer'],
                  ['Prefer Not to Say', 'Prefer not to say'],
                ]}
              />
            )}
          </section>

        </div>

        <footer className="discover-filter-footer">
          <button type="button" className="filter-reset-button" onClick={resetFilters}>Reset</button>
          <button type="submit" className="filter-apply-button">
            Apply Filters <span aria-hidden="true">→</span>
          </button>
        </footer>
      </form>
    </section>
  );
};

export default Filter;
