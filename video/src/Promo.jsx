import React from 'react';
import { AbsoluteFill, Audio, Series, staticFile } from 'remotion';
import contenuti from './contenuti.generato.json';
import { Apertura, Chiusura, Funzione, Panoramica, Problema, Vantaggi } from './Scene';
import './tema';

export const FPS = 30;
const s = secondi => Math.round(secondi * FPS);

// Le sei funzionalità, nello stesso ordine della brochure. Per cambiare testi o durata basta toccare qui.
const FUNZIONI = [
  { numero: '01', immagine: 'img/preventivo.png', titolo: 'Il prezzo regge? Lo sai prima di firmare',
    testo: 'Ogni preventivo è confrontato con il prezzo minimo sostenibile della tua azienda.',
    punti: ['Esito immediato: congrua o non congrua', 'Ricarico controllato voce per voce', 'L\'offerta accettata diventa commessa'] },
  { numero: '02', immagine: 'img/movimenti.png', titolo: 'SAL, fatture, ore e costi in un solo posto',
    testo: 'Una registrazione per ogni evento del cantiere: i totali si aggiornano da soli.',
    punti: ['Fatturato, ritenute e svincoli allineati', 'Ore valorizzate al costo aziendale', 'Costi diretti per categoria'] },
  { numero: '03', immagine: 'img/gantt.png', titolo: 'Cronoprogramma e ore per fase',
    testo: 'Previsto contro effettivo, fase per fase: date, uomini e ore di manodopera.',
    punti: ['Ritardi evidenziati in rosso', 'Lavori propri e subappalti distinti', 'Le ore del Gantt alimentano il budget'] },
  { numero: '04', immagine: 'img/utile.png', titolo: 'Utile maturato e utile a finire',
    testo: 'Quanto ha reso la commessa fino a oggi, e quanto renderà a lavori conclusi.',
    punti: ['Si aggiorna a ogni movimento', 'Previsione su ore e costi residui', 'Previsto, minimo e consuntivo a confronto'] },
  { numero: '05', immagine: 'img/alert.png', titolo: 'Gli allarmi arrivano da soli',
    testo: 'Il programma segnala che cosa non va, con il motivo scritto in chiaro.',
    punti: ['Commesse in perdita, ore oltre il budget', 'SAL da emettere, ritenute da sbloccare', 'Soglie decise da te'] },
  { numero: '06', immagine: 'img/importa.png', titolo: 'Si parte dal tuo Excel',
    testo: 'Commesse, saldi, movimenti e costi si caricano da un foglio, con anteprima riga per riga.',
    punti: ['Modello pronto da compilare', 'Gli errori vengono fermati e spiegati', 'Ogni modifica resta nel registro'] }
];

const SCENE = [
  { durata: s(4.5), el: <Apertura contenuti={contenuti} /> },
  { durata: s(4), el: <Problema /> },
  { durata: s(9.5), el: <Panoramica /> },
  ...FUNZIONI.map((f, i) => ({ durata: s(4.5), el: <Funzione {...f} inversa={i % 2 === 1} /> })),
  { durata: s(5.5), el: <Vantaggi /> },
  { durata: s(4.5), el: <Chiusura contenuti={contenuti} /> }
];

export const DURATA = SCENE.reduce((t, x) => t + x.durata, 0);

export const Promo = () => (
  <AbsoluteFill style={{ background: '#162b47' }}>
    {/* colonna sonora generata da musica.js: dissolvenze di ingresso e uscita già nel file */}
    <Audio src={staticFile("musica.wav")} volume={0.6} />
    <Series>
      {SCENE.map((x, i) => <Series.Sequence key={i} durationInFrames={x.durata}>{x.el}</Series.Sequence>)}
    </Series>
  </AbsoluteFill>
);
