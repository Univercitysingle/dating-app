import logger from '../utils/logger';
import { getAuth } from 'firebase/auth';
import app from '../firebase';

const API_TIMEOUT_MS = 60000;

async function readResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (response.status === 204) return null;
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function createApiError(response, data) {
  const message = data?.message || data?.error || response.statusText || 'Request failed';
  const error = new Error(message);
  error.name = 'ApiError';
  error.status = response.status;
  error.data = data || {};
  error.code = data?.code || null;
  error.forbidden = response.status === 403;
  error.retryable = response.status === 408 || response.status === 425 ||
    response.status === 429 || response.status >= 500;
  return error;
}

const apiClient = {
  async request(method, path, data = null, options = {}) {
    const baseUrl = '/api';
    const headers = new Headers(options.headers || {});

    if (data !== null && !(data instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    let token = null;
    try {
      const firebaseUser = getAuth(app).currentUser;
      token = firebaseUser ? await firebaseUser.getIdToken() : localStorage.getItem('authToken');
      if (token && firebaseUser) localStorage.setItem('authToken', token);
    } catch (error) {
      token = localStorage.getItem('authToken');
      logger.warn('Unable to refresh Firebase ID token before API request.', {
        message: error?.message || 'Token refresh failed',
        usingCachedToken: Boolean(token)
      });
    }
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let url = `${baseUrl}${path}`;
    if (options.params) {
      const queryParams = new URLSearchParams(options.params).toString();
      if (queryParams) url += `?${queryParams}`;
    }

    const controller = new AbortController();
    const externalSignal = options.signal;
    const timeoutId = window.setTimeout(() => controller.abort(), options.timeout || API_TIMEOUT_MS);
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const config = {
      ...options,
      method: method.toUpperCase(),
      headers,
      signal: controller.signal
    };
    delete config.params;
    delete config.timeout;

    if (data !== null) {
      if (data instanceof FormData) config.body = data;
      else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method)) config.body = JSON.stringify(data);
    }

    const safeHeaders = Object.fromEntries(headers.entries());
    if (safeHeaders.authorization) safeHeaders.authorization = '[REDACTED]';
    logger.debug(`API Request - ${config.method} ${url}`, {
      headers: safeHeaders,
      hasBody: data !== null,
      bodyType: data instanceof FormData ? 'FormData' : typeof data
    });

    try {
      const response = await fetch(url, config);
      const responseData = await readResponseBody(response);
      logger.debug(`API Response - ${config.method} ${url}`, { status: response.status });

      if (!response.ok) {
        const error = createApiError(response, responseData);
        logger.warn(`API request failed: ${config.method} ${url}`, {
          status: error.status,
          code: error.code
        });
        throw error;
      }

      logger.debug(`API Success - ${config.method} ${url}`, {
        responseType: responseData === null ? 'empty' : typeof responseData
      });
      return responseData;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('The request timed out.');
        timeoutError.name = 'ApiError';
        timeoutError.status = 408;
        timeoutError.code = 'REQUEST_TIMEOUT';
        timeoutError.retryable = true;
        throw timeoutError;
      }
      if (!error?.status && (error instanceof TypeError || error?.name === 'NetworkError')) {
        error.code = 'NETWORK_ERROR';
        error.status = 0;
        error.retryable = true;
      }
      logger.error(`API Client Error - ${config.method} ${url}`, {
        status: error?.status || 0,
        code: error?.code || null,
        message: error?.message || 'Unknown API error'
      });
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  },

  get(path, options = {}) {
    return this.request('GET', path, null, options);
  },
  post(path, data, options = {}) {
    return this.request('POST', path, data, options);
  },
  put(path, data, options = {}) {
    return this.request('PUT', path, data, options);
  },
  delete(path, data, options = {}) {
    return this.request('DELETE', path, data, options);
  },
  patch(path, data, options = {}) {
    return this.request('PATCH', path, data, options);
  }
};

export default apiClient;
