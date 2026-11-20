import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SwipeDeck from './SwipeDeck';
import apiClient from '../api/apiClient';

jest.mock('../api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'viewer', preference: 'everyone', photos: [] }, setUser: jest.fn() }),
}));

jest.mock('../components/SwipeCard', () => ({ user, onVote }) => (
  <button type="button" onClick={() => onVote(user.uid, 'right')} onDoubleClick={() => { onVote(user.uid, 'right'); onVote(user.uid, 'right'); }}>Like {user.name}</button>
));

jest.mock('../components/Filter', () => () => null);

jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => <>{children}</>,
}));

const profile = { _id: 'profile-1', uid: 'candidate-1', name: 'Alex', photos: [] };

describe('SwipeDeck swipe submission safety', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.post.mockReset();
    apiClient.put.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  it('submits only one swipe when the same card is tapped repeatedly before the request resolves', async () => {
    let resolveSwipe;
    apiClient.get.mockResolvedValue([profile]);
    apiClient.post.mockImplementation(() => new Promise(resolve => { resolveSwipe = resolve; }));

    render(<MemoryRouter><SwipeDeck /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Like Alex' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.doubleClick(screen.getByRole('button', { name: 'Like Alex' }));
    });

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith('/swipe/like', { userId: 'candidate-1' });

    await act(async () => { resolveSwipe({ status: 'liked' }); });
  });

  it('restores the profile when the swipe request fails so the user can retry', async () => {
    apiClient.get.mockResolvedValue([profile]);
    apiClient.post.mockRejectedValue(new Error('temporary network failure'));

    render(<MemoryRouter><SwipeDeck /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Like Alex' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Like Alex' }));
    });

    expect(await screen.findByRole('button', { name: 'Like Alex' })).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });
});
