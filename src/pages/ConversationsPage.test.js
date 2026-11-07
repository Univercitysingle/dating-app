import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import apiClient from '../api/apiClient';
import ConversationsPage from './ConversationsPage';

jest.mock('../api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'test-user' } }),
}));

const conversation = (roomId, name, timestamp, unreadCount = 0) => ({
  roomId,
  otherUser: { name },
  lastMessage: {
    _id: '507f1f77bcf86cd799439011',
    timestamp,
    messageContent: 'Hello there',
  },
  unreadCount,
});

describe('ConversationsPage inbox synchronization', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    apiClient.get.mockReset();
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shows unread totals and unread conversation highlighting data', async () => {
    apiClient.get.mockResolvedValue([
      conversation('room-a', 'Alex', '2026-11-04T09:00:00.000Z', '3'),
      conversation('room-b', 'Sam', '2026-11-04T08:00:00.000Z', 0),
    ]);

    render(
      <MemoryRouter>
        <ConversationsPage />
      </MemoryRouter>
    );

    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('3 unread')).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alex, 3 unread messages' })).toHaveClass('bg-rose-50/70');
  });

  it('updates the inbox from activity events without periodic API polling', async () => {
    apiClient.get.mockResolvedValueOnce([
      conversation('room-a', 'Alex', '2026-11-04T08:00:00.000Z', 0),
      conversation('room-b', 'Sam', '2026-11-04T07:00:00.000Z', 0),
    ]);

    render(
      <MemoryRouter>
        <ConversationsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Alex')).toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new CustomEvent('dating-app-conversations-updated', {
        detail: [
          conversation('room-b', 'Sam', '2026-11-04T09:00:00.000Z', 2),
          conversation('room-a', 'Alex', '2026-11-04T08:00:00.000Z', 0),
        ],
      }));
    });

    expect(screen.getByText('2 unread')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    const samIndex = links.findIndex(link => link.textContent.includes('Sam'));
    const alexIndex = links.findIndex(link => link.textContent.includes('Alex'));
    expect(samIndex).toBeGreaterThanOrEqual(0);
    expect(alexIndex).toBeGreaterThan(samIndex);

    await act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });});
