import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  signInWithEmailAndPassword: jest.fn(),
  signInWithCustomToken: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  sendEmailVerification: jest.fn(),
  signInWithPopup: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  signInWithPhoneNumber: jest.fn(),
  RecaptchaVerifier: jest.fn()
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: jest.fn() })
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../components/Footer', () => () => null);

describe('Login registration entry point', () => {
  test('opens directly in signup mode when requested by the register route', () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Login initialSignUp />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Sign Up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
    expect(screen.getByText('Already have an account?')).toBeInTheDocument();
  });
});
