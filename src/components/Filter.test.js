import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Filter from './Filter';

describe('Filter component', () => {
  it('renders the filter drawer with sensible defaults', () => {
    render(<Filter onApply={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Your preferences' })).toBeInTheDocument();
    expect(screen.getByLabelText('Minimum age')).toHaveValue('18');
    expect(screen.getByLabelText('Maximum age')).toHaveValue('100');
    expect(screen.getByText('100 km')).toBeInTheDocument();
  });

  it('applies the selected filters in the API-compatible shape', () => {
    const onApply = jest.fn();
    render(<Filter onApply={onApply} />);

    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/ }));

    expect(onApply).toHaveBeenCalledWith({
      minAge: 18,
      maxAge: 100,
      maxDistance: 100,
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

  it('restores all saved discovery filters when the filter opens', () => {
    render(<Filter initialFilters={{ preference: 'Male', minAge: 24, maxAge: 38, maxDistance: 42, lookingFor: 'Relationship' }} onApply={() => {}} />);
    expect(screen.getByLabelText('Show me')).toHaveValue('Male');
    expect(screen.getByLabelText('Minimum age')).toHaveValue('24');
    expect(screen.getByLabelText('Maximum age')).toHaveValue('38');
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

  it('resets preferences without submitting the form', () => {
    const onApply = jest.fn();
    render(<Filter onApply={onApply} />);
    fireEvent.change(screen.getByLabelText('Maximum distance'), { target: { value: '25' } });
    fireEvent.click(screen.getByText('Reset'));

    expect(screen.getByText('100 km')).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });
});
