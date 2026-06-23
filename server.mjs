/**
 * Servidor estático mínimo, SEM dependências, só com o módulo `http` do Node.
 *
 * Existe por um motivo concreto: abrir o index.html direto (file://) faz o
 * Chrome bloquear os `import` de ES Modules por CORS, e o app inteiro morre
 * (o botão Iniciar nunca é habilitado). Servindo por HTTP, os módulos carregam
 * normalmente. Rode com `npm start`.
 *
 * Uso: PORT=5173 node server.mjs   (porta padrão 5173)
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  // Resolve o caminho pedido dentro de ROOT, barrando "../" (path traversal).
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const relative = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(ROOT, relative);
  // Diretório raiz ou caminho terminado em "/" servem o index.html.
  // (No Windows normalize('/') vira '\\', então o teste tem de usar a URL, não `relative`.)
  if (urlPath.endsWith('/')) filePath = join(filePath, 'index.html');

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 — arquivo não encontrado');
  }
});

server.listen(PORT, () => {
  console.log(`Cronômetro rodando em http://localhost:${PORT}`);
});
