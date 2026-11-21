import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import StorePage from './StorePage';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));

describe('StorePage USD pricing safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { uid: 'test-user' } });
    apiClient.get.mockResolvedValue([]);
  });

  test('shows half-market USD launch prices without enabling checkout before settlement approval', async () => {
    render(
      <MemoryRouter initialEntries={['/store']}>
        <StorePage />
      </MemoryRouter>
    );

    expect(screen.queryByText(/LKR/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('$1.49 USD')).toHaveLength(2);
    expect(screen.getByText('$7.99 USD')).toBeInTheDocument();
    expect(screen.getByText('$59.99 USD')).toBeInTheDocument();
    expect(screen.getByText('$2.49 USD')).toBeInTheDocument();
    expect(screen.getByText('$1.99 USD')).toBeInTheDocument();
    const checkoutButtons = await screen.findAllByRole('button', { name: /checkout coming soon/i });
    expect(checkoutButtons).toHaveLength(6);
    expect(checkoutButtons.every((button) => button.disabled)).toBe(true);
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
