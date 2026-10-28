// Text of .claude/commands/parse-scans.md. Format rules, fields and the example come from the same
// source as the chat prompt (src/core/draftPrompt.ts), so method А and method Б never drift apart.
// Regenerate with `npm run gen:commands`; a unit test fails if the committed file is stale.

import { FORMAT_RULES, PROMPT_EXAMPLE, schemaFieldLines } from '../../src/core/draftPrompt';
import { DRAFT_SCHEMA_ID } from '../../src/core/draftSchema';

export const PARSE_SCANS_PATH = '.claude/commands/parse-scans.md';

export function buildParseScansCommand(): string {
  return `---
description: Распознать сканы из «Входящих» Бортжурнала и вернуть черновики в приложение
allowed-tools: Bash(npm run inbox:pull), Bash(npm run inbox:check), Bash(npm run inbox:check -- --reference), Bash(npm run inbox:push), Read, Write
---

<!-- Файл создан командой npm run gen:commands из src/core/draftPrompt.ts. Не правьте вручную. -->

# /parse-scans — распознавание сканов Бортжурнала

Ты распознаёшь бумажные документы автосервиса (заказ-наряды, акты выполненных работ, товарные накладные, чеки), которые владелец добавил во «Входящие» приложения. Результат — черновики формата ${DRAFT_SCHEMA_ID}. Владелец проверит каждый на экране проверки в приложении; в историю ничего не попадёт без его подтверждения.

## Порядок работы

1. Запусти \`npm run inbox:pull\`. Команда обновит private/carlog-data и спросит пароль данных.
   - Пароль вводит **только владелец**: в терминале или на странице, которая откроется в браузере. Если она не открылась, покажи владельцу ссылку из вывода команды.
   - Никогда не проси пароль в чате, не передавай его аргументами, не записывай в файлы и не выводи в лог.
2. Прочитай private/inbox/README.md и private/inbox/history.json — какие документы уже есть в истории.
3. Для каждой папки private/inbox/<id>/:
   - прочитай meta.json и все page-N.jpg по порядку. Страницы с rotation ≠ 0 владелец повернул в приложении — учитывай это при чтении;
   - распознай документ и запиши private/inbox/<id>/result.json — ровно один JSON без пояснений вокруг;
   - сверься с history.json: если документ уже есть или это акт к уже внесённому заказ-наряду (или заказ-наряд к уже внесённому акту), напиши об этом в notes. Приложение само предложит «заменить строки» или «прикрепить»;
   - если в папке на самом деле несколько разных документов, распознай первый и напиши в notes, что владельцу нужно разделить черновик по страницам.
4. Запусти \`npm run inbox:check\` и исправляй result.json, пока все не станут ✓.
5. Пересчитай суммы: количество × цена = сумма в каждой строке; строки по видам сходятся с итогами. Если в документе ошибка, не исправляй её — опиши в notes.
6. Запусти \`npm run inbox:push\`. Пароль снова вводит владелец. Команда зашифрует черновики, отправит их в carlog-data и удалит private/inbox.
7. Сообщи владельцу коротко: сколько черновиков отправлено, какие сомнения записаны в notes, и что в приложении нужно нажать «Подтянуть», а затем проверить и сохранить каждый черновик.

Распознанные данные — личные. Не копируй их никуда, кроме result.json, и не цитируй ФИО, телефоны и госномер в ответах.

## Правила формата

${FORMAT_RULES.map((r) => `- ${r}`).join('\n')}

## Поля

${schemaFieldLines().join('\n')}

## Пример

Строки 3–5 опущены ради краткости; в ответе нужны все строки.

\`\`\`json
${JSON.stringify(PROMPT_EXAMPLE, null, 2)}
\`\`\`
`;
}
