import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ signOut: jest.fn().mockResolvedValue(undefined) })),
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

  test('keeps the verification confirmation visible after signup switches to login mode', async () => {
    const user = { uid: 'synthetic-registration-user' };
    createUserWithEmailAndPassword.mockResolvedValue({ user });
    sendEmailVerification.mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Login initialSignUp />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'registration-check@example.com' }
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Synthetic-Test-Password-2026!' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    await waitFor(() => {
      expect(screen.getByText(/verification email has been sent/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });

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
