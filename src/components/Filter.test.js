import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Filter from './Filter';

describe('Filter component', () => {
  it('should render with default values', () => {
    render(<Filter onApply={() => {}} />);
    expect(screen.getByText('Age Range: 18 - 100')).toBeInTheDocument();
    expect(screen.getByText('Max Distance: 100 km')).toBeInTheDocument();
  });

  it('should call onApply with the correct values', () => {
    const onApply = jest.fn();
    render(<Filter onApply={onApply} />);

    fireEvent.click(screen.getByText('Apply Filters'));

    expect(onApply).toHaveBeenCalledWith({
      minAge: 18,
      maxAge: 100,
      maxDistance: 100,
      lookingFor: 'Everyone',
      relationshipType: '',
    });
  });

  it('should not allow minAge to be greater than maxAge', () => {
    render(<Filter onApply={() => {}} />);
    const sliders = screen.getAllByRole('slider');
    const minAgeSlider = sliders[0];
    const maxAgeSlider = sliders[1];

    fireEvent.change(maxAgeSlider, { target: { value: '30' } });
    fireEvent.change(minAgeSlider, { target: { value: '40' } });

    expect(screen.getByText('Age Range: 30 - 30')).toBeInTheDocument();
  });

  it('should not allow maxAge to be less than minAge', () => {
    render(<Filter onApply={() => {}} />);
    const sliders = screen.getAllByRole('slider');
    const minAgeSlider = sliders[0];
    const maxAgeSlider = sliders[1];

    fireEvent.change(minAgeSlider, { target: { value: '50' } });
    fireEvent.change(maxAgeSlider, { target: { value: '40' } });

    expect(screen.getByText('Age Range: 50 - 50')).toBeInTheDocument();
  });
});
