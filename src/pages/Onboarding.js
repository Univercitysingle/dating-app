import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/apiClient';
import PhotoUploader from '../components/PhotoUploader';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { subYears } from 'date-fns';

const steps = [
  { title: 'The basics', subtitle: 'Start with a few details about you.' },
  { title: 'A photo says a lot', subtitle: 'Add a clear photo so people can recognise you.' },
  { title: 'A little more about you', subtitle: 'Share the details that help show your personality.' },
  { title: 'What brings you here?', subtitle: 'Tell people what kind of connection you have in mind.' },
  { title: 'One last thing', subtitle: 'Add a couple of details to complete your profile.' },
];

const inputClass = 'mt-2 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-pink-400 focus:ring-4 focus:ring-pink-100';
const labelClass = 'block text-sm font-semibold text-gray-800';

const countryCallingCodes = [
  { country: 'United Arab Emirates', flag: '🇦🇪', code: '+971' },
  { country: 'Sri Lanka', flag: '🇱🇰', code: '+94' },
  { country: 'India', flag: '🇮🇳', code: '+91' },
  { country: 'Pakistan', flag: '🇵🇰', code: '+92' },
  { country: 'Bangladesh', flag: '🇧🇩', code: '+880' },
  { country: 'Nepal', flag: '🇳🇵', code: '+977' },
  { country: 'Philippines', flag: '🇵🇭', code: '+63' },
  { country: 'United Kingdom', flag: '🇬🇧', code: '+44' },
  { country: 'United States', flag: '🇺🇸', code: '+1' },
  { country: 'Canada', flag: '🇨🇦', code: '+1' },
  { country: 'Australia', flag: '🇦🇺', code: '+61' },
  { country: 'New Zealand', flag: '🇳🇿', code: '+64' },
  { country: 'Saudi Arabia', flag: '🇸🇦', code: '+966' },
  { country: 'Qatar', flag: '🇶🇦', code: '+974' },
  { country: 'Kuwait', flag: '🇰🇼', code: '+965' },
  { country: 'Bahrain', flag: '🇧🇭', code: '+973' },
  { country: 'Oman', flag: '🇴🇲', code: '+968' },
  { country: 'Jordan', flag: '🇯🇴', code: '+962' },
  { country: 'Lebanon', flag: '🇱🇧', code: '+961' },
  { country: 'Egypt', flag: '🇪🇬', code: '+20' },
  { country: 'South Africa', flag: '🇿🇦', code: '+27' },
  { country: 'Nigeria', flag: '🇳🇬', code: '+234' },
  { country: 'Kenya', flag: '🇰🇪', code: '+254' },
  { country: 'Germany', flag: '🇩🇪', code: '+49' },
  { country: 'France', flag: '🇫🇷', code: '+33' },
  { country: 'Italy', flag: '🇮🇹', code: '+39' },
  { country: 'Spain', flag: '🇪🇸', code: '+34' },
  { country: 'Portugal', flag: '🇵🇹', code: '+351' },
  { country: 'Netherlands', flag: '🇳🇱', code: '+31' },
  { country: 'Belgium', flag: '🇧🇪', code: '+32' },
  { country: 'Switzerland', flag: '🇨🇭', code: '+41' },
  { country: 'Austria', flag: '🇦🇹', code: '+43' },
  { country: 'Ireland', flag: '🇮🇪', code: '+353' },
  { country: 'Sweden', flag: '🇸🇪', code: '+46' },
  { country: 'Norway', flag: '🇳🇴', code: '+47' },
  { country: 'Denmark', flag: '🇩🇰', code: '+45' },
  { country: 'Finland', flag: '🇫🇮', code: '+358' },
  { country: 'Poland', flag: '🇵🇱', code: '+48' },
  { country: 'Turkey', flag: '🇹🇷', code: '+90' },
  { country: 'Russia', flag: '🇷🇺', code: '+7' },
  { country: 'Ukraine', flag: '🇺🇦', code: '+380' },
  { country: 'China', flag: '🇨🇳', code: '+86' },
  { country: 'Japan', flag: '🇯🇵', code: '+81' },
  { country: 'South Korea', flag: '🇰🇷', code: '+82' },
  { country: 'Singapore', flag: '🇸🇬', code: '+65' },
  { country: 'Malaysia', flag: '🇲🇾', code: '+60' },
  { country: 'Indonesia', flag: '🇮🇩', code: '+62' },
  { country: 'Thailand', flag: '🇹🇭', code: '+66' },
  { country: 'Vietnam', flag: '🇻🇳', code: '+84' },
  { country: 'Hong Kong', flag: '🇭🇰', code: '+852' },
  { country: 'Mexico', flag: '🇲🇽', code: '+52' },
  { country: 'Brazil', flag: '🇧🇷', code: '+55' },
  { country: 'Argentina', flag: '🇦🇷', code: '+54' },
  { country: 'Chile', flag: '🇨🇱', code: '+56' },
  { country: 'Colombia', flag: '🇨🇴', code: '+57' },
  { country: 'Peru', flag: '🇵🇪', code: '+51' },
];

const ChoiceCard = ({ selected, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${selected
      ? 'border-pink-500 bg-pink-50 text-pink-700 ring-2 ring-pink-100'
      : 'border-gray-200 bg-white text-gray-700 hover:border-pink-200 hover:bg-pink-50/40'}`}
  >
    {children}
  </button>
);

const Onboarding = () => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState(null);
  const [gender, setGender] = useState('');
  const [personalityType, setPersonalityType] = useState('');
  const [photo, setPhoto] = useState(null);
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [countryCode, setCountryCode] = useState('+971');
  const [mobileNumber, setMobileNumber] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [education, setEducation] = useState('');
  const [relationshipGoals, setRelationshipGoals] = useState('');
  const [lookingFor, setLookingFor] = useState('');
  const [sexualOrientation, setSexualOrientation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const progress = useMemo(() => ((step + 1) / steps.length) * 100, [step]);

  const validateStep = () => {
    if (step === 0) {
      if (!name.trim() || !birthday || !gender) return 'Please complete your name, birthday and gender.';
      if (birthday > subYears(new Date(), 18)) return 'You must be at least 18 to create an account.';
    }
    if (step === 1 && !photo) return 'Please upload a profile photo to continue.';
    if (step === 2 && (!personalityType || !education.trim())) return 'Please select your personality type and add your education.';
    if (step === 3) {
      if (!relationshipGoals || !lookingFor) return 'Please select your relationship goals and what you are looking for.';
      if (lookingFor === 'Casual (FWB)' && !sexualOrientation) return 'Please select your sexual orientation.';
    }
    if (step === 4) {
      if (!/^\+[1-9]\d{7,14}$/.test(mobileNumber.trim())) return 'Enter your mobile number in international format, for example +971501234567.';
      const feet = Number(heightFeet);
      const inches = Number(heightInches);
      if (!heightFeet || !heightInches || feet < 3 || feet > 8 || inches < 0 || inches > 11) return 'Enter a valid height in feet and inches.';
    }
    return null;
  };

  const handleNext = () => {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setStep(current => Math.min(current + 1, steps.length - 1));
  };

  const handleBack = () => {
    setError(null);
    setStep(current => Math.max(current - 1, 0));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setIsSaving(true);

    const heightInCm = Math.round((Number(heightFeet) * 30.48) + (Number(heightInches) * 2.54));
    try {
      const updatedProfile = await apiClient.put('/users/me', {
        name: name.trim(),
        birthday,
        gender,
        photos: [{ url: photo, order: 0 }],
        location,
        personalityType,
        ...(sexualOrientation ? { sexualOrientation } : {}),
        mobileNumber: `${countryCode}${mobileNumber.replace(/\\D/g, '')}`,
        education: education.trim(),
        relationshipGoals,
        lifestyle: { lookingFor },
        badges: { height: heightInCm },
        isOnboardingComplete: true,
      });

      if (typeof setUser === 'function') {
        setUser(prevUser => ({
          ...prevUser,
          ...updatedProfile,
          isOnboardingComplete: true,
        }));
        navigate('/discover');
      } else {
        console.error('AuthContext setUser is unavailable.', { user });
        window.location.href = '/discover';
      }
    } catch (err) {
      setError(err.data?.message || err.message || 'We could not save your profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLocation = () => {
    if (!navigator.geolocation) {
      setError('Location is not supported by this browser. You can skip this step.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocation({
          type: 'Point',
          coordinates: [position.coords.longitude, position.coords.latitude],
        });
        setError(null);
      },
      () => setError('We could not access your location. You can continue without it.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  return (
    <main className="auth-page flex min-h-screen items-center justify-center px-4 py-8 sm:py-12">
      <section className="auth-card w-full max-w-2xl overflow-hidden rounded-3xl">
        <div className="h-1.5 w-full bg-gray-100" aria-label={`Step ${step + 1} of ${steps.length}`}>
          <div className="h-full rounded-r-full bg-gradient-to-r from-pink-500 to-rose-400 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="p-6 sm:p-10">
          <div className="mb-8">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-pink-600">Your profile</span>
              <span className="text-xs font-semibold text-gray-400">STEP {step + 1} OF {steps.length}</span>
            </div>
            <div className="mb-3 flex gap-1.5" aria-hidden="true">
              {steps.map((item, index) => (
                <span key={item.title} className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-pink-500' : 'bg-gray-100'}`} />
              ))}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{steps[step].title}</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">{steps[step].subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <label className={labelClass} htmlFor="name">What should we call you?</label>
                  <input id="name" name="name" type="text" required maxLength={25} autoComplete="given-name" value={name} onChange={e => setName(e.target.value)} placeholder="Your first name" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="birthday">When's your birthday?</label>
                  <DatePicker id="birthday" selected={birthday} onChange={setBirthday} maxDate={subYears(new Date(), 18)} minDate={subYears(new Date(), 100)} showYearDropdown yearDropdownItemNumber={100} scrollableYearDropdown dateFormat="dd MMMM yyyy" placeholderText="Select your date of birth" className={inputClass} wrapperClassName="block" />
                  <p className="mt-2 text-xs text-gray-400">You must be 18 or older to use Hart2Hart.</p>
                </div>
                <div>
                  <span className={labelClass}>How do you identify?</span>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {['Male', 'Female', 'Other'].map(value => <ChoiceCard key={value} selected={gender === value} onClick={() => setGender(value)}>{value}</ChoiceCard>)}
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="rounded-2xl border border-dashed border-pink-200 bg-pink-50/40 p-6 text-center sm:p-8">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white text-pink-500 shadow-sm">
                  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h2l1.2-1.5h4.6L15.5 5h2A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><circle cx="12" cy="12" r="3.5"/></svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Choose your main profile photo</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500">Use a recent, clear photo where people can see you. You can add more photos to your profile later.</p>
                <div className="mt-5 flex justify-center">
                  <PhotoUploader onUploadComplete={response => setPhoto(response.fileUrl)} />
                </div>
                {photo && <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700"><span className="h-2 w-2 rounded-full bg-green-500" /> Photo uploaded successfully</div>}
                <p className="mt-3 text-xs text-gray-400">Your original image quality is preserved during upload.</p>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <label className={labelClass} htmlFor="personalityType">What's your personality type?</label>
                  <select id="personalityType" required value={personalityType} onChange={e => setPersonalityType(e.target.value)} className={inputClass}>
                    <option value="">Choose your Myers-Briggs type</option>
                    {['ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP', 'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'].map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="education">What's your education?</label>
                  <input id="education" type="text" required value={education} onChange={e => setEducation(e.target.value)} placeholder="e.g. Bachelor's degree" className={inputClass} />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <span className={labelClass}>What kind of relationship are you hoping for?</span>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {['Long-term relationship', 'Long-term, open to short', 'Short-term, open to long', 'Short-term fun', 'New friends', 'Figuring it out'].map(value => <ChoiceCard key={value} selected={relationshipGoals === value} onClick={() => setRelationshipGoals(value)}>{value}</ChoiceCard>)}
                  </div>
                </div>
                <div>
                  <span className={labelClass}>What are you looking for?</span>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {['Relationship', 'Casual (FWB)', 'Friendship', "Don't know yet"].map(value => <ChoiceCard key={value} selected={lookingFor === value} onClick={() => setLookingFor(value)}>{value}</ChoiceCard>)}
                  </div>
                </div>
                {lookingFor === 'Casual (FWB)' && (
                  <div>
                    <label className={labelClass} htmlFor="sexualOrientation">Sexual orientation</label>
                    <select id="sexualOrientation" required value={sexualOrientation} onChange={e => setSexualOrientation(e.target.value)} className={inputClass}>
                      <option value="">Select an option</option>
                      {['Straight', 'Gay', 'Lesbian', 'Bisexual', 'Pansexual', 'Asexual', 'Queer', 'Other'].map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <span className={labelClass}>Mobile number</span>
                  <div className="mt-2 grid grid-cols-[minmax(145px,0.9fr)_minmax(0,1.5fr)] gap-2">
                    <div>
                      <label htmlFor="countryCode" className="sr-only">Country calling code</label>
                      <select id="countryCode" autoComplete="tel-country-code" value={countryCode} onChange={e => setCountryCode(e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-pink-400 focus:ring-4 focus:ring-pink-100">
                        {countryCallingCodes.map((item, index) => (
                          <option key={`${item.country}-${index}`} value={item.code}>{item.flag} {item.country} ({item.code})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="mobileNumber" className="sr-only">Mobile number without country code</label>
                      <input id="mobileNumber" name="mobileNumber" type="tel" inputMode="numeric" autoComplete="tel-national" required value={mobileNumber} onChange={e => setMobileNumber(e.target.value.replace(/\\D/g, '').slice(0, 14))} maxLength={14} placeholder="50 123 4567" className={inputClass.replace('mt-2 ', '')} />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-gray-400">Select your country code, then enter your mobile number. Do not include the country code again.</p>
                </div>
                <div>
                  <span className={labelClass}>Your height</span>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div><label htmlFor="heightFeet" className="text-xs text-gray-500">Feet</label><input id="heightFeet" type="number" min="3" max="8" value={heightFeet} onChange={e => setHeightFeet(e.target.value)} placeholder="5" className={inputClass} /></div>
                    <div><label htmlFor="heightInches" className="text-xs text-gray-500">Inches</label><input id="heightInches" type="number" min="0" max="11" value={heightInches} onChange={e => setHeightInches(e.target.value)} placeholder="8" className={inputClass} /></div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div><p className="text-sm font-semibold text-gray-800">Add your location</p><p className="mt-1 text-xs leading-5 text-gray-500">This is optional and helps us show more relevant people nearby.</p></div>
                    <button type="button" onClick={handleLocation} className="shrink-0 rounded-full border border-pink-200 px-3 py-2 text-xs font-semibold text-pink-700 transition hover:bg-pink-50">{location ? 'Update' : 'Share location'}</button>
                  </div>
                  {location && <p className="mt-2 text-xs font-medium text-green-700">Location added</p>}
                </div>
              </div>
            )}

            {error && <div role="alert" className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <div className="mt-8 flex items-center justify-between gap-3 border-t border-gray-100 pt-6">
              <button type="button" onClick={handleBack} disabled={step === 0 || isSaving} className="rounded-full px-5 py-3 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30">Back</button>
              {step < steps.length - 1 ? (
                <button type="button" onClick={handleNext} className="rounded-full bg-gradient-to-r from-pink-600 to-rose-500 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-200 transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-pink-200">Continue <span aria-hidden="true">→</span></button>
              ) : (
                <button type="submit" disabled={isSaving} className="rounded-full bg-gradient-to-r from-pink-600 to-rose-500 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-200 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-wait disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-pink-200">{isSaving ? 'Saving profile…' : 'Complete profile'}</button>
              )}
            </div>
            <p className="mt-4 text-center text-xs text-gray-400">You can update most of these details anytime in your profile settings.</p>
          </form>
        </div>
      </section>
    </main>
  );
};

export default Onboarding;
