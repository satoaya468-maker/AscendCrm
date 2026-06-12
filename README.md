# Ascend CRM — лендинг

Минималистичная инфо-страница Ascend CRM в фирменном стиле [Ascend Systems](https://ascendsystems.ru/).
**Весь сайт — один автономный файл `index.html`** (~4 МБ): разметка, стили, движок и три
зацикленных видео-ленты, встроенные в base64. Работает даже при открытии двойным кликом.

## Почему видео, а не canvas

Ленты — это настоящие видео (H.264 MP4 + VP9 WebM на выбор браузера). Их декодирует
видеочип, а не JavaScript, поэтому анимация не лагает ни на каком устройстве.
Играет только секция на экране — остальные стоят на паузе (экономия батареи).

## Структура

```
index.html     — весь сайт (можно деплоить один этот файл)
assets/og.jpg  — превью для соцсетей (опционально, путь в og:image)
```

## Кнопка «Войти»

Все кнопки входа ведут на `login.html`. Положите рядом страницу входа CRM
под этим именем — или замените адрес поиском по `login.html` в `index.html`.

## SEO

В страницу встроены: title/description, Open Graph + Twitter Card, `robots`,
JSON-LD (Organization, SoftwareApplication, FAQPage — вопросы из секции FAQ
попадают в выдачу), семантическая разметка и `lang="ru"`.

## Безопасность

Статическая страница без форм, кук и пользовательского ввода — атаковать почти нечего.
Встроено в HTML:

- **Content Security Policy** (meta): запрещены все внешние скрипты, объекты, формы
  и подключения, кроме шрифтов Google;
- защита от clickjacking (страница выпрыгивает из чужих iframe);
- `referrer: strict-origin-when-cross-origin`, все внешние ссылки с `noopener noreferrer`.

На хостинге дополнительно включите HTTPS и отдавайте заголовки
(пример для nginx):

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

Для Apache (`.htaccess`) — те же заголовки через `Header set ...`.
