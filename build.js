// Сборка для хостинга: node build.js  (или npm run build)
// Собирает dist/: index.html со встроенными styles.css и безопасными бандлами,
// рядом — файлы, которые встраивать нельзя (см. UNSAFE_TO_INLINE) и bsi-model.js.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');
const ENTRY = 'BSI Platform.dc.html';

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read(ENTRY);
const inlined = [];
const copied = [];

// Встраивать JS, внутри которого есть литералы "<script…" / "</script" / "<x-dc",
// НЕЛЬЗЯ: dc-runtime разбирает .dc.html как шаблон компонента и принимает такие
// строки за настоящие теги — документ рвётся, страница схлопывается в текст.
// Именно так ломался support.js (это сам бандл dc-runtime).
const UNSAFE_TO_INLINE = /<\/?script|<x-dc/i;

// <link rel="stylesheet" href="локальный.css">  →  <style>…</style>
html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, (m, href) => {
  if (/^https?:/.test(href)) return m;
  try {
    inlined.push(href);
    return '<style>\n' + read(href) + '\n</style>';
  } catch (e) {
    console.warn('пропущен (не найден): ' + href);
    return m;
  }
});

// <script src="локальный.js"></script>  →  <script>…</script>, если это безопасно
html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (m, src) => {
  if (/^https?:/.test(src)) return m;
  let code;
  try {
    code = read(src);
  } catch (e) {
    console.warn('пропущен (не найден): ' + src);
    return m;
  }
  if (UNSAFE_TO_INLINE.test(code)) {
    copied.push(src);
    return m;              // оставляем внешней ссылкой
  }
  inlined.push(src);
  return '<script>\n' + code + '\n</script>';
});

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// файлы, которые загружаются в рантайме или не подлежат встраиванию
for (const asset of ['bsi-model.js', ...copied]) {
  const rel = asset.replace(/^\.\//, '');
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(ROOT, rel), dest);
}

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' КБ';
console.log('dist/index.html — ' + kb(html));
console.log('встроено: ' + (inlined.join(', ') || '—'));
console.log('рядом: ' + ['bsi-model.js', ...copied].join(', '));
console.log('\nЗалить содержимое dist/ в корень домена. Точка входа — index.html.');
console.log('Внешние ресурсы остаются по сети: фото engpro.kz, three.js с esm.sh, шрифты Google Fonts.');
