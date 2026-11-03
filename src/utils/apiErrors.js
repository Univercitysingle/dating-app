const STATUS_MESSAGES = {
  400: 'Some information is missing or invalid. Review your entries and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to complete this action.',
  404: 'We could not find what you requested. It may have been moved or removed.',
  408: 'The request took too long. Please try again.',
  409: 'This action conflicts with a recent change. Refresh the page and try again.',
  413: 'This file is too large. Choose a smaller file and try again.',
  415: 'This file type is not supported. Choose a supported file and try again.',
  422: 'Some information could not be accepted. Review your entries and try again.',
  429: 'You are doing that too often. Please wait a moment before trying again.',
  500: 'Something went wrong on our side. Please try again shortly.',
  502: 'The service is temporarily unavailable. Please try again shortly.',
  503: 'This service is temporarily unavailable. Please try again shortly.',
  504: 'The service took too long to respond. Please try again.'
};

export function getUserFriendlyError(error, fallback = 'We could not complete that request. Please try again.') {
  if (error?.name === 'AbortError' || error?.code === 'REQUEST_TIMEOUT') {
    return STATUS_MESSAGES[408];
  }
  if (error?.status && STATUS_MESSAGES[error.status]) {
    return STATUS_MESSAGES[error.status];
  }
  if (error?.status === 0 || error?.code === 'NETWORK_ERROR' || error instanceof TypeError) {
    return 'Unable to connect right now. Check your internet connection and try again.';
  }
  if (error?.status >= 500) return STATUS_MESSAGES[500];
  return fallback;
}

export function isRetryableApiError(error) {
  return !error?.status || error.status === 0 || error.status === 408 ||
    error.status === 425 || error.status === 429 || error.status >= 500 ||
    error?.code === 'NETWORK_ERROR' || error?.code === 'REQUEST_TIMEOUT';
}
