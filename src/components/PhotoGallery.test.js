import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PhotoGallery from './PhotoGallery';

describe('PhotoGallery', () => {
  const photos = [
    { url: 'photo1.jpg' },
    { url: 'photo2.jpg' },
    { url: 'photo3.jpg' },
  ];

  it('renders the first photo by default', () => {
    render(<PhotoGallery photos={photos} />);
    expect(screen.getByAltText('User photo 1')).toBeInTheDocument();
  });

  it('navigates to the next photo on right click', () => {
    render(<PhotoGallery photos={photos} />);
    const rightSide = screen.getByAltText('User photo 1').nextSibling.lastChild;
    fireEvent.click(rightSide);
    expect(screen.getByAltText('User photo 2')).toBeInTheDocument();
  });

  it('navigates to the previous photo on left click', () => {
    render(<PhotoGallery photos={photos} />);
    const rightSide = screen.getByAltText('User photo 1').nextSibling.lastChild;
    fireEvent.click(rightSide); // go to photo 2
    const leftSide = screen.getByAltText('User photo 2').nextSibling.firstChild;
    fireEvent.click(leftSide);
    expect(screen.getByAltText('User photo 1')).toBeInTheDocument();
  });

  it('loops back to the first photo from the last photo', () => {
    render(<PhotoGallery photos={photos} />);
    const rightSide = screen.getByAltText('User photo 1').nextSibling.lastChild;
    fireEvent.click(rightSide); // photo 2
    fireEvent.click(rightSide); // photo 3
    fireEvent.click(rightSide); // photo 1
    expect(screen.getByAltText('User photo 1')).toBeInTheDocument();
  });

  it('renders the correct number of indicator bars', () => {
    render(<PhotoGallery photos={photos} />);
    const indicators = screen.getByAltText('User photo 1').previousSibling;
    expect(indicators.children.length).toBe(3);
  });
});
