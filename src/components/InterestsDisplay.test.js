import React from 'react';
import { render, screen } from '@testing-library/react';
import InterestsDisplay from './InterestsDisplay';

describe('InterestsDisplay', () => {
  test('renders no interests message when no interests are provided', () => {
    render(<InterestsDisplay interests={[]} />);
    expect(screen.getByText('No interests added yet.')).toBeInTheDocument();
  });

  test('renders interests when provided', () => {
    const interests = ['hiking', 'reading', 'coding'];
    render(<InterestsDisplay interests={interests} />);

    interests.forEach(interest => {
      expect(screen.getByText(interest)).toBeInTheDocument();
    });
  });
});
