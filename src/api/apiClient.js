import logger from '../utils/logger';
import { API_URL } from '../utils/constants';

const apiClient = {
  async request(method, path, data = null, options = {}) {
    const headers = new Headers(options.headers || {});

    // Set Content-Type for JSON, but not for FormData
    if (!(data instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
    }

    const token = localStorage.getItem("authToken");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const url = `${API_URL}${path}`;
    const config = {
      method: method.toUpperCase(),
      headers,
      ...options,
    };

    if (data) {
      if (data instanceof FormData) {
        config.body = data; // Let the browser set the Content-Type with boundary
      } else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method)) {
        config.body = JSON.stringify(data);
      }
    }

    logger.debug(`API Request - ${config.method} ${url}`, {
      headers: Object.fromEntries(headers.entries()),
      body: data,
    });

    try {
      const response = await fetch(url, config);

      logger.debug(`API Response - ${config.method} ${url}`, {
        status: response.status,
        headers: Array.from(response.headers.entries()),
      });

      // Handle 403 (Forbidden) separately
      if (response.status === 403) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { message: 'Access forbidden' };
        }
        logger.warn(`API 403 Forbidden (${config.method} ${url})`, errorData);
        // Return the data but mark it as forbidden
        return { forbidden: true, ...errorData };
      }

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { message: response.statusText || 'An error occurred' };
        }

        const error = new Error(
          errorData.error || errorData.message || 'Network response was not ok.'
        );
        error.status = response.status;
        error.data = errorData;

        logger.error(`API Error (${config.method} ${url})`, errorData);
        throw error;
      }

      if (response.status === 204) {
        logger.info(`${config.method} ${url} - No Content`);
        return null;
      }

      const jsonData = await response.json();
      logger.debug(`API Success (${config.method} ${url})`, jsonData);
      return jsonData;
    } catch (error) {
      logger.error(`API Client Caught Error (${config.method} ${url})`, error);
      throw error;
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
  },
};

export default apiClient;
