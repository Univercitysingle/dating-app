import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PhotoEditor from './PhotoEditor';
import apiClient from '../api/apiClient';

// Mock the apiClient
jest.mock('../api/apiClient');

// Mock the PhotoUploader component
const mockOnUploadComplete = jest.fn();
jest.mock('./PhotoUploader', () => (props) => {
  // Assign the prop to the mock function so we can access it in the test
  if (props.onUploadComplete) {
    mockOnUploadComplete.mockImplementation(props.onUploadComplete);
  }
  return <div data-testid="photo-uploader-mock" />;
});

describe('PhotoEditor', () => {
  const initialPhotos = [
    { url: 'https://example.com/photo1.jpg', order: 1 },
    { url: 'https://example.com/photo2.jpg', order: 2 },
    { url: 'https://example.com/photo3.jpg', order: 3 },
  ];

  const onSave = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  test('renders with initial photos and PhotoUploader', () => {
    render(<PhotoEditor photos={initialPhotos} onSave={onSave} onCancel={onCancel} />);

    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.getByTestId('photo-uploader-mock')).toBeInTheDocument();
  });

  test('calls onCancel when cancel button is clicked', () => {
    render(<PhotoEditor photos={initialPhotos} onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('calls apiClient.delete when delete button is clicked and updates photos', async () => {
    const remainingPhotos = initialPhotos.slice(1);
    apiClient.delete.mockResolvedValue({ photos: remainingPhotos });

    const { rerender } = render(<PhotoEditor photos={initialPhotos} onSave={onSave} onCancel={onCancel} />);

    // Click the delete button on the first photo
    const deleteButtons = screen.getAllByText('X');
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/api/users/photos', { photoUrl: 'photo1.jpg' });
    });

    // Rerender with the new photos from the mocked API response
    rerender(<PhotoEditor photos={remainingPhotos} onSave={onSave} onCancel={onCancel} />);

    await waitFor(() => {
      // After deleting and rerendering, there should be 2 photos left
      expect(screen.getAllByRole('img')).toHaveLength(2);
    });
  });

  test('does not allow deleting the last photo', () => {
    render(<PhotoEditor photos={[{ url: 'https://example.com/photo1.jpg', order: 1 }]} onSave={onSave} onCancel={onCancel} />);
    const deleteButton = screen.getByText('X');
    expect(deleteButton).toBeDisabled();
  });

  test('calls apiClient.put with the correct photo order on save', async () => {
    render(<PhotoEditor photos={initialPhotos} onSave={onSave} onCancel={onCancel} />);

    // Note: Reordering logic is not implemented in this simplified test,
    // as it would require a drag-and-drop library. We will just test if the save
    // button calls the API with the current order.

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith('/api/users/photos/order', { photos: initialPhotos });
    });

    // Also check if the onSave prop function is called
    await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
    });
  });

  test('adds a new photo when upload is complete', async () => {
    render(<PhotoEditor photos={initialPhotos} onSave={onSave} onCancel={onCancel} />);

    // Simulate the uploader calling the onUploadComplete callback
    act(() => {
      mockOnUploadComplete('new-photo.jpg');
    });

    await waitFor(() => {
      const images = screen.getAllByRole('img');
      expect(images).toHaveLength(4);
      expect(images[3]).toHaveAttribute('src', 'https://dateme.enadoctemp.workers.dev/new-photo.jpg');
    });
  });
});
