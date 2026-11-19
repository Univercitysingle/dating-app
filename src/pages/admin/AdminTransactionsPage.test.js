import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import apiClient from '../../api/apiClient';
import AdminTransactionsPage from './AdminTransactionsPage';

jest.mock('../../api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn() }
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(() => ({ user: { role: 'admin' } }))
}));
import { useAuth } from '../../context/AuthContext';


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
  test('shows local reconciliation flags to superadmins and labels the report as local-only', async () => {
    useAuth.mockReturnValue({ user: { role: 'superadmin' } });
    apiClient.get.mockImplementation((path) => path === '/admin/transactions'
      ? Promise.resolve([])
      : Promise.resolve({
        source: 'local_mongodb_records_only',
        providerStatusQueried: false,
        counts: { totalScanned: 2, pending: 1, completed: 1, refundRequired: 0, anomalies: 1 },
        anomalies: [{ reason: 'stale_pending', transactionId: 'transaction-1', status: 'pending', recommendedAction: 'Check provider transaction.' }]
      }));
    render(<AdminTransactionsPage />);
    const button = await screen.findByRole('button', { name: 'Run reconciliation' });
    fireEvent.click(button);
    expect(await screen.findByText(/Provider status was not queried/)).toBeInTheDocument();
    expect(screen.getByText('stale pending')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/payment-reconciliation');
  });

  test('does not show reconciliation controls to ordinary admins', async () => {
    useAuth.mockReturnValue({ user: { role: 'admin' } });
    render(<AdminTransactionsPage />);
    expect(await screen.findByText('Transaction Owner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run reconciliation' })).not.toBeInTheDocument();
  });
});
