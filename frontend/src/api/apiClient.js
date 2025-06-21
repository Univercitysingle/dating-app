const getStoredAppUser = () => {
  try {
    const appUserString = localStorage.getItem('appUser');
    if (appUserString) {
      return JSON.parse(appUserString);
    }
  } catch (e) {
    console.error("Error parsing appUser from localStorage", e);
  }
  return null;
};

const apiClient = {
  async request(method, path, data = null, options = {}) {
    const appUser = getStoredAppUser();
    const token = appUser ? appUser.token : null;

    const headers = new Headers({
      'Content-Type': 'application/json',
      ...options.headers,
    });

    if (token) {
      headers.append('Authorization', `Bearer ${token}`);
    }

    // Debug: Log the API base URL to the browser console
    console.log("API Base URL:", process.env.REACT_APP_API_BASE_URL);

    // Use REACT_APP_API_BASE_URL if set, otherwise default to production backend for debugging
    let baseUrl = process.env.REACT_APP_API_BASE_URL || "";
    if (!baseUrl) {
      // Optionally set your production backend as a fallback (remove this after debugging)
      baseUrl = "https://graceful-youth-production.up.railway.app";
      console.warn("REACT_APP_API_BASE_URL not set! Using fallback:", baseUrl);
    }

    const url = `${baseUrl}${path}`;

    const config = {
      method: method.toUpperCase(),
      headers,
      ...options,
    };

    if (data && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT' || method.toUpperCase() === 'PATCH')) {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        // Attempt to parse error from backend if available
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          // If response is not JSON or other error
          errorData = { message: response.statusText || 'An error occurred' };
        }
        // Throw an error object that includes status and backend message
        const error = new Error(errorData.message || 'Network response was not ok.');
        error.status = response.status;
        error.data = errorData; // Attach full error data from backend
        throw error;
      }

      // Handle cases where response might be empty (e.g., 204 No Content)
      if (response.status === 204) {
        return null;
      }

      return await response.json(); // Assuming most responses are JSON
    } catch (error) {
      console.error(`API Client Error (${method} ${path}):`, error);
      throw error; // Re-throw the error to be caught by the calling function
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

  patch(path, data, options = {}) { // Added PATCH for completeness
    return this.request('PATCH', path, data, options);
  }
};

export default apiClient;
