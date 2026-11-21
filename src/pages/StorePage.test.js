import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import StorePage from './StorePage';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));

describe('StorePage membership catalogue safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { uid: 'test-user' } });
    apiClient.get.mockResolvedValue([]);
  });

  test('shows the effective backend membership and its active entitlements', async () => {
    apiClient.get.mockImplementation((path) => {
      if (path === '/users/me/subscriptions') return Promise.resolve([]);
      if (path === '/users/me/entitlements') return Promise.resolve({
        tier: 'gold',
        status: 'active',
        expiresAt: '2026-12-21T12:00:00.000Z',
        features: { unlimitedLikes: true, unlimitedUndo: true, seeLikes: true },
        limits: { dailyLikes: null }
      });
      return Promise.reject(new Error('Unexpected request'));
    });

    render(<MemoryRouter initialEntries={['/store']}><StorePage /></MemoryRouter>);

    expect(await screen.findByText(/Your current membership:/i)).toHaveTextContent('gold');
    expect(screen.getByText(/Unlimited likes are enabled/i)).toBeInTheDocument();
    expect(screen.getByText(/See Who Likes You is enabled/i)).toBeInTheDocument();
  });

  test('activates a monthly profile boost and refreshes remaining allowance', async () => {
    const activeEntitlements = {
      tier: 'gold',
      status: 'active',
      features: { monthlyBoosts: true },
      limits: { monthlyBoosts: 1, monthlyBoostsRemaining: 1 }
    };
    const exhaustedEntitlements = {
      ...activeEntitlements,
      limits: { monthlyBoosts: 1, monthlyBoostsRemaining: 0 }
    };
    apiClient.get.mockImplementation((path) => {
      if (path === '/users/me/subscriptions') return Promise.resolve([]);
      if (path === '/users/me/entitlements') {
        return Promise.resolve(apiClient.post.mock.calls.length ? exhaustedEntitlements : activeEntitlements);
      }
      return Promise.reject(new Error('Unexpected request'));
    });
    apiClient.post.mockResolvedValue({ boosted: true, boostExpiresAt: '2026-11-21T20:30:00.000Z' });

    render(<MemoryRouter initialEntries={['/store']}><StorePage /></MemoryRouter>);
    const boostButton = await screen.findByRole('button', { name: /activate profile boost/i });
    fireEvent.click(boostButton);

    expect(await screen.findByText(/your profile boost is active until/i)).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('/profile/boost', {});
    expect(await screen.findByText(/0 boosts remaining this month/i)).toBeInTheDocument();
  });

  test('shows Free, Plus, Gold and Platinum with proposed USD prices and keeps paid checkout disabled', async () => {
    render(<MemoryRouter initialEntries={['/store']}><StorePage /></MemoryRouter>);

    expect(screen.queryByText(/LKR/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Free' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Plus' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gold' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Platinum' })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.className.includes('text-3xl') && element.textContent.includes('3.99 USD'))).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.className.includes('text-3xl') && element.textContent.includes('7.99 USD'))).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.className.includes('text-3xl') && element.textContent.includes('11.99 USD'))).toBeInTheDocument();
    expect(screen.getByText(/Annual option:.*28.99 USD.*40% less/i)).toBeInTheDocument();
    expect(screen.getByText(/Annual option:.*57.99 USD.*40% less/i)).toBeInTheDocument();
    expect(screen.getByText(/Annual option:.*86.99 USD.*40% less/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Travel Pass' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Privacy Pass' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Visibility Pass' })).toBeInTheDocument();
    const disabledActions = screen.getAllByRole('button', { name: /coming soon/i });
    expect(disabledActions.length).toBeGreaterThanOrEqual(9);
    expect(disabledActions.every((button) => button.disabled)).toBe(true);
  });
});

describe('StorePage payment return handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { uid: 'test-user' } });
    apiClient.get.mockImplementation((path) => {
      if (path === '/users/me/subscriptions') return Promise.resolve([]);
      if (path.startsWith('/purchase/status/')) return Promise.reject(new Error('Not a purchase'));
      if (path.startsWith('/subscription/status/')) return Promise.resolve({ status: 'cancelled', plan: 'monthly' });
      return Promise.reject(new Error('Unexpected request'));
    });
  });

  test('shows a retry-safe message and clears the return query after a declined subscription', async () => {
    window.history.replaceState({}, '', '/premium?purchaseId=507f1f77bcf86cd799439011');

    render(
      <MemoryRouter initialEntries={['/premium?purchaseId=507f1f77bcf86cd799439011']}>
        <StorePage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/payment was declined or cancelled/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.search).toBe('');
    });
    expect(apiClient.get).toHaveBeenCalledWith('/subscription/status/507f1f77bcf86cd799439011');
  });

  test('warns users not to pay again when a late successful payment needs refund review', async () => {
    apiClient.get.mockImplementation((path) => {
      if (path === '/users/me/subscriptions') return Promise.resolve([]);
      if (path.startsWith('/purchase/status/')) return Promise.reject(new Error('Not a purchase'));
      if (path.startsWith('/subscription/status/')) return Promise.resolve({ status: 'refund_required' });
      return Promise.reject(new Error('Unexpected request'));
    });

    window.history.replaceState({}, '', '/premium?purchaseId=507f1f77bcf86cd799439012');
    render(
      <MemoryRouter initialEntries={['/premium?purchaseId=507f1f77bcf86cd799439012']}>
        <StorePage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/flagged for refund review/i)).toBeInTheDocument();
    expect(screen.getByText(/do not pay again/i)).toBeInTheDocument();
  });
});
