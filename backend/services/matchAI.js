// Define initial scoring weights
const SHARED_INTEREST_SCORE = 10; // Points per common interest
const MATCHING_RELATIONSHIP_GOALS_SCORE = 30; // Points if goals are identical
const MATCHING_PERSONALITY_TYPE_SCORE = 20; // Points if personality types are identical
// Future considerations: Age proximity, location proximity (if enabled), activity level similarity

/**
 * Calculates a match score between two users based on shared criteria.
 * @param {object} currentUser - The user for whom matches are being calculated.
 * @param {object} potentialMatchUser - The user being evaluated as a potential match.
 * @returns {number} The calculated match score.
 */
const calculateMatchScore = (currentUser, potentialMatchUser) => {
  let score = 0;

  if (!currentUser || !potentialMatchUser) {
    return 0; // Or throw an error, but 0 score is safer for ranking
  }

  // 1. Shared Interests
  if (currentUser.interests && Array.isArray(currentUser.interests) &&
      potentialMatchUser.interests && Array.isArray(potentialMatchUser.interests)) {

    const currentUserInterestsSet = new Set(currentUser.interests.map(i => typeof i === 'string' ? i.toLowerCase().trim() : ''));
    const potentialMatchInterests = potentialMatchUser.interests.map(i => typeof i === 'string' ? i.toLowerCase().trim() : '');

    let commonInterestsCount = 0;
    for (const interest of potentialMatchInterests) {
      if (interest && currentUserInterestsSet.has(interest)) { // ensure interest is not empty string
        commonInterestsCount++;
      }
    }
    score += commonInterestsCount * SHARED_INTEREST_SCORE;
  }

  // 2. Matching Relationship Goals
  if (currentUser.relationshipGoals && potentialMatchUser.relationshipGoals &&
      typeof currentUser.relationshipGoals === 'string' &&
      typeof potentialMatchUser.relationshipGoals === 'string') {

    if (currentUser.relationshipGoals.trim().toLowerCase() === potentialMatchUser.relationshipGoals.trim().toLowerCase()) {
      score += MATCHING_RELATIONSHIP_GOALS_SCORE;
    }
  }

  // 3. Matching Personality Type
  if (currentUser.personalityQuizResults && currentUser.personalityQuizResults.type &&
      potentialMatchUser.personalityQuizResults && potentialMatchUser.personalityQuizResults.type &&
      typeof currentUser.personalityQuizResults.type === 'string' &&
      typeof potentialMatchUser.personalityQuizResults.type === 'string') {

    if (currentUser.personalityQuizResults.type.trim().toLowerCase() ===
        potentialMatchUser.personalityQuizResults.type.trim().toLowerCase()) {
      score += MATCHING_PERSONALITY_TYPE_SCORE;
    }
  }

  // Add other scoring factors here in the future
  // e.g., age difference, location proximity (would require location data)

  return score;
};

/**
 * Ranks potential matches for a current user based on a calculated match score.
 * @param {object} currentUser - The user for whom matches are being ranked.
 * @param {object[]} potentialCandidatesArray - An array of user objects to be ranked.
 * @returns {object[]} An array of objects, each containing the user and their matchScore, sorted by score.
 */
const getRankedMatches = (currentUser, potentialCandidatesArray) => {
  if (!currentUser) {
    console.warn("getRankedMatches: currentUser is null or undefined. Returning empty array.");
    return [];
  }
  if (!Array.isArray(potentialCandidatesArray) || potentialCandidatesArray.length === 0) {
    return [];
  }

  const scoredCandidates = potentialCandidatesArray.map(candidate => {
    // Ensure candidate is a plain object if it's a Mongoose document, for safety,
    // though direct field access should work. If issues arise, use candidate.toObject().
    const score = calculateMatchScore(currentUser, candidate);
    return {
      // user: candidate.toObject ? candidate.toObject() : candidate, // Convert Mongoose doc to plain object
      user: candidate, // Keep as Mongoose doc for now, controller can convert if needed before sending response
      matchScore: score,
    };
  });

  // Sort candidates by score in descending order
  scoredCandidates.sort((a, b) => b.matchScore - a.matchScore);

  return scoredCandidates;
};

module.exports = {
  calculateMatchScore,
  getRankedMatches,
  // Export weights if they need to be configurable or referenced elsewhere, otherwise keep them internal.
  // SHARED_INTEREST_SCORE,
  // MATCHING_RELATIONSHIP_GOALS_SCORE,
  // MATCHING_PERSONALITY_TYPE_SCORE
};
