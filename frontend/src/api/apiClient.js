const getStoredAppUser = () => {
  try {
    const appUserString = localStorage.getItem('appUser');
    if (appUserString) {
      return JSON.parse(appUserString);
    }
  } catch (e) {
    console.error("❌ Error parsing appUser from localStorage:", e);
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

    let baseUrl = process.env.REACT_APP_API_BASE_URL || "";
    if (!baseUrl) {
      baseUrl = "https://graceful-youth-production.up.railway.app";
      console.warn("⚠️ REACT_APP_API_BASE_URL not set! Using fallback:", baseUrl);
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

    // 🔍 Log request details
    console.groupCollapsed(`📡 API Request - ${config.method} ${url}`);
    console.log("➡️ Headers:", Object.fromEntries(headers.entries()));
    if (data) console.log("➡️ Body:", data);
    console.groupEnd();

    try {
      const response = await fetch(url, config);

      // 🔍 Log raw response
      console.groupCollapsed(`📬 API Response - ${config.method} ${url}`);
      console.log("Status:", response.status);
      console.log("Headers:", Array.from(response.headers.entries()));
      console.groupEnd();

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { message: response.statusText || 'An error occurred' };
        }

        const error = new Error(errorData.message || 'Network response was not ok.');
        error.status = response.status;
        error.data = errorData;

        console.error(`❌ API Error (${config.method} ${url}):`, errorData);
        throw error;
      }

      if (response.status === 204) {
        console.info(`ℹ️ ${config.method} ${url} - No Content`);
        return null;
      }

      const jsonData = await response.json();
      console.log(`✅ API Success (${config.method} ${url}):`, jsonData);
      return jsonData;
    } catch (error) {
      console.error(`🚨 API Client Caught Error (${config.method} ${url}):`, error);
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
  }
};

export default apiClient;
