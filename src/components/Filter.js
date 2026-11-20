import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../api/apiClient';

const DEFAULTS = {
  minAge: 18,
  maxAge: 100,
  maxDistance: 100,
  travelMode: 'anywhere',
  lookingFor: '',
  sexualOrientation: '',
  city: '',
  country: '',
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
  const [travelMode, setTravelMode] = useState(initialFilters.travelMode || (initialFilters.city ? 'city' : initialFilters.country ? 'country' : 'anywhere'));
  const [lookingFor, setLookingFor] = useState(initialFilters.lookingFor || DEFAULTS.lookingFor);
  const [sexualOrientation, setSexualOrientation] = useState(initialFilters.sexualOrientation || DEFAULTS.sexualOrientation);
  const [city, setCity] = useState(initialFilters.city || DEFAULTS.city);
  const [country, setCountry] = useState(initialFilters.country || DEFAULTS.country);
  const [preference, setPreference] = useState(initialFilters.preference || DEFAULTS.preference);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locationStale, setLocationStale] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const dialogRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const focusable = dialog ? Array.from(dialog.querySelectorAll(focusableSelector)) : [];
    (focusable[0] || dialog)?.focus();

    const handleDialogKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const currentFocusable = Array.from(dialog.querySelectorAll(focusableSelector));
      if (!currentFocusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleDialogKeyDown);

    let active = true;
    apiClient.get('/users/me/location').then(status => {
      if (active) { setLocationEnabled(status?.enabled === true); setLocationStale(status?.stale === true); }
    }).catch(() => {
      if (active) setLocationEnabled(false);
    });
    return () => {
      active = false;
      document.removeEventListener('keydown', handleDialogKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) previousFocus.focus();
    };
  }, [onClose]);

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
    setTravelMode(DEFAULTS.travelMode);
    setLookingFor(DEFAULTS.lookingFor);
    setSexualOrientation(DEFAULTS.sexualOrientation);
    setCity(DEFAULTS.city);
    setCountry(DEFAULTS.country);
    setPreference(DEFAULTS.preference);
  };

  const handleApply = (event) => {
    event.preventDefault();
    const filters = {
      minAge,
      maxAge,
      ...(travelMode === 'nearby' && locationEnabled && !locationStale ? { maxDistance: Number(maxDistance) } : {}),
      lookingFor,
      preference,
      ...(travelMode === 'city' && city.trim() ? { city: city.trim() } : {}),
      ...(travelMode === 'country' && country.trim() ? { country: country.trim() } : {}),
    };
    if (travelMode === 'city' && !city.trim()) { setLocationMessage('Enter a destination city to search there.'); return; }
    if (travelMode === 'country' && !country.trim()) { setLocationMessage('Enter a destination country to search there.'); return; }
    if (travelMode === 'nearby' && (!locationEnabled || locationStale)) { setLocationMessage('Enable or refresh GPS location before using nearby discovery.'); return; }
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
    travelMode !== DEFAULTS.travelMode,
    travelMode === 'nearby' && maxDistance !== DEFAULTS.maxDistance,
    Boolean(lookingFor),
    Boolean(sexualOrientation),
    Boolean(city.trim()),
    Boolean(country.trim()),
    preference !== DEFAULTS.preference,
  ].filter(Boolean).length;

  return (
    <section ref={dialogRef} className="discover-filter-panel" role="dialog" aria-modal="true" aria-labelledby="filter-title" tabIndex={-1}>
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
                     </section>

          <section className="filter-section" aria-labelledby="location-search-title">
            <div className="filter-section-heading">
              <h3 id="location-search-title">Where would you like to discover?</h3>
              <span>Travel & location</span>
            </div>
            <SelectField id="travel-mode" label="Discovery location" value={travelMode} onChange={(event) => { setTravelMode(event.target.value); setLocationMessage(''); }} options={[["anywhere", "Anywhere / international"], ["nearby", "Near my current location"], ["city", "Explore a specific city"], ["country", "Explore a specific country"]]} hint="This only filters profiles by their listed city or country, or by opted-in GPS distance. It does not track travel." />
            {travelMode === 'city' && <div className="filter-field">
              <label htmlFor="discovery-city" className="filter-label">Destination city</label>
              <input id="discovery-city" type="text" value={city} maxLength={100} onChange={event => setCity(event.target.value)} placeholder="Enter city" className="filter-select" autoComplete="off" />
            </div>}
            {travelMode === 'country' && <div className="filter-field">
              <label htmlFor="discovery-country" className="filter-label">Destination country</label>
              <input id="discovery-country" type="text" value={country} maxLength={100} onChange={event => setCountry(event.target.value)} placeholder="Enter country" className="filter-select" autoComplete="off" />
            </div>}
            {travelMode === 'nearby' && <div className="filter-field filter-distance-field">
              <div className="filter-range-heading">
                <label htmlFor="max-distance" className="filter-label">Maximum distance</label>
                <output>Up to {maxDistance} km</output>
              </div>
              <input id="max-distance" aria-label="Maximum distance" type="range" min="1" max="100" value={maxDistance} disabled={!locationEnabled || locationStale || locationBusy} onChange={(event) => setMaxDistance(Number(event.target.value))} />
              <div className="mt-3 space-y-2">
                <p className="text-xs text-neutral-500">Your exact coordinates are private and are never shown to members.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={enableLocation} disabled={locationBusy} className="rounded-full border border-primary px-4 py-2 text-sm font-medium text-primary disabled:opacity-50">{locationBusy ? 'Updating location...' : locationEnabled ? 'Refresh my location' : 'Use my current location'}</button>
                  {locationEnabled && <button type="button" onClick={disableLocation} disabled={locationBusy} className="rounded-full border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50">Turn off</button>}
                </div>
                {locationMessage && <p className="text-xs text-neutral-600" role="status">{locationMessage}</p>}
                {!locationEnabled && <p className="text-xs text-amber-700">Enable location to apply this distance filter.</p>}
                {locationStale && <p className="text-xs text-amber-700">Your GPS update is older than 24 hours. Refresh before applying.</p>}
              </div>
              <div className="filter-range-scale"><span>1 km</span><span>100 km</span></div>
            </div>}
            {travelMode === 'anywhere' && <p className="filter-hint">Explore internationally. No city, country or GPS distance filter is applied.</p>}
            {(travelMode === 'city' || travelMode === 'country') && <p className="filter-hint">Matches against the city or country members have listed on their profiles. GPS is not used.</p>}
            {locationMessage && travelMode !== 'nearby' && <p className="filter-hint" role="status">{locationMessage}</p>}
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
