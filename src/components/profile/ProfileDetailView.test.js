import React from 'react';
import { render, screen } from '@testing-library/react';
import ProfileDetailView from './ProfileDetailView';

describe('ProfileDetailView relationship discovery', () => {
  it('shows only consented public relationship intentions and styles supplied by the API', () => {
    render(<ProfileDetailView user={{
      bio: 'Hello',
      relationshipDiscovery: {
        relationshipIntent: ['long_term', 'casual_dating'],
        relationshipStyles: ['ethical_non_monogamy']
      }
    }} />);

    expect(screen.getByText('Shared relationship preferences')).toBeInTheDocument();
    expect(screen.getByText('Long Term')).toBeInTheDocument();
    expect(screen.getByText('Casual Dating')).toBeInTheDocument();
    expect(screen.getByText('Ethical Non Monogamy')).toBeInTheDocument();
  });

  it('does not render private desires, curiosities, boundaries or raw preferences', () => {
    render(<ProfileDetailView user={{
      relationshipDiscovery: {
        relationshipIntent: ['friendship'],
        relationshipStyles: []
      },
      relationshipPreferences: {
        desires: ['private_desire_marker'],
        curiosities: ['private_curiosity_marker'],
        boundaries: ['private_boundary_marker']
      },
      desires: ['another_private_marker']
    }} />);

    expect(screen.getByText('Friendship')).toBeInTheDocument();
    expect(screen.queryByText(/private_desire_marker|private_curiosity_marker|private_boundary_marker|another_private_marker/)).not.toBeInTheDocument();
  });

  it('omits the section when no public relationship preferences are supplied', () => {
    render(<ProfileDetailView user={{ bio: 'Hello' }} />);
    expect(screen.queryByText('Shared relationship preferences')).not.toBeInTheDocument();
  });
});
