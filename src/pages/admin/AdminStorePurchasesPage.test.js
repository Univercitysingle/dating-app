import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import apiClient from '../../api/apiClient';
import AdminStorePurchasesPage from './AdminStorePurchasesPage';
import { useAuth } from '../../context/AuthContext';

jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));

jest.mock('../../api/apiClient', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn()
  }
}));

describe('AdminStorePurchasesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { role: 'superadmin' } });
    apiClient.get.mockResolvedValue([]);
  });

  test('loads the admin purchases endpoint and renders subscription refund review details', async () => {
    apiClient.get.mockResolvedValueOnce([{
      _id: '507f1f77bcf86cd799439011',
      transactionType: 'subscription',
      plan: 'monthly',
      amount: 19.99,
      status: 'refund_required',
      refundReason: 'late_success_after_cancelled_checkout',
      paymentReference: 'webxpay-payment-123',
      paidLateAt: '2026-11-07T10:00:00.000Z',
      createdAt: '2026-11-07T09:00:00.000Z',
      userId: { name: 'Synthetic Test User' }
    }]);

    render(<AdminStorePurchasesPage />);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/admin/users/purchases', {
        params: { status: 'all' }
      });
    });
    expect(await screen.findByText('Subscription')).toBeInTheDocument();
    expect(screen.getByText('monthly')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.getByText('Payment Details')).toBeInTheDocument();
    expect(screen.getByText('late_success_after_cancelled_checkout')).toBeInTheDocument();
    expect(screen.getByText('webxpay-payment-123')).toBeInTheDocument();
    expect(screen.getByText(/Do not approve or reject this transaction/i)).toBeInTheDocument();
  });

  test('does not expose manual approval or rejection for pending IPG payments', async () => {
    apiClient.get.mockResolvedValueOnce([{
      _id: '507f1f77bcf86cd799439014',
      transactionType: 'purchase',
      itemName: '5 Super Likes',
      status: 'pending',
      createdAt: '2026-11-07T09:00:00.000Z',
      userId: { name: 'Synthetic Test User' }
    }]);
    render(<AdminStorePurchasesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
    expect(screen.getByText(/Awaiting confirmation from WebXPay/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  test('requests the refund_required filter from the Worker API', async () => {
    render(<AdminStorePurchasesPage />);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith(
      '/admin/users/purchases',
      { params: { status: 'all' } }
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Refund review' }));

    await waitFor(() => expect(apiClient.get).toHaveBeenLastCalledWith(
      '/admin/users/purchases',
      { params: { status: 'refund_required' } }
    ));
  });

  test('records a refund only after explicit confirmation and reference entry', async () => {
    const transaction = {
      _id: '507f1f77bcf86cd799439012',
      transactionType: 'subscription',
      plan: 'monthly',
      amount: 19.99,
      status: 'refund_required',
      createdAt: '2026-11-07T09:00:00.000Z',
      userId: { name: 'Synthetic Test User' }
    };
    apiClient.get.mockResolvedValue([transaction]);
    apiClient.post.mockResolvedValue({ message: 'Refund recorded' });
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const prompt = jest.spyOn(window, 'prompt')
      .mockReturnValueOnce('WEBXPAY-REFUND-123')
      .mockReturnValueOnce('Verified in staging merchant portal');

    render(<AdminStorePurchasesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record completed refund' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      '/admin/users/purchases/507f1f77bcf86cd799439012/record-refund',
      {
        transactionType: 'subscription',
        refundReference: 'WEBXPAY-REFUND-123',
        note: 'Verified in staging merchant portal'
      }
    ));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
    prompt.mockRestore();
  });
});


  test('does not expose refund recording to ordinary administrators', async () => {
    useAuth.mockReturnValue({ user: { role: 'admin' } });
    apiClient.get.mockResolvedValue([{
      _id: '507f1f77bcf86cd799439013',
      transactionType: 'purchase',
      itemName: 'Test item',
      status: 'refund_required',
      createdAt: '2026-11-07T09:00:00.000Z',
      userId: { name: 'Synthetic Test User' }
    }]);

    render(<AdminStorePurchasesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));

    expect(screen.queryByRole('button', { name: 'Record completed refund' })).not.toBeInTheDocument();
  });
