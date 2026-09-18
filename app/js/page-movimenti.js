/* FIDA EDILE – Movimenti: archivio cronologico unico + dashboard di periodo */
(function () {
  'use strict';
  const esc = UI.esc;
  const CAMPI = ['commessaId', 'data', 'tipo', 'numeroDocumento', 'descrizione', 'sal', 'fatturatoLordo', 'ritenuta', 'svincolo', 'ore', 'perditaSal', 'note'];
  // Valori del movimento: quali compaiono nella maschera dipende dal tipo scelto (Engine.CAMPI_TIPO).
  const VALORI = ['sal', 'fatturatoLordo', 'ritenuta', 'svincolo', 'fatturatoNetto', 'ore', 'perditaSal'];
  const ADDENDI_NETTO = ['fatturatoLordo', 'ritenuta', 'svincolo'];
  const NOMI_VALORE = { sal: 'SAL maturato', fatturatoLordo: 'fatturato lordo', ritenuta: 'ritenuta', svincolo: 'svincolo ritenuta', ore: 'ore effettive', perditaSal: 'perdita SAL accettata' };
  // campi di un tipo: i suoi, più il fatturato netto se se ne vede almeno un addendo (è un calcolo, non un dato)
  function campiDelTipo(tipo) {
    const campi = Engine.CAMPI_TIPO[tipo] || [];
    return ADDENDI_NETTO.some(c => campi.indexOf(c) >= 0) ? campi.concat(['fatturatoNetto']) : campi.slice();
  }
  const D = { commessaId: '', meseDa: 1, meseA: 12 };
  const F = { testo: '', tipo: '', anno: null, annullati: false, commessaId: '' };

  const Movimenti = {
    apriForm(id, opt) {
      opt = opt || {};
      const esistente = id ? Store.db.movimenti.find(m => m.id === id) : null;
      if (!Store.puo(esistente ? 'movimento.modifica' : 'movimento.crea')) return UI.permessoNegato();
      if (esistente && esistente.annullato) return UI.toast('Il movimento è annullato e non può essere modificato.', 'errore');
      const anno = Store.db.parametri.annoGestione;
      const m = esistente ? JSON.parse(JSON.stringify(esistente)) : Object.assign(Schema.nuovoMovimento(), { commessaId: opt.commessaId || '', data: Engine.annoDi(Fmt.oggi()) === anno ? Fmt.oggi() : anno + '-12-31' });
      const corpo = '<form id="form-mov" onsubmit="return false">' +
        '<fieldset><legend>Commessa</legend><div class="campo"><label class="req">Commessa (codice | cliente | cantiere)</label><div id="mov-combo"></div></div></fieldset>' +
        '<fieldset><legend>Evento</legend><div class="form-griglia">' +
        UI.campo({ nome: 'data', etichetta: 'Data movimento', tipo: 'date', req: true, aiuto: 'Obbligatoria, nell\'esercizio ' + anno + '. Tutte le dashboard temporali usano questa data.' }, m.data) +
        UI.campo({ nome: 'tipo', etichetta: 'Tipo movimento', tipo: 'select', req: true, opzioni: Engine.TIPI_MOVIMENTO, vuotoTesto: 'Seleziona…' }, m.tipo) +
        UI.campo({ nome: 'numeroDocumento', etichetta: 'Numero documento' }, m.numeroDocumento) +
        UI.campo({ nome: 'descrizione', etichetta: 'Descrizione', classe: 'doppio' }, m.descrizione) +
        '</div><div class="aiuto" id="mov-hint" style="margin-top:6px;font-size:12px;color:var(--testo2)"></div></fieldset>' +
        '<fieldset><legend>Valori dell\'evento</legend><div class="msg info" id="mov-scegli-tipo">Scegli il <b>tipo movimento</b> qui sopra: compariranno solo i valori che lo riguardano.</div><div class="form-griglia">' +
        UI.campo({ nome: 'sal', etichetta: 'SAL maturato (€)', tipo: 'euro' }, m.sal) +
        UI.campo({ nome: 'fatturatoLordo', etichetta: 'Fatturato lordo (€)', tipo: 'euro' }, m.fatturatoLordo) +
        UI.campo({ nome: 'ritenuta', etichetta: 'Ritenuta maturata (€)', tipo: 'euro' }, m.ritenuta) +
        UI.campo({ nome: 'svincolo', etichetta: 'Svincolo ritenuta (€)', tipo: 'euro' }, m.svincolo) +
        UI.campo({ nome: 'fatturatoNetto', etichetta: 'Fatturato netto (€)', tipo: 'sola', html: Fmt.euro(Engine.fatturatoNetto(m)) }) +
        UI.campo({ nome: 'ore', etichetta: 'Ore effettive', tipo: 'ore', step: '0.5' }, m.ore) +
        UI.campo({ nome: 'perditaSal', etichetta: 'Perdita SAL accettata (€)', tipo: 'euro' }, m.perditaSal) +
        '</div><div class="aiuto" id="mov-netto-nota" style="margin-top:6px">Fatturato netto = fatturato lordo − ritenuta + svincolo (calcolato automaticamente).</div></fieldset>' +
        '<fieldset><legend>Note</legend>' + UI.campo({ nome: 'note', etichetta: 'Note', tipo: 'textarea', classe: 'largo' }, m.note) + '</fieldset></form>';
      let combo;
      UI.modale({
        titolo: esistente ? 'Modifica movimento' : 'Nuovo movimento', corpo,
        pulsanti: [{
          testo: 'Salva', classe: 'primario', async azione(mm) {
            const v = UI.leggiForm(mm.el.querySelector('#form-mov'));
            delete v.fatturatoNetto;
            const nuovo = Object.assign({}, m, v, { commessaId: combo.valore });
            const row = nuovo.commessaId ? Engine.calcolaCommessa(Store.commessa(nuovo.commessaId), Store.db) : null;
            nuovo._svincoloPrecedente = esistente ? Engine.num(esistente.svincolo) : 0;
            await UI.salvaConControlli(mm, {
              valida: () => Engine.validaMovimento(nuovo, Store.db, row),
              salva: async () => {
                delete nuovo._svincoloPrecedente;
                await Store.salva(db => {
                  const rif = Store.etichetta(nuovo.commessaId) + ' · ' + Fmt.data(nuovo.data) + ' · ' + nuovo.tipo;
                  if (esistente) {
                    const cur = db.movimenti.find(x => x.id === esistente.id);
                    const mod = Store.diff(cur, nuovo, CAMPI);
                    CAMPI.forEach(k => { cur[k] = nuovo[k]; });
                    cur.modificatoIl = new Date().toISOString();
                    if (mod.length) { Store.log(db, 'movimento', cur.id, rif, 'MODIFICA MOVIMENTO', mod); Store.toccaCommessa(db, cur.commessaId); }
                  } else {
                    nuovo.creatoIl = new Date().toISOString(); nuovo.creatoDa = Store.utente.nome;
                    db.movimenti.push(nuovo);
                    Store.log(db, 'movimento', nuovo.id, rif, 'NUOVO MOVIMENTO', Store.diff(null, nuovo, CAMPI));
                    Store.toccaCommessa(db, nuovo.commessaId);
                  }
                });
                UI.toast('Movimento salvato.');
                if (opt.onSalvato) opt.onSalvato();
              }
            });
          }
        }],
        onMount(mm) {
          const form = mm.el.querySelector('#form-mov');
          combo = UI.comboCommessa(form.querySelector('#mov-combo'), { valore: m.commessaId });
          const selTipo = form.querySelector('#f-tipo');
          const riquadro = n => { const el = form.querySelector('#f-' + n); return el ? el.closest('.campo') : null; };
          // il fatturato netto è uno <span> calcolato: non ha un valore da leggere né da svuotare
          const haValore = n => { const el = form.querySelector('#f-' + n); return !!(el && 'value' in el && String(el.value).trim() !== ''); };

          // Mostra i soli valori che riguardano il tipo scelto.
          // Cambiando tipo, i valori non più pertinenti si svuotano prima di sparire: se restassero,
          // verrebbero salvati pur non essendo più visibili.
          // All'apertura invece non si svuota nulla: un movimento già registrato che contiene un valore
          // fuori dal suo tipo lo tiene in vista, altrimenti sparirebbe dagli occhi restando nell'archivio.
          function mostraValori(cambioTipo) {
            const t = selTipo.value;
            const generico = !!t && !(Engine.CAMPI_TIPO[t] || []).length;      // ALTRO: nessun campo tipico
            const perti = !t ? [] : (generico ? VALORI.slice() : campiDelTipo(t));
            if (cambioTipo) VALORI.forEach(n => {
              if (n === 'fatturatoNetto' || perti.indexOf(n) >= 0) return;
              const el = form.querySelector('#f-' + n);
              if (el && 'value' in el) el.value = '';
            });
            const superstiti = VALORI.filter(n => n !== 'fatturatoNetto' && perti.indexOf(n) < 0 && haValore(n));
            const visibili = perti.concat(superstiti);
            if (visibili.indexOf('fatturatoNetto') < 0 && ADDENDI_NETTO.some(c => visibili.indexOf(c) >= 0)) visibili.push('fatturatoNetto');
            VALORI.forEach(n => { const b = riquadro(n); if (b) b.hidden = visibili.indexOf(n) < 0; });
            form.querySelector('#mov-scegli-tipo').hidden = !!t;
            form.querySelector('#mov-netto-nota').hidden = visibili.indexOf('fatturatoNetto') < 0;
            form.querySelector('#mov-hint').textContent = !t ? ''
              : (generico ? 'Tipo generico: sono disponibili tutti i valori, si compilano quelli pertinenti.'
                : 'Per "' + t + '" si compila: ' + Engine.CAMPI_TIPO[t].map(c => NOMI_VALORE[c]).join(', ') + '.') +
                (superstiti.length ? ' Resta in vista anche ' + superstiti.map(c => NOMI_VALORE[c]).join(', ') + ', che il movimento contiene già.' : '');
          }
          const netto = () => { form.querySelector('#f-fatturatoNetto').textContent = Fmt.euro(Engine.fatturatoNetto(UI.leggiForm(form))); };
          selTipo.addEventListener('change', () => mostraValori(true));
          form.addEventListener('input', netto); form.addEventListener('change', netto);
          mostraValori(false); netto();
        }
      });
    },
    async annulla(id) {
      if (!Store.puo('movimento.annulla')) return UI.permessoNegato();
      const m = Store.db.movimenti.find(x => x.id === id); if (!m) return;
      const r = await UI.conferma({ titolo: 'Annulla movimento', pericolo: true, testoConferma: 'Annulla movimento', motivo: 'Motivo dell\'annullamento', motivoObbligatorio: true,
        html: 'Il movimento del <b>' + Fmt.data(m.data) + '</b> (' + esc(m.tipo) + ') per <b>' + esc(Store.etichetta(m.commessaId)) + '</b> verrà <b>annullato</b>: resta visibile nello storico ma esce da tutti i calcoli.' });
      if (!r) return;
      await Store.salva(db => {
        const cur = db.movimenti.find(x => x.id === id); cur.annullato = true; cur.motivoAnnullamento = r.motivo; cur.annullatoIl = new Date().toISOString(); cur.annullatoDa = Store.utente.nome;
        Store.log(db, 'movimento', id, Store.etichetta(cur.commessaId) + ' · ' + Fmt.data(cur.data), 'ANNULLAMENTO MOVIMENTO', [{ campo: 'annullato', prima: false, dopo: true }, { campo: 'motivoAnnullamento', prima: '', dopo: r.motivo }]);
        Store.toccaCommessa(db, cur.commessaId);
      });
      UI.toast('Movimento annullato.');
    },
    async ripristina(id) {
      if (!Store.puo('saldo.modifica')) return UI.permessoNegato();
      await Store.salva(db => { const cur = db.movimenti.find(x => x.id === id); cur.annullato = false; Store.log(db, 'movimento', id, Store.etichetta(cur.commessaId) + ' · ' + Fmt.data(cur.data), 'RIPRISTINO MOVIMENTO', [{ campo: 'annullato', prima: true, dopo: false }]); Store.toccaCommessa(db, cur.commessaId); });
      UI.toast('Movimento ripristinato.');
    },
    colonne(conCommessa) {
      const c = [
        { campo: 'data', titolo: 'Data', fmt: v => Fmt.data(v), classe: 'nowrap' }
      ];
      if (conCommessa) c.push({ campo: 'etichetta', titolo: 'Commessa', fmt: (v, r) => '<a href="#/commessa/' + esc(r.commessaId) + '" class="cod">' + esc(r.codice) + '</a> <span class="muto">|</span> ' + esc(r.cliente) + ' <span class="muto">|</span> ' + esc(r.cantiere), classe: 'desc' });
      return c.concat([
        { campo: 'tipo', titolo: 'Tipo', fmt: v => '<span class="badge neutro">' + esc(v) + '</span>' },
        { campo: 'numeroDocumento', titolo: 'N. doc.' },
        { campo: 'descrizione', titolo: 'Descrizione', classe: 'desc' },
        { campo: 'sal', titolo: 'SAL', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v, { zeroVuoto: true }) },
        { campo: 'fatturatoLordo', titolo: 'Fatt. lordo', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v, { zeroVuoto: true }) },
        { campo: 'ritenuta', titolo: 'Ritenuta', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v, { zeroVuoto: true }) },
        { campo: 'svincolo', titolo: 'Svincolo', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v, { zeroVuoto: true }) },
        { campo: 'fatturatoNetto', titolo: 'Fatt. netto', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v, { zeroVuoto: true }) },
        { campo: 'ore', titolo: 'Ore', tipo: 'n', classe: 'in', fmt: v => Fmt.ore(v, { zeroVuoto: true }) },
        { campo: 'perditaSal', titolo: 'Perdita SAL', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v, { zeroVuoto: true }) },
        { campo: 'note', titolo: 'Note', classe: 'desc piccolo', fmt: (v, r) => esc(v || '') + (r.annullato ? '<div class="muto">Annullato: ' + esc(r.motivoAnnullamento || '') + '</div>' : '') },
        { campo: 'azioni', titolo: '', ord: false, classe: 'azioni-riga no-barra', fmt: (v, r) => r.annullato ? (Store.puo('saldo.modifica') ? '<button type="button" data-azione="ripristina" data-id="' + esc(r.id) + '">Ripristina</button>' : '') :
          ((Store.puo('movimento.modifica') && r.anno === Store.db.parametri.annoGestione ? '<button type="button" data-azione="modifica" data-id="' + esc(r.id) + '">Modifica</button>' : '') + (Store.puo('movimento.annulla') ? '<button type="button" class="pericolo" data-azione="annulla" data-id="' + esc(r.id) + '">Annulla</button>' : '')) }
      ]);
    },
    righe(filtro) {
      return Store.db.movimenti.filter(filtro || (() => true)).map(m => {
        const c = Store.commessa(m.commessaId) || {};
        return Object.assign({}, m, { codice: c.codice || '?', cliente: c.cliente || '', cantiere: c.cantiere || '', etichetta: Engine.etichetta(c), fatturatoNetto: Engine.fatturatoNetto(m), anno: Engine.annoDi(m.data) });
      });
    },
    azione(az, id) {
      if (az === 'modifica') Movimenti.apriForm(id);
      else if (az === 'annulla') Movimenti.annulla(id);
      else if (az === 'ripristina') Movimenti.ripristina(id);
    },
    COLONNE_EXPORT: [
      { titolo: 'Data', valore: r => Fmt.data(r.data) }, { titolo: 'Codice', campo: 'codice' }, { titolo: 'Cliente', campo: 'cliente' }, { titolo: 'Cantiere', campo: 'cantiere' },
      { titolo: 'Tipo', campo: 'tipo' }, { titolo: 'N. documento', campo: 'numeroDocumento' }, { titolo: 'Descrizione', campo: 'descrizione' },
      { titolo: 'SAL maturato', campo: 'sal' }, { titolo: 'Fatturato lordo', campo: 'fatturatoLordo' }, { titolo: 'Ritenuta', campo: 'ritenuta' }, { titolo: 'Svincolo', campo: 'svincolo' },
      { titolo: 'Fatturato netto', campo: 'fatturatoNetto' }, { titolo: 'Ore', campo: 'ore' }, { titolo: 'Perdita SAL accettata', campo: 'perditaSal' }, { titolo: 'Note', campo: 'note' },
      { titolo: 'Annullato', valore: r => r.annullato ? 'SI' : '' }, { titolo: 'Motivo annullamento', campo: 'motivoAnnullamento' }
    ]
  };
  window.Movimenti = Movimenti;

  UI.registra('movimenti', function (cont) {
    const P = Store.db.parametri;
    if (F.anno === null) F.anno = P.annoGestione;
    const anni = Array.from(new Set(Store.db.movimenti.map(m => Engine.annoDi(m.data)).filter(x => x).concat([P.annoGestione]))).sort((a, b) => b - a);
    const mesiOpz = sel => Engine.MESI.map((n, i) => '<option value="' + (i + 1) + '"' + (sel === i + 1 ? ' selected' : '') + '>' + n + '</option>').join('');
    const comOpz = sel => Commesse.opzioniSelect(true).map(o => '<option value="' + esc(o.v) + '"' + (o.v === sel ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('');
    cont.innerHTML = UI.testata('Movimenti ' + esc(P.annoGestione), 'Archivio cronologico unico: una registrazione = un evento datato. La dashboard considera solo i movimenti dell\'anno, i saldi iniziali restano esclusi.',
      (Store.puo('movimento.crea') ? '<button type="button" class="primario" id="btn-nuovo-mov">+ Nuovo movimento</button>' : '') + UI.pulsanteEsporta('mov')) +
      '<div class="pannello"><h2>Dashboard di periodo</h2><div class="filtri" id="mov-dash">' +
      '<div class="campo largo"><label>Commessa</label><select class="in" name="commessaId">' + comOpz(D.commessaId) + '</select></div>' +
      '<div class="campo"><label>Mese iniziale</label><select class="in" name="meseDa">' + mesiOpz(D.meseDa) + '</select></div>' +
      '<div class="campo"><label>Mese finale</label><select class="in" name="meseA">' + mesiOpz(D.meseA) + '</select></div>' +
      '</div><div id="mov-kpi"></div></div>' +
      '<div class="pannello compatto"><div class="filtri" id="mov-filtri">' +
      '<div class="campo largo"><label>Ricerca</label><input type="search" class="in" name="testo" value="' + esc(F.testo) + '" placeholder="codice, cliente, cantiere, descrizione, documento"></div>' +
      '<div class="campo"><label>Tipo</label><select class="in" name="tipo"><option value="">Tutti</option>' + Engine.TIPI_MOVIMENTO.map(t => '<option' + (F.tipo === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>' +
      '<div class="campo"><label>Anno</label><select class="in" name="anno">' + anni.map(a => '<option value="' + a + '"' + (+F.anno === a ? ' selected' : '') + '>' + a + (a !== P.annoGestione ? ' (storico)' : '') + '</option>').join('') + '</select></div>' +
      '<div class="campo"><label>Annullati</label><label style="text-transform:none;font-size:13px;margin-top:6px"><input type="checkbox" name="annullati"' + (F.annullati ? ' checked' : '') + '> mostra annullati</label></div>' +
      '<div class="campo"><label>&nbsp;</label><span class="pill" id="mov-conta"></span></div></div></div>' +
      UI.legenda() + '<div id="mov-tab"></div>';

    function aggiornaDash() {
      const d = Engine.dashboardMovimenti(Store.db, { commessaId: D.commessaId || null, meseDa: +D.meseDa, meseA: +D.meseA });
      const periodo = Engine.MESI[D.meseDa - 1] + (D.meseDa !== D.meseA ? ' – ' + Engine.MESI[D.meseA - 1] : '') + ' ' + P.annoGestione;
      document.getElementById('mov-kpi').innerHTML = (+D.meseDa > +D.meseA ? '<div class="msg avviso">Il mese iniziale è successivo al mese finale: periodo non valido.</div>' : '') +
        '<div class="kpi-griglia">' + UI.kpi('SAL del periodo', Fmt.euro(d.sal), { sub: periodo }) + UI.kpi('Fatturato lordo', Fmt.euro(d.fatturatoLordo)) + UI.kpi('Ritenute maturate', Fmt.euro(d.ritenute)) +
        UI.kpi('Ritenute svincolate', Fmt.euro(d.svincoli)) + UI.kpi('Fatturato netto', Fmt.euro(d.fatturatoNetto)) + UI.kpi('Ore', Fmt.ore(d.ore)) + UI.kpi('Perdite SAL accettate', Fmt.euro(d.perditeSal), { colore: d.perditeSal > 0 ? 'rosso' : '' }) +
        UI.kpi('Costi diretti del periodo', Fmt.euro(d.costiDiretti), { sub: d.nCosti + ' registrazioni' }) + '</div>';
    }
    function aggiornaTab() {
      let r = Movimenti.righe(m => Engine.annoDi(m.data) === +F.anno && (F.annullati || !m.annullato));
      if (F.tipo) r = r.filter(x => x.tipo === F.tipo);
      r = UI.ricerca(r, F.testo, ['codice', 'cliente', 'cantiere', 'descrizione', 'numeroDocumento', 'note', 'tipo']);
      const att = r.filter(x => !x.annullato);
      const sum = f => att.reduce((t, x) => t + Engine.num(x[f]), 0);
      document.getElementById('mov-conta').textContent = r.length + ' movimenti';
      const t = document.getElementById('mov-tab');
      t.innerHTML = UI.tabella('mov', { colonne: Movimenti.colonne(true), righe: r, chiave: 'id', ordine: { campo: 'data', dir: 'desc' }, classeRiga: x => x.annullato ? 'annullato' : '', vuoto: 'Nessun movimento per i criteri selezionati.', onAzione: Movimenti.azione,
        totali: { data: 'Totale (' + att.length + ')', sal: Fmt.euro(sum('sal')), fatturatoLordo: Fmt.euro(sum('fatturatoLordo')), ritenuta: Fmt.euro(sum('ritenuta')), svincolo: Fmt.euro(sum('svincolo')), fatturatoNetto: Fmt.euro(sum('fatturatoNetto')), ore: Fmt.ore(sum('ore')), perditaSal: Fmt.euro(sum('perditaSal')) } });
      UI.legaTabelle(t);
    }
    const dash = document.getElementById('mov-dash');
    dash.addEventListener('change', () => { dash.querySelectorAll('[name]').forEach(el => { D[el.name] = el.name === 'commessaId' ? el.value : +el.value; }); aggiornaDash(); });
    const fil = document.getElementById('mov-filtri');
    const onCambio = UI.debounce(() => { fil.querySelectorAll('[name]').forEach(el => { F[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); aggiornaTab(); }, 150);
    fil.addEventListener('input', onCambio); fil.addEventListener('change', onCambio);
    const bn = document.getElementById('btn-nuovo-mov'); if (bn) bn.onclick = () => Movimenti.apriForm(null);
    const be = cont.querySelector('[data-esporta="mov"]'); if (be) be.onclick = () => UI.esportaCsv('movimenti_' + F.anno, UI.righeOrdinate('mov'), Movimenti.COLONNE_EXPORT);
    aggiornaDash(); aggiornaTab();
  });
})();
