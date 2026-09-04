// Сборка для хостинга: node build.js  (или npm run build)
// Собирает dist/: index.html со встроенными styles.css, _ds_bundle.js и support.js,
// рядом — bsi-model.js (подгружается в рантайме, поэтому остаётся отдельным файлом).
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');
const ENTRY = 'BSI Platform.dc.html';

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read(ENTRY);
const inlined = [];

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

// <script src="локальный.js"></script>  →  <script>…</script>
html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (m, src) => {
  if (/^https?:/.test(src)) return m;
  try {
    inlined.push(src);
    return '<script>\n' + read(src) + '\n</script>';
  } catch (e) {
    console.warn('пропущен (не найден): ' + src);
    return m;
  }
});

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// файлы, которые загружаются в рантайме и не могут быть встроены
for (const asset of ['bsi-model.js']) {
  fs.copyFileSync(path.join(ROOT, asset), path.join(OUT, asset));
}

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' КБ';
console.log('dist/index.html — ' + kb(html));
console.log('встроено: ' + (inlined.join(', ') || '—'));
console.log('рядом: bsi-model.js');
console.log('\nЗалить содержимое dist/ в корень домена. Точка входа — index.html.');
console.log('Внешние ресурсы остаются по сети: фото engpro.kz, three.js с esm.sh, шрифты Google Fonts.');
