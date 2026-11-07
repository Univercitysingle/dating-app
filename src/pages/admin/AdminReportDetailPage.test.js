import React from 'react';
import { render, screen } from '@testing-library/react';
import apiClient from '../../api/apiClient';
import { useAuth } from '../../context/AuthContext';
import AdminReportDetailPage from './AdminReportDetailPage';

jest.mock('../../api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn()
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ reportId: '507f1f77bcf86cd799439031' })
}));

describe('AdminReportDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { role: 'admin' } });
    apiClient.get.mockResolvedValue({
      _id: '507f1f77bcf86cd799439031',
      reporterUid: 'reporter-firebase-uid',
      reportedUserUid: 'reported-firebase-uid',
      reporter: { name: 'Reporter Member' },
      reportedUser: { name: 'Reported Member', role: 'user', suspendedUntil: null },
      category: 'harassment',
      status: 'pending',
      reason: 'Synthetic moderation test',
      createdAt: '2026-11-07T10:00:00.000Z'
    });
  });

  test('renders the populated reporter and reported user objects', async () => {
    render(<AdminReportDetailPage />);

    expect(await screen.findByText('Reported Member')).toBeInTheDocument();
    expect(screen.getByText('Reporter Member')).toBeInTheDocument();
    expect(screen.getByText('Not suspended')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/reports/507f1f77bcf86cd799439031');
  });
});
