import { Fragment, useEffect, useMemo, type ReactNode } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor, type Route } from '../../app/routes';
import { inlineText, parseMarkdown, type Block, type Inline, type List } from '../../core/markdown';
import { guideByFile, GUIDES, helpHref, type Guide } from './guides';

/** `/more/help`, `/more/help/<guide>`, `/more/help/<guide>/<section>`. */
export function HelpScreen({ route }: { route: Route }) {
  const [, slug, anchor] = route.rest;
  const guide = GUIDES.find((g) => g.slug === slug);
  if (slug && guide) return <GuideView guide={guide} anchor={anchor} />;
  return <HelpIndex />;
}

function HelpIndex() {
  usePageHeader('Справка', hrefFor('/more'));
  return (
    <div className="stack">
      <p className="hint">Инструкции встроены в приложение и открываются без интернета.</p>
      <ul className="feed" aria-label="Инструкции">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <a className="visit-row" href={helpHref(g.slug)}>
              <span className="visit-row__date">{g.title}</span>
              <span className="muted visit-row__lines">{g.summary}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GuideView({ guide, anchor }: { guide: Guide; anchor: string | undefined }) {
  usePageHeader(guide.title, hrefFor('/more/help'));
  const blocks = useMemo(() => parseMarkdown(guide.source), [guide]);

  // Section links (#/more/help/sync/если-токен-истёк) scroll to the heading.
  // Next frame: the app scrolls to the top on every route change, after this effect runs.
  useEffect(() => {
    if (!anchor) return;
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(`help-${anchor}`);
      el?.scrollIntoView({ block: 'start' });
      el?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [anchor, blocks]);

  return (
    <article className="card guide" data-testid="guide">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} guide={guide} />
      ))}
    </article>
  );
}

function BlockView({ block, guide }: { block: Block; guide: Guide }) {
  switch (block.type) {
    case 'heading': {
      // The page title is in the app bar; the guide's own h1 becomes a subtitle.
      const Tag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4';
      return (
        <Tag id={`help-${block.id}`} tabIndex={-1} className={`guide__h guide__h${block.level}`}>
          <Inlines nodes={block.content} guide={guide} />
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p>
          <Inlines nodes={block.content} guide={guide} />
        </p>
      );
    case 'list':
      return <ListView list={block} guide={guide} />;
    case 'table':
      return (
        <div className="guide__table">
          <table>
            <thead>
              <tr>
                {block.header.map((c, i) => (
                  <th key={i}>
                    <Inlines nodes={c} guide={guide} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((c, i) => (
                    // data-label: on narrow screens each row becomes a card with labelled values.
                    <td key={i} data-label={inlineText(block.header[i] ?? [])}>
                      <Inlines nodes={c} guide={guide} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function ListView({ list, guide }: { list: List; guide: Guide }) {
  const items = list.items.map((it, i) => (
    <li key={i}>
      <Inlines nodes={it.content} guide={guide} />
      {it.children && <ListView list={it.children} guide={guide} />}
    </li>
  ));
  return list.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
}

/** Links between guides and to sections stay inside the app; the rest open in the browser. */
function linkTarget(href: string, guide: Guide): { href: string; external: boolean } {
  if (/^https?:\/\//.test(href)) return { href, external: true };
  const [file, anchor] = href.split('#');
  if (!file) return { href: helpHref(guide.slug, anchor), external: false };
  const target = guideByFile(file);
  return target ? { href: helpHref(target.slug, anchor), external: false } : { href, external: true };
}

function Inlines({ nodes, guide }: { nodes: Inline[]; guide: Guide }): ReactNode {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'text':
        return <Fragment key={i}>{n.text}</Fragment>;
      case 'strong':
        return (
          <strong key={i}>
            <Inlines nodes={n.children} guide={guide} />
          </strong>
        );
      case 'em':
        return (
          <em key={i}>
            <Inlines nodes={n.children} guide={guide} />
          </em>
        );
      case 'code':
        return <code key={i}>{n.text}</code>;
      case 'link': {
        const t = linkTarget(n.href, guide);
        return (
          <a key={i} href={t.href} {...(t.external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>
            <Inlines nodes={n.children} guide={guide} />
          </a>
        );
      }
    }
  });
}
