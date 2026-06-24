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
import { readFile, readdir } from 'node:fs/promises';
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
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.weba': 'audio/webm',
  '.webm': 'audio/webm',
};

// Extensões de áudio aceitas como "som final" da pasta end/.
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.flac', '.weba', '.webm']);

// Procura o primeiro arquivo de áudio dentro de end/ (em ordem alfabética).
// Devolve o caminho absoluto, ou null se a pasta não existe / está sem áudio.
async function findEndSound() {
  try {
    const dir = join(ROOT, 'end');
    const files = (await readdir(dir)).sort();
    const audio = files.find((f) => AUDIO_EXT.has(extname(f).toLowerCase()));
    return audio ? join(dir, audio) : null;
  } catch {
    return null; // pasta end/ ausente
  }
}

const server = createServer(async (req, res) => {
  // Resolve o caminho pedido dentro de ROOT, barrando "../" (path traversal).
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  // Som final: serve o arquivo de áudio que o usuário largou na pasta end/.
  // O cliente sempre pede /end-sound; o servidor descobre o arquivo real.
  if (urlPath === '/end-sound') {
    const soundPath = await findEndSound();
    if (!soundPath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 — nenhum som na pasta end/');
      return;
    }
    const data = await readFile(soundPath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(soundPath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache', // troca o arquivo da pasta sem ficar preso ao cache
    });
    res.end(data);
    return;
  }

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
