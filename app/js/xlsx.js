/*
 * FIDA EDILE – Lettura e scrittura di file Excel (.xlsx) senza librerie esterne.
 *
 * Un .xlsx è un archivio ZIP di documenti XML (SpreadsheetML). Qui c'è il minimo indispensabile:
 *  - in SCRITTURA l'archivio è prodotto con il metodo "store" (nessuna compressione), così non serve
 *    alcun compressore: Excel, LibreOffice e Fogli Google leggono senza problemi un .xlsx non compresso;
 *  - in LETTURA le parti compresse sono espanse con DecompressionStream('deflate-raw'), funzione
 *    standard del browser (Chrome/Edge 80+, Firefox 113+, Safari 16.4+) e di Node 18+.
 *
 * Nessuna dipendenza e nessun uso del DOM: lo stesso file funziona nel browser (window.Xlsx)
 * e in Node (test di andata e ritorno in test/verifica.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Xlsx = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- utilità comuni
  const ENC = new TextEncoder();
  function byte(testo) { return ENC.encode(testo); }

  // I caratteri di controllo non sono ammessi in XML: si tolgono invece di produrre un file illeggibile.
  function escXml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function deescXml(s) {
    return String(s).replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }
  // 0 -> "A", 25 -> "Z", 26 -> "AA"
  function colonnaLettera(i) {
    let s = '', n = i + 1;
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function colonnaIndice(lettere) {
    let n = 0;
    for (let i = 0; i < lettere.length; i++) n = n * 26 + (lettere.toUpperCase().charCodeAt(i) - 64);
    return n - 1;
  }

  // Excel conta i giorni dal 30/12/1899 (l'origine che rende corretta anche la nota anomalia del 1900).
  const GIORNO = 86400000, EPOCA = Date.UTC(1899, 11, 30);
  function serialeDaIso(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return null;
    return (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - EPOCA) / GIORNO;
  }
  function isoDaSeriale(n) {
    if (typeof n !== 'number' || !isFinite(n) || n < 1) return '';
    const d = new Date(EPOCA + Math.round(n) * GIORNO);
    const p = x => String(x).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }

  // ---------------------------------------------------------------- ZIP (scrittura, metodo "store")
  let TABELLA_CRC = null;
  function crc32(buf) {
    if (!TABELLA_CRC) {
      TABELLA_CRC = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        TABELLA_CRC[n] = c >>> 0;
      }
    }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = TABELLA_CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  // campi: [[larghezza in byte, valore], ...] scritti in little endian, come vuole il formato ZIP
  function blocco(campi) {
    const n = campi.reduce((t, c) => t + c[0], 0);
    const b = new Uint8Array(n), dv = new DataView(b.buffer);
    let o = 0;
    campi.forEach(c => { if (c[0] === 2) dv.setUint16(o, c[1], true); else dv.setUint32(o, c[1] >>> 0, true); o += c[0]; });
    return b;
  }
  function unisci(parti) {
    const n = parti.reduce((t, p) => t + p.length, 0);
    const out = new Uint8Array(n);
    let o = 0;
    parti.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }
  function zip(voci) {
    const ora = new Date();
    const tempo = ((ora.getHours() << 11) | (ora.getMinutes() << 5) | (ora.getSeconds() >> 1)) & 0xFFFF;
    const giorno = (((ora.getFullYear() - 1980) << 9) | ((ora.getMonth() + 1) << 5) | ora.getDate()) & 0xFFFF;
    const locali = [], centrali = [];
    let offset = 0;
    voci.forEach(v => {
      const nome = byte(v.nome), dati = v.dati, crc = crc32(dati);
      // bit 11 dei flag = nomi in UTF-8
      const intestazione = unisci([blocco([[4, 0x04034b50], [2, 20], [2, 0x0800], [2, 0], [2, tempo], [2, giorno],
        [4, crc], [4, dati.length], [4, dati.length], [2, nome.length], [2, 0]]), nome]);
      locali.push(intestazione, dati);
      centrali.push(unisci([blocco([[4, 0x02014b50], [2, 20], [2, 20], [2, 0x0800], [2, 0], [2, tempo], [2, giorno],
        [4, crc], [4, dati.length], [4, dati.length], [2, nome.length], [2, 0], [2, 0], [2, 0], [2, 0], [4, 0], [4, offset]]), nome]));
      offset += intestazione.length + dati.length;
    });
    const dir = unisci(centrali);
    const fine = blocco([[4, 0x06054b50], [2, 0], [2, 0], [2, voci.length], [2, voci.length], [4, dir.length], [4, offset], [2, 0]]);
    return unisci(locali.concat([dir, fine]));
  }

  // ---------------------------------------------------------------- ZIP (lettura)
  async function espandi(compressi) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('Questo browser non sa espandere i file .xlsx compressi. Aggiornare il browser (Chrome, Edge, Firefox o Safari recenti) oppure, da Excel, salvare il file come "Cartella di lavoro di Excel" e riprovare.');
    }
    const sorgente = new ReadableStream({ start(c) { c.enqueue(compressi); c.close(); } });
    const lettore = sorgente.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const parti = [];
    for (;;) {
      const p = await lettore.read();
      if (p.done) break;
      parti.push(p.value);
    }
    return unisci(parti);
  }
  async function dezip(buffer) {
    const b = new Uint8Array(buffer);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    // il record di chiusura sta in fondo: si cerca all'indietro perché può avere un commento finale
    let fine = -1;
    for (let i = b.length - 22; i >= 0 && i >= b.length - 22 - 65535; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { fine = i; break; }
    }
    if (fine < 0) throw new Error('Il file non è un .xlsx valido (archivio non riconosciuto).');
    const nVoci = dv.getUint16(fine + 10, true);
    let p = dv.getUint32(fine + 16, true);
    const out = {};
    for (let i = 0; i < nVoci; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(p + 10, true);
      const dimCompressa = dv.getUint32(p + 20, true);
      const lunNome = dv.getUint16(p + 28, true);
      const lunExtra = dv.getUint16(p + 30, true);
      const lunCommento = dv.getUint16(p + 32, true);
      const offLocale = dv.getUint32(p + 42, true);
      const nome = new TextDecoder().decode(b.subarray(p + 46, p + 46 + lunNome));
      // l'intestazione locale ha lunghezze proprie: vanno rilette da lì per trovare l'inizio dei dati
      const lunNomeL = dv.getUint16(offLocale + 26, true);
      const lunExtraL = dv.getUint16(offLocale + 28, true);
      const inizio = offLocale + 30 + lunNomeL + lunExtraL;
      const grezzi = b.subarray(inizio, inizio + dimCompressa);
      if (metodo === 0) out[nome] = grezzi;
      else if (metodo === 8) out[nome] = await espandi(grezzi);
      else throw new Error('Il file .xlsx usa una compressione non supportata (metodo ' + metodo + ').');
      p += 46 + lunNome + lunExtra + lunCommento;
    }
    const testo = {};
    Object.keys(out).forEach(k => { testo[k] = new TextDecoder('utf-8').decode(out[k]); });
    return testo;
  }

  // ---------------------------------------------------------------- scrittura del foglio di lavoro
  // Stili disponibili nelle celle e nelle colonne (l'indice è la posizione in cellXfs, qui sotto).
  const STILI = { normale: 0, testata: 1, testataObbligatoria: 2, data: 3, euro: 4, numero: 5, testo: 6, titolo: 7, grassetto: 8, nota: 9 };

  const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="&quot;€&quot;\\ #,##0.00"/><numFmt numFmtId="166" formatCode="#,##0.00"/></numFmts>' +
    '<fonts count="5">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="14"/><color rgb="FF1F3A5F"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><i/><sz val="10"/><color rgb="FF5B6573"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF8A5A00"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFBFC7D2"/></left><right style="thin"><color rgb="FFBFC7D2"/></right>' +
    '<top style="thin"><color rgb="FFBFC7D2"/></top><bottom style="thin"><color rgb="FFBFC7D2"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="10">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function stileDi(nome) {
    const s = STILI[nome];
    return s === undefined ? 0 : s;
  }

  // Una cella può essere un valore semplice oppure { v, s } con lo stile scelto.
  function cellaXml(rif, cella) {
    const c = (cella && typeof cella === 'object' && !(cella instanceof Date)) ? cella : { v: cella };
    const s = stileDi(c.s);
    const attrS = s ? ' s="' + s + '"' : '';
    let v = c.v;
    if (v === null || v === undefined || v === '') return s ? '<c r="' + rif + '"' + attrS + '/>' : '';
    // una data si scrive come numero seriale: è lo stile a mostrarla come gg/mm/aaaa
    if (c.s === 'data') {
      const n = serialeDaIso(v);
      if (n !== null) return '<c r="' + rif + '"' + attrS + '><v>' + n + '</v></c>';
    }
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + rif + '"' + attrS + '><v>' + v + '</v></c>';
    if (typeof v === 'boolean') return '<c r="' + rif + '"' + attrS + ' t="b"><v>' + (v ? 1 : 0) + '</v></c>';
    v = String(v);
    const spazio = /^\s|\s$|\n/.test(v) ? ' xml:space="preserve"' : '';
    return '<c r="' + rif + '"' + attrS + ' t="inlineStr"><is><t' + spazio + '>' + escXml(v) + '</t></is></c>';
  }

  function foglioXml(f) {
    const righe = f.righe || [];
    const nCol = Math.max(1, (f.colonne || []).length, righe.reduce((m, r) => Math.max(m, r.length), 0));
    const vista = f.congelaRighe
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + f.congelaRighe + '" topLeftCell="A' + (f.congelaRighe + 1) +
        '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A' + (f.congelaRighe + 1) + '" sqref="A' + (f.congelaRighe + 1) + '"/></sheetView></sheetViews>'
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    const cols = (f.colonne || []).length
      ? '<cols>' + f.colonne.map((c, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.larghezza || 14) + '" customWidth="1"' +
        (c.stile ? ' style="' + stileDi(c.stile) + '"' : '') + '/>').join('') + '</cols>'
      : '';
    const corpo = righe.map((r, i) => {
      const celle = r.map((c, j) => cellaXml(colonnaLettera(j) + (i + 1), c)).join('');
      return celle ? '<row r="' + (i + 1) + '">' + celle + '</row>' : '';
    }).join('');
    const filtro = f.filtro && righe.length ? '<autoFilter ref="A1:' + colonnaLettera(nCol - 1) + '1"/>' : '';
    const val = (f.validazioni || []).length
      ? '<dataValidations count="' + f.validazioni.length + '">' + f.validazioni.map(v => {
        const col = colonnaLettera(v.colonna);
        return '<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"' +
          (v.messaggio ? ' errorTitle="Valore non ammesso" error="' + escXml(v.messaggio) + '"' : '') +
          ' sqref="' + col + (v.da || 2) + ':' + col + (v.a || 1000) + '"><formula1>' + escXml(v.origine) + '</formula1></dataValidation>';
      }).join('') + '</dataValidations>'
      : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:' + colonnaLettera(nCol - 1) + Math.max(1, righe.length) + '"/>' + vista +
      '<sheetFormatPr defaultRowHeight="15"/>' + cols +
      '<sheetData>' + corpo + '</sheetData>' + filtro + val + '</worksheet>';
  }

  // fogli: [{ nome, righe, colonne, congelaRighe, filtro, validazioni }] -> Uint8Array con il .xlsx
  function crea(fogli) {
    const f = (fogli || []).filter(x => x && x.nome);
    if (!f.length) throw new Error('Nessun foglio da scrivere.');
    const voci = [
      {
        nome: '[Content_Types].xml', dati: byte('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          f.map((x, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          '</Types>')
      },
      {
        nome: '_rels/.rels', dati: byte('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>')
      },
      {
        nome: 'xl/workbook.xml', dati: byte('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          '<sheets>' + f.map((x, i) => '<sheet name="' + escXml(x.nome) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>')
      },
      {
        nome: 'xl/_rels/workbook.xml.rels', dati: byte('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          f.map((x, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
          '<Relationship Id="rId' + (f.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
          '</Relationships>')
      },
      { nome: 'xl/styles.xml', dati: byte(STYLES_XML) }
    ];
    f.forEach((x, i) => voci.push({ nome: 'xl/worksheets/sheet' + (i + 1) + '.xml', dati: byte(foglioXml(x)) }));
    return zip(voci);
  }

  // ---------------------------------------------------------------- lettura del foglio di lavoro
  // Formati numerici predefiniti di Excel che rappresentano date oppure ore.
  function formatoData(id, codice) {
    if (codice) {
      // si ignorano i testi fra virgolette, gli escape e i blocchi [rosso] / [$-410]: solo il formato vero conta
      const pulito = String(codice).replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '');
      return /[dmy]/i.test(pulito) && !/^general$/i.test(pulito.trim());
    }
    return (id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58);
  }
  function formatoPercentuale(id, codice) {
    if (codice) return String(codice).replace(/"[^"]*"/g, '').indexOf('%') >= 0;
    return id === 9 || id === 10;
  }

  function leggiStili(xml) {
    const codici = {};
    (xml.match(/<numFmt\b[^>]*\/>/g) || []).forEach(n => {
      const id = /numFmtId="(\d+)"/.exec(n), c = /formatCode="([^"]*)"/.exec(n);
      if (id && c) codici[+id[1]] = deescXml(c[1]);
    });
    const blocco = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
    const out = [];
    if (blocco) {
      (blocco[1].match(/<xf\b[^>]*>/g) || []).forEach(x => {
        const id = /numFmtId="(\d+)"/.exec(x);
        const n = id ? +id[1] : 0;
        out.push({ data: formatoData(n, codici[n]), percentuale: formatoPercentuale(n, codici[n]) });
      });
    }
    return out;
  }

  function leggiTestiCondivisi(xml) {
    if (!xml) return [];
    return (xml.match(/<si\b[^>]*>[\s\S]*?<\/si>|<si\b[^>]*\/>/g) || []).map(si => {
      // la pronuncia giapponese (<rPh>) non fa parte del testo
      const senzaRPh = si.replace(/<rPh[\s\S]*?<\/rPh>/g, '');
      return (senzaRPh.match(/<t\b[^>]*>[\s\S]*?<\/t>|<t\b[^>]*\/>/g) || [])
        .map(t => /\/>$/.test(t) ? '' : deescXml(t.replace(/^<t\b[^>]*>/, '').replace(/<\/t>$/, ''))).join('');
    });
  }

  const VUOTA = { valore: '', tipo: 'vuoto' };
  function leggiFoglio(xml, condivisi, stili) {
    const righe = [];
    let maxCol = 0;
    const reRiga = /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
    let mr;
    while ((mr = reRiga.exec(xml)) !== null) {
      if (mr[2] === undefined) continue;
      const nRiga = /r="(\d+)"/.exec(mr[1] || '');
      const iRiga = (nRiga ? +nRiga[1] : righe.length + 1) - 1;
      const celle = [];
      const reCella = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let mc;
      while ((mc = reCella.exec(mr[2])) !== null) {
        const attr = mc[1] || '', dentro = mc[2] || '';
        const rif = /r="([A-Z]+)\d+"/.exec(attr);
        const iCol = rif ? colonnaIndice(rif[1]) : celle.length;
        const tipo = (/t="([^"]+)"/.exec(attr) || [])[1] || 'n';
        const stile = stili[+((/s="(\d+)"/.exec(attr) || [])[1] || -1)] || null;
        let cella = VUOTA;
        if (tipo === 'inlineStr') {
          const t = (dentro.match(/<t\b[^>]*>[\s\S]*?<\/t>/g) || []).map(x => deescXml(x.replace(/^<t\b[^>]*>/, '').replace(/<\/t>$/, ''))).join('');
          cella = t === '' ? VUOTA : { valore: t, tipo: 'testo' };
        } else {
          const v = /<v>([\s\S]*?)<\/v>/.exec(dentro);
          const grezzo = v ? deescXml(v[1]) : '';
          if (grezzo === '') cella = VUOTA;
          else if (tipo === 's') { const t = condivisi[+grezzo] || ''; cella = t === '' ? VUOTA : { valore: t, tipo: 'testo' }; }
          else if (tipo === 'str') cella = { valore: grezzo, tipo: 'testo' };
          else if (tipo === 'b') cella = { valore: grezzo === '1', tipo: 'booleano' };
          else if (tipo === 'e') cella = { valore: grezzo, tipo: 'errore' };
          else {
            const n = Number(grezzo);
            if (isNaN(n)) cella = { valore: grezzo, tipo: 'testo' };
            else if (stile && stile.data) cella = { valore: isoDaSeriale(n), tipo: 'data' };
            else if (stile && stile.percentuale) cella = { valore: n, tipo: 'percentuale' };
            else cella = { valore: n, tipo: 'numero' };
          }
        }
        celle[iCol] = cella;
        if (iCol + 1 > maxCol) maxCol = iCol + 1;
      }
      righe[iRiga] = celle;
    }
    // le righe e le celle mai scritte da Excel restano "buchi": si riempiono per poterle scorrere senza controlli
    for (let i = 0; i < righe.length; i++) {
      const r = righe[i] || [];
      for (let j = 0; j < maxCol; j++) if (!r[j]) r[j] = VUOTA;
      righe[i] = r;
    }
    return righe;
  }

  // buffer (ArrayBuffer o Uint8Array) -> { fogli: [{ nome, righe }], foglio(nome) }
  async function leggi(buffer) {
    const parti = await dezip(buffer);
    const wb = parti['xl/workbook.xml'];
    if (!wb) throw new Error('Il file non è una cartella di lavoro Excel (.xlsx).');
    const rels = {};
    (parti['xl/_rels/workbook.xml.rels'] || '').match(/<Relationship\b[^>]*\/>/g)?.forEach(r => {
      const id = /Id="([^"]+)"/.exec(r), t = /Target="([^"]+)"/.exec(r);
      if (id && t) rels[id[1]] = t[1].replace(/^\/?xl\//, '').replace(/^\//, '');
    });
    const condivisi = leggiTestiCondivisi(parti['xl/sharedStrings.xml']);
    const stili = leggiStili(parti['xl/styles.xml'] || '');
    const fogli = [];
    (wb.match(/<sheet\b[^>]*\/>/g) || []).forEach((s, i) => {
      const nome = deescXml((/name="([^"]*)"/.exec(s) || [])[1] || ('Foglio' + (i + 1)));
      const rid = (/r:id="([^"]+)"/.exec(s) || [])[1];
      const percorso = 'xl/' + (rels[rid] || ('worksheets/sheet' + (i + 1) + '.xml'));
      const xml = parti[percorso];
      if (xml) fogli.push({ nome, righe: leggiFoglio(xml, condivisi, stili) });
    });
    if (!fogli.length) throw new Error('Il file Excel non contiene fogli leggibili.');
    return {
      fogli,
      foglio(nome) {
        const n = String(nome || '').trim().toLowerCase();
        const f = fogli.find(x => x.nome.trim().toLowerCase() === n);
        return f ? f.righe : null;
      }
    };
  }

  // Testo di una cella, qualunque sia il tipo (per intestazioni e confronti).
  function testo(cella) {
    if (!cella || cella.tipo === 'vuoto') return '';
    if (cella.tipo === 'booleano') return cella.valore ? 'SI' : 'NO';
    if (cella.tipo === 'numero' || cella.tipo === 'percentuale') return String(cella.valore);
    return String(cella.valore);
  }

  return { crea, leggi, testo, STILI, colonnaLettera, colonnaIndice, serialeDaIso, isoDaSeriale, escXml };
});
