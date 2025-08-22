import logger from '../utils/logger';

const apiClient = {
  async request(method, path, data = null, options = {}) {
    const headers = new Headers({
      'Content-Type': 'application/json',
      ...options.headers,
    });

    let baseUrl = process.env.REACT_APP_API_BASE_URL || '';
    if (!baseUrl) {
      baseUrl = '';
      logger.warn('REACT_APP_API_BASE_URL not set! Using relative paths.');
    }

    const url = `${baseUrl}${path}`;
    const config = {
      method: method.toUpperCase(),
      headers,
      ...options,
    };

    if (data && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
      config.body = JSON.stringify(data);
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

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { message: response.statusText || 'An error occurred' };
        }

        const error = new Error(
          errorData.message || 'Network response was not ok.'
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

  delete(path, options = {}) {
    return this.request('DELETE', path, null, options);
  },

  patch(path, data, options = {}) {
    return this.request('PATCH', path, data, options);
  },
};

export default apiClient;
