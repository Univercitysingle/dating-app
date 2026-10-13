const cleanUrl = (url) => {
  if (!url) return '';
  let cleanedUrl = url.trim();
  if (cleanedUrl.startsWith('"') && cleanedUrl.endsWith('"')) {
    cleanedUrl = cleanedUrl.substring(1, cleanedUrl.length - 1);
  }
  return cleanedUrl;
};

// Use a relative URL for the API. This ensures that the frontend will
// always make requests to the same domain and protocol it was served from.
// This is a robust solution for environments where the backend is served
// from the same domain (e.g., via a reverse proxy).
// This value is used by the apiClient to make requests.
export const API_URL = '/api';
console.log("API_URL in constants.js:", API_URL);

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

// Future constants (e.g., for predefined interests, goals, etc.) can go here.
