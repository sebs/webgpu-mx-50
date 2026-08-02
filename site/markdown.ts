// A deliberately small Markdown renderer — enough for the repo's own docs (DEFERRED.md,
// the ADRs): headings, paragraphs, lists, tables, fenced code, blockquotes, inline code,
// links, bold/italic. No dependency, because ADR-0003 means no npm UI dependencies and the
// site must work offline.
//
// It is not a general-purpose parser and does not try to be. If a doc grows syntax this
// cannot handle, the doc will look plain rather than broken.

import { esc } from './shell.js';

/** Placeholder for an extracted code span. A NUL byte cannot occur in a source document,
 *  so this can never collide with prose — a bare numeric marker would corrupt any standalone
 *  number ("0 to 510 frames"). */
const SENTINEL = '\u0000';

function inline(src: string): string {
  let s = esc(src);
  // code spans first, so their contents are not further transformed
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(c);
    return SENTINEL + (codes.length - 1) + SENTINEL;
  });
  s = s.replace(/!?\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_m, text: string, url: string) => {
    const safe = /^(https?:|#|\.|\/)/.test(url) ? url : '#';
    return `<a href="${safe}">${text || safe}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(new RegExp(SENTINEL + '(\\d+)' + SENTINEL, 'g'), (_m, i: string) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

function tableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

export function renderMarkdown(src: string): string {
  const lines = src.split('\n');
  const out: string[] = [];
  let i = 0;
  let para: string[] = [];

  const flushPara = (): void => {
    if (!para.length) return;
    out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (!trimmed) {
      flushPara();
      i++;
      continue;
    }

    // fenced code
    if (trimmed.slice(0, 3) === '```') {
      flushPara();
      const buf: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.trim().slice(0, 3) !== '```') {
        buf.push(lines[i]!);
        i++;
      }
      i++;
      out.push(
        `<pre class="mono" style="overflow-x:auto;background:var(--mx-well);border:1px solid var(--mx-line);` +
          `border-radius:6px;padding:12px;font-size:12.5px;line-height:1.55">${esc(buf.join('\n'))}</pre>`,
      );
      continue;
    }

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushPara();
      const level = Math.min(h[1]!.length + 1, 6); // demote: page owns <h1>
      out.push(`<h${level}>${inline(h[2]!)}</h${level}>`);
      i++;
      continue;
    }

    // horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushPara();
      out.push('<hr style="border:0;border-top:1px solid var(--mx-line);margin:26px 0">');
      i++;
      continue;
    }

    // table
    if (trimmed[0] === '|' && i + 1 < lines.length && /^\|[\s:|-]+\|?$/.test(lines[i + 1]!.trim())) {
      flushPara();
      const head = tableRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim()[0] === '|') {
        rows.push(tableRow(lines[i]!));
        i++;
      }
      const ths = head.map((c) => `<th>${inline(c)}</th>`).join('');
      const trs = rows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<div class="mx-tablewrap"><table class="mx-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`);
      continue;
    }

    // blockquote
    if (trimmed[0] === '>') {
      flushPara();
      const buf: string[] = [];
      while (i < lines.length && lines[i]!.trim()[0] === '>') {
        buf.push(lines[i]!.trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote class="mx-note">${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    // lists
    const isUl = /^[-*+]\s+/.test(trimmed);
    const isOl = /^\d+[.)]\s+/.test(trimmed);
    if (isUl || isOl) {
      flushPara();
      const tag = isUl ? 'ul' : 'ol';
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i]!.trim();
        if (!t) break;
        const m = isUl ? /^[-*+]\s+(.*)$/.exec(t) : /^\d+[.)]\s+(.*)$/.exec(t);
        if (m) {
          items.push(m[1]!);
        } else if (items.length) {
          items[items.length - 1] += ' ' + t; // continuation line
        } else {
          break;
        }
        i++;
      }
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }

    para.push(trimmed);
    i++;
  }
  flushPara();
  return out.join('\n');
}
