import React, { useState } from 'react';

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
    const filters = {
      minAge,
      maxAge,
      maxDistance: Number(maxDistance),
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
    maxDistance !== DEFAULTS.maxDistance,
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
