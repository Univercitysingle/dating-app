import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import apiClient from '../api/apiClient';
import LikesPage from './LikesPage';

jest.mock('../api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const liker = (uid, name) => ({ uid, name, photos: [], isBlurred: false });

describe('LikesPage synchronization', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    apiClient.get.mockReset();
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('refreshes incoming likes while visible without replacing the page with a loader', async () => {
    apiClient.get
      .mockResolvedValueOnce([liker('one', 'Alex')])
      .mockResolvedValueOnce([liker('two', 'Sam'), liker('one', 'Alex')]);

    render(<MemoryRouter><LikesPage /></MemoryRouter>);
    expect(await screen.findByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('1 like')).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(30000);
      await Promise.resolve();
    });

    expect(screen.getByText('Sam')).toBeInTheDocument();
    expect(screen.getByText('2 likes')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows Super Like and Platinum Priority Like markers', async () => {
    apiClient.get.mockResolvedValue([
      { ...liker('priority-user', 'Alex'), likeType: 'priority' },
      { ...liker('super-user', 'Sam'), likeType: 'superlike' }
    ]);

    render(<MemoryRouter><LikesPage /></MemoryRouter>);

    expect(await screen.findByText('Priority Like')).toBeInTheDocument();
    expect(screen.getByText('Super Like')).toBeInTheDocument();
  });

  it('does not poll while the document is hidden', async () => {
    const originalVisibility = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    apiClient.get.mockResolvedValue([liker('one', 'Alex')]);

    render(<MemoryRouter><LikesPage /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      jest.advanceTimersByTime(90000);
      await Promise.resolve();
    });

    expect(apiClient.get).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: originalVisibility?.get ? originalVisibility.get.call(document) : 'visible',
    });
  });

  it('keeps the last successful likes visible when a background refresh fails', async () => {
    apiClient.get
      .mockResolvedValueOnce([liker('one', 'Alex')])
      .mockRejectedValueOnce(new Error('temporary network failure'));

    render(<MemoryRouter><LikesPage /></MemoryRouter>);
    expect(await screen.findByText('Alex')).toBeInTheDocument();

    // Trigger the same foreground refresh path used when the user returns
    // to the tab. This avoids depending on fake-timer interval scheduling.
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });

    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('last update');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
