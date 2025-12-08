// src/config.ts
const isLocalhost = window.location.hostname === 'localhost';

export const API_BASE = isLocalhost
  ? '/api' // ローカル → Vite の proxy に任せる
  : 'https://kiroku-exe.onrender.com/api'; // 本番 → Render
