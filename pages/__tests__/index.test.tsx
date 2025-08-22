import { render, screen } from '@testing-library/react';
import Home from '../index';
import '@testing-library/jest-dom';

jest.mock('../../hooks/useAuth', () => ({
  __esModule: true,
  default: () => ({
    user: null,
    loading: false,
    logout: jest.fn(),
  }),
}));

jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '',
      query: '',
      asPath: '',
      push: jest.fn(),
      events: {
        on: jest.fn(),
        off: jest.fn(),
      },
      beforePopState: jest.fn(() => null),
      prefetch: jest.fn(() => Promise.resolve()),
    };
  },
}));


describe('Home', () => {
  it('renders a heading', () => {
    render(<Home />);

    const heading = screen.getByRole('heading', {
      name: /Welcome/i,
    });

    expect(heading).toBeInTheDocument();
  });
});
