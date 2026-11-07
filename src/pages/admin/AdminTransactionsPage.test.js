import React from 'react';
import { render, screen } from '@testing-library/react';
import apiClient from '../../api/apiClient';
import AdminTransactionsPage from './AdminTransactionsPage';

jest.mock('../../api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn() }
}));

describe('AdminTransactionsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiClient.get.mockResolvedValue([{
      _id: '507f1f77bcf86cd799439021',
      type: 'Subscription',
      itemName: 'Monthly Plan',
      price: '3000 LKR',
      status: 'active',
      createdAt: '2026-11-07T10:00:00.000Z',
      user: { name: 'Transaction Owner', email: 'owner@example.test' }
    }]);
  });

  test('renders the populated user returned by the Worker API', async () => {
    render(<AdminTransactionsPage />);

    expect(await screen.findByText('Transaction Owner')).toBeInTheDocument();
    expect(screen.getByText('owner@example.test')).toBeInTheDocument();
    expect(screen.getByText('Monthly Plan')).toBeInTheDocument();
  });

  test('supports legacy userId response shape', async () => {
    apiClient.get.mockResolvedValueOnce([{
      _id: '507f1f77bcf86cd799439022',
      type: 'Store Item',
      itemName: 'Profile Boost',
      price: '500 LKR',
      status: 'completed',
      createdAt: '2026-11-07T10:00:00.000Z',
      userId: { name: 'Legacy Transaction Owner' }
    }]);

    render(<AdminTransactionsPage />);
    expect(await screen.findByText('Legacy Transaction Owner')).toBeInTheDocument();
  });
});
