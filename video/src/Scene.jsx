import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORI, TESTO, TITOLI } from './tema';
import misure from './misure.generato.json';

const fermo = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

// Entrata a molla di un elemento che parte dal fotogramma «da»: restituisce un valore da 0 a 1.
const useEntrata = (da, opzioni) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - da, fps, config: { damping: 200, ...(opzioni || {}) } });
};
// Dissolvenza in uscita negli ultimi fotogrammi della scena.
const useUscita = (durata = 10) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return interpolate(frame, [durationInFrames - durata, durationInFrames], [1, 0], fermo);
};

const Sale = ({ da, distanza = 40, style, children }) => {
  const e = useEntrata(da);
  return <div style={{ opacity: e, transform: `translateY(${(1 - e) * distanza}px)`, ...style }}>{children}</div>;
};

const FondoBlu = ({ children }) => {
  const frame = useCurrentFrame();
  // la fascia diagonale scorre lentamente: dà movimento anche alle scene di solo testo
  const x = interpolate(frame, [0, 300], [0, 120]);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${COLORI.bluScuro} 0%, ${COLORI.blu} 46%, ${COLORI.bluChiaro} 100%)`, color: '#fff', fontFamily: TESTO }}>
      <AbsoluteFill style={{ background: 'linear-gradient(115deg, transparent 0 58%, rgba(255,255,255,.05) 58% 72%, transparent 72%)', transform: `translateX(${x}px)` }} />
      {children}
    </AbsoluteFill>
  );
};

const Marchio = ({ contenuti, piccolo }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: piccolo ? 14 : 22 }}>
    <Img src={staticFile('img/logo.png')} style={{ width: piccolo ? 52 : 84, height: piccolo ? 52 : 84, borderRadius: piccolo ? 10 : 16 }} />
    <div>
      <div style={{ fontFamily: TITOLI, fontWeight: 700, fontSize: piccolo ? 26 : 40, letterSpacing: '.12em', lineHeight: 1 }}>{contenuti.prodotto.marchio}</div>
      <div style={{ fontSize: piccolo ? 17 : 24, opacity: 0.75, marginTop: 4 }}>{contenuti.prodotto.nome}</div>
    </div>
  </div>
);

// Cornice da finestra del browser attorno a una schermata dell'applicazione.
const Finestra = ({ src, larghezza, style }) => (
  <div style={{ width: larghezza, borderRadius: 14, overflow: 'hidden', background: '#fff', boxShadow: '0 30px 80px rgba(8,20,45,.38)', ...style }}>
    <div style={{ height: 34, background: '#e7eaef', display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16 }}>
      {[0, 1, 2].map(i => <div key={i} style={{ width: 11, height: 11, borderRadius: '50%', background: '#b8bfca' }} />)}
    </div>
    <Img src={staticFile(src)} style={{ display: 'block', width: '100%' }} />
  </div>
);

// ------------------------------------------------------------ 1 · apertura
export const Apertura = ({ contenuti }) => {
  const barra = useEntrata(4);
  const uscita = useUscita();
  const righe = contenuti.prodotto.nome.split(' ');
  return (
    <FondoBlu>
      <AbsoluteFill style={{ padding: '110px 130px', opacity: uscita }}>
        <Sale da={0} distanza={20}><Marchio contenuti={contenuti} /></Sale>
        <div style={{ position: 'absolute', left: 0, top: 372, width: 34, height: 300 * barra, background: COLORI.giallo }} />
        <Sale da={10} style={{ marginTop: 150, fontFamily: TITOLI, fontWeight: 600, fontSize: 30, letterSpacing: '.2em', textTransform: 'uppercase', color: COLORI.giallo }}>
          Il gestionale di commessa per le imprese edili
        </Sale>
        <div style={{ fontFamily: TITOLI, fontWeight: 700, fontSize: 210, lineHeight: 0.95, textTransform: 'uppercase', marginTop: 14 }}>
          {righe.map((r, i) => <Sale key={r} da={16 + i * 6} distanza={70}>{r}</Sale>)}
        </div>
        <Sale da={40} style={{ fontFamily: TITOLI, fontWeight: 600, fontSize: 78, color: COLORI.giallo, marginTop: 26 }}>{contenuti.prodotto.slogan}</Sale>
      </AbsoluteFill>
    </FondoBlu>
  );
};

// ------------------------------------------------------------ 2 · il problema
export const Problema = () => {
  const uscita = useUscita();
  const parole = ['Ore.', 'Costi.', 'SAL.', 'Margini.'];
  return (
    <FondoBlu>
      <AbsoluteFill style={{ padding: '0 130px', justifyContent: 'center', opacity: uscita }}>
        <div style={{ display: 'flex', gap: 44, fontFamily: TITOLI, fontWeight: 700, fontSize: 150, textTransform: 'uppercase', lineHeight: 1 }}>
          {parole.map((p, i) => <Sale key={p} da={4 + i * 9} distanza={50}>{p}</Sale>)}
        </div>
        <Sale da={50} style={{ fontSize: 58, marginTop: 44, color: '#d5deea', maxWidth: 1400, lineHeight: 1.25 }}>
          Sparsi in dieci fogli Excel che <span style={{ color: COLORI.giallo, fontWeight: 600 }}>non tornano fra loro?</span>
        </Sale>
      </AbsoluteFill>
    </FondoBlu>
  );
};

// ------------------------------------------------------------ 3 · la dashboard
// La dashboard direzionale scorre dall'alto in basso dentro la finestra, così si vedono tutti gli
// indicatori: stato delle commesse, fatturato, redditività, surplus, utili e l'elenco.
// La barra laterale resta ferma e scorre solo il contenuto, come nell'applicazione vera.
// Le misure (in pixel CSS) delle due schermate le scrive prepara.js in misure.generato.json.
const DASH = misure.dashboard;
export const Panoramica = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const sale = useEntrata(6, { damping: 26, stiffness: 60 });
  const uscita = useUscita();
  const LARGH = 1560, ALTO = 216, BARRA = 34;
  const scala = LARGH / DASH.largo;
  const visibile = 1080 - ALTO - BARRA;
  const corsa = DASH.alto * scala - visibile;
  // un attimo fermi in cima, poi scorrimento regolare, poi fermi in fondo
  const y = interpolate(frame, [40, durationInFrames - 30], [0, corsa], { ...fermo, easing: Easing.inOut(Easing.quad) });
  return (
    <FondoBlu>
      <AbsoluteFill style={{ opacity: uscita }}>
        <div style={{ position: 'absolute', left: 180, top: 46 }}>
          <Sale da={0} style={{ fontFamily: TITOLI, fontWeight: 600, fontSize: 26, letterSpacing: '.2em', textTransform: 'uppercase', color: COLORI.giallo }}>Una pagina sola</Sale>
          <Sale da={5} style={{ fontFamily: TITOLI, fontWeight: 700, fontSize: 76, textTransform: 'uppercase', lineHeight: 1.05, marginTop: 2 }}>Tutte le commesse sotto controllo</Sale>
        </div>
        <div style={{ position: 'absolute', left: (1920 - LARGH) / 2, top: ALTO + (1 - sale) * 800, width: LARGH, height: 1080 - ALTO + 40, borderRadius: '14px 14px 0 0', overflow: 'hidden', background: '#f3f5f8', boxShadow: '0 30px 80px rgba(8,20,45,.45)' }}>
          <div style={{ height: BARRA, background: '#e7eaef', display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ width: 11, height: 11, borderRadius: '50%', background: '#b8bfca' }} />)}
          </div>
          <div style={{ position: 'relative', height: visibile + 40, overflow: 'hidden', background: '#1f3a5f' }}>
            <Img src={staticFile('img/laterale.png')} style={{ position: 'absolute', left: 0, top: 0, width: DASH.laterale * scala }} />
            <div style={{ position: 'absolute', left: DASH.laterale * scala, top: 0, right: 0, bottom: 0, overflow: 'hidden', background: '#f3f5f8' }}>
              <Img src={staticFile('img/dashboard.png')} style={{ display: 'block', width: '100%', transform: `translateY(${-y}px)` }} />
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </FondoBlu>
  );
};

// ------------------------------------------------------------ 4-9 · una funzionalità
export const Funzione = ({ numero, titolo, testo, punti, immagine, inversa }) => {
  const frame = useCurrentFrame();
  const entra = useEntrata(4, { damping: 30, stiffness: 70 });
  const uscita = useUscita(8);
  const zoom = interpolate(frame, [0, 130], [1, 1.045]);
  const LARGH = 1010;
  const lato = inversa ? { left: 100 } : { right: 100 };
  const testoLato = inversa ? { right: 110 } : { left: 120 };
  return (
    <AbsoluteFill style={{ background: COLORI.carta, color: COLORI.inchiostro, fontFamily: TESTO, opacity: uscita }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, width: 14, background: COLORI.giallo, ...(inversa ? { right: 0 } : { left: 0 }) }} />
      <div style={{ position: 'absolute', top: 200, width: 600, ...testoLato }}>
        <Sale da={0} style={{ fontFamily: TITOLI, fontWeight: 700, fontSize: 130, lineHeight: 0.9, color: COLORI.giallo, WebkitTextStroke: `3px ${COLORI.blu}` }}>{numero}</Sale>
        <Sale da={5} style={{ fontFamily: TITOLI, fontWeight: 700, fontSize: 74, lineHeight: 1.02, textTransform: 'uppercase', color: COLORI.blu, marginTop: 22 }}>{titolo}</Sale>
        <Sale da={12} style={{ fontSize: 33, lineHeight: 1.35, marginTop: 26, color: '#2b3644' }}>{testo}</Sale>
        <div style={{ marginTop: 34 }}>
          {punti.map((p, i) => (
            <Sale key={p} da={24 + i * 8} distanza={20} style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 28, fontWeight: 500, marginBottom: 14 }}>
              <div style={{ width: 26, height: 10, background: COLORI.giallo, outline: `2px solid ${COLORI.blu}`, flexShrink: 0 }} />{p}
            </Sale>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', top: 190, ...lato, opacity: entra, transform: `translateX(${(1 - entra) * (inversa ? -120 : 120)}px) scale(${zoom})` }}>
        <Finestra src={immagine} larghezza={LARGH} />
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ 10 · vantaggi
export const Vantaggi = () => {
  const uscita = useUscita();
  const voci = [
    ['Online, ovunque', 'In ufficio o in cantiere: tutti lavorano sugli stessi dati.'],
    ['Niente da installare', 'Funziona con il browser che hai già: Windows, Mac o Linux.'],
    ['Tutto è tracciato', 'Chi ha cambiato che cosa, e quando: nulla si cancella.']
  ];
  return (
    <FondoBlu>
      <AbsoluteFill style={{ padding: '120px 130px', opacity: uscita }}>
        <Sale da={0} style={{ fontFamily: TITOLI, fontWeight: 600, fontSize: 28, letterSpacing: '.2em', textTransform: 'uppercase', color: COLORI.giallo }}>Perché sceglierlo</Sale>
        <Sale da={5} style={{ fontFamily: TITOLI, fontWeight: 700, fontSize: 96, textTransform: 'uppercase', lineHeight: 1.05, marginTop: 6 }}>Pensato per chi i cantieri li fa</Sale>
        <div style={{ display: 'flex', gap: 40, marginTop: 90 }}>
          {voci.map(([t, d], i) => (
            <Sale key={t} da={18 + i * 12} distanza={60} style={{ flex: 1, background: 'rgba(255,255,255,.07)', borderTop: `8px solid ${COLORI.giallo}`, padding: '40px 38px 46px' }}>
              <div style={{ fontFamily: TITOLI, fontWeight: 700, fontSize: 60, color: COLORI.giallo, lineHeight: 1 }}>0{i + 1}</div>
              <div style={{ fontFamily: TITOLI, fontWeight: 700, fontSize: 46, textTransform: 'uppercase', lineHeight: 1.08, marginTop: 18 }}>{t}</div>
              <div style={{ fontSize: 29, lineHeight: 1.35, color: '#d5deea', marginTop: 16 }}>{d}</div>
            </Sale>
          ))}
        </div>
      </AbsoluteFill>
    </FondoBlu>
  );
};

// ------------------------------------------------------------ 11 · chiusura
export const Chiusura = ({ contenuti }) => {
  const barra = useEntrata(14);
  return (
    <FondoBlu>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <Sale da={0} distanza={30}>
          <Img src={staticFile('img/logo.png')} style={{ width: 150, height: 150, borderRadius: 28 }} />
        </Sale>
        <Sale da={8} style={{ fontFamily: TITOLI, fontWeight: 700, fontSize: 40, letterSpacing: '.2em', marginTop: 34 }}>{contenuti.prodotto.marchio}</Sale>
        <Sale da={12} distanza={60} style={{ fontFamily: TITOLI, fontWeight: 700, fontSize: 150, textTransform: 'uppercase', lineHeight: 1, marginTop: 10 }}>{contenuti.prodotto.nome}</Sale>
        <div style={{ width: 260 * barra, height: 12, background: COLORI.giallo, marginTop: 34 }} />
        <Sale da={24} style={{ fontFamily: TITOLI, fontWeight: 600, fontSize: 70, color: COLORI.giallo, marginTop: 34 }}>{contenuti.prodotto.slogan}</Sale>
      </AbsoluteFill>
    </FondoBlu>
  );
};
