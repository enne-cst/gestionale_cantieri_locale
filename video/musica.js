/*
 * Video Gestione Cantieri – colonna sonora.
 *
 *   node musica.js
 *
 * Genera public/musica.wav con una sintesi fatta qui dentro, senza campioni né file esterni:
 * il brano è quindi originale e libero da diritti.
 *
 * Suoni volutamente morbidi: piano elettrico, basso rotondo, una melodia a «kalimba», cassa
 * ovattata, schiocco di dita e shaker. Niente onde aspre, niente rumori che salgono, niente piatti.
 * Giro di accordi: La minore 7 – Fa maggiore 7 – Do – Sol.
 *
 * Il brano segue il montaggio, letto da src/Promo.jsx:
 *   fino alle funzionalità   accordi tenuti, poi basso e shaker, poi la melodia accennata
 *   funzionalità             ritmo completo e melodia; ogni funzionalità dura due misure esatte
 *   vantaggi                 si ferma la batteria, restano piano e melodia
 *   chiusura                 accordo finale di Do che sfuma
 *
 * Per cambiarlo: GIRO per gli accordi, TEMA per la melodia, i livelli accanto a ogni strumento.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FREQ = 44100;
const TAU = 2 * Math.PI;

// ---------------------------------------------------------------- tempi del video
// Legge l'elenco delle scene da Promo.jsx: nome del componente, inizio e durata in secondi.
function sceneDelVideo() {
  const src = fs.readFileSync(path.join(__dirname, 'src', 'Promo.jsx'), 'utf8');
  const blocco = src.slice(src.indexOf('const SCENE'), src.indexOf('export const DURATA'));
  const nFunzioni = (src.match(/numero: '\d+'/g) || []).length;
  const scene = []; let t = 0;
  blocco.split('\n').forEach(riga => {
    const m = riga.match(/durata: s\(([\d.]+)\), el: <(\w+)/);
    if (!m) return;
    const volte = riga.includes('FUNZIONI.map') ? nFunzioni : 1;
    for (let k = 0; k < volte; k++) { scene.push({ nome: m[2], inizio: t, durata: parseFloat(m[1]) }); t += parseFloat(m[1]); }
  });
  if (!scene.length) throw new Error('Scene non riconosciute in src/Promo.jsx');
  return { scene, durata: t };
}
const { scene, durata: DURATA } = sceneDelVideo();
const inizioDi = nome => { const s = scene.find(x => x.nome === nome); if (!s) throw new Error('Scena «' + nome + '» non trovata'); return s.inizio; };
const T_FUNZIONI = inizioDi('Funzione'), T_VANTAGGI = inizioDi('Vantaggi'), T_CHIUSURA = inizioDi('Chiusura');

const MISURA = scene.find(x => x.nome === 'Funzione').durata / 2;   // una funzionalità = due misure
const SEDICESIMO = MISURA / 16;
const BPM = 240 / MISURA;
// la griglia delle misure è ancorata all'inizio delle funzionalità: lì cade sempre un battere
const SFASO = T_FUNZIONI % MISURA;
const MIS_VIA = Math.round((T_FUNZIONI - SFASO) / MISURA);

const N = Math.ceil(DURATA * FREQ);
const base = [new Float32Array(N), new Float32Array(N)];     // piano, basso, batteria
const canto = [new Float32Array(N), new Float32Array(N)];    // melodia: riceve l'eco

const nota = semitoniDaLa4 => 440 * Math.pow(2, semitoniDaLa4 / 12);
let seme = 20261010;                                          // rumore ripetibile: il file esce sempre identico
const rumore = () => { seme = (seme * 1664525 + 1013904223) >>> 0; return seme / 2147483648 - 1; };

function scrivi(gruppo, inizio, durata, pan, onda) {
  const i0 = Math.max(0, Math.floor(inizio * FREQ)), i1 = Math.min(N, Math.floor((inizio + durata) * FREQ));
  const gs = Math.cos((pan + 1) * Math.PI / 4), gd = Math.sin((pan + 1) * Math.PI / 4);
  for (let i = i0; i < i1; i++) {
    const v = onda((i - i0) / FREQ);
    gruppo[0][i] += v * gs; gruppo[1][i] += v * gd;
  }
}

// ---------------------------------------------------------------- strumenti
// Piano elettrico: una sinusoide «colorata» da un'altra che si spegne in fretta (attacco a campanello, coda calda).
function piano(t0, semitoni, durata, livello, pan) {
  const f = nota(semitoni);
  scrivi(base, t0, durata + 0.25, pan, t => {
    const inv = Math.min(1, t / 0.005) * Math.exp(-t * 1.6) * (t < durata ? 1 : Math.exp(-(t - durata) * 18));
    const colore = (1.6 * Math.exp(-t * 7) + 0.25) * Math.sin(TAU * f * t);
    const tremolo = 1 + 0.08 * Math.sin(TAU * 4.5 * t);
    return inv * tremolo * livello * (Math.sin(TAU * f * t + colore) + 0.5 * Math.sin(TAU * f * 1.003 * t));
  });
}
// Basso rotondo: quasi solo la fondamentale.
function basso(t0, semitoni, durata, livello) {
  const f = nota(semitoni);
  scrivi(base, t0, durata, 0, t => {
    const inv = Math.min(1, t / 0.012) * Math.min(1, (durata - t) / 0.04) * Math.exp(-t * 1.8);
    return inv * livello * (Math.sin(TAU * f * t) + 0.18 * Math.sin(TAU * 2 * f * t));
  });
}
// Kalimba: nota pizzicata, con un armonico alto che dura un istante.
function kalimba(t0, semitoni, livello, pan) {
  const f = nota(semitoni);
  scrivi(canto, t0, 1.1, pan, t => {
    const inv = Math.min(1, t / 0.003);
    return inv * livello * (Math.exp(-t * 4.5) * Math.sin(TAU * f * t) + 0.35 * Math.exp(-t * 9) * Math.sin(TAU * 2 * f * t) + 0.22 * Math.exp(-t * 28) * Math.sin(TAU * 5.4 * f * t));
  });
}
function cassa(t0, livello) {
  scrivi(base, t0, 0.3, 0, t => livello * Math.exp(-t * 13) * Math.sin(TAU * (48 * t + (70 / 24) * (1 - Math.exp(-24 * t)))));
}
// Schiocco di dita: un soffio di rumore smorzato più un colpetto intonato.
function schiocco(t0, livello) {
  let filtro = 0;
  scrivi(base, t0, 0.09, 0.15, t => {
    filtro += 0.35 * (rumore() - filtro);                     // passa-basso: toglie il sibilo
    return livello * (Math.exp(-t * 55) * filtro * 2.2 + 0.5 * Math.exp(-t * 70) * Math.sin(TAU * 1500 * t) * Math.exp(-t * 40));
  });
}
function shaker(t0, livello) {
  let filtro = 0, prec = 0;
  scrivi(base, t0, 0.07, -0.3, t => {
    filtro += 0.5 * (rumore() - filtro); const v = filtro - prec; prec = filtro;
    return livello * Math.min(1, t / 0.006) * Math.exp(-t * 55) * v * 3;
  });
}

// ---------------------------------------------------------------- partitura
// accordi come semitoni rispetto al La4: nota del basso e quattro voci
const GIRO = [
  { basso: -24, voci: [-12, -9, -5, -2] },   // La minore 7   (La3 Do4 Mi4 Sol4)
  { basso: -28, voci: [-12, -9, -5, -4] },   // Fa maggiore 7 (La3 Do4 Mi4 Fa4)
  { basso: -21, voci: [-14, -9, -7, -5] },   // Do con la nona (Sol3 Do4 Re4 Mi4)
  { basso: -26, voci: [-14, -10, -7, -2] }   // Sol           (Sol3 Si3 Re4 Sol4)
];
// la melodia: una frase di quattro misure. Ogni nota è [sedicesimo d'inizio, semitoni]
const DO5 = 3, RE5 = 5, MI5 = 7, SOL5 = 10, LA5 = 12, LA4 = 0;
const TEMA = [
  [[0, MI5], [3, MI5], [6, RE5], [8, DO5], [12, LA4]],
  [[0, DO5], [3, DO5], [6, RE5], [8, MI5], [14, RE5]],
  [[0, SOL5], [3, SOL5], [6, MI5], [8, RE5], [12, DO5]],
  [[0, RE5], [3, RE5], [6, MI5], [8, RE5], [14, SOL5]]
];
const prima = t => t < T_CHIUSURA - 0.02;                    // quello che cadrebbe nella chiusura non si suona

// eventuale attesa prima della prima misura intera: un accordo tenuto
if (SFASO > 0.05) GIRO[3].voci.forEach((s, k) => piano(0, s, SFASO, 0.05, (k - 1.5) * 0.4));

for (let m = 0; SFASO + m * MISURA < T_CHIUSURA; m++) {
  const t0 = SFASO + m * MISURA, acc = GIRO[m % GIRO.length];
  const pieno = m >= MIS_VIA && t0 < T_VANTAGGI - 0.02;
  const vantaggi = t0 >= T_VANTAGGI - 0.02;
  const avvio = m < MIS_VIA;
  const quantoAvvio = avvio ? m / Math.max(1, MIS_VIA) : 1;  // 0 all'inizio, 1 al «via»: il brano cresce piano

  // ---- piano elettrico: accordo tenuto nelle parti calme, ritmo 3+3+2 quando il brano è pieno
  const colpi = pieno ? [[0, 5.5], [6, 5.5], [12, 3.5]] : (avvio && quantoAvvio >= 0.5 ? [[0, 11.5], [12, 3.5]] : [[0, 15.5]]);
  colpi.forEach(([p, d], k) => {
    const t = t0 + p * SEDICESIMO; if (!prima(t)) return;
    acc.voci.forEach((s, v) => piano(t, s, Math.min(d * SEDICESIMO, T_CHIUSURA - t), (pieno ? 0.062 : 0.055) * (k === 0 ? 1 : 0.85), (v - 1.5) * 0.4));
  });

  // ---- basso: dalla seconda coppia di misure in poi
  if (m >= 2 && !vantaggi) {
    const frase = pieno ? [[0, 5, 0], [6, 5, 0], [12, 2, 0], [14, 2, 12]] : [[0, 10, 0], [12, 4, 0]];
    frase.forEach(([p, d, ottava]) => { const t = t0 + p * SEDICESIMO; if (prima(t)) basso(t, acc.basso + ottava, d * SEDICESIMO, pieno ? 0.2 : 0.15); });
  } else if (vantaggi) {
    basso(t0, acc.basso, Math.min(MISURA, T_CHIUSURA - t0), 0.14);
  }

  // ---- melodia: accennata (solo le note principali) nella seconda metà dell'avvio, intera poi
  const frase = TEMA[m % TEMA.length];
  if (pieno || vantaggi) frase.forEach(([p, s], k) => { const t = t0 + p * SEDICESIMO; if (prima(t)) kalimba(t, s, vantaggi ? 0.1 : 0.13, k % 2 ? 0.25 : -0.15); });
  else if (quantoAvvio >= 0.5) frase.filter(([p]) => p % 8 === 0).forEach(([p, s]) => kalimba(t0 + p * SEDICESIMO, s, 0.08, 0.1));
  // nella parte piena, ogni quattro misure una risposta un'ottava sopra
  if (pieno && m % 4 === 3) [[10, LA5], [12, SOL5]].forEach(([p, s]) => kalimba(t0 + p * SEDICESIMO, s, 0.06, 0.4));

  // ---- batteria
  if (m >= 2 && !vantaggi) for (let o = 0; o < 8; o++) shaker(t0 + o * 2 * SEDICESIMO, (o % 2 ? 0.05 : 0.03) * (pieno ? 1 : 0.6 + 0.4 * quantoAvvio));
  if (pieno) {
    [0, 4, 8, 12].forEach(p => cassa(t0 + p * SEDICESIMO, 0.3));
    [4, 12].forEach(p => schiocco(t0 + p * SEDICESIMO, 0.11));
  } else if (avvio && quantoAvvio >= 0.5) {
    [0, 8].forEach(p => cassa(t0 + p * SEDICESIMO, 0.2));
    schiocco(t0 + 12 * SEDICESIMO, 0.07);
  } else if (vantaggi) {
    [4, 12].forEach(p => { const t = t0 + p * SEDICESIMO; if (prima(t)) schiocco(t, 0.07); });
  }
}

// ---- chiusura: accordo di Do tenuto, basso e una nota di melodia che lo conclude
{
  const resto = DURATA - T_CHIUSURA;
  [-14, -9, -7, -5, -2].forEach((s, v) => piano(T_CHIUSURA, s, resto, 0.07, (v - 2) * 0.35));
  basso(T_CHIUSURA, -21, resto, 0.2);
  cassa(T_CHIUSURA, 0.25);
  kalimba(T_CHIUSURA, DO5, 0.13, 0); kalimba(T_CHIUSURA + 3 * SEDICESIMO, MI5, 0.1, 0.2); kalimba(T_CHIUSURA + 6 * SEDICESIMO, SOL5, 0.1, -0.2);
}

// ---------------------------------------------------------------- missaggio
// eco sulla sola melodia, a un ottavo puntato, incrociata fra i canali
const RIT = Math.floor(SEDICESIMO * 3 * FREQ);
for (let i = RIT; i < N; i++) {
  const s = canto[0][i - RIT], d = canto[1][i - RIT];
  canto[0][i] += d * 0.3; canto[1][i] += s * 0.3;
}
// somma, filtro che smussa gli acuti, dissolvenze di ingresso e di uscita
const mix = [new Float32Array(N), new Float32Array(N)];
const ENTRA = 0.5 * FREQ, ESCE = Math.min(3, DURATA - T_CHIUSURA) * FREQ;
let picco = 0;
for (let c = 0; c < 2; c++) {
  let filtro = 0;
  for (let i = 0; i < N; i++) {
    filtro += 0.55 * (base[c][i] + canto[c][i] - filtro);     // passa-basso dolce, attorno ai 6 kHz
    mix[c][i] = filtro * Math.min(1, i / ENTRA) * Math.min(1, (N - i) / ESCE);
    picco = Math.max(picco, Math.abs(mix[c][i]));
  }
}
const spinta = 1.25 / picco;
const limita = v => Math.tanh(v * spinta) * 0.85;             // arrotonda i pochi picchi più alti

// WAV a 16 bit, stereo
const dati = Buffer.alloc(N * 4);
let somma = 0;
for (let i = 0; i < N; i++) {
  const a = limita(mix[0][i]), b = limita(mix[1][i]);
  dati.writeInt16LE(Math.round(a * 32767), i * 4);
  dati.writeInt16LE(Math.round(b * 32767), i * 4 + 2);
  somma += a * a + b * b;
}
const testa = Buffer.alloc(44);
testa.write('RIFF', 0); testa.writeUInt32LE(36 + dati.length, 4); testa.write('WAVE', 8);
testa.write('fmt ', 12); testa.writeUInt32LE(16, 16); testa.writeUInt16LE(1, 20); testa.writeUInt16LE(2, 22);
testa.writeUInt32LE(FREQ, 24); testa.writeUInt32LE(FREQ * 4, 28); testa.writeUInt16LE(4, 32); testa.writeUInt16LE(16, 34);
testa.write('data', 36); testa.writeUInt32LE(dati.length, 40);
fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'public', 'musica.wav'), Buffer.concat([testa, dati]));
console.log('  musica.wav: ' + DURATA.toFixed(1) + ' s a ' + BPM.toFixed(1) + ' bpm · funzionalità da ' + T_FUNZIONI + ' s (misura ' + MIS_VIA +
  '), vantaggi da ' + T_VANTAGGI + ' s, chiusura da ' + T_CHIUSURA + ' s · livello medio ' + (20 * Math.log10(Math.sqrt(somma / (2 * N)))).toFixed(1) + ' dB');
