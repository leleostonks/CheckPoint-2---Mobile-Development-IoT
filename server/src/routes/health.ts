import { Router } from 'express';

import { isFirebaseConfigured, readCloudinaryEnv } from '../env';

export const healthRouter = Router();

const ENDPOINTS = [
  'GET  /health',
  'POST /notifications/messages',
  'POST /groups/:groupId/sync-members',
  'GET  /profiles/:uid',
  'POST /uploads/signature',
];

function healthPayload() {
  const firebaseConfigured = isFirebaseConfigured();
  const cloudinaryConfigured = readCloudinaryEnv() !== null;
  return {
    status: firebaseConfigured && cloudinaryConfigured ? 'ok' : 'degraded',
    service: 'chat-firebase-api',
    time: new Date().toISOString(),
    firebaseConfigured,
    cloudinaryConfigured,
  };
}

/** Health check público: não expõe valores de configuração, apenas se estão presentes. */
healthRouter.get('/health', (_req, res) => {
  const payload = healthPayload();
  res.status(payload.firebaseConfigured ? 200 : 503).json(payload);
});

healthRouter.get('/', (_req, res) => {
  res.json({ ...healthPayload(), endpoints: ENDPOINTS });
});
