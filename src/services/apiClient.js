import axios from 'axios';

// Tokens remain strictly in JS memory (never localStorage or sessionStorage).
let memoryAccessToken = null;
let memoryRefreshToken = null;
let onSessionExpiredHandler = null;
let refreshPromise = null;

export function setInMemoryTokens(accessToken, refreshToken) {
  memoryAccessToken = accessToken || null;
  memoryRefreshToken = refreshToken || null;
}

export function getInMemoryRefreshToken() {
  return memoryRefreshToken;
}

export function clearInMemoryTokens() {
  memoryAccessToken = null;
  memoryRefreshToken = null;
}

export function registerSessionExpiredHandler(handler) {
  onSessionExpiredHandler = handler;
}

const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  if (memoryAccessToken) {
    config.headers.Authorization = `Bearer ${memoryAccessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const isAuthRoute =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/claim-super-admin');

    if (status === 401 && !originalRequest?._retry && !isAuthRoute && memoryRefreshToken) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post('/api/v1/auth/refresh', { refreshToken: memoryRefreshToken })
            .then((res) => {
              const { accessToken, refreshToken } = res.data.data;
              setInMemoryTokens(accessToken, refreshToken);
              return accessToken;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }
        const nextAccessToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        clearInMemoryTokens();
        if (onSessionExpiredHandler) {
          onSessionExpiredHandler();
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
