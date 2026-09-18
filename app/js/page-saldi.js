/* FIDA EDILE – Saldi iniziali (commesse pregresse: cumulativi al 31/12 dell'anno precedente) */
(function () {
  'use strict';
  const esc = UI.esc;
  const CAMPI = ['commessaId', 'anno', 'sal', 'fatturatoLordo', 'ritenute', 'svincoli', 'perditeSal', 'ore', 'costiDiretti', 'note'];
  const D = { commessaId: '' };

  const Saldi = {
    apriForm(id, opt) {
      opt = opt || {};
      const esistente = id ? Store.db.saldi.find(s => s.id === id) : null;
      if (!Store.puo(esistente ? 'saldo.modifica' : 'saldo.crea')) return UI.permessoNegato();
      if (esistente && esistente.annullato) return UI.toast('Il saldo è annullato.', 'errore');
      const anno = Store.db.parametri.annoGestione;
      const s = esistente ? JSON.parse(JSON.stringify(esistente)) : Object.assign(Schema.nuovoSaldo(anno), { commessaId: opt.commessaId || '' });
      const pregresse = Store.commesseAttive().filter(c => Engine.isPregressa(c, anno) && (esistente ? true : !Store.db.saldi.some(x => !x.annullato && x.commessaId === c.id && x.anno === anno)));
      const corpo = '<form id="form-saldo" onsubmit="return false">' +
        '<div class="msg info">Saldo al <b>' + Fmt.data(Engine.dataSaldo(anno)) + '</b> (esercizio ' + anno + '). Ammesse solo commesse pregresse: DATA DI INIZIO EFFETTIVA precedente al 01/01/' + anno + '.' +
        (pregresse.length ? '' : '<br><b>Nessuna commessa pregressa senza saldo.</b> Verificare la data di inizio effettiva in Anagrafica.') + '</div>' +
        '<fieldset><legend>Commessa pregressa</legend>' +
        UI.campo({ nome: 'commessaId', etichetta: 'Commessa (codice | cliente | cantiere)', tipo: 'select', req: true, opzioni: pregresse.map(c => ({ v: c.id, t: Engine.etichetta(c) })), vuotoTesto: 'Seleziona…', disabled: !!esistente }, s.commessaId) +
        '</fieldset><fieldset><legend>Valori cumulativi maturati al ' + Fmt.data(Engine.dataSaldo(anno)) + '</legend><div class="form-griglia">' +
        UI.campo({ nome: 'sal', etichetta: 'SAL maturato (€)', tipo: 'euro' }, s.sal) +
        UI.campo({ nome: 'fatturatoLordo', etichetta: 'Fatturato lordo (€)', tipo: 'euro' }, s.fatturatoLordo) +
        UI.campo({ nome: 'ritenute', etichetta: 'Ritenute maturate (€)', tipo: 'euro' }, s.ritenute) +
        UI.campo({ nome: 'svincoli', etichetta: 'Ritenute svincolate (€)', tipo: 'euro' }, s.svincoli) +
        UI.campo({ nome: 'perditeSal', etichetta: 'Perdite SAL accettate (€)', tipo: 'euro' }, s.perditeSal) +
        UI.campo({ nome: 'ore', etichetta: 'Ore effettive', tipo: 'ore', step: '0.5' }, s.ore) +
        UI.campo({ nome: 'costiDiretti', etichetta: 'Costi diretti (€)', tipo: 'euro' }, s.costiDiretti) +
        '</div></fieldset><fieldset><legend>Note</legend>' + UI.campo({ nome: 'note', etichetta: 'Note', tipo: 'textarea', classe: 'largo' }, s.note) + '</fieldset></form>';
      UI.modale({
        titolo: esistente ? 'Modifica saldo iniziale' : 'Nuovo saldo iniziale', corpo,
        pulsanti: [{
          testo: 'Salva', classe: 'primario', async azione(m) {
            const v = UI.leggiForm(m.el.querySelector('#form-saldo'));
            const nuovo = Object.assign({}, s, v, { anno, commessaId: esistente ? esistente.commessaId : v.commessaId });
            await UI.salvaConControlli(m, {
              valida: () => Engine.validaSaldo(nuovo, Store.db, esistente ? esistente.id : null),
              salva: async () => {
                await Store.salva(db => {
                  const rif = Store.etichetta(nuovo.commessaId) + ' · saldo al ' + Fmt.data(Engine.dataSaldo(anno));
                  if (esistente) {
                    const cur = db.saldi.find(x => x.id === esistente.id);
                    const mod = Store.diff(cur, nuovo, CAMPI);
                    CAMPI.forEach(f => { cur[f] = nuovo[f]; });
                    if (mod.length) Store.log(db, 'saldo', cur.id, rif, 'MODIFICA SALDO INIZIALE', mod);
                  } else {
                    nuovo.creatoIl = new Date().toISOString();
                    db.saldi.push(nuovo);
                    Store.log(db, 'saldo', nuovo.id, rif, 'NUOVO SALDO INIZIALE', Store.diff(null, nuovo, CAMPI));
                  }
                });
                UI.toast('Saldo salvato.');
                if (opt.onSalvato) opt.onSalvato();
              }
            });
          }
        }]
      });
    },
    async annulla(id) {
      if (!Store.puo('saldo.annulla')) return UI.permessoNegato();
      const s = Store.db.saldi.find(x => x.id === id); if (!s) return;
      const r = await UI.conferma({ titolo: 'Annulla saldo iniziale', pericolo: true, testoConferma: 'Annulla saldo', motivo: 'Motivo', motivoObbligatorio: true, html: 'Il saldo iniziale di <b>' + esc(Store.etichetta(s.commessaId)) + '</b> verrà annullato ed escluso dai cumulativi. Resta nello storico.' });
      if (!r) return;
      await Store.salva(db => { const cur = db.saldi.find(x => x.id === id); cur.annullato = true; cur.motivoAnnullamento = r.motivo; cur.annullatoIl = new Date().toISOString(); Store.log(db, 'saldo', id, Store.etichetta(cur.commessaId), 'ANNULLAMENTO SALDO', [{ campo: 'annullato', prima: false, dopo: true }, { campo: 'motivoAnnullamento', prima: '', dopo: r.motivo }]); });
      UI.toast('Saldo annullato.');
    },
    righe(anno) {
      return Store.db.saldi.filter(s => s.anno === anno).map(s => { const c = Store.commessa(s.commessaId) || {}; return Object.assign({}, s, { codice: c.codice || '?', cliente: c.cliente || '', cantiere: c.cantiere || '', etichetta: Engine.etichetta(c), dataSaldo: Engine.dataSaldo(anno) }); });
    },
    colonne(conCommessa) {
      const c = [{ campo: 'dataSaldo', titolo: 'Data saldo', fmt: v => Fmt.data(v), classe: 'nowrap calc' }];
      if (conCommessa) c.push({ campo: 'etichetta', titolo: 'Commessa', classe: 'desc', fmt: (v, r) => '<a href="#/commessa/' + esc(r.commessaId) + '/saldi" class="cod">' + esc(r.codice) + '</a> <span class="muto">|</span> ' + esc(r.cliente) + ' <span class="muto">|</span> ' + esc(r.cantiere) });
      return c.concat([
        { campo: 'sal', titolo: 'SAL maturato', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v) },
        { campo: 'fatturatoLordo', titolo: 'Fatturato lordo', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v) },
        { campo: 'ritenute', titolo: 'Ritenute', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v) },
        { campo: 'svincoli', titolo: 'Svincoli', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v) },
        { campo: 'perditeSal', titolo: 'Perdite SAL', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v) },
        { campo: 'ore', titolo: 'Ore', tipo: 'n', classe: 'in', fmt: v => Fmt.ore(v) },
        { campo: 'costiDiretti', titolo: 'Costi diretti', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v) },
        { campo: 'note', titolo: 'Note', classe: 'desc piccolo', fmt: (v, r) => esc(v || '') + (r.annullato ? '<div class="muto">Annullato: ' + esc(r.motivoAnnullamento || '') + '</div>' : '') },
        { campo: 'azioni', titolo: '', ord: false, classe: 'azioni-riga no-barra', fmt: (v, r) => r.annullato ? '' : ((Store.puo('saldo.modifica') ? '<button type="button" data-azione="modifica" data-id="' + esc(r.id) + '">Modifica</button>' : '') + (Store.puo('saldo.annulla') ? '<button type="button" class="pericolo" data-azione="annulla" data-id="' + esc(r.id) + '">Annulla</button>' : '')) }
      ]);
    },
    azione(az, id) { if (az === 'modifica') Saldi.apriForm(id); else if (az === 'annulla') Saldi.annulla(id); }
  };
  window.Saldi = Saldi;

  UI.registra('saldi', function (cont) {
    const P = Store.db.parametri, anno = P.annoGestione;
    const righe = Saldi.righe(anno);
    const attive = righe.filter(r => !r.annullato);
    const pregresse = Store.commesseAttive().filter(c => Engine.isPregressa(c, anno));
    const senzaSaldo = pregresse.filter(c => !attive.some(s => s.commessaId === c.id));
    const opz = [{ v: '', t: 'TUTTE' }].concat(attive.map(r => ({ v: r.commessaId, t: r.etichetta })));
    cont.innerHTML = UI.testata('Saldi al ' + Fmt.data(Engine.dataSaldo(anno)), 'Valori cumulativi già maturati dalle commesse pregresse (iniziate prima del 01/01/' + anno + '). Partecipano ai cumulativi della scheda Cantiere ma non alla dashboard Movimenti.',
      (Store.puo('saldo.crea') ? '<button type="button" class="primario" id="btn-nuovo-saldo">+ Nuovo saldo iniziale</button>' : '') + UI.pulsanteEsporta('saldi')) +
      (senzaSaldo.length ? '<div class="msg avviso"><b>' + senzaSaldo.length + ' commesse pregresse senza saldo iniziale:</b> ' + senzaSaldo.map(c => esc(c.codice)).join(', ') + '. Se avevano valori maturati al ' + Fmt.data(Engine.dataSaldo(anno)) + ', inserirli qui.</div>' : '') +
      '<div class="pannello"><div class="filtri"><div class="campo largo"><label>Commessa</label><select class="in" id="saldi-sel">' + opz.map(o => '<option value="' + esc(o.v) + '"' + (o.v === D.commessaId ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('') + '</select></div></div><div id="saldi-kpi"></div></div>' +
      UI.legenda() + '<div id="saldi-tab"></div>';
    function aggiorna() {
      const sel = D.commessaId ? attive.filter(r => r.commessaId === D.commessaId) : attive;
      const sum = f => sel.reduce((t, x) => t + Engine.num(x[f]), 0);
      document.getElementById('saldi-kpi').innerHTML = '<div class="kpi-griglia">' + UI.kpi('SAL maturato', Fmt.euro(sum('sal'))) + UI.kpi('Fatturato lordo', Fmt.euro(sum('fatturatoLordo'))) + UI.kpi('Ritenute', Fmt.euro(sum('ritenute'))) + UI.kpi('Svincoli', Fmt.euro(sum('svincoli'))) + UI.kpi('Perdite SAL', Fmt.euro(sum('perditeSal'))) + UI.kpi('Ore', Fmt.ore(sum('ore'))) + UI.kpi('Costi diretti', Fmt.euro(sum('costiDiretti'))) + UI.kpi('Righe', sel.length, { calc: false }) + '</div>';
      const t = document.getElementById('saldi-tab');
      t.innerHTML = UI.tabella('saldi', { colonne: Saldi.colonne(true), righe: D.commessaId ? righe.filter(r => r.commessaId === D.commessaId) : righe, chiave: 'id', ordine: { campo: 'etichetta', dir: 'asc' }, classeRiga: x => x.annullato ? 'annullato' : '', vuoto: 'Nessun saldo iniziale per l\'esercizio ' + anno + '.', onAzione: Saldi.azione });
      UI.legaTabelle(t);
    }
    document.getElementById('saldi-sel').onchange = e => { D.commessaId = e.target.value; aggiorna(); };
    const bn = document.getElementById('btn-nuovo-saldo'); if (bn) bn.onclick = () => Saldi.apriForm(null);
    const be = cont.querySelector('[data-esporta="saldi"]'); if (be) be.onclick = () => UI.esportaCsv('saldi_iniziali_' + anno, UI.righeOrdinate('saldi'), [
      { titolo: 'Data saldo', valore: r => Fmt.data(r.dataSaldo) }, { titolo: 'Codice', campo: 'codice' }, { titolo: 'Cliente', campo: 'cliente' }, { titolo: 'Cantiere', campo: 'cantiere' },
      { titolo: 'SAL maturato', campo: 'sal' }, { titolo: 'Fatturato lordo', campo: 'fatturatoLordo' }, { titolo: 'Ritenute', campo: 'ritenute' }, { titolo: 'Svincoli', campo: 'svincoli' }, { titolo: 'Perdite SAL', campo: 'perditeSal' }, { titolo: 'Ore', campo: 'ore' }, { titolo: 'Costi diretti', campo: 'costiDiretti' }, { titolo: 'Note', campo: 'note' }, { titolo: 'Annullato', valore: r => r.annullato ? 'SI' : '' }
    ]);
    aggiorna();
  });
})();
