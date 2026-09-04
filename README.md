# Bek Stroy Invest — исходники сайта

Несобранная версия: файлы, которые правятся. Зависимостей нет, сборки нет.

## Запуск

    npm start

Откроется на `http://localhost:8000/`. Другой порт — `npm run serve` (8080) или `node server.js 3000`.

`npm install` не нужен: пакетов в зависимостях нет, `server.js` работает на встроенном модуле Node (нужен Node 18+).

## Сборка

    npm run build

Собирает `dist/`: `index.html` со встроенными `styles.css`, `_ds_bundle.js` и `support.js`, рядом `bsi-model.js` (подгружается в рантайме). Проверить сборку локально — `npm run preview` → `http://localhost:8001/`.

## Структура
- `BSI Platform.dc.html` — весь сайт: разметка (пять страниц, RU/EN) и логика (роутинг по адресу, переключатель языка, форма заявки). Правится здесь.
- `bsi-model.js` — 3D-модель на three.js в блоке героя (вращение колесом, обзор перетаскиванием).
- `support.js` — рантайм, который выполняет разметку. Не редактировать.
- `server.js` — локальный сервер для разработки.
- `build.js` — сборка `dist/` для хостинга.
- `_ds/industry-.../` — дизайн-система Industry: `styles.css` (цвета, шрифты, отступы через переменные) и `_ds_bundle.js` с компонентами.

## Где что менять
- Все тексты — в конце `BSI Platform.dc.html`, в объекте `T`: `T.ru` и `T.en`. Каждая строка есть в двух языках.
- Стадии, панели, услуги, SaaS-блок, портфолио, контакты — там же массивами: `stages`, `panels`, `services`, `saas`, `saasMetrics`, `portfolio`, `contactRows`, `directions`.
- Цвета и шрифты — переменные в `_ds/industry-.../styles.css`, не в разметке.
- Телефон и WhatsApp — строка `77779576163`.

## Адреса страниц
- `/#/` — главная, `/#/product`, `/#/services`, `/#/company`, `/#/contacts`
- `?lang=en` открывает англоязычную версию: `/#/product?lang=en`

## Внешние ресурсы
- Фото портфолио: `engpro.kz/images/portfolio/…`
- three.js: `esm.sh`
- Шрифты Barlow / Barlow Condensed: Google Fonts

## Публикация
`npm run build` → залить содержимое `dist/` в корень домена на любом статическом хостинге (Netlify, Vercel, GitHub Pages, `public_html`). Ни PHP, ни базы не нужно.
