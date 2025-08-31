import React from 'react';
import { render, screen } from '@testing-library/react';
import SpotifyConnect from './SpotifyConnect';

describe('SpotifyConnect', () => {
  it('renders the connect button with the correct link', () => {
    render(<SpotifyConnect />);
    const connectButton = screen.getByText('Connect to Spotify');
    expect(connectButton).toBeInTheDocument();
    expect(connectButton.closest('a')).toHaveAttribute(
      'href',
      `${process.env.REACT_APP_API_BASE_URL}/api/spotify/connect`
    );
  });
});
