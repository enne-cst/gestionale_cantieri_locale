/*
 * FIDA EDILE – Gestione Cantieri: server locale (solo moduli integrati di Node.js, nessuna libreria).
 *
 * Avvio:   node server.js            → http://localhost:8765  (solo questo PC)
 *          node server.js --rete     → raggiungibile anche dagli altri PC della rete locale
 *          node server.js --porta 9000
 *
 * I dati sono salvati in data/database.json. Ad ogni salvataggio viene conservata una copia
 * giornaliera in data/backup/. Il server serve inoltre i file statici della cartella app/.
 *
 * Pubblicazione su internet (Render e simili), tramite variabili d'ambiente:
 *   PORT          porta assegnata dall'hosting (gia' gestita)
 *   RENDER        impostata da Render: fa ascoltare su tutte le interfacce
 *   APP_UTENTE    utente richiesto dal browser all'apertura (se vuoto: nessuna password)
 *   APP_PASSWORD  password richiesta dal browser all'apertura
 *   DATA_DIR      cartella dei dati, da puntare a un disco persistente (es. /var/data)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const args = process.argv.slice(2);
// In hosting (Render e simili) occorre ascoltare su tutte le interfacce, altrimenti il servizio
// risulta irraggiungibile dall'esterno e il deploy fallisce. In locale resta legato a questo solo PC.
const inRete = args.includes('--rete') || args.includes('--lan') || !!process.env.RENDER;
const iPorta = args.indexOf('--porta');
const PORTA = iPorta >= 0 ? parseInt(args[iPorta + 1], 10) : (parseInt(process.env.PORT, 10) || 8765);
const HOST = process.env.HOST || (inRete ? '0.0.0.0' : '127.0.0.1');

// Utente e password per l'accesso da internet. Se non sono impostati (uso in locale o in rete
// aziendale) l'app resta aperta come prima; su un indirizzo pubblico vanno SEMPRE impostati.
const UTENTE_WEB = process.env.APP_UTENTE || '';
const PASSWORD_WEB = process.env.APP_PASSWORD || '';
const AUTENTICAZIONE = !!(UTENTE_WEB && PASSWORD_WEB);

const DIR_APP = path.join(__dirname, 'app');
// La cartella dei dati si puo' spostare con DATA_DIR: serve per agganciare un disco persistente
// dell'hosting (es. DATA_DIR=/var/data), perche' il disco del container viene azzerato a ogni riavvio.
const DIR_DATI = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DIR_BACKUP = path.join(DIR_DATI, 'backup');
const FILE_DB = path.join(DIR_DATI, 'database.json');
const FILE_DB_INIZIALE = path.join(__dirname, 'data', 'database.json');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// L'archivio sta SEMPRE nella cartella dell'applicazione (data/database.json). Se non è scrivibile
// è inutile proseguire: meglio dirlo subito e in chiaro che fallire al primo salvataggio.
try {
  fs.mkdirSync(DIR_BACKUP, { recursive: true });
  const prova = path.join(DIR_DATI, '.prova-scrittura');
  fs.writeFileSync(prova, 'x');
  fs.unlinkSync(prova);
} catch (e) {
  console.error('');
  console.error('  IMPOSSIBILE SCRIVERE NELLA CARTELLA DEI DATI');
  console.error('  ' + DIR_DATI);
  console.error('  ' + String(e.message || e));
  console.error('');
  console.error('  Su macOS: concedi a Terminale l\'accesso ai file da Impostazioni di Sistema →');
  console.error('  Privacy e sicurezza → File e cartelle, oppure sposta la cartella dell\'app.');
  console.error('  Su disco di sola lettura o chiavetta: copia prima la cartella sul computer.');
  console.error('');
  process.exit(1);
}

// Primo avvio su una cartella dati vuota (tipico di un disco appena creato dall'hosting):
// si parte dalla copia presente nel progetto, cosi' l'app non si apre su un archivio inesistente.
if (!fs.existsSync(FILE_DB) && FILE_DB !== FILE_DB_INIZIALE && fs.existsSync(FILE_DB_INIZIALE)) {
  try {
    fs.copyFileSync(FILE_DB_INIZIALE, FILE_DB);
    console.log('Archivio iniziale copiato in ' + FILE_DB);
  } catch (e) {
    console.error('Copia dell\'archivio iniziale non riuscita: ' + (e.message || e));
  }
}

function leggiDb() {
  try { return JSON.parse(fs.readFileSync(FILE_DB, 'utf8')); }
  catch (e) { return null; }
}
function scriviDb(db) {
  const testo = JSON.stringify(db, null, 1);
  const tmp = FILE_DB + '.tmp';
  try {
    fs.writeFileSync(tmp, testo, 'utf8');
    fs.renameSync(tmp, FILE_DB);
  } catch (e) {
    throw new Error('Impossibile scrivere ' + FILE_DB + ': ' + (e.message || e));
  }
  const giorno = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fileBackup = path.join(DIR_BACKUP, 'database-' + giorno + '.json');
  // la copia giornaliera non deve far fallire il salvataggio: se non riesce, si segnala e basta
  try { fs.writeFileSync(fileBackup, testo, 'utf8'); }
  catch (e) { console.error('Copia giornaliera non riuscita (' + fileBackup + '): ' + (e.message || e)); }
}
function json(res, codice, obj) {
  res.writeHead(codice, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function leggiCorpo(req) {
  return new Promise((resolve, reject) => {
    const parti = [];
    let dim = 0;
    req.on('data', c => { dim += c.length; if (dim > 200 * 1024 * 1024) { reject(new Error('Richiesta troppo grande')); req.destroy(); } parti.push(c); });
    req.on('end', () => resolve(Buffer.concat(parti).toString('utf8')));
    req.on('error', reject);
  });
}

// Confronto a tempo costante: evita di far dedurre la password dalla velocita' della risposta.
function ugualeSicuro(a, b) {
  const ba = Buffer.from(String(a), 'utf8'), bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) { crypto.timingSafeEqual(ba, ba); return false; }
  return crypto.timingSafeEqual(ba, bb);
}
// Chiede utente e password al browser (autenticazione HTTP di base). Restituisce true se
// la richiesta puo' proseguire, false se ha gia' risposto chiedendo le credenziali.
function accessoConsentito(req, res) {
  if (!AUTENTICAZIONE) return true;
  const intestazione = req.headers['authorization'] || '';
  if (/^Basic /i.test(intestazione)) {
    const decodificato = Buffer.from(intestazione.slice(6), 'base64').toString('utf8');
    const taglio = decodificato.indexOf(':');
    const utente = taglio < 0 ? decodificato : decodificato.slice(0, taglio);
    const password = taglio < 0 ? '' : decodificato.slice(taglio + 1);
    // le due verifiche si fanno entrambe, senza scorciatoie, per non rivelare quale delle due sbaglia
    const okUtente = ugualeSicuro(utente, UTENTE_WEB);
    const okPassword = ugualeSicuro(password, PASSWORD_WEB);
    if (okUtente && okPassword) return true;
  }
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Gestione Cantieri", charset="UTF-8"',
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end('Accesso riservato.');
  return false;
}

let codaScrittura = Promise.resolve();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  // Controllo di salute dell'hosting: deve rispondere anche senza credenziali, altrimenti
  // il servizio viene considerato guasto e riavviato in continuazione.
  if (p === '/api/salute') return json(res, 200, { stato: 'ok' });

  if (!accessoConsentito(req, res)) return;

  // ------------------------------------------------------------ API
  if (p === '/api/db' && req.method === 'GET') {
    const db = leggiDb();
    return json(res, 200, { db: db, modo: 'server' });
  }
  if (p === '/api/db' && req.method === 'PUT') {
    codaScrittura = codaScrittura.then(async () => {
      try {
        const corpo = JSON.parse(await leggiCorpo(req));
        if (!corpo || typeof corpo.db !== 'object') return json(res, 400, { errore: 'Corpo non valido' });
        const attuale = leggiDb();
        const revAttuale = attuale && typeof attuale.rev === 'number' ? attuale.rev : 0;
        const revBase = typeof corpo.rev === 'number' ? corpo.rev : 0;
        if (attuale && revBase !== revAttuale) return json(res, 409, { errore: 'Conflitto di versione', rev: revAttuale });
        corpo.db.rev = revAttuale + 1;
        corpo.db.salvatoIl = new Date().toISOString();
        scriviDb(corpo.db);
        return json(res, 200, { rev: corpo.db.rev });
      } catch (e) {
        return json(res, 500, { errore: String(e.message || e) });
      }
    });
    return;
  }
  if (p === '/api/info') {
    return json(res, 200, { app: 'FIDA EDILE – Gestione Cantieri', file: FILE_DB, backup: DIR_BACKUP, host: os.hostname() });
  }

  // ------------------------------------------------------------ file statici
  let rel = decodeURIComponent(p === '/' ? '/index.html' : p);
  const file = path.normalize(path.join(DIR_APP, rel));
  if (!file.startsWith(DIR_APP)) { res.writeHead(403); return res.end('Accesso negato'); }
  fs.readFile(file, (err, dati) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('File non trovato: ' + rel); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(dati);
  });
});

server.listen(PORTA, HOST, () => {
  console.log('');
  console.log('  FIDA EDILE - Gestione Cantieri');
  console.log('  ------------------------------');
  console.log('  Apri nel browser:  http://localhost:' + PORTA);
  if (inRete) {
    const ifs = os.networkInterfaces();
    Object.keys(ifs).forEach(n => ifs[n].forEach(i => { if (i.family === 'IPv4' && !i.internal) console.log('  Dagli altri PC:    http://' + i.address + ':' + PORTA); }));
  }
  console.log('  Dati:              ' + FILE_DB);
  console.log('  Accesso:           ' + (AUTENTICAZIONE ? 'protetto da utente e password' : 'libero (nessuna password)'));
  console.log('  Backup giornalieri:' + ' ' + DIR_BACKUP);
  console.log('');
  console.log('  Lascia aperta questa finestra. Per chiudere: Ctrl+C');
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error('La porta ' + PORTA + ' è già in uso. Forse il server è già avviato? Altrimenti usa: node server.js --porta 9000');
  else console.error(e);
  process.exit(1);
});
