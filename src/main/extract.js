// Pull the text out of slides and PDFs once, on the laptop, so Claude can read a cheap text version
// instead of the whole original every time. Hidden PowerPoint slides are skipped.
const fsp = require('fs').promises;
const path = require('path');
const JSZip = require('jszip');

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');

// Text of each paragraph inside a piece of DrawingML.
function paragraphs(xml) {
  const out = [];
  for (const p of xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) || []) {
    const t = (p.match(/<a:t>([\s\S]*?)<\/a:t>|<a:t [^>]*>([\s\S]*?)<\/a:t>/g) || [])
      .map((x) => decode(x.replace(/<[^>]+>/g, ''))).join('').replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }
  return out;
}

function tables(xml) {
  const out = [];
  for (const tbl of xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g) || []) {
    const rows = (tbl.match(/<a:tr\b[\s\S]*?<\/a:tr>/g) || []).map((tr) =>
      (tr.match(/<a:tc\b[\s\S]*?<\/a:tc>/g) || []).map((tc) => paragraphs(tc).join(' ')).join(' | '));
    if (rows.length) out.push(rows.map((r) => `| ${r} |`).join('\n'));
  }
  return out;
}

async function pptx(file) {
  const zip = await JSZip.loadAsync(await fsp.readFile(file));
  const read = (p) => (zip.file(p) ? zip.file(p).async('string') : Promise.resolve(''));
  const pres = await read('ppt/presentation.xml');
  const rels = await read('ppt/_rels/presentation.xml.rels');
  const target = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) target[m[1]] = m[2];
  for (const m of rels.matchAll(/<Relationship\b[^>]*Target="([^"]+)"[^>]*Id="([^"]+)"/g)) target[m[2]] = m[1];
  const order = [...pres.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map((m) => target[m[1]]).filter(Boolean);

  const parts = [`# ${path.basename(file)}`];
  let shown = 0, hidden = 0;
  for (let i = 0; i < order.length; i++) {
    const slidePath = 'ppt/' + order[i].replace(/^\.?\/?/, '').replace(/^\.\.\//, '');
    const xml = await read(slidePath);
    if (!xml) continue;
    if (/<p:sld\b[^>]*\bshow="(0|false)"/.test(xml)) { hidden++; continue; }
    shown++;
    // Title: the shape whose placeholder is a title.
    let title = '';
    for (const sp of xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) || []) {
      if (/<p:ph\b[^>]*type="(title|ctrTitle)"/.test(sp)) { title = paragraphs(sp).join(' '); break; }
    }
    const body = [];
    for (const sp of xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) || []) {
      if (/<p:ph\b[^>]*type="(title|ctrTitle|sldNum|dt|ftr)"/.test(sp)) continue;
      for (const t of paragraphs(sp)) body.push(`- ${t}`);
    }
    for (const t of tables(xml)) body.push(t);
    if (/<p:pic\b|<c:chart\b|graphicData uri="[^"]*chart/.test(xml)) body.push('- [this slide has a picture or chart]');
    // Speaker notes.
    const srels = await read(slidePath.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'));
    const nm = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(srels);
    let notes = '';
    if (nm) {
      const nx = await read('ppt/notesSlides/' + nm[1]);
      for (const sp of nx.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) || []) {
        if (/<p:ph\b[^>]*type="body"/.test(sp)) notes = paragraphs(sp).join(' ');
      }
    }
    parts.push(`\n## Slide ${i + 1}${title ? ': ' + title : ''}`);
    if (body.length) parts.push(body.join('\n'));
    if (notes) parts.push(`Notes: ${notes}`);
  }
  const note = hidden ? `${hidden} hidden slide${hidden === 1 ? '' : 's'} skipped` : '';
  return { text: parts.join('\n') + '\n', note, pages: shown };
}

// PDF text rebuilt from where each word sits on the page: words at the same height form a line, and
// wide gaps become column breaks, so schedule tables keep their rows together.
function pageLines(items) {
  const words = items.filter((it) => it.str && it.str.trim()).map((it) => ({
    s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.transform[3]) || it.height || 10,
  }));
  words.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const wd of words) {
    const line = lines.find((l) => Math.abs(l.y - wd.y) <= Math.max(2, wd.h * 0.45));
    if (line) line.words.push(wd); else lines.push({ y: wd.y, words: [wd] });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map((l) => {
    l.words.sort((a, b) => a.x - b.x);
    let out = '', cols = 0, prev = null;
    for (const wd of l.words) {
      if (prev) {
        const gap = wd.x - (prev.x + prev.w);
        const cw = prev.w / Math.max(1, prev.s.length) || wd.h * 0.5;
        if (gap > Math.max(cw * 3, 10)) { out += ' | '; cols++; } else if (gap > cw * 0.2 && !/\s$/.test(out) && !/^\s/.test(wd.s)) out += ' ';
      }
      out += wd.s;
      prev = wd;
    }
    out = out.replace(/\s+/g, ' ').trim();
    return cols >= 2 ? `| ${out} |` : out;
  }).filter(Boolean);
}

async function pdf(file) {
  const { getDocumentProxy } = await import('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(await fsp.readFile(file)));
  const parts = [`# ${path.basename(file)}`];
  let chars = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const lines = pageLines((await page.getTextContent()).items);
    chars += lines.join('').length;
    if (lines.length) parts.push(`\n## Page ${i}\n${lines.join('\n')}`);
  }
  // Almost no text means a scanned PDF: Claude reads the original instead.
  if (chars < doc.numPages * 40) return { text: '', note: 'scanned, Claude reads the original', pages: doc.numPages };
  return { text: parts.join('\n') + '\n', note: '', pages: doc.numPages };
}

// Word: headings, paragraphs and lists as text, tables kept as rows.
async function docx(file) {
  const mammoth = require('mammoth');
  const { value: html } = await mammoth.convertToHtml({ path: file });
  const strip = (h) => decode(h.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  const out = [`# ${path.basename(file)}`];
  const blocks = html.match(/<table[\s\S]*?<\/table>|<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>[\s\S]*?<\/p>|<li[^>]*>[\s\S]*?<\/li>/g) || [];
  for (const b of blocks) {
    if (b.startsWith('<table')) {
      const rows = (b.match(/<tr[\s\S]*?<\/tr>/g) || []).map((tr) => '| ' + (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/g) || []).map(strip).join(' | ') + ' |');
      if (rows.length) out.push('', ...rows, '');
    } else if (/^<h(\d)/.test(b)) {
      const t = strip(b); if (t) out.push('', '#'.repeat(Math.min(6, +b[2] + 1)) + ' ' + t);
    } else if (b.startsWith('<li')) {
      const t = strip(b); if (t) out.push('- ' + t);
    } else {
      const t = strip(b); if (t) out.push(t);
    }
  }
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n', note: '' };
}

// Excel: each sheet as rows, with real dates written out.
async function xlsx(file) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const fmt = (v) => {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object') return v.text || (v.richText ? v.richText.map((r) => r.text).join('') : v.result != null ? fmt(v.result) : '');
    return String(v);
  };
  const out = [`# ${path.basename(file)}`];
  wb.eachSheet((ws) => {
    out.push('', `## Sheet: ${ws.name}`);
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells = [];
      for (let c = 1; c <= row.cellCount; c++) cells.push(fmt(row.getCell(c).value).replace(/\s+/g, ' ').trim());
      if (cells.some(Boolean)) out.push('| ' + cells.join(' | ') + ' |');
    });
  });
  return { text: out.join('\n') + '\n', note: '' };
}

async function plain(file) {
  const t = await fsp.readFile(file, 'utf8');
  return { text: `# ${path.basename(file)}\n\n${t}`, note: '' };
}

async function extract(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pptx') return pptx(file);
  if (ext === '.pdf') return pdf(file);
  if (ext === '.docx') return docx(file);
  if (ext === '.xlsx') return xlsx(file);
  if (ext === '.txt' || ext === '.md') return plain(file);
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return { text: '', note: 'picture, Claude looks at it only when needed' };
  if (ext === '.doc' || ext === '.xls') return { text: '', note: `old ${ext} format, save it as ${ext}x to include its text` };
  if (ext === '.ppt') return { text: '', note: 'old .ppt format, save it as .pptx to include its text' };
  return { text: '', note: '' };
}

module.exports = { extract };
