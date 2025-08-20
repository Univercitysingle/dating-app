import { Timestamp } from 'firebase/firestore';

// Note: Since firebase is not installed, Timestamp is just a placeholder type.
// In a real environment, this would be the Firestore Timestamp type.

export interface UserProfile {
  uid: string;
  name: string;
  pronouns?: string;
  interests?: string[];
  boundaries?: string[];
  photos: Photo[];
  location: {
    lat: number;
    lng: number;
    geohash: string;
  };
  dob: Timestamp; // Date of Birth
  lastOnlineAt: Timestamp;
}

export interface Photo {
  key: string; // e.g., users/{uid}/{uuid}.jpg
  width: number;
  height: number;
  blurhash?: string;
}

export interface Match {
  id: string;
  users: string[]; // array of user uids
  createdAt: Timestamp;
  lastMessageAt: Timestamp;
  lastMessageText?: string;
}

export interface Message {
  id: string;
  sentBy: string; // user uid
  sentAt: Timestamp;
  text?: string;
  imageUrl?: string;
  readBy: string[];
}

export interface Swipe {
    fromUid: string;
    toUid: string;
    action: 'like' | 'pass';
    timestamp: Timestamp;
}

export interface Report {
    reportedByUid: string;
    reportedUid: string;
    reason: string;
    notes?: string;
    timestamp: Timestamp;
}
