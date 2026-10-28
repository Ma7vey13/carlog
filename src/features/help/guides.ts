// Owner guides from docs/, bundled into the app (and so available offline): "Ещё → Справка".
import pagesMd from '../../../docs/02-github-pages.md?raw';
import reposMd from '../../../docs/01-github-repos.md?raw';
import installMd from '../../../docs/03-install.md?raw';
import syncMd from '../../../docs/04-sync.md?raw';
import { hrefFor } from '../../app/routes';

export interface Guide {
  slug: string;
  file: string;
  title: string;
  summary: string;
  source: string;
}

/** In the order the owner needs them day to day. */
export const GUIDES: readonly Guide[] = [
  { slug: 'sync', file: '04-sync.md', title: 'Синхронизация', summary: 'Токен, настройка телефона и компьютера, истёкший токен, забытый пароль', source: syncMd },
  { slug: 'install', file: '03-install.md', title: 'Установка и обновления', summary: 'Приложение на главном экране, работа без интернета', source: installMd },
  { slug: 'repos', file: '01-github-repos.md', title: 'Репозитории GitHub', summary: 'carlog и carlog-data, скрытая почта', source: reposMd },
  { slug: 'pages', file: '02-github-pages.md', title: 'Публикация сайта', summary: 'GitHub Pages и запуск публикации', source: pagesMd },
];

export function guideByFile(file: string): Guide | undefined {
  return GUIDES.find((g) => g.file === file);
}

/** In-app link to a guide, optionally to a section: helpHref('sync', 'если-токен-истёк'). */
export function helpHref(slug: string, anchor?: string): string {
  return hrefFor(`/more/help/${slug}${anchor ? `/${encodeURIComponent(anchor)}` : ''}`);
}
