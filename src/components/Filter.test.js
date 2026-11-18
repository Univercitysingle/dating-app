import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Filter from './Filter';

describe('Filter component', () => {
  it('renders the filter drawer with international discovery defaults', () => {
    render(<Filter onApply={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Your preferences' })).toBeInTheDocument();
    expect(screen.getByLabelText('Minimum age')).toHaveValue('18');
    expect(screen.getByLabelText('Maximum age')).toHaveValue('100');
    expect(screen.getByLabelText('Discovery location')).toHaveValue('anywhere');
    expect(screen.queryByLabelText('Maximum distance')).not.toBeInTheDocument();
  });

  it('applies default filters without enabling GPS distance filtering', () => {
    const onApply = jest.fn();
    render(<Filter onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/ }));

    expect(onApply).toHaveBeenCalledWith({
      minAge: 18,
      maxAge: 100,
      lookingFor: '',
      preference: 'everyone',
    });
  });

  it('offers men, women, other, and everyone as discovery preferences', () => {
    const onApply = jest.fn();
    render(<Filter onApply={onApply} />);
    fireEvent.change(screen.getByLabelText('Show me'), { target: { value: 'Female' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/ }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ preference: 'Female' }));
    fireEvent.change(screen.getByLabelText('Show me'), { target: { value: 'Other' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/ }));
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ preference: 'Other' }));
  });

  it('restores saved discovery filters including the selected location mode', () => {
    render(<Filter initialFilters={{ preference: 'Male', minAge: 24, maxAge: 38, maxDistance: 42, travelMode: 'nearby', lookingFor: 'Relationship' }} onApply={() => {}} />);
    expect(screen.getByLabelText('Show me')).toHaveValue('Male');
    expect(screen.getByLabelText('Minimum age')).toHaveValue('24');
    expect(screen.getByLabelText('Maximum age')).toHaveValue('38');
    expect(screen.getByLabelText('Discovery location')).toHaveValue('nearby');
    expect(screen.getByLabelText('Maximum distance')).toHaveValue('42');
    expect(screen.getByLabelText("I'm looking for")).toHaveValue('Relationship');
  });

  it('omits family status and lifestyle sections', () => {
    render(<Filter onApply={() => {}} />);
    expect(screen.queryByText('Family background')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Everyday life' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Pets')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Exercise')).not.toBeInTheDocument();
  });

  it('does not allow the minimum age to exceed the maximum', () => {
    render(<Filter onApply={() => {}} />);
    fireEvent.change(screen.getByLabelText('Maximum age'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Minimum age'), { target: { value: '40' } });
    expect(screen.getByText('30–30')).toBeInTheDocument();
  });

  it('does not allow the maximum age to fall below the minimum', () => {
    render(<Filter onApply={() => {}} />);
    fireEvent.change(screen.getByLabelText('Minimum age'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Maximum age'), { target: { value: '40' } });
    expect(screen.getByText('50–50')).toBeInTheDocument();
  });

  it('resets location preferences without submitting the form', () => {
    const onApply = jest.fn();
    render(<Filter initialFilters={{ travelMode: 'city', city: 'Dubai' }} onApply={onApply} />);
    expect(screen.getByLabelText('Destination city')).toHaveValue('Dubai');
    fireEvent.click(screen.getByText('Reset'));
    expect(screen.getByLabelText('Discovery location')).toHaveValue('anywhere');
    expect(screen.queryByLabelText('Destination city')).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });
});
