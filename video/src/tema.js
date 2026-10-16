import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

// Stessi colori e font della brochure (blu e giallo dell'applicazione, Barlow).
export const COLORI = {
  blu: '#1f3a5f',
  bluScuro: '#162b47',
  bluChiaro: '#2c4f80',
  giallo: '#f2c94c',
  carta: '#f6f4ee',
  inchiostro: '#1a2433',
  grigio: '#5b6573'
};
export const TITOLI = 'Barlow Condensed';
export const TESTO = 'Barlow';

[['Barlow', 'barlow', '400'], ['Barlow', 'barlow', '500'], ['Barlow', 'barlow', '600'],
  ['Barlow Condensed', 'barlow-condensed', '600'], ['Barlow Condensed', 'barlow-condensed', '700']]
  .forEach(([family, file, weight]) => loadFont({ family, weight, url: staticFile('fonts/' + file + '-latin-' + weight + '-normal.woff2') }));
