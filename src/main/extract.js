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

async function pdf(file) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(await fsp.readFile(file)));
  const { totalPages, text } = await extractText(doc, { mergePages: false });
  const chars = text.reduce((s, t) => s + t.trim().length, 0);
  // Almost no text means a scanned PDF: Claude reads the original instead.
  if (chars < totalPages * 40) return { text: '', note: 'scanned, Claude reads the original', pages: totalPages };
  const parts = [`# ${path.basename(file)}`];
  text.forEach((t, i) => { const s = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); if (s) parts.push(`\n## Page ${i + 1}\n${s}`); });
  return { text: parts.join('\n') + '\n', note: '', pages: totalPages };
}

async function plain(file) {
  const t = await fsp.readFile(file, 'utf8');
  return { text: `# ${path.basename(file)}\n\n${t}`, note: '' };
}

async function extract(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pptx') return pptx(file);
  if (ext === '.pdf') return pdf(file);
  if (ext === '.txt' || ext === '.md') return plain(file);
  if (ext === '.ppt') return { text: '', note: 'old .ppt format, save it as .pptx to include its text' };
  return { text: '', note: '' };
}

module.exports = { extract };
