import React, { useState } from 'react';

const DEFAULTS = {
  minAge: 18,
  maxAge: 100,
  maxDistance: 100,
  relationshipType: '',
  sexualOrientation: '',
  familyStatus: '',
  lifestyle: { pets: '', workout: '', drinking: '', smoking: '' },
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

const Filter = ({ onApply, onClose = () => {} }) => {
  const [minAge, setMinAge] = useState(DEFAULTS.minAge);
  const [maxAge, setMaxAge] = useState(DEFAULTS.maxAge);
  const [maxDistance, setMaxDistance] = useState(DEFAULTS.maxDistance);
  const [lifestyle, setLifestyle] = useState({ ...DEFAULTS.lifestyle });
  const [relationshipType, setRelationshipType] = useState(DEFAULTS.relationshipType);
  const [sexualOrientation, setSexualOrientation] = useState(DEFAULTS.sexualOrientation);
  const [familyStatus, setFamilyStatus] = useState(DEFAULTS.familyStatus);

  const handleLifestyleChange = (event) => {
    const { name, value } = event.target;
    setLifestyle((current) => ({ ...current, [name]: value }));
  };

  const resetFilters = () => {
    setMinAge(DEFAULTS.minAge);
    setMaxAge(DEFAULTS.maxAge);
    setMaxDistance(DEFAULTS.maxDistance);
    setLifestyle({ ...DEFAULTS.lifestyle });
    setRelationshipType(DEFAULTS.relationshipType);
    setSexualOrientation(DEFAULTS.sexualOrientation);
    setFamilyStatus(DEFAULTS.familyStatus);
  };

  const handleApply = (event) => {
    event.preventDefault();
    const filters = {
      minAge,
      maxAge,
      maxDistance: Number(maxDistance),
      relationshipType,
      familyStatus,
    };
    if (relationshipType === 'Casual (FWB)' && sexualOrientation) {
      filters.sexualOrientation = sexualOrientation;
    }
    Object.entries(lifestyle).forEach(([key, value]) => {
      if (value) filters[key] = value;
    });
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
    Boolean(relationshipType),
    Boolean(familyStatus),
    Boolean(sexualOrientation),
    ...Object.values(lifestyle).map(Boolean),
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
                <output>{maxDistance} km</output>
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
              id="relationshipType"
              label="I'm looking for"
              value={relationshipType}
              onChange={(event) => setRelationshipType(event.target.value)}
              options={[
                ['', 'Open to anything'],
                ['Relationship', 'A relationship'],
                ['Casual (FWB)', 'Something casual'],
                ['Friendship', 'New friends'],
                ["Don't know yet", 'Still figuring it out'],
              ]}
            />
            {relationshipType === 'Casual (FWB)' && (
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
            <SelectField
              id="familyStatus"
              label="Family background"
              value={familyStatus}
              onChange={(event) => setFamilyStatus(event.target.value)}
              options={[
                ['', 'No preference'],
                ['Lower Class Family', 'Lower income background'],
                ['Lower-Middle Class Family', 'Lower-middle income background'],
                ['Middle Class Family', 'Middle income background'],
                ['Upper-Middle Class Family', 'Upper-middle income background'],
                ['Upper Class / Elite Family', 'Higher income background'],
              ]}
            />
          </section>

          <section className="filter-section" aria-labelledby="lifestyle-title">
            <div className="filter-section-heading">
              <h3 id="lifestyle-title">Everyday life</h3>
              <span>Lifestyle</span>
            </div>
            <div className="filter-lifestyle-grid">
              <SelectField id="pets" label="Pets" value={lifestyle.pets} onChange={handleLifestyleChange} options={[
                ['', 'No preference'], ['Dog person', 'Dogs'], ['Cat person', 'Cats'], ['No pets', 'No pets'], ['All the pets', 'All pets'],
              ]} />
              <SelectField id="workout" label="Exercise" value={lifestyle.workout} onChange={handleLifestyleChange} options={[
                ['', 'No preference'], ['Every day', 'Every day'], ['Often', 'Often'], ['Sometimes', 'Sometimes'], ['Never', 'Rarely / never'],
              ]} />
              <SelectField id="drinking" label="Drinking" value={lifestyle.drinking} onChange={handleLifestyleChange} options={[
                ['', 'No preference'], ['Frequently', 'Often'], ['Socially', 'Socially'], ['Rarely', 'Rarely'], ['Never', 'Never'],
              ]} />
              <SelectField id="smoking" label="Smoking" value={lifestyle.smoking} onChange={handleLifestyleChange} options={[
                ['', 'No preference'], ['Socially', 'Socially'], ['Sometimes', 'Sometimes'], ['Never', 'Never'],
              ]} />
            </div>
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
