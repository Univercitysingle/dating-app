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
    render(<LifestyleEditor initialLifestyle={initialLifestyle} initialBadges={initialBadges} onSave={() => {}} />);

    expect(screen.getByLabelText('Pets')).toHaveValue(initialLifestyle.pets);
    expect(screen.getByLabelText('Zodiac')).toHaveValue(initialBadges.zodiac);
    expect(screen.getByLabelText('Workout')).toHaveValue(initialBadges.workout);
    expect(screen.getByLabelText('Height (cm)')).toHaveValue(initialBadges.height);
  });

  test('updates state on input change', () => {
    render(<LifestyleEditor initialLifestyle={{}} initialBadges={{}} onSave={() => {}} />);

    const petsSelect = screen.getByLabelText('Pets');
    fireEvent.change(petsSelect, { target: { value: 'Cat person' } });
    expect(petsSelect).toHaveValue('Cat person');

    const zodiacInput = screen.getByLabelText('Zodiac');
    fireEvent.change(zodiacInput, { target: { value: 'Pisces' } });
    expect(zodiacInput).toHaveValue('Pisces');
  });

  test('calls onSave with updated data when save button is clicked', () => {
    const handleSave = jest.fn();
    render(<LifestyleEditor initialLifestyle={{}} initialBadges={{}} onSave={handleSave} />);

    fireEvent.change(screen.getByLabelText('Pets'), { target: { value: 'No pets' } });
    fireEvent.change(screen.getByLabelText('Zodiac'), { target: { value: 'Aries' } });

    fireEvent.click(screen.getByText('Save Lifestyle & Badges'));

    expect(handleSave).toHaveBeenCalledWith({
      lifestyle: {
        pets: 'No pets',
      },
      badges: {
        zodiac: 'Aries',
      }
    });
  });
});
