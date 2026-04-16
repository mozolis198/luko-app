import axios from 'axios';
import { TOKEN_KEY } from '../store/auth';

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
export const FILES_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

export function resolveVideoUrl(videoPath) {
  if (!videoPath) {
    return '';
  }

  const normalized = String(videoPath).trim();
  if (!normalized) {
    return '';
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return `${FILES_BASE_URL}${normalized}`;
}

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  register: async (payload) => {
    const response = await api.post('/auth/register', payload);
    return response.data;
  },
  login: async (payload) => {
    const response = await api.post('/auth/login', payload);
    return response.data;
  },
  refresh: async () => {
    const response = await api.post('/auth/refresh');
    return response.data;
  },
};

export const exercisesApi = {
  list: async (params) => {
    const response = await api.get('/exercises', { params });
    return response.data;
  },
  create: async (payload) => {
    const response = await api.post('/exercises', payload);
    return response.data;
  },
  update: async (id, payload) => {
    const response = await api.put(`/exercises/${id}`, payload);
    return response.data;
  },
};

export const videosApi = {
  upload: async ({ file, exerciseId, onProgress }) => {
    const formData = new FormData();
    formData.append('video', file);
    if (exerciseId) {
      formData.append('exercise_id', exerciseId);
    }

    const response = await api.post('/videos/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (event) => {
        if (typeof onProgress === 'function') {
          onProgress(event);
        }
      },
    });

    return response.data;
  },
};

export const plansApi = {
  list: async () => {
    const response = await api.get('/plans');
    return response.data;
  },
  create: async (payload) => {
    const response = await api.post('/plans', payload);
    return response.data;
  },
  update: async (id, payload) => {
    const response = await api.put(`/plans/${id}`, payload);
    return response.data;
  },
  remove: async (id) => {
    const response = await api.delete(`/plans/${id}`);
    return response.data;
  },
};

export const sessionsApi = {
  list: async (params) => {
    const response = await api.get('/sessions', { params });
    return response.data;
  },
};

export default api;
