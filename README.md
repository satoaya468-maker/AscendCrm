# Ascend CRM — лендинг

Минималистичная инфо-страница Ascend CRM в фирменном стиле [Ascend Systems](https://ascendsystems.ru/):
белый фон, янтарная «живая лента» (scroll-cinematic, как у Stripe), Space Grotesk + Manrope.

## Структура

```
index.html            — лендинг (единственная страница)
styles.css            — стили
main.js               — scroll-cinematic движок (canvas + покадровая анимация скроллом)
assets/frames/hero/   — 120 кадров хиро-сцены (1920×1080 JPEG)
assets/frames/flow/   — 96 кадров сцены «хаос → порядок»
assets/frames/rise/   — 96 кадров сцены «восхождение»
assets/og.jpg         — превью для соцсетей
tools/render_frames.py— генератор кадров
```

## Запуск

Статический сайт — достаточно любого хостинга или:

```bash
python3 -m http.server 8000
# открыть http://localhost:8000
```

## Кнопка «Войти»

Все кнопки входа ведут на `login.html`. Положите рядом страницу входа CRM
(текущий `index.html` кабинета) под именем `login.html` — или замените адрес
поиском по `login.html` в `index.html`.

## Перегенерация кадров

```bash
pip install pillow numpy
python3 tools/render_frames.py --scene all            # все сцены
python3 tools/render_frames.py --scene hero --preview 0.5   # один кадр для проверки
```

Палитра и геометрия лент настраиваются в `tools/render_frames.py` (PALETTE, thread_points).

## Замена кадров на видео (например, Higgsfield 1080p)

Сгенерируйте видео и нарежьте его в кадры — движок подхватит автоматически,
нужно только совпадение имён и количества кадров (`data-frames` в `index.html`):

```bash
ffmpeg -i hero.mp4 -vf "fps=24,scale=1920:1080" -q:v 4 assets/frames/hero/hero_%04d.jpg
```

Нумерация начинается с `0000` (`-start_number 0` при необходимости).
