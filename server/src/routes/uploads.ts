import { Router } from 'express';
import { z } from 'zod';

import { readCloudinaryEnv } from '../env';
import { HttpError } from '../errors';
import { authenticate } from '../middleware/authenticate';
import { signUpload } from '../services/cloudinary';

const bodySchema = z.object({
  folder: z.enum(['profiles', 'groups']),
});

export const uploadsRouter = Router();

/** POST /uploads/signature — assinatura temporária para o app enviar a foto direto ao Cloudinary. */
uploadsRouter.post('/uploads/signature', authenticate, (req, res) => {
  const { folder } = bodySchema.parse(req.body);
  const env = readCloudinaryEnv();
  if (!env) {
    throw new HttpError(503, 'Armazenamento de imagens não configurado.');
  }
  res.json(signUpload(env, folder));
});
