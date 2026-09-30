import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';

import { ConfigError, HttpError } from './errors';
import { groupsRouter } from './routes/groups';
import { healthRouter } from './routes/health';
import { notificationsRouter } from './routes/notifications';
import { profilesRouter } from './routes/profiles';
import { uploadsRouter } from './routes/uploads';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

app.use(healthRouter);
app.use(notificationsRouter);
app.use(groupsRouter);
app.use(profilesRouter);
app.use(uploadsRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// Tratamento central: o app recebe mensagens compreensíveis, sem detalhes internos.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Requisição inválida.' });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: 'JSON inválido.' });
    return;
  }
  if (error instanceof ConfigError) {
    console.error('[config]', error.message);
    res.status(503).json({ error: 'Servidor não configurado.' });
    return;
  }
  console.error('[unhandled]', error);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// A Vercel detecta este arquivo (src/app.ts) e usa o export default como função.
export default app;
