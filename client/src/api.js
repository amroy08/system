import axios from 'axios';

export const api = axios.create({ baseURL: '/api', withCredentials: true });

api.interceptors.request.use((cfg) => {
  if (['post', 'put', 'patch', 'delete'].includes(cfg.method?.toLowerCase())) {
    const csrfToken = document.cookie
      .split('; ')
      .find((part) => part.startsWith('sms_csrf='))
      ?.split('=')
      .slice(1)
      .join('=');
    if (csrfToken) cfg.headers['X-CSRF-Token'] = decodeURIComponent(csrfToken);
  }
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const requestUrl = err.config?.url || '';
    const isAuthProbe = requestUrl.includes('/auth/me');
    const isLoginRequest = requestUrl.includes('/auth/login');
    const isLoginPage = window.location.pathname === '/login';
    if (err.response?.status === 401 && !isAuthProbe && !isLoginRequest && !isLoginPage) {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const errMsg = (e) => e?.response?.data?.error || e.message || 'Something went wrong';
