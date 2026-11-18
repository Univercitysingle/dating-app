import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import apiClient from '../api/apiClient';
import Filter from './Filter';

jest.mock('../api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), delete: jest.fn() }
}));

beforeEach(() => {
  jest.clearAllMocks();
  apiClient.get.mockResolvedValue({ enabled: false, stale: false });
  apiClient.put.mockResolvedValue({});
  apiClient.delete.mockResolvedValue({});
});

describe('Filter component', () => {
  it('renders the filter drawer with international discovery defaults', () => {
    render(<Filter onApply={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Your preferences' })).toBeInTheDocument();
    expect(screen.getByLabelText('Minimum age')).toHaveValue('18');
    expect(screen.getByLabelText('Maximum age')).toHaveValue('100');
    expect(screen.getByLabelText('Discovery location')).toHaveValue('anywhere');
    expect(screen.queryByLabelText('Maximum distance')).not.toBeInTheDocument();
  });

  it('applies default filters without enabling GPS distance filtering', () => {
    const onApply = jest.fn();
    render(<Filter onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/ }));

    expect(onApply).toHaveBeenCalledWith({
      minAge: 18,
      maxAge: 100,
      lookingFor: '',
      preference: 'everyone',
    });
  });

  it('offers men, women, other, and everyone as discovery preferences', () => {
    const onApply = jest.fn();
    render(<Filter onApply={onApply} />);
    fireEvent.change(screen.getByLabelText('Show me'), { target: { value: 'Female' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/ }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ preference: 'Female' }));
    fireEvent.change(screen.getByLabelText('Show me'), { target: { value: 'Other' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/ }));
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ preference: 'Other' }));
  });

  it('restores saved discovery filters including the selected location mode', () => {
    render(<Filter initialFilters={{ preference: 'Male', minAge: 24, maxAge: 38, maxDistance: 42, travelMode: 'nearby', lookingFor: 'Relationship' }} onApply={() => {}} />);
    expect(screen.getByLabelText('Show me')).toHaveValue('Male');
    expect(screen.getByLabelText('Minimum age')).toHaveValue('24');
    expect(screen.getByLabelText('Maximum age')).toHaveValue('38');
    expect(screen.getByLabelText('Discovery location')).toHaveValue('nearby');
    expect(screen.getByLabelText('Maximum distance')).toHaveValue('42');
    expect(screen.getByLabelText("I'm looking for")).toHaveValue('Relationship');
  });

  it('omits family status and lifestyle sections', () => {
    render(<Filter onApply={() => {}} />);
    expect(screen.queryByText('Family background')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Everyday life' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Pets')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Exercise')).not.toBeInTheDocument();
  });

  it('does not allow the minimum age to exceed the maximum', () => {
    render(<Filter onApply={() => {}} />);
    fireEvent.change(screen.getByLabelText('Maximum age'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Minimum age'), { target: { value: '40' } });
    expect(screen.getByText('30–30')).toBeInTheDocument();
  });

  it('does not allow the maximum age to fall below the minimum', () => {
    render(<Filter onApply={() => {}} />);
    fireEvent.change(screen.getByLabelText('Minimum age'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Maximum age'), { target: { value: '40' } });
    expect(screen.getByText('50–50')).toBeInTheDocument();
  });

  it('resets location preferences without submitting the form', () => {
    const onApply = jest.fn();
    render(<Filter initialFilters={{ travelMode: 'city', city: 'Dubai' }} onApply={onApply} />);
    expect(screen.getByLabelText('Destination city')).toHaveValue('Dubai');
    fireEvent.click(screen.getByText('Reset'));
    expect(screen.getByLabelText('Discovery location')).toHaveValue('anywhere');
    expect(screen.queryByLabelText('Destination city')).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('requests GPS only after the member explicitly chooses to use current location', async () => {
    const getCurrentPosition = jest.fn();
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition }
    });
    render(<Filter onApply={() => {}} />);
    fireEvent.change(screen.getByLabelText('Discovery location'), { target: { value: 'nearby' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Use my current location' }));

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true, timeout: 15000, maximumAge: 60000
    });

    await act(async () => {
      getCurrentPosition.mock.calls[0][0]({
        coords: { latitude: 25.2, longitude: 55.27, accuracy: 35 }
      });
    });
    expect(apiClient.put).toHaveBeenCalledWith('/users/me/location', {
      latitude: 25.2, longitude: 55.27, accuracyMeters: 35
    });
    expect(await screen.findByText(/exact coordinates are private/i)).toBeInTheDocument();
  });

  it('revokes GPS sharing through the location API when the member turns it off', async () => {
    apiClient.get.mockResolvedValue({ enabled: true, stale: false });
    render(<Filter onApply={() => {}} />);
    fireEvent.change(screen.getByLabelText('Discovery location'), { target: { value: 'nearby' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Turn off' }));

    expect(apiClient.delete).toHaveBeenCalledWith('/users/me/location');
    expect(await screen.findByText('Location sharing is off. Distance filtering is disabled.')).toBeInTheDocument();
  });

  it('does not apply nearby filters when the saved GPS location is stale', async () => {
    apiClient.get.mockResolvedValue({ enabled: true, stale: true });
    const onApply = jest.fn();
    render(<Filter onApply={onApply} />);
    fireEvent.change(screen.getByLabelText('Discovery location'), { target: { value: 'nearby' } });
    expect(await screen.findByText(/older than 24 hours/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/ }));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText(/Enable or refresh GPS location before using nearby discovery/i)).toBeInTheDocument();
  });

  it('does not apply nearby filters when browser GPS permission is denied', async () => {
    const getCurrentPosition = jest.fn((_success, error) => error({ code: 1 }));
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition }
    });
    const onApply = jest.fn();
    render(<Filter onApply={onApply} />);
    fireEvent.change(screen.getByLabelText('Discovery location'), { target: { value: 'nearby' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Use my current location' }));
    expect(await screen.findByText(/Location permission was denied/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/ }));

    expect(onApply).not.toHaveBeenCalled();
    expect(apiClient.put).not.toHaveBeenCalled();
  });


  it('refreshes an expired GPS location before allowing nearby discovery', async () => {
    const getCurrentPosition = jest.fn();
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition }
    });
    apiClient.get.mockResolvedValue({ enabled: true, stale: true });
    const onApply = jest.fn();
    render(<Filter onApply={onApply} />);
    fireEvent.change(screen.getByLabelText('Discovery location'), { target: { value: 'nearby' } });

    expect(await screen.findByText(/older than 24 hours/i)).toBeInTheDocument();
    const refreshButton = await screen.findByRole('button', { name: 'Refresh my location' });
    fireEvent.click(refreshButton);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    await act(async () => {
      getCurrentPosition.mock.calls[0][0]({
        coords: { latitude: 25.21, longitude: 55.28, accuracy: 25 }
      });
    });

    expect(apiClient.put).toHaveBeenCalledWith('/users/me/location', {
      latitude: 25.21, longitude: 55.28, accuracyMeters: 25
    });
    expect(screen.queryByText(/older than 24 hours/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/ }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      maxDistance: 100,
      minAge: 18,
      maxAge: 100
    }));
  });

});
