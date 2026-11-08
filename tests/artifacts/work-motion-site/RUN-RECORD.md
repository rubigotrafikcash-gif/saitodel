# Work P2 — анимация копии сайта «Линия»

Дата: 2026-11-08. Режим: motion. Версия реализации: `motion-1`.

## Задача и разрешённый результат

Добавить продуманную анимацию первого экрана, появления разделов и состояний кнопок. Движение помогает ориентироваться, не мешает чтению и учитывает системную настройку уменьшения движения. Сохранить содержание и существующие действия.

Исходник: `../work-site`. Созданы только пять копий файлов сайта и материалы проверки в `work-motion-site`. Исходный сайт и пакет Сайтодела не изменяются. Публикация вне поручения. Стек сохранён: автономные HTML, CSS, JavaScript, локальные SVG, без установок, сетевых зависимостей, токенов и отправки данных.

Роли: координатор `/root`; исполнитель `/root/website_work_p2` (единственный владелец файлов этого каталога); отдельный проверяющий назначается координатором после фиксации версии. Самопроверка ниже не является независимой приёмкой. `initial_review_done=false`, `fix_cycles_used=0` из 2; одновременно не более 3 активных агентов в общем пилоте.

## Бриф и решение

«Линия» — существующая локальная демонстрация студии сайтов для кафе, салонов и сервисных компаний. Главный CTA «Обсудить проект» ведёт к `#contact`. Демоформа только проверяет имя и email, никуда не отправляет и не сохраняет данные. Содержание, цвета, типографика, композиция и все ссылки защищены.

Движение: небольшое вертикальное приближение блоков к финальному положению. Первый экран: вступление 6 px/380 ms; заголовок 16 px/620 ms с задержкой 40 ms; описание с CTA 10 px/480 ms с задержкой 120 ms; полоса аудиторий 6 px/400 ms с задержкой 200 ms. Вся последовательность завершается за 660 ms. Навигация остаётся неподвижной. Текст и кнопки всегда непрозрачны и сразу доступны.

Разделы: одноразовое движение 14 px/520 ms при входе в область экрана, задержка связанных строк до 90 ms. Нет скрытых исходных состояний, непрерывных циклов, привязки движения к каждому пикселю прокрутки или тяжёлых фильтров. Уже просмотренные блоки повторно не анимируются. Прямой переход по якорю и фокус внутри блока дают стабильную точку назначения.

Кнопки: наведение до 2 px, нажатие 1 px/scale .99, стрелка 2 px; состояния 180 ms. Фокус остаётся видимым. На touch нет наведения стрелки; при reduced motion движения и smooth scroll отключены, цвет и outline сохраняют обратную связь. Изменение системного предпочтения во время работы отменяет активное движение. Pointerdown и focusin прерывают анимацию содержащего их блока. При выключенном JS контент виден, демоформа сохраняет исходную безопасную блокировку.

## Критерии до проверки

| ID | Ожидание | Способ |
|---|---|---|
| M1 | Исходник не изменён; содержание и ссылки сохранены | SHA-256 пяти файлов источника до/после; побайтовое сравнение HTML и SVG; headings/links в браузере |
| M2 | Первый экран анимируется, смысл и CTA сразу доступны | Активные анимации/transform/opacity в первом кадре; просмотр early/settled PNG |
| M3 | Появление разделов работает один раз и не мешает тексту | Реальная прокрутка, animation state, скриншоты раздела |
| M4 | Кнопки дают отклик; фокус, CTA, FAQ и форма работают | Hover, keyboard, якорь, пустая/корректная форма, Enter |
| M5 | Reduced motion даёт статичную эквивалентную страницу | Начальный reduce; смена preference во время анимации; hover и scroll |
| M6 | Адаптив и ресурсы без регрессий | 1280×900, 390×844, 320×568, 667×375, 768×1024, 1920×1080; overflow/console/requests |
| M7 | Видимость сохраняется без JS; исходные ограничения отправки сохранены | Отдельный browser context с JavaScript disabled |

## Прочитанные материалы и применение

Все пути ниже относительно `work/saitodel`, кроме явно указанных внешних источников. Чтение выполнялось инструментом `Get-Content -Encoding UTF8`; крупные документы дочитаны отдельными вызовами без усечённого вывода.

| Источник/версия | Фактически прочитанные пути | Применение и доказательство |
|---|---|---|
| Сайтодел 1.0.2, регламент 1.0 | `SKILL.md`, `references/integrated-skills.md`, `references/multi-agent-regulation.md`, `references/orchestration.md`, `references/design-motion-and-qa.md`, `references/delivery-and-governance.md`, `assets/run-record-template.md`; `sources.lock.json` (закреплённые ref) | Motion-маршрут, защищённое содержание, версии, разделение самопроверки и приёмки, этот документ |
| MotionSites `9a785681d760b7010ea9c8f36e2755628242621d` | `vendor/motionsites/skills/motionsites-web-builder/SKILL.md`; `references/craft.md`, `references/techniques/INDEX.md`, `references/review.md`; recipes: `type-and-text-motion.md` строки 1–147 (entrance/fail-safe), `scroll.md` строки 1–70 (viewport reveal), `surfaces-and-buttons.md` строки 209–248 (arrow feedback) | Адаптированы последовательность, однократный reveal, видимое состояние без JS, освобождение transform после анимации. Blur, opacity fade и rolling text сознательно не добавлены для читаемости и сохранения HTML |
| TheGoat `9922fa0af0aea32443cf7365ef5024dc7797382d` | `vendor/thegoat/skills/browser-inspection-workflow/SKILL.md`, его `references/browser-inspection-workflow-guide.md`; `visual-regression-lab/SKILL.md`, его `references/baseline-contract.md`; `website-operating-rules/references/scoped-web-contract.md` | Одна матрица browser/viewport/state, до/после, настоящая прокрутка, hash PNG, реальные сценарии; `evidence/verification.json` |
| Vercel `434b7f91364665f2f733b310ec54809bf8f37937` | `vendor/vercel/AGENTS.md`, `vendor/vercel/command.md` полностью | Только transform, явные transition properties, прерывание, focus, reduced motion, отсутствие неподтверждённых отправок |
| Регламент задач | `c31/inbox-reglament` через skills.read; `INBOX_Project_Instructions.md` | Восстановление контекста, разрешённая копия, проверяемый итог |
| Мой вайбкодер / ECC 2.2.3 | `c33/6ae826018684819182665d40d3989670/moy-vaybkoder`, `e20/skills/verification-loop` через skills.read | Точечный diff; `node --check`, проверка runtime и исходных файлов. Build/TS/lint N/A: статическая страница, таких команд нет; зависимости не устанавливались |
| Официальная документация, проверена 2026-11-08 | [MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion), [MDN Element.animate](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate), [Playwright emulation](https://playwright.dev/docs/emulation) | Нативная API, media preference, browser emulation вместо новых библиотек |

## Окружение и ограничения

Windows PowerShell, Node `C:/Program Files/nodejs/node.exe`, существующий Playwright по пути `C:/Users/rust/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`. Пробный стандартный Chromium launch не нашёл bundled executable. После проверки установленного Chrome использован явный `C:/Program Files/Google/Chrome/Application/chrome.exe`; без установки браузера и без флагов отключения защиты. HTTP localhost запрещён средой, поэтому проверяется автономный разрешённый `file://` URL.

Git в cwd отсутствует (`fatal: not a git repository`); версия фиксируется SHA-256 пяти файлов. `rg` отсутствует; использованы PowerShell Select-String/Get-Content. Эти ограничения не препятствуют автономной проверке сайта.

Никакая эмуляция не означает проверки реального телефона или Safari. Исследование с человеком не проводилось. Внешней публикации нет: N/A, вне поручения. Новая сборка не нужна: страница открывается непосредственно как файл.

## Реальные результаты

Завершены на фиксированной версии `motion-1`, Chrome **156.0.8078.80**. Основной сценарий `verify.cjs`: **285 PASS, 0 FAIL** (`evidence/verification.json`). Дополнительные проверки обязательных свойств однократного reveal, прерывания по фокусу, прямого якоря и доступности без animation API/IntersectionObserver: **9 PASS, 0 FAIL** (`evidence/edge-verification.json`, `verify-edge.cjs`). Вначале прямой якорь измерялся через 50 ms во время smooth scroll; уточнение проверки после 900 ms подтвердило видимую секцию contact, top=180.453125 px. Сайт при этом не менялся.

| Критерии | Самопроверка | Фактический результат |
|---|---|---|
| M1 | PASS | Все пять source hashes до/после одинаковы. HTML и оба SVG копии побайтово совпадают с исходником; headings и href совпадают во всех 12 состояниях |
| M2 | PASS | Во всех normal состояниях зафиксированы активные entrance-анимации; opacity текста и CTA = 1; после 800 ms анимаций 0 |
| M3 | PASS | При первом входе step-анимация присутствует, повторном — 0; разделы непрозрачны; прерывание при фокусе возвращает transform:none |
| M4 | PASS | Якорь, ошибки пустой формы, успешная локальная проверка, Enter, фокус и FAQ проверены во всех 12 состояниях. Hover/focus видимы; запросов отправки нет |
| M5 | PASS | На всех reduce состояниях 0 entrance-анимаций и scroll-behavior:auto; hover без transform. Смена preference прерывает активное движение; обратная смена разрешает будущие reveal |
| M6 | PASS в проверенном Chrome | 6 размеров × 2 режима: overflow, console errors, failed requests и внешние запросы отсутствуют |
| M7 | PASS | Контент остаётся видимым без JS; демоформа disabled. Отсутствующие Element.animate/IntersectionObserver дают статичную доступную страницу и рабочую демоформу |

Просмотрены реальные PNG: `before-desktop`, `early-desktop-no-preference`, `early-desktop-reduce`, `after-desktop-no-preference`, `after-desktop-reduce`, `after-mobile-no-preference`, `after-mobile-reduce`, `section-desktop-reduce`, `focus-hover-desktop-no-preference`, `focus-hover-desktop-reduce`, `after-short-no-preference`, `no-js-mobile`, `after-narrow`, `after-tablet`, `after-wide`, `process-desktop`, `form-errors-desktop`, `form-success-desktop`. Изображения с теми же байтами не требуют нового содержательного вывода: before/after/reduce desktop SHA совпадают; before/after/reduce/no-JS mobile SHA совпадают. Полный список хешей PNG находится в JSON. Показанные после формы состояния зависят от фокуса и прокрутки, поэтому не используются как сопоставимый baseline.

Визуальное наблюдение: композиция и типографика сохранены, обычный и уменьшенный режим после завершения идентичны исходнику. Движение раннего кадра не скрывает текст и CTA. На 320×568 CTA расположен у нижнего края первого экрана; на 667×375 он ниже первого viewport, как в существующем адаптиве. Это не новая регрессия и за рамки motion-правки не расширялось. Контент читаем, горизонтального обрезания не обнаружено. Пятисекундного теста с человеком нет; это оценка исполнителя.

`node --check app.js` — PASS. Сборка/TypeScript/линтер — N/A: они отсутствуют в этом автономном проекте. Разбор diff: добавлены изолированный motion-IIFE после исходного form handler и CSS overlay; исходный handler не изменён; сторонних загрузок и секретов не добавлено.

### Зафиксированная ведомость motion-1

| Файл | SHA-256 |
|---|---|
| index.html | `4c5b270ca2ecc4ad389c193b2f017d6fd6c8c39395e1904cde2aaa4ef5df653c` |
| styles.css | `b7dee39db6a657e0a4f32bb4ea5afa3111017c5c8b9b247d5d60df15592662c3` |
| app.js | `e94350141ec67e603df64e1f9d0fba26905a663543cfef34d02f88350abc87e8` |
| favicon.svg | `b28f2a9719ffa0578f2781aec08e8ca7487241be78c9480ab1395021ded54445` |
| social-preview.svg | `0cbf9106cb6ecc510936c8d626542fd0c8debb4769fa376ec8c99f013997b654` |

Статус передачи: **REVIEWING**, версия frozen. Собрано — PASS; визуально проверено исполнителем — PASS в указанной области; сценарии исполнителем — PASS; независимо принято — NOT_CHECKED (ожидается назначенный координатором проверяющий); опубликовано — N/A. Исправлений реализации после первоначальной проверки не потребовалось, `fix_cycles_used=0`.

Для повторения из текущего каталога PowerShell:

```powershell
& 'C:/Program Files/nodejs/node.exe' --check './app.js'
& 'C:/Program Files/nodejs/node.exe' './verify.cjs'
& 'C:/Program Files/nodejs/node.exe' './verify-edge.cjs'
```

Проверка пишет только в `evidence/` этой копии. Перед независимой проверкой координатору передаются этот бриф, точные SHA-256, исходное поручение и реальные артефакты. Исходные файлы после передачи не редактировать.
