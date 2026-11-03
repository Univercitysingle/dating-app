import { getUserFriendlyError, isRetryableApiError } from './apiErrors';

describe('API error recovery helpers', () => {
  test.each([
    [400, /information is missing or invalid/i],
    [401, /session has expired/i],
    [403, /permission/i],
    [404, /could not find/i],
    [413, /file is too large/i],
    [429, /too often/i],
    [503, /temporarily unavailable/i],
  ])('maps HTTP %i to a user-friendly message', (status, expected) => {
    expect(getUserFriendlyError({ status, message: 'database internals' })).toMatch(expected);
    expect(getUserFriendlyError({ status, message: 'database internals' })).not.toContain('database internals');
  });

  test('provides a connection message for network failures', () => {
    const error = new TypeError('Failed to fetch');
    expect(getUserFriendlyError(error)).toMatch(/internet connection/i);
  });

  test('provides a timeout message for aborted requests', () => {
    expect(getUserFriendlyError({ name: 'AbortError' })).toMatch(/too long/i);
  });

  test('marks transient errors as retryable but not authorization failures', () => {
    expect(isRetryableApiError({ status: 503 })).toBe(true);
    expect(isRetryableApiError({ status: 0 })).toBe(true);
    expect(isRetryableApiError({ status: 401 })).toBe(false);
    expect(isRetryableApiError({ status: 403 })).toBe(false);
  });
});
