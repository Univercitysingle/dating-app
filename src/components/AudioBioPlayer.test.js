import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AudioBioPlayer from './AudioBioPlayer';

jest.mock('wavesurfer.js', () => ({
  create: jest.fn().mockReturnValue({
    load: jest.fn(),
    on: jest.fn(),
    destroy: jest.fn(),
    playPause: jest.fn(),
  }),
}));

describe('AudioBioPlayer', () => {
  it('renders the play button and waveform container', () => {
    render(<AudioBioPlayer audioUrl="test.mp3" />);
    expect(screen.getByLabelText('Play audio bio')).toBeInTheDocument();
    expect(document.querySelector('.flex-grow')).toBeInTheDocument();
  });

  it('shows a message when no audio URL is provided', () => {
    render(<AudioBioPlayer audioUrl="" />);
    expect(screen.getByText('No audio bio available.')).toBeInTheDocument();
  });
});
