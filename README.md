# Ascend CRM — лендинг

Один автономный файл `index.html` (~0.8 МБ): three.js (WebGL-ленты, анимация в шейдере
на видеокарте — медленное 3D-вращение, без лагов) + GSAP ScrollTrigger (скролл-хореография),
встроены инлайн — работает офлайн и при открытии двойным кликом.

- Кнопки «Войти» ведут на `login.html` — положите рядом страницу входа CRM.
- SEO: JSON-LD (Organization, SoftwareApplication, FAQPage), OG/Twitter, robots.
- Безопасность: CSP, анти-clickjacking, strict referrer; на хостинге включите HTTPS
  и заголовки HSTS / X-Content-Type-Options / X-Frame-Options.
