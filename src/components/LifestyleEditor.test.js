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
    const { rerender } = render(<LifestyleEditor initialLifestyle={{}} initialBadges={{}} onChange={handleChange} />);

    const petsSelect = screen.getByLabelText('Pets');
    fireEvent.change(petsSelect, { target: { name: 'pets', value: 'Cat person' } });

    // Check if onChange was called correctly
    expect(handleChange).toHaveBeenCalledWith({
      lifestyle: { pets: 'Cat person' },
      badges: {},
      sexualOrientation: '',
    });

    // Re-render the component with the new lifestyle, simulating the parent's state update
    rerender(<LifestyleEditor initialLifestyle={{ pets: 'Cat person' }} initialBadges={{}} onChange={handleChange} />);
    expect(screen.getByLabelText('Pets')).toHaveValue('Cat person');

    const zodiacInput = screen.getByLabelText('Zodiac');
    fireEvent.change(zodiacInput, { target: { name: 'zodiac', value: 'Pisces' } });

    // Check if onChange was called correctly
    expect(handleChange).toHaveBeenCalledWith({
        lifestyle: { pets: 'Cat person' },
        badges: { zodiac: 'Pisces' },
        sexualOrientation: '',
    });

    // Re-render with new badge data
    rerender(<LifestyleEditor initialLifestyle={{ pets: 'Cat person' }} initialBadges={{ zodiac: 'Pisces' }} onChange={handleChange} />);
    expect(screen.getByLabelText('Zodiac')).toHaveValue('Pisces');
  });
});
