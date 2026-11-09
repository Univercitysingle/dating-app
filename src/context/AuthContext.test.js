import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getAuth, onIdTokenChanged } from 'firebase/auth';
import AuthContextProvider, { AuthProvider, useAuth } from './AuthContext';
import apiClient from '../api/apiClient';

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  onIdTokenChanged: jest.fn()
}));

jest.mock('../api/apiClient', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn()
  }
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const auth = { signOut: jest.fn() };
let tokenListener;

const Probe = () => {
  const { user, isLoading, logout } = useAuth();
  return (
    <div>
      <output data-testid="user-id">{user?.uid || 'signed-out'}</output>
      <output data-testid="loading">{String(isLoading)}</output>
      <button type="button" onClick={logout}>Log out</button>
    </div>
  );
};

const renderProvider = () => render(
  <AuthProvider>
    <Probe />
  </AuthProvider>
);

const emitToken = async (firebaseUser) => {
  await act(async () => {
    await tokenListener(firebaseUser);
  });
};

describe('AuthProvider session lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    auth.signOut.mockResolvedValue(undefined);
    apiClient.post.mockResolvedValue({});
    apiClient.get.mockResolvedValue({ uid: 'user-1', name: 'Test User' });
    onIdTokenChanged.mockImplementation((_auth, callback) => {
      tokenListener = callback;
      return jest.fn();
    });
    getAuth.mockReturnValue(auth);
  });

  test('restores the authenticated profile and avoids refetching it on token refresh', async () => {
    renderProvider();
    const firebaseUser = {
      uid: 'user-1',
      getIdToken: jest.fn().mockResolvedValue('fresh-firebase-token')
    };

    await emitToken(firebaseUser);
    expect(screen.getByTestId('user-id')).toHaveTextContent('user-1');
    expect(window.localStorage.getItem('authToken')).toBe('fresh-firebase-token');
    expect(apiClient.get).toHaveBeenCalledTimes(1);

    await emitToken(firebaseUser);
    expect(firebaseUser.getIdToken).toHaveBeenCalledTimes(2);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  test('keeps the Firebase session when profile loading fails temporarily', async () => {
    apiClient.get.mockRejectedValue(Object.assign(new Error('Database unavailable'), { status: 503 }));
    renderProvider();

    await emitToken({
      uid: 'user-1',
      getIdToken: jest.fn().mockResolvedValue('valid-token')
    });

    expect(screen.getByTestId('user-id')).toHaveTextContent('signed-out');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(window.localStorage.getItem('authToken')).toBe('valid-token');
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  test('clears the session and signs out Firebase after an unauthorized profile response', async () => {
    apiClient.get.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));
    renderProvider();

    await emitToken({
      uid: 'user-1',
      getIdToken: jest.fn().mockResolvedValue('expired-token')
    });

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('authToken')).toBeNull();
    expect(screen.getByTestId('user-id')).toHaveTextContent('signed-out');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  test('clears local authentication state when Firebase reports no user', async () => {
    window.localStorage.setItem('authToken', 'stale-token');
    renderProvider();

    await emitToken(null);

    expect(window.localStorage.getItem('authToken')).toBeNull();
    expect(screen.getByTestId('user-id')).toHaveTextContent('signed-out');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  test('always clears the local session when logging out, even if the API logout fails', async () => {
    apiClient.post.mockRejectedValue(new Error('API unavailable'));
    window.localStorage.setItem('authToken', 'valid-token');
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => {
      expect(auth.signOut).toHaveBeenCalledTimes(1);
      expect(window.localStorage.getItem('authToken')).toBeNull();
    });
    expect(screen.getByTestId('user-id')).toHaveTextContent('signed-out');
  });
});
