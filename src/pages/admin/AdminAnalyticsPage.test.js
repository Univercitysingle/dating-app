import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import apiClient from '../../api/apiClient';
import AdminAnalyticsPage from './AdminAnalyticsPage';

jest.mock('../../api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn() }
}));

jest.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="line-chart" />,
  Pie: () => <div data-testid="pie-chart" />
}));

jest.mock('react-datepicker', () => function MockDatePicker() {
  return <input aria-label="Date filter" readOnly />;
});

describe('AdminAnalyticsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiClient.get.mockResolvedValue({
      userStats: { total: 10, paid: 3, unpaid: 7 },
      signupsPerDay: [{ _id: '2026-11-07', count: 2 }],
      reportedUsersCount: 1,
      locations: []
    });
  });

  test('renders analytics returned by the authenticated API client', async () => {
    render(<AdminAnalyticsPage />);

    expect(await screen.findByText('10')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    expect(screen.getByText(/Location breakdown is not currently available/i)).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith(
      expect.stringMatching(/^\/admin\/analytics\/summary\?/),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  test('handles incomplete analytics responses without crashing', async () => {
    apiClient.get.mockResolvedValueOnce({});
    render(<AdminAnalyticsPage />);

    expect(await screen.findByText('No sign-ups recorded in this date range.')).toBeInTheDocument();
    expect(screen.getByText(/Location breakdown is not currently available/i)).toBeInTheDocument();
  });

  test('downloads CSV through apiClient so the Firebase token is attached', async () => {
    const createObjectURL = jest.fn(() => 'blob:analytics-export');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    apiClient.get.mockResolvedValueOnce({
      userStats: { total: 1, paid: 0, unpaid: 1 },
      signupsPerDay: [],
      reportedUsersCount: 0,
      locations: []
    }).mockResolvedValueOnce('date,new_signups\n2026-11-07,1');

    render(<AdminAnalyticsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Export CSV' }));

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenLastCalledWith(
        expect.stringMatching(/^\/admin\/analytics\/export\?/),
      );
    });
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:analytics-export');
    click.mockRestore();
  });
});
