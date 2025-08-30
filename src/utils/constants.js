const getApiUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return process.env.REACT_APP_API_BASE_URL || '';
  }

  // For local development, construct the URL based on the browser's hostname
  // This allows testing from other devices on the same network
  const host = window.location.hostname;
  return `http://${host}:5000`;
};

export const API_URL = getApiUrl();

export const PREDEFINED_PERSONALITY_TYPES = [
  "The Adventurer",
  "The Analyst",
  "The Creative",
  "The Strategist",
  "The Nurturer",
  "The Entertainer",
  "The Idealist",
  "The Guardian",
];

// Could add other constants here later, e.g., for interests if they become predefined.
// Or for relationship goals, education levels if they become dropdowns.
