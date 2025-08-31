import React from 'react';
import { render, screen } from '@testing-library/react';
import TopArtists from './TopArtists';

describe('TopArtists', () => {
  it('renders a list of artists', () => {
    const artists = [
      { artistName: 'Artist 1', artistImage: 'image1.jpg' },
      { artistName: 'Artist 2', artistImage: 'image2.jpg' },
    ];
    render(<TopArtists artists={artists} />);
    expect(screen.getByText('Artist 1')).toBeInTheDocument();
    expect(screen.getByText('Artist 2')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('renders a message when there are no artists', () => {
    render(<TopArtists artists={[]} />);
    expect(screen.getByText('No top artists to display.')).toBeInTheDocument();
  });
});
