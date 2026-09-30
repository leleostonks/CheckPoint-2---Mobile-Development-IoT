import app from './app';

// Apenas para desenvolvimento local (npm run dev). Em produção a Vercel usa src/app.ts diretamente.
const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`API local em http://localhost:${port}`);
});
