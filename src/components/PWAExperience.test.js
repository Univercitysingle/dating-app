import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PWAExperience from './PWAExperience';

describe('PWAExperience', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('shows an offline status and clears it when connectivity returns', () => {
    render(<PWAExperience />);

    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByText(/you are offline/i)).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument();
  });

  test('offers the browser installation prompt when supported', async () => {
    const prompt = jest.fn().mockResolvedValue(undefined);
    const installEvent = new Event('beforeinstallprompt', { cancelable: true });
    installEvent.prompt = prompt;
    installEvent.userChoice = Promise.resolve({ outcome: 'accepted' });

    render(<PWAExperience />);
    act(() => window.dispatchEvent(installEvent));

    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
  });

  test('shows an update action and activates the waiting worker', () => {
    const postMessage = jest.fn();
    const registration = { waiting: { postMessage } };

    render(<PWAExperience />);
    act(() => window.dispatchEvent(new CustomEvent('hart2hart:pwa-update', {
      detail: { registration }
    })));

    fireEvent.click(screen.getByRole('button', { name: 'Update now' }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  test('can dismiss the installation suggestion', () => {
    const installEvent = new Event('beforeinstallprompt', { cancelable: true });
    installEvent.prompt = jest.fn();
    installEvent.userChoice = Promise.resolve({ outcome: 'dismissed' });

    render(<PWAExperience />);
    act(() => window.dispatchEvent(installEvent));
    expect(screen.getByRole('region', { name: 'Install Hart2Hart' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss install suggestion' }));
    expect(screen.queryByRole('region', { name: 'Install Hart2Hart' })).not.toBeInTheDocument();
  });
});
