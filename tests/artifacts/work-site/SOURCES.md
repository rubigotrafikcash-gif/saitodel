# Источники и применённые решения

Это испытание исходника Сайтодела в Work, не проверка обнаружения установленного плагина в новой сессии и не отдельная сессия Codex.

## Фактически прочитано 8 ноября 2026

- Исходный бриф поручения; `INBOX_Project_Instructions.md`, `Task-Regulation/CODEX_DESKTOP.md`; облачный `inbox-reglament/SKILL.md`.
- `work/saitodel/SKILL.md` и `sources.lock.json` на момент начала испытания.
- `work/saitodel/references/`: `integrated-skills.md`, `multi-agent-regulation.md`, `architecture-and-copy.md`, `design-motion-and-qa.md`, `delivery-and-governance.md`.
- TheGoat, commit `9922fa0af0aea32443cf7365ef5024dc7797382d`: входные `SKILL.md` и связанные полные руководства `website-operating-rules`, `web-design-vocabulary`, `website-blueprint-first`, `web-design-direction-system`, `frontend-quality-auditor`, `browser-inspection-workflow`; отдельно `scoped-web-contract.md`, `audit-checklist.md`. Источник: https://github.com/TheGoat395/Codex-Skills/tree/9922fa0af0aea32443cf7365ef5024dc7797382d/skills
- Vercel, commit `434b7f91364665f2f733b310ec54809bf8f37937`: полные `vendor/vercel/AGENTS.md` и `command.md`. Источник: https://github.com/vercel-labs/web-interface-guidelines/tree/434b7f91364665f2f733b310ec54809bf8f37937
- Web Design Engineer, commit `b4ccd4f7aa2f8c640b3da7035fd854852bf54f8d`: через GitHub `fetch_file` получены полные `web-design-engineer/SKILL.md`, `references/advanced-patterns.md`, `agents/openai.yaml`, `explanation.html`. Из-за ограничения вывода SKILL.md дочитан отдельным запросом с280 строки, advanced-patterns.md отдельно целиком. Исходник: https://github.com/XiaoZhen-Y/codex_skills/tree/b4ccd4f7aa2f8c640b3da7035fd854852bf54f8d/web-design-engineer
- Возвращённые blob SHA совпали с lock: `SKILL.md=f4503b5d0238481128fdfbf8ab9256c26f890531`, `advanced-patterns.md=43c775c1a962e544814edef83815ea672d26fd63`, `openai.yaml=5b367b14908e79335cc81cb067cc66b799dbd181`, `explanation.html=721184a0424e49ff46439db2e278573a3b740787`. Внешний пакет не скопирован в поставку, его код не исполнялся.
- Словодел: облачный полный `SKILL.md`, `references/natural-russian.md`, `references/agent-workflow.md`; локальный `C:/Users/rust/.codex/plugins/cache/created-by-me-remote/slovodel/0.8.5/skills/slovodel/SKILL.md` и `references/python-fallback.md`. Применены конкретные формулировки, ясная последовательность, естественная русская пунктуация и сверка обещаний с брифом; выполнен Core create (см. отчёт).
- Официальная документация HTML/форм: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/form ; CSP https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action ; эмуляция https://playwright.dev/docs/emulation (открыты8 ноября2026).

## Решения и следы

| Источник | Применение | Артефакт/проверка |
|---|---|---|
| Сайтодел, brief/architecture | Один CTA, ясный следующий шаг и деморежим, никаких придуманных доказательств | BRIEF.md; index.html; CTA/form checks |
| TheGoat blueprint/vocabulary/direction | Редакционное направление, выразительность типографикой, спокойная палитра, различная композиция разделов | BRIEF.md; styles.css; desktop/mobile screenshots |
| Web Design Engineer | Токены, сетка, контраст масштаба, простая типографика без CDN и тяжёлых библиотек | styles.css; браузерный рендер |
| Vercel | Семантические якоря/details, фокус, label/autocomplete, inline-ошибки, reduced-motion, доступный zoom | index.html/app.js; keyboard, FAQ, form, reduced-motion и enlargement checks |
| Browser inspection + auditor | Одна матрица viewport/state; фактические сценарии и запись ошибок | verify.cjs; browser-report.json; screenshots |
| Словодел | Готовые русские тексты без численных обещаний; качественная редактура и локальное измерение | checks-final/site-copy.txt; copy-final/ |

Совместимость: прямое требование пользователя к адаптиву важнее desktop-only внешнего источника. Повторных согласований не запрошено: разработка разрешена до результата. Tweaks/плейсхолдеры не включены в пользовательский интерфейс. MotionSites не загружался в build-части: нет отдельной анимационной задачи, только короткое смещение стрелки; следующий motion-проход выполняет отдельный агент. Фото/генерация изображений не нужны выбранной текстовой концепции.

Предположения: названия трёх услуг — типовые направления веб-разработки в демонстрации. Они не выдаются за подтверждённый коммерческий прайс. Перед коммерческим использованием нужно подтвердить состав услуг, контакты, условия, домен и обработку данных. Эти пункты не блокируют согласованную локальную демонстрацию.
