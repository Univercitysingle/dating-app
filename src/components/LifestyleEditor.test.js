import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LifestyleEditor from './LifestyleEditor';

describe('LifestyleEditor', () => {
  const initialLifestyle = {
    pets: 'Dog person',
    lookingFor: 'Relationship',
    religion: 'Agnostic',
    politicalLeaning: 'Moderate',
  };

  const initialBadges = {
    height: 180,
    zodiac: 'Leo',
    workout: 'Often',
    drinking: 'Socially',
    smoking: 'Never',
  };

  test('renders with initial lifestyle and badges data', () => {
    render(<LifestyleEditor initialLifestyle={initialLifestyle} initialBadges={initialBadges} onChange={() => {}} />);

    expect(screen.getByLabelText('Pets')).toHaveValue(initialLifestyle.pets);
    expect(screen.getByLabelText('Zodiac')).toHaveValue(initialBadges.zodiac);
    expect(screen.getByLabelText('Workout')).toHaveValue(initialBadges.workout);
    expect(screen.getByLabelText('Height (cm)')).toHaveValue(initialBadges.height);
  });

  test('updates state and calls onChange on input change', () => {
    const handleChange = jest.fn();
    render(<LifestyleEditor initialLifestyle={{}} initialBadges={{}} onChange={handleChange} />);

    const petsSelect = screen.getByLabelText('Pets');
    fireEvent.change(petsSelect, { target: { name: 'pets', value: 'Cat person' } });
    expect(petsSelect).toHaveValue('Cat person');
    expect(handleChange).toHaveBeenCalledWith({
      lifestyle: { pets: 'Cat person' },
      badges: {},
    });

    const zodiacInput = screen.getByLabelText('Zodiac');
    fireEvent.change(zodiacInput, { target: { name: 'zodiac', value: 'Pisces' } });
    expect(zodiacInput).toHaveValue('Pisces');
    // The state from the previous change should be preserved
    expect(handleChange).toHaveBeenCalledWith({
        lifestyle: { pets: 'Cat person' },
        badges: { zodiac: 'Pisces' },
    });
  });
});
