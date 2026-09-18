/* FIDA EDILE – Registro modifiche (tracciabilità) */
(function () {
  'use strict';
  const esc = UI.esc;
  const F = { testo: '', entita: '', utente: '', da: '', a: '' };
  const ETI = Schema.ETICHETTE;

  function fmtVal(campo, v) {
    if (v === '' || v === null || v === undefined) return '<span class="muto">vuoto</span>';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return Fmt.data(String(v));
    if (typeof v === 'number') return Fmt.numero(v, 2);
    return esc(String(v).length > 120 ? String(v).slice(0, 120) + '…' : v);
  }
  function modificheHtml(mod) {
    if (!mod || !mod.length) return '<span class="muto">—</span>';
    return '<div class="piccolo">' + mod.slice(0, 12).map(m => '<div><b>' + esc(ETI[m.campo] || m.campo) + '</b>: ' + fmtVal(m.campo, m.prima) + ' → ' + fmtVal(m.campo, m.dopo) + '</div>').join('') + (mod.length > 12 ? '<div class="muto">… e altre ' + (mod.length - 12) + ' variazioni</div>' : '') + '</div>';
  }

  UI.registra('registro', function (cont) {
    const audit = Store.db.audit;
    const entita = Array.from(new Set(audit.map(a => a.entita))).sort();
    const utenti = Array.from(new Set(audit.map(a => a.utente))).sort();
    cont.innerHTML = UI.testata('Registro modifiche', 'Ogni inserimento o modifica importante conserva autore, data, ora, valore precedente e valore nuovo.', UI.pulsanteEsporta('reg')) +
      '<div class="pannello compatto"><div class="filtri" id="reg-filtri">' +
      '<div class="campo largo"><label>Ricerca</label><input type="search" class="in" name="testo" value="' + esc(F.testo) + '" placeholder="riferimento, azione, campo, valore"></div>' +
      '<div class="campo"><label>Entità</label><select class="in" name="entita"><option value="">Tutte</option>' + entita.map(e => '<option' + (F.entita === e ? ' selected' : '') + '>' + esc(e) + '</option>').join('') + '</select></div>' +
      '<div class="campo"><label>Utente</label><select class="in" name="utente"><option value="">Tutti</option>' + utenti.map(e => '<option' + (F.utente === e ? ' selected' : '') + '>' + esc(e) + '</option>').join('') + '</select></div>' +
      '<div class="campo"><label>Dal</label><input type="date" class="in" name="da" value="' + esc(F.da) + '"></div>' +
      '<div class="campo"><label>Al</label><input type="date" class="in" name="a" value="' + esc(F.a) + '"></div>' +
      '<div class="campo"><label>&nbsp;</label><span class="pill" id="reg-conta"></span></div></div></div><div id="reg-tab"></div>';
    const colonne = [
      { campo: 'ts', titolo: 'Data e ora', fmt: v => Fmt.dataOra(v), classe: 'nowrap' },
      { campo: 'utente', titolo: 'Utente', fmt: (v, r) => esc(v) + '<div class="muto piccolo">' + esc(r.ruolo || '') + '</div>' },
      { campo: 'entita', titolo: 'Entità', fmt: v => '<span class="badge neutro">' + esc(v) + '</span>' },
      { campo: 'riferimento', titolo: 'Riferimento', classe: 'desc', fmt: (v, r) => (r.entita === 'commessa' || r.entita === 'budget' || r.entita === 'controllo') && r.entitaId && Store.commessa(r.entitaId) ? '<a href="#/commessa/' + esc(r.entitaId) + '">' + esc(v) + '</a>' : esc(v) },
      { campo: 'azione', titolo: 'Azione' },
      { campo: 'modifiche', titolo: 'Variazioni (prima → dopo)', ord: false, fmt: v => modificheHtml(v) }
    ];
    function aggiorna() {
      let r = audit.slice();
      if (F.entita) r = r.filter(a => a.entita === F.entita);
      if (F.utente) r = r.filter(a => a.utente === F.utente);
      if (F.da) r = r.filter(a => a.ts.slice(0, 10) >= F.da);
      if (F.a) r = r.filter(a => a.ts.slice(0, 10) <= F.a);
      if (F.testo) {
        const q = F.testo.toLowerCase();
        r = r.filter(a => [a.riferimento, a.azione, a.utente].some(x => String(x || '').toLowerCase().includes(q)) || (a.modifiche || []).some(m => [m.campo, ETI[m.campo], m.prima, m.dopo].some(x => String(x ?? '').toLowerCase().includes(q))));
      }
      document.getElementById('reg-conta').textContent = r.length + ' voci';
      const t = document.getElementById('reg-tab');
      t.innerHTML = UI.tabella('reg', { colonne, righe: r, chiave: 'id', ordine: { campo: 'ts', dir: 'desc' }, vuoto: 'Nessuna voce nel registro.' });
      UI.legaTabelle(t);
    }
    const fil = document.getElementById('reg-filtri');
    const onCambio = UI.debounce(() => { fil.querySelectorAll('[name]').forEach(el => { F[el.name] = el.value; }); aggiorna(); }, 150);
    fil.addEventListener('input', onCambio); fil.addEventListener('change', onCambio);
    const be = cont.querySelector('[data-esporta="reg"]'); if (be) be.onclick = () => {
      const righe = [];
      UI.righeOrdinate('reg').forEach(a => { (a.modifiche && a.modifiche.length ? a.modifiche : [{ campo: '', prima: '', dopo: '' }]).forEach(m => righe.push({ ts: Fmt.dataOra(a.ts), utente: a.utente, ruolo: a.ruolo, entita: a.entita, riferimento: a.riferimento, azione: a.azione, campo: ETI[m.campo] || m.campo, prima: m.prima, dopo: m.dopo })); });
      UI.esportaCsv('registro_modifiche', righe, [{ titolo: 'Data e ora', campo: 'ts' }, { titolo: 'Utente', campo: 'utente' }, { titolo: 'Ruolo', campo: 'ruolo' }, { titolo: 'Entità', campo: 'entita' }, { titolo: 'Riferimento', campo: 'riferimento' }, { titolo: 'Azione', campo: 'azione' }, { titolo: 'Campo', campo: 'campo' }, { titolo: 'Valore precedente', campo: 'prima' }, { titolo: 'Valore nuovo', campo: 'dopo' }]);
    };
    aggiorna();
  });
})();
