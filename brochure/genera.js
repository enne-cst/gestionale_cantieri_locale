/*
 * Brochure Gestione Cantieri – rigenerazione completa.
 *
 *   node genera.js              cattura le schermate dall'app e produce i due PDF
 *   node genera.js --solo-pdf   riusa le schermate già presenti in img/ e rifà solo i PDF
 *
 * Le schermate sono prese dall'applicazione vera, avviata su una porta di servizio con una COPIA
 * dell'archivio dimostrativo (dati-demo/database.json): l'archivio di lavoro data/database.json
 * non viene né letto né scritto, così nella brochure non finiscono mai dati reali.
 *
 * Nome, slogan e sottotitolo stanno in contenuti.json, impaginazione in brochure.html e brochure.css.
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright-core');

const QUI = __dirname;
const RADICE = path.join(QUI, '..');
const DIR_IMG = path.join(QUI, 'img');
const PORTA = 8793;
const BASE = 'http://127.0.0.1:' + PORTA + '/';
const SOLO_PDF = process.argv.includes('--solo-pdf');

// Formato: A4 al vivo, più 3 mm di abbondanza per lato per la versione da tipografia.
const A4 = { l: 210, a: 297 };
const ABBONDANZA = 3;

const attendi = ms => new Promise(r => setTimeout(r, ms));

// Usa Chrome o Edge già installati: nessun browser da scaricare.
async function apriBrowser() {
  let ultimo;
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel }); } catch (e) { ultimo = e; }
  }
  try { return await chromium.launch(); } catch (e) { ultimo = e; }
  throw new Error('Nessun browser trovato (Chrome, Edge o Chromium di Playwright).\n' + ultimo.message);
}

// ---------------------------------------------------------------- app di servizio
async function avviaApp() {
  const dirDati = fs.mkdtempSync(path.join(os.tmpdir(), 'brochure-cantieri-'));
  fs.copyFileSync(path.join(QUI, 'dati-demo', 'database.json'), path.join(dirDati, 'database.json'));
  const proc = spawn(process.execPath, ['server.js', '--porta', String(PORTA)], {
    cwd: RADICE, env: Object.assign({}, process.env, { DATA_DIR: dirDati, APP_UTENTE: '', APP_PASSWORD: '', PORT: '', RENDER: '' }), stdio: 'ignore'
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + 'api/salute')).ok) return { proc, dirDati }; } catch (e) { /* non ancora pronto */ }
    await attendi(200);
  }
  proc.kill();
  throw new Error('L\'app non risponde sulla porta ' + PORTA + ' (forse è già occupata).');
}

// ---------------------------------------------------------------- schermate
async function catturaSchermate(browser) {
  fs.mkdirSync(DIR_IMG, { recursive: true });
  const contesto = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2.5, locale: 'it-IT' });
  const pagina = await contesto.newPage();
  await pagina.goto(BASE);
  await pagina.waitForSelector('.laterale');
  // l'etichetta «dati su server locale» della barra laterale vale solo per l'uso in locale: nel materiale
  // commerciale l'applicazione è presentata come servizio online, quindi non deve comparire
  await pagina.addStyleTag({ content: '.utente-box .pill { display: none !important; }' });

  const vai = async (hash, utente) => {
    await pagina.evaluate(([h, u]) => { if (u) Store.login(u); location.hash = '#/' + h; UI.render(); }, [hash, utente || null]);
    await attendi(350);
  };
  // Ritaglio di una zona della pagina: parte dall'angolo del riquadro indicato e ha proporzioni fisse,
  // così tutte le immagini della brochure entrano nella stessa cornice senza deformarsi.
  const scatta = async (nome, opt) => {
    await pagina.evaluate(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); window.scrollTo(0, 0); });
    let r = { x: 0, y: opt.y || 0, width: pagina.viewportSize().width };
    if (opt.pannello) {
      r = await pagina.evaluate(testo => {
        const p = [...document.querySelectorAll('.pannello')].find(x => { const h = x.querySelector('h2'); return h && h.textContent.toLowerCase().includes(testo); });
        if (!p) return null;
        const b = p.getBoundingClientRect();
        return { x: b.left + scrollX, y: b.top + scrollY, width: b.width };
      }, opt.pannello);
      if (!r) throw new Error('Riquadro «' + opt.pannello + '» non trovato per ' + nome);
    } else if (opt.sel) {
      r = await pagina.evaluate(s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, width: b.width }; }, opt.sel);
    }
    const m = opt.margine || 0;
    const clip = { x: Math.max(0, r.x - m), y: Math.max(0, r.y - m + (opt.dy || 0)), width: r.width + 2 * m };
    clip.height = Math.round(clip.width / opt.rapporto);
    const file = path.join(DIR_IMG, nome + '.png');
    await pagina.screenshot({ path: file, fullPage: true, clip });
    if (opt.scala) await riduci(file, opt.scala);
    console.log('  schermata', nome);
  };

  // Riduce un'immagine già salvata: la copertina è catturata a tutta finestra e a 2,5x peserebbe
  // inutilmente, in stampa oltre i 300 dpi non servono.
  const riduci = async (file, scala) => {
    const p2 = await contesto.newPage();
    const dati = fs.readFileSync(file).toString('base64');
    const url = await p2.evaluate(async ([b64, k]) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    }, [dati, scala]);
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    await p2.close();
  };

  const idCommessa = await pagina.evaluate(() => (Store.db.commesse.find(c => c.codice === '26.0002') || Store.db.commesse.find(c => !c.annullato)).id);
  const idPreventivo = await pagina.evaluate(() => (Store.db.preventivi.find(p => !p.annullato) || {}).id || '');

  // copertina: la dashboard direzionale così come si apre
  await vai('dashboard', 'u_direzione');
  await attendi(2000); // il grafico a torta si disegna con un'animazione
  await scatta('copertina', { rapporto: 1280 / 800, scala: 0.8 });

  // per le funzionalità la finestra è più stretta: nelle cornici piccole i testi restano leggibili
  await pagina.setViewportSize({ width: 1120, height: 860 });

  // 1 · alert: le commesse che richiedono attenzione
  await vai('cantieri', 'u_direzione');
  await scatta('alert', { pannello: 'commesse che richiedono attenzione', rapporto: 1.5 });

  // 2 · utile maturato e previsione a finire
  await vai('commessa/' + idCommessa + '/riepilogo', 'u_direzione');
  await scatta('utile', { pannello: 'utile maturato', rapporto: 1.5, dy: 104 });

  // 3 · preventivo: prezzo proposto contro prezzo minimo sostenibile
  if (idPreventivo) {
    await vai('preventivo/' + idPreventivo, 'u_direzione');
    await scatta('preventivo', { sel: '.testata', rapporto: 1.5, margine: 6 });
  }

  // 4 · cronoprogramma e ore per fase
  await vai('commessa/' + idCommessa + '/gantt', 'u_direzione');
  await scatta('gantt', { pannello: 'diagramma di gantt', rapporto: 1.5 });

  // 5 · movimenti: la dashboard di periodo
  await vai('movimenti', 'u_direzione');
  await scatta('movimenti', { pannello: 'dashboard di periodo', rapporto: 1.5 });

  // 6 · importazione da Excel: si prepara in memoria un file con una riga da aggiornare,
  //     una nuova e una con un errore, e se ne mostra l'anteprima (nulla viene salvato)
  await vai('importa', 'u_direzione');
  await pagina.evaluate(async () => {
    const db2 = JSON.parse(JSON.stringify(Store.db));
    const daIniziare = db2.commesse.filter(c => c.stato === 'Da iniziare');
    const a = daIniziare[0] || db2.commesse[0], b = daIniziare[1] || db2.commesse[1];
    a.dataFinePrevista = '2027-06-15'; a.causaAggiornamentoDataFine = 'Proroga/Sospensione autorizzata';
    const copia = extra => Object.assign(JSON.parse(JSON.stringify(b)), extra);
    const n = copia({ id: 'c_nuova1', codice: '26.0030', cliente: 'Panificio Dal Maso', cantiere: 'Nuovo laboratorio di produzione' });
    const e = copia({ id: 'c_nuova2', codice: '26.0031', cliente: 'Autofficina Rigon', cantiere: 'Ampliamento officina', stato: 'Sospeso' });
    db2.commesse.push(n, e);
    const dati = Xlsx.crea(ImportaCommesse.fogliModello(db2, [a, b, n, e]));
    await Importa.analizza(new File([dati], 'commesse_da_aggiornare.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  });
  await attendi(700);
  const zona = await pagina.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find(x => /anteprima delle commesse/i.test(x.textContent));
    const c = document.querySelector('#contenuto').getBoundingClientRect();
    const st = getComputedStyle(document.querySelector('#contenuto'));
    const x = c.left + parseFloat(st.paddingLeft) - 10;
    return { x, y: h.getBoundingClientRect().top + scrollY - 12, width: c.right - parseFloat(st.paddingRight) + 10 - x };
  });
  await pagina.screenshot({ path: path.join(DIR_IMG, 'importa.png'), fullPage: true, clip: Object.assign(zona, { height: Math.round(zona.width / 1.5) }) });
  console.log('  schermata importa');

  await contesto.close();
}

// ---------------------------------------------------------------- PDF
function componiHtml(conAbbondanza) {
  const contenuti = JSON.parse(fs.readFileSync(path.join(QUI, 'contenuti.json'), 'utf8'));
  const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = fs.readFileSync(path.join(QUI, 'brochure.html'), 'utf8');
  html = html.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (tutto, chiave) => {
    const v = chiave.split('.').reduce((o, k) => (o == null ? o : o[k]), contenuti);
    if (v == null) throw new Error('contenuti.json: manca la voce «' + chiave + '»');
    return esc(v);
  });
  const ab = conAbbondanza ? ABBONDANZA : 0;
  const formato = '<style>@page { size: ' + (A4.l + 2 * ab) + 'mm ' + (A4.a + 2 * ab) + 'mm; margin: 0; } :root { --ab: ' + ab + 'mm; }</style>';
  return html.replace('<!--FORMATO-->', formato);
}

async function esportaPdf(browser, conAbbondanza, nomeFile) {
  const ab = conAbbondanza ? ABBONDANZA : 0;
  // il file composto sta accanto ai sorgenti, così i percorsi relativi (css, img, font) restano validi
  const temp = path.join(QUI, '.composta-' + (conAbbondanza ? 'stampa' : 'video') + '.html');
  fs.writeFileSync(temp, componiHtml(conAbbondanza), 'utf8');
  const pagina = await browser.newPage();
  try {
    await pagina.goto('file:///' + temp.split(path.sep).join('/'));
    await pagina.evaluate(() => document.fonts.ready);
    const rotte = await pagina.evaluate(() => [...document.images].filter(i => !i.naturalWidth).map(i => i.getAttribute('src')));
    if (rotte.length) throw new Error('Immagini mancanti: ' + rotte.join(', ') + '. Rilanciare senza --solo-pdf.');
    const fuori = await pagina.evaluate(() => [...document.querySelectorAll('.pagina:not(.copertina)')].map((p, i) => p.scrollHeight > p.clientHeight + 1 ? i + 2 : 0).filter(Boolean));
    if (fuori.length) console.warn('  ATTENZIONE: il contenuto esce dalla pagina ' + fuori.join(', ') + ' (testi troppo lunghi in contenuti.json?)');
    await pagina.pdf({ path: path.join(QUI, nomeFile), width: (A4.l + 2 * ab) + 'mm', height: (A4.a + 2 * ab) + 'mm', printBackground: true, preferCSSPageSize: true });
    console.log('  scritto', nomeFile, '(' + (A4.l + 2 * ab) + ' × ' + (A4.a + 2 * ab) + ' mm)');
  } finally {
    await pagina.close();
    fs.unlinkSync(temp);
  }
}

(async () => {
  const browser = await apriBrowser();
  let app = null;
  try {
    if (!SOLO_PDF) {
      console.log('Schermate dall\'applicazione…');
      app = await avviaApp();
      await catturaSchermate(browser);
    }
    console.log('Esportazione PDF…');
    await esportaPdf(browser, true, 'brochure-stampa.pdf');
    await esportaPdf(browser, false, 'brochure-video.pdf');
  } finally {
    await browser.close();
    if (app) { app.proc.kill(); try { fs.rmSync(app.dirDati, { recursive: true, force: true }); } catch (e) { /* cartella temporanea */ } }
  }
})().catch(e => { console.error('\nERRORE: ' + (e.message || e)); process.exit(1); });
