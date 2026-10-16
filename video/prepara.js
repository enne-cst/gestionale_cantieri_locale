/*
 * Video Gestione Cantieri – preparazione del materiale.
 *
 *   node prepara.js
 *
 * 1. Avvia l'applicazione su una porta di servizio con una COPIA dell'archivio dimostrativo
 *    (../brochure/dati-demo/database.json): l'archivio di lavoro non viene né letto né scritto.
 * 2. Cattura con Playwright le schermate che compaiono nel video (public/img/).
 * 3. Copia in public/ logo e font, e in src/ i testi condivisi con la brochure (nome e slogan).
 *
 * Il montaggio vero e proprio è in src/ e si esporta con «npm run video».
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright-core');

const QUI = __dirname;
const RADICE = path.join(QUI, '..');
const DIR_IMG = path.join(QUI, 'public', 'img');
const DIR_FONT = path.join(QUI, 'public', 'fonts');
const ARCHIVIO_DEMO = path.join(RADICE, 'brochure', 'dati-demo', 'database.json');
const CONTENUTI = path.join(RADICE, 'brochure', 'contenuti.json');
const PORTA = 8794;
const BASE = 'http://127.0.0.1:' + PORTA + '/';
// proporzioni della cornice in cui il video mostra le schermate delle funzionalità (vedi src/Scene.jsx)
const RAPPORTO = 1.6;

const attendi = ms => new Promise(r => setTimeout(r, ms));

async function apriBrowser() {
  let ultimo;
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel }); } catch (e) { ultimo = e; }
  }
  try { return await chromium.launch(); } catch (e) { ultimo = e; }
  throw new Error('Nessun browser trovato (Chrome, Edge o Chromium di Playwright).\n' + ultimo.message);
}

async function avviaApp() {
  const dirDati = fs.mkdtempSync(path.join(os.tmpdir(), 'video-cantieri-'));
  fs.copyFileSync(ARCHIVIO_DEMO, path.join(dirDati, 'database.json'));
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

async function catturaSchermate(browser) {
  fs.mkdirSync(DIR_IMG, { recursive: true });
  const contesto = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, locale: 'it-IT' });
  const pagina = await contesto.newPage();
  await pagina.goto(BASE);
  await pagina.waitForSelector('.laterale');
  // l'etichetta «dati su server locale» della barra laterale vale solo per l'uso in locale: nel materiale
  // commerciale l'applicazione è presentata come servizio online, quindi non deve comparire
  await pagina.addStyleTag({ content: '.utente-box .pill { display: none !important; }' });

  const vai = async hash => {
    await pagina.evaluate(h => { Store.login('u_direzione'); location.hash = '#/' + h; UI.render(); }, hash);
    await attendi(350);
  };
  // zona della pagina che parte dall'angolo di un riquadro (cercato per titolo) e ha proporzioni fisse
  const riquadro = (testo, dy) => pagina.evaluate(([t, d]) => {
    const p = [...document.querySelectorAll('.pannello')].find(x => { const h = x.querySelector('h2'); return h && h.textContent.toLowerCase().includes(t); });
    if (!p) return null;
    const b = p.getBoundingClientRect();
    return { x: b.left + scrollX, y: b.top + scrollY + d, width: b.width };
  }, [testo, dy || 0]);
  const scatta = async (nome, zona) => {
    if (!zona) throw new Error('Zona non trovata per la schermata «' + nome + '»');
    await pagina.evaluate(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); window.scrollTo(0, 0); });
    const clip = { x: zona.x, y: zona.y, width: zona.width, height: Math.round(zona.width / (zona.rapporto || RAPPORTO)) };
    await pagina.screenshot({ path: path.join(DIR_IMG, nome + '.png'), fullPage: true, clip });
    console.log('  schermata', nome);
  };

  const idCommessa = await pagina.evaluate(() => (Store.db.commesse.find(c => c.codice === '26.0002') || Store.db.commesse.find(c => !c.annullato)).id);
  const idPreventivo = await pagina.evaluate(() => (Store.db.preventivi.find(p => !p.annullato) || {}).id || '');

  // panoramica: la dashboard direzionale in tutta la sua lunghezza, fino alle prime righe dell'elenco
  // delle commesse; nel video scorre dall'alto in basso dentro la finestra (vedi Panoramica in src/Scene.jsx)
  await vai('dashboard');
  await attendi(2000); // il grafico a torta si disegna con un'animazione
  // barra laterale e contenuto si catturano separati: nel video la barra resta ferma e scorre solo il contenuto,
  // come nell'applicazione vera
  const misure = await pagina.evaluate(() => ({ laterale: Math.round(document.querySelector('.laterale').getBoundingClientRect().width), largo: 1280, alto: Math.min(document.documentElement.scrollHeight, 2050), finestra: 720 }));
  await scatta('laterale', { x: 0, y: 0, width: misure.laterale, rapporto: misure.laterale / misure.finestra });
  await scatta('dashboard', { x: misure.laterale, y: 0, width: misure.largo - misure.laterale, rapporto: (misure.largo - misure.laterale) / misure.alto });
  fs.writeFileSync(path.join(QUI, 'src', 'misure.generato.json'), JSON.stringify({ dashboard: misure }, null, 2) + String.fromCharCode(10));

  // per le funzionalità la finestra è più stretta: nella cornice del video i testi restano leggibili
  await pagina.setViewportSize({ width: 1120, height: 720 });

  if (idPreventivo) {
    await vai('preventivo/' + idPreventivo);
    const t = await pagina.evaluate(() => { const b = document.querySelector('.testata').getBoundingClientRect(); return { x: b.left + scrollX - 6, y: b.top + scrollY - 6, width: b.width + 12 }; });
    await scatta('preventivo', t);
  }
  await vai('movimenti');
  await scatta('movimenti', await riquadro('dashboard di periodo'));
  await vai('commessa/' + idCommessa + '/gantt');
  await scatta('gantt', await riquadro('diagramma di gantt'));
  await vai('commessa/' + idCommessa + '/riepilogo');
  await scatta('utile', await riquadro('utile maturato', 104));
  await vai('cantieri');
  await scatta('alert', await riquadro('commesse che richiedono attenzione'));

  // importazione da Excel: file preparato in memoria con una riga da aggiornare, una nuova e una
  // con un errore; se ne mostra solo l'anteprima, nulla viene salvato
  await vai('importa');
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
  await scatta('importa', await pagina.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find(x => /anteprima delle commesse/i.test(x.textContent));
    const c = document.querySelector('#contenuto').getBoundingClientRect();
    const st = getComputedStyle(document.querySelector('#contenuto'));
    const x = c.left + parseFloat(st.paddingLeft) - 10;
    return h ? { x, y: h.getBoundingClientRect().top + scrollY - 12, width: c.right - parseFloat(st.paddingRight) + 10 - x } : null;
  }));

  await contesto.close();
}

function copiaRisorse() {
  fs.mkdirSync(DIR_FONT, { recursive: true });
  fs.copyFileSync(path.join(RADICE, 'app', 'img', 'logo.png'), path.join(DIR_IMG, 'logo.png'));
  const font = [['barlow', 400], ['barlow', 500], ['barlow', 600], ['barlow-condensed', 600], ['barlow-condensed', 700]];
  font.forEach(([famiglia, peso]) => {
    const nome = famiglia + '-latin-' + peso + '-normal.woff2';
    fs.copyFileSync(path.join(QUI, 'node_modules', '@fontsource', famiglia, 'files', nome), path.join(DIR_FONT, nome));
  });
  // nome e slogan hanno una sola fonte: il file dei contenuti della brochure
  fs.copyFileSync(CONTENUTI, path.join(QUI, 'src', 'contenuti.generato.json'));
  console.log('  logo, font e contenuti copiati');
}

(async () => {
  const browser = await apriBrowser();
  let app = null;
  try {
    console.log('Schermate dall\'applicazione…');
    app = await avviaApp();
    await catturaSchermate(browser);
    copiaRisorse();
  } finally {
    await browser.close();
    if (app) { app.proc.kill(); try { fs.rmSync(app.dirDati, { recursive: true, force: true }); } catch (e) { /* cartella temporanea */ } }
  }
})().catch(e => { console.error('\nERRORE: ' + (e.message || e)); process.exit(1); });
