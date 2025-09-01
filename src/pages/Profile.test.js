import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Profile from './Profile';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/apiClient';

jest.mock('../context/AuthContext');
jest.mock('../components/PersonalityQuizSummary', () => () => <div>PersonalityQuizSummary</div>);
jest.mock('../api/apiClient', () => ({
  get: jest.fn(),
  put: jest.fn(),
}));

const mockUser = {
  uid: 'test-user-id',
  name: 'Test User',
  age: 25,
  email: 'test@test.com',
  gender: 'Man',
  preference: 'Woman',
  education: 'University',
  relationshipGoals: 'Long-term relationship',
  photos: [{ url: 'photo1.jpg' }],
  profilePrompts: [],
  interests: [],
  personalityQuizResults: {},
  audioBioUrl: '',
  lifestyle: {},
  badges: {},
  spotifyRefreshToken: null,
};

describe('Profile page', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: mockUser, logout: jest.fn() });
    apiClient.get.mockResolvedValue([]);
  });

  it('renders the 3-dot menu', () => {
    render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );
    const menuButton = screen.getByRole('button', { name: /menu/i });
    expect(menuButton).toBeInTheDocument();
  });

  it('opens the menu on click', () => {
    render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );
    const menuButton = screen.getByRole('button', { name: /menu/i });
    fireEvent.click(menuButton);
    expect(screen.getByText('Edit Profile')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('enters edit mode when "Edit Profile" is clicked', () => {
    render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );
    const menuButton = screen.getByRole('button', { name: /menu/i });
    fireEvent.click(menuButton);
    const editButton = screen.getByText('Edit Profile');
    fireEvent.click(editButton);
    // After clicking edit, the save buttons should be visible
    expect(screen.getByText('Save All Changes')).toBeInTheDocument();
  });

  it('switches to the settings tab when "Settings" is clicked', () => {
    render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );
    const menuButton = screen.getByRole('button', { name: /menu/i });
    fireEvent.click(menuButton);
    const settingsButton = screen.getByText('Settings');
    fireEvent.click(settingsButton);
    // After clicking settings, the logout button should be visible
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });

  it('does not render the Social Media section', () => {
    render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );
    expect(screen.queryByText('Social Media')).not.toBeInTheDocument();
  });
});
