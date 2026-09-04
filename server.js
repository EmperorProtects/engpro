// Локальный сервер для разработки. Без зависимостей.
//   npm start        → http://localhost:8000
//   npm run serve    → порт 8080
//   node server.js 3000
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8000;
const ROOT = path.join(__dirname, process.argv[3] || '.');
const ENTRY = process.argv[3] ? 'index.html' : 'BSI Platform.dc.html';

const OLLAMA = {host: '127.0.0.1', port: 11434 };
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2'
};
function readBody(req){
  return new Promise((resolve, reject)=> {
    const chunks =[];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function proxyOllama(req, res, upstreamPath){
  const body = req.method === 'POST' ? await readBody(req) : Buffer.alloc(0);
  
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });

  const mockResponse = {
    model: 'ollama-mock',
    created_at: new Date().toISOString(),
    response: 'Привет! Это тестовый мок-ответ от сервера.',
    done: true
  };

  res.end(JSON.stringify(mockResponse));

  // const up = http.request({
  //   host: OLLAMA.host,
  //   port: OLLAMA.port, 
  //   path: upstreamPath,
  //   method: req.method,
  //   headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
  // }, r => {
  //   res.writeHead(r.statusCode, {
  //     'Content-Type': r.headers['content-type'] || 'application/x-ndjson',
  //     'Cache-Control': 'no-cache',
  //     'X-Accel-Buffering': 'no'   // на случай, если спереди встанет nginx
  //   });
  //   r.pipe(res);                
  // });
  //  up.on('error', e => {
  //   res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
  //      .end(JSON.stringify({ error: 'Ollama недоступна: ' + e.message }));
  // });

  // req.on('aborted', () => up.destroy());  // юзер закрыл вкладку — гасим генерацию
  // up.end(body);
}


http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/' + ENTRY;
  if (rel === '/api/chat')  return proxyOllama(req, res, '/api/chat').catch(() => res.writeHead(500).end());
  // if (rel === '/api/chat') 
  // return response.writeHead(200, {
  //   'Content-Length': body.length,
  //   'Content-Type': 'text/plain' 
  // })
  

  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[\/\\])+/, ''));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Не найдено: ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    }).end(data);
  });
}).listen(PORT, () => {
  console.log('Сайт: http://localhost:' + PORT + '/');
});
