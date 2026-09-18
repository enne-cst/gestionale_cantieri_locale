/*
 * FIDA EDILE – Formattazione italiana e utilità di esportazione.
 */
(function (root) {
  'use strict';
  const VUOTO = '—';
  // Formattazione manuale: separatore migliaia sempre presente (Intl it-IT lo omette sotto 10.000)
  function fmtFisso(v, minDec, maxDec) {
    const neg = v < 0; v = Math.abs(v);
    let s = v.toFixed(maxDec);
    if (maxDec > minDec) s = s.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
    if (minDec > 0 && s.indexOf('.') < 0) s += '.' + '0'.repeat(minDec);
    const p = s.split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + p[0] + (p[1] !== undefined ? ',' + p[1] : '');
  }
  const nfEuro = { format: v => fmtFisso(v, 2, 2) };
  const nfInt = { format: v => fmtFisso(v, 0, 0) };
  const nf2 = { format: v => fmtFisso(v, 0, 2) };

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function euro(v, opt) {
    if (!isNum(v)) return VUOTO;
    if ((opt && opt.zeroVuoto) && Math.abs(v) < 0.005) return VUOTO;
    return nfEuro.format(v) + ' €';
  }
  function numero(v, dec) {
    if (!isNum(v)) return VUOTO;
    if (dec === 0) return nfInt.format(v);
    if (dec === 2) return nfEuro.format(v);
    return nf2.format(v);
  }
  function ore(v, opt) {
    if (!isNum(v)) return VUOTO;
    if ((opt && opt.zeroVuoto) && Math.abs(v) < 0.005) return VUOTO;
    return nf2.format(v) + ' h';
  }
  function pct(v, dec) {
    if (!isNum(v)) return VUOTO;
    const d = dec === undefined ? 1 : dec;
    return fmtFisso(v * 100, d, d) + ' %';
  }
  function giorni(v) { return isNum(v) ? nfInt.format(v) + ' gg' : VUOTO; }
  function data(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return VUOTO;
    return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  }
  function dataOra(isoTs) {
    if (!isoTs) return VUOTO;
    const d = new Date(isoTs);
    if (isNaN(d)) return VUOTO;
    const p = n => String(n).padStart(2, '0');
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function oggi() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function testo(v) { return (v === null || v === undefined || String(v).trim() === '') ? VUOTO : String(v); }

  // Percentuale inserita dall'utente (es. "7" o "7,5") -> frazione (0.07)
  function pctDaInput(s) {
    if (s === null || s === undefined || s === '') return null;
    const n = Number(String(s).replace(',', '.'));
    return isNaN(n) ? null : n / 100;
  }
  function numDaInput(s) {
    if (s === null || s === undefined || String(s).trim() === '') return null;
    const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
    if (!isNaN(n) && /,/.test(String(s))) return n;
    const n2 = Number(String(s));
    return isNaN(n2) ? null : n2;
  }

  // ------------------------------------------------------------ CSV (separatore ; per Excel italiano)
  function csv(righe, colonne) {
    const q = v => {
      if (v === null || v === undefined) return '';
      let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
      if (/[;"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const head = colonne.map(c => q(c.titolo)).join(';');
    const body = righe.map(r => colonne.map(c => q(typeof c.valore === 'function' ? c.valore(r) : r[c.campo])).join(';'));
    return '﻿' + [head].concat(body).join('\r\n');
  }
  function scarica(nomeFile, contenuto, tipo) {
    const blob = new Blob([contenuto], { type: tipo || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nomeFile; document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  }
  function nomeFileData(base, est) {
    return base + '_' + oggi().replace(/-/g, '') + '.' + (est || 'csv');
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  root.Fmt = { VUOTO, euro, numero, ore, pct, giorni, data, dataOra, oggi, testo, pctDaInput, numDaInput, csv, scarica, nomeFileData, esc, isNum };
})(window);
