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

  const up = http.request({
    host: OLLAMA.host,
    port: OLLAMA.port,
    path: upstreamPath,
    method: req.method,
    headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
  }, r => {
    res.writeHead(r.statusCode, {
      'Content-Type': r.headers['content-type'] || 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no'   // на случай, если спереди встанет nginx
    });
    r.pipe(res);
  });
  up.on('error', e => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
       .end(JSON.stringify({ error: 'Ollama недоступна: ' + e.message }));
  });

  req.on('aborted', () => up.destroy());  // юзер закрыл вкладку — гасим генерацию
  up.end(body);
}

// Один запрос к Ollama /api/chat, ответ целиком в памяти (не стрим) — для
// внутренних задач (извлечение параметров), а не для чата с пользователем.
function ollamaChat(payload) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload));
    const req = http.request({
      host: OLLAMA.host,
      port: OLLAMA.port,
      path: '/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
    }, r => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function readJsonBody(req) {
  const raw = await readBody(req);
  try { return JSON.parse(raw.toString('utf8') || '{}'); }
  catch (e) { return {}; }
}

// ===== Смета: LLM только извлекает параметры, расчёт — детерминированный =====
// ДЕМО-РАСЦЕНКИ. Замените на реальные ставки компании (за м², по материалам,
// регионам, отделке) — сейчас это условные числа для демонстрации механики.
const ESTIMATE_RATES = {
  base: { warehouse: 180000, office: 260000, residential: 240000, industrial: 200000, other: 220000 }, // ₸/м² за этаж
  material: { brick: 1.05, concrete: 1.0, metal: 0.9, wood: 0.85, other: 1.0 },
  finishing: { none: 0.8, basic: 1.0, premium: 1.35 },
  region: { 'астана': 1.0, 'astana': 1.0, 'алматы': 1.12, 'almaty': 1.12 }
};

function computeEstimate(raw) {
  const buildingType = ESTIMATE_RATES.base[raw.buildingType] ? raw.buildingType : 'other';
  const material = ESTIMATE_RATES.material[raw.material] ? raw.material : 'other';
  const finishing = ESTIMATE_RATES.finishing[raw.finishing] ? raw.finishing : 'basic';
  const regionMul = ESTIMATE_RATES.region[String(raw.region || '').toLowerCase()] ?? 0.95;
  const areaM2 = Number(raw.areaM2) > 0 ? Number(raw.areaM2) : 100;
  const floors = Number(raw.floors) > 0 ? Math.round(Number(raw.floors)) : 1;
  const floorsMul = 1 + (floors - 1) * 0.04;

  const total = Math.round(
    areaM2 * floors * ESTIMATE_RATES.base[buildingType] *
    ESTIMATE_RATES.material[material] * ESTIMATE_RATES.finishing[finishing] *
    floorsMul * regionMul
  );

  const shares = [
    ['Материалы', 0.45],
    ['СМР (строительно-монтажные работы)', 0.30],
    ['Проектирование и экспертиза', 0.10],
    ['Инженерные сети', 0.10],
    ['Непредвиденные расходы', 0.05]
  ];
  const rows = shares.map(([name, share]) => ({ name, amount: Math.round(total * share) }));

  return {
    params: { buildingType, areaM2, floors, material, finishing, region: raw.region || 'не указан' },
    rows, total, currency: 'KZT'
  };
}

async function handleEstimate(req, res) {
  const { description } = await readJsonBody(req);
  const prompt = [
    'Извлеки параметры строительного объекта из описания и верни ТОЛЬКО JSON без комментариев и пояснений.',
    'Поля: buildingType (warehouse|office|residential|industrial|other), areaM2 (число, м²),',
    'floors (целое, по умолчанию 1), material (brick|concrete|metal|wood|other),',
    'finishing (none|basic|premium, по умолчанию basic), region (строка, город).',
    'Если что-то не указано в описании — подставь разумное значение по умолчанию.',
    'Описание: ' + (description || '')
  ].join('\n');

  let raw = {}, note = null;
  try {
    const upResp = await ollamaChat({
      model: 'llama3',
      messages: [{ role: 'user', content: prompt }],
      format: 'json',
      stream: false,
      options: { temperature: 0.1 }
    });
    try { raw = JSON.parse(upResp.message?.content || '{}'); }
    catch (e) { note = 'Модель вернула не-JSON, использованы параметры по умолчанию.'; }
  } catch (e) {
    note = 'Ollama недоступна (' + e.message + '), использованы параметры по умолчанию.';
  }

  const estimate = computeEstimate(raw);
  if (note) estimate.note = note;
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(estimate));
}

// ===== 3D по описанию: LLM извлекает геометрию, рендерит клиентский Three.js =====
// Ollama не генерирует меши — она только достаёт числа (ширина/глубина/этажи/крыша),
// по которым <param-model> (param-model.js) строит упрощённый параметрический вайрфрейм.
function clampModel3dParams(raw) {
  const num = (v, def, min, max) => {
    const n = parseFloat(v);
    return isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
  };
  const roof = String(raw.roof || '').toLowerCase() === 'flat' ? 'flat' : 'gable';
  return {
    buildingType: String(raw.buildingType || 'здание').slice(0, 40),
    width: num(raw.width, 12, 3, 60),
    depth: num(raw.depth, 8, 3, 60),
    height: num(raw.height, 3.2, 2.2, 6),
    floors: Math.round(num(raw.floors, 1, 1, 20)),
    roof
  };
}

async function handleModel3d(req, res) {
  const { description } = await readJsonBody(req);
  const prompt = [
    'Извлеки геометрические параметры здания из описания и верни ТОЛЬКО JSON без комментариев.',
    'Поля: buildingType (краткое название на русском), width (число, метры — ширина фасада),',
    'depth (число, метры — длина), height (число, метры — высота ОДНОГО этажа, обычно 2.5-4),',
    'floors (целое — число этажей), roof (flat|gable).',
    'Если что-то не указано — подставь разумное значение по умолчанию для промышленного здания.',
    'Описание: ' + (description || '')
  ].join('\n');

  let raw = {}, note = null;
  try {
    const upResp = await ollamaChat({
      model: 'llama3',
      messages: [{ role: 'user', content: prompt }],
      format: 'json',
      stream: false,
      options: { temperature: 0.1 }
    });
    try { raw = JSON.parse(upResp.message?.content || '{}'); }
    catch (e) { note = 'Модель вернула не-JSON, использованы параметры по умолчанию.'; }
  } catch (e) {
    note = 'Ollama недоступна (' + e.message + '), использованы параметры по умолчанию.';
  }

  const params = clampModel3dParams(raw);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ params, note }));
}

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/' + ENTRY;
  if (rel === '/api/chat')     return proxyOllama(req, res, '/api/chat').catch(() => res.writeHead(500).end());
  if (rel === '/api/estimate') return handleEstimate(req, res).catch(e => res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: e.message })));
  if (rel === '/api/model3d')  return handleModel3d(req, res).catch(e => res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: e.message })));


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
