/* FIDA EDILE – Costi diretti (archivio separato, costo effettivo puro) */
(function () {
  'use strict';
  const esc = UI.esc;
  const CAMPI = ['commessaId', 'data', 'macroCategoria', 'descrizione', 'importo', 'fornitore', 'note'];
  const F = { testo: '', categoria: '', anno: null, annullati: false };

  const Costi = {
    apriForm(id, opt) {
      opt = opt || {};
      const esistente = id ? Store.db.costi.find(k => k.id === id) : null;
      if (!Store.puo(esistente ? 'costo.modifica' : 'costo.crea')) return UI.permessoNegato();
      if (esistente && esistente.annullato) return UI.toast('Il costo è annullato e non può essere modificato.', 'errore');
      const anno = Store.db.parametri.annoGestione;
      const k = esistente ? JSON.parse(JSON.stringify(esistente)) : Object.assign(Schema.nuovoCosto(), { commessaId: opt.commessaId || '', data: Engine.annoDi(Fmt.oggi()) === anno ? Fmt.oggi() : anno + '-12-31' });
      const cat = Store.db.liste.macroCategorie.slice();
      if (k.macroCategoria && cat.indexOf(k.macroCategoria) < 0) cat.push(k.macroCategoria);
      const corpo = '<form id="form-costo" onsubmit="return false">' +
        '<fieldset><legend>Commessa</legend><div class="campo"><label class="req">Commessa (codice | cliente | cantiere)</label><div id="costo-combo"></div></div></fieldset>' +
        '<fieldset><legend>Costo</legend><div class="form-griglia">' +
        UI.campo({ nome: 'data', etichetta: 'Data costo', tipo: 'date', req: true, aiuto: 'Nell\'esercizio ' + anno + '.' }, k.data) +
        UI.campo({ nome: 'macroCategoria', etichetta: 'Voce di costo (macro-categoria)', tipo: 'select', opzioni: cat, vuotoTesto: cat.length ? 'Seleziona…' : 'Nessuna voce: crearle con «Voci di costo…»', aiuto: 'Le voci si creano e si modificano dalla pagina Costi diretti, pulsante «Voci di costo…».' }, k.macroCategoria) +
        UI.campo({ nome: 'importo', etichetta: 'Importo (€)', tipo: 'euro', req: true, aiuto: 'Costo effettivo puro: nessun margine o ricarico.' }, k.importo) +
        UI.campo({ nome: 'descrizione', etichetta: 'Descrizione', classe: 'doppio' }, k.descrizione) +
        UI.campo({ nome: 'fornitore', etichetta: 'Fornitore / Documento' }, k.fornitore) +
        '</div></fieldset>' +
        '<fieldset><legend>Note</legend>' + UI.campo({ nome: 'note', etichetta: 'Note', tipo: 'textarea', classe: 'largo' }, k.note) + '</fieldset></form>';
      let combo;
      UI.modale({
        titolo: esistente ? 'Modifica costo diretto' : 'Nuovo costo diretto', corpo,
        pulsanti: [{
          testo: 'Salva', classe: 'primario', async azione(mm) {
            const v = UI.leggiForm(mm.el.querySelector('#form-costo'));
            const nuovo = Object.assign({}, k, v, { commessaId: combo.valore });
            await UI.salvaConControlli(mm, {
              valida: () => Engine.validaCosto(nuovo, Store.db),
              salva: async () => {
                await Store.salva(db => {
                  const rif = Store.etichetta(nuovo.commessaId) + ' · ' + Fmt.data(nuovo.data) + ' · ' + Fmt.euro(nuovo.importo);
                  if (esistente) {
                    const cur = db.costi.find(x => x.id === esistente.id);
                    const mod = Store.diff(cur, nuovo, CAMPI);
                    CAMPI.forEach(f => { cur[f] = nuovo[f]; });
                    if (mod.length) { Store.log(db, 'costo', cur.id, rif, 'MODIFICA COSTO', mod); Store.toccaCommessa(db, cur.commessaId); }
                  } else {
                    nuovo.creatoIl = new Date().toISOString(); nuovo.creatoDa = Store.utente.nome;
                    db.costi.push(nuovo);
                    Store.log(db, 'costo', nuovo.id, rif, 'NUOVO COSTO', Store.diff(null, nuovo, CAMPI));
                    Store.toccaCommessa(db, nuovo.commessaId);
                  }
                });
                UI.toast('Costo salvato.');
                if (opt.onSalvato) opt.onSalvato();
              }
            });
          }
        }],
        onMount(mm) { combo = UI.comboCommessa(mm.el.querySelector('#costo-combo'), { valore: k.commessaId }); }
      });
    },
    // Voci di costo diretto (macro-categorie): le crea l'azienda, perché dipendono da che cosa ha già messo
    // dentro il proprio costo orario. Sono righe libere: si aggiungono, si rinominano, si tolgono.
    apriVoci(onSalvato) {
      if (!Store.puo('parametri')) return UI.permessoNegato();
      const attuali = Store.db.liste.macroCategorie.slice();
      const usate = {};
      Store.db.costi.forEach(k => { if (k.macroCategoria) usate[k.macroCategoria] = (usate[k.macroCategoria] || 0) + 1; });
      let tabella = null;
      UI.modale({
        titolo: 'Voci di costo diretto', stretta: true,
        corpo: '<div class="msg info">Sono le voci fra cui si sceglie registrando un costo diretto o una voce di preventivo. Dipendono da come l\'azienda forma il proprio <b>costo orario</b>: ciò che è già compreso lì non va fra i costi diretti. Si possono aggiungere, rinominare e togliere liberamente.</div><div id="voci-righe"></div>',
        pulsanti: [{
          testo: 'Salva', classe: 'primario', async azione(m) {
            const righe = tabella.righe.map(x => ({ prima: x.prima, voce: String(x.voce || '').trim() }));
            const nomi = righe.map(x => x.voce).filter(x => x);
            const doppie = nomi.filter((x, i) => nomi.findIndex(y => y.toLowerCase() === x.toLowerCase()) !== i);
            if (doppie.length) { m.msg('<div class="msg errore">Voce ripetuta: ' + esc(doppie[0]) + '.</div>'); return; }
            // una voce rinominata si porta dietro i costi e le voci di preventivo che la usavano
            const rinomine = righe.filter(x => x.prima && x.voce && x.prima !== x.voce);
            await Store.salva(db => {
              rinomine.forEach(x => {
                db.costi.forEach(k => { if (k.macroCategoria === x.prima) k.macroCategoria = x.voce; });
                db.preventivi.forEach(p => (p.voci || []).forEach(v => { if (v.macroCategoria === x.prima) v.macroCategoria = x.voce; }));
              });
              const mod = Store.diff({ macroCategorie: db.liste.macroCategorie }, { macroCategorie: nomi }, ['macroCategorie']);
              db.liste.macroCategorie = nomi;
              if (mod.length) Store.log(db, 'parametri', '', '', 'MODIFICA VOCI DI COSTO DIRETTO', mod);
            });
            m.chiudi(); UI.toast('Voci di costo salvate.');
            if (onSalvato) onSalvato();
          }
        }],
        onMount(m) {
          tabella = UI.righeEditabili(m.el.querySelector('#voci-righe'), {
            colonne: [
              { nome: 'voce', titolo: 'Voce di costo', tipo: 'text', larghezza: '260px', placeholder: 'es. Materiali, Noleggi, Subappalti…' },
              { nome: 'uso', titolo: 'Costi registrati', tipo: 'calc', calc: r => r.prima && usate[r.prima] ? String(usate[r.prima]) : '<span class="muto">—</span>' }
            ],
            righe: attuali.map(v => ({ voce: v, prima: v })),
            nuova: () => ({ voce: '', prima: '' }),
            testoAggiungi: '+ Aggiungi voce di costo',
            vuoto: 'Nessuna voce: aggiungere quelle che servono all\'azienda.',
            aiuto: 'Le righe lasciate vuote non vengono salvate. Togliendo una voce, i costi già registrati la conservano.'
          });
        }
      });
    },
    async annulla(id) {
      if (!Store.puo('costo.annulla')) return UI.permessoNegato();
      const k = Store.db.costi.find(x => x.id === id); if (!k) return;
      const r = await UI.conferma({ titolo: 'Annulla costo diretto', pericolo: true, testoConferma: 'Annulla costo', motivo: 'Motivo dell\'annullamento', motivoObbligatorio: true,
        html: 'Il costo di <b>' + Fmt.euro(k.importo) + '</b> del ' + Fmt.data(k.data) + ' per <b>' + esc(Store.etichetta(k.commessaId)) + '</b> verrà annullato: resta nello storico ma esce dai calcoli.' });
      if (!r) return;
      await Store.salva(db => {
        const cur = db.costi.find(x => x.id === id); cur.annullato = true; cur.motivoAnnullamento = r.motivo; cur.annullatoIl = new Date().toISOString(); cur.annullatoDa = Store.utente.nome;
        Store.log(db, 'costo', id, Store.etichetta(cur.commessaId) + ' · ' + Fmt.data(cur.data), 'ANNULLAMENTO COSTO', [{ campo: 'annullato', prima: false, dopo: true }, { campo: 'motivoAnnullamento', prima: '', dopo: r.motivo }]);
        Store.toccaCommessa(db, cur.commessaId);
      });
      UI.toast('Costo annullato.');
    },
    async ripristina(id) {
      if (!Store.puo('saldo.modifica')) return UI.permessoNegato();
      await Store.salva(db => { const cur = db.costi.find(x => x.id === id); cur.annullato = false; Store.log(db, 'costo', id, Store.etichetta(cur.commessaId) + ' · ' + Fmt.data(cur.data), 'RIPRISTINO COSTO', [{ campo: 'annullato', prima: true, dopo: false }]); Store.toccaCommessa(db, cur.commessaId); });
      UI.toast('Costo ripristinato.');
    },
    colonne(conCommessa) {
      const c = [{ campo: 'data', titolo: 'Data', fmt: v => Fmt.data(v), classe: 'nowrap' }];
      if (conCommessa) c.push({ campo: 'etichetta', titolo: 'Commessa', classe: 'desc', fmt: (v, r) => '<a href="#/commessa/' + esc(r.commessaId) + '" class="cod">' + esc(r.codice) + '</a> <span class="muto">|</span> ' + esc(r.cliente) + ' <span class="muto">|</span> ' + esc(r.cantiere) });
      return c.concat([
        { campo: 'macroCategoria', titolo: 'Macro-categoria', fmt: v => v ? '<span class="badge neutro">' + esc(v) + '</span>' : '<span class="muto">—</span>' },
        { campo: 'descrizione', titolo: 'Descrizione', classe: 'desc' },
        { campo: 'importo', titolo: 'Importo', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v) },
        { campo: 'fornitore', titolo: 'Fornitore / Documento' },
        { campo: 'note', titolo: 'Note', classe: 'desc piccolo', fmt: (v, r) => esc(v || '') + (r.annullato ? '<div class="muto">Annullato: ' + esc(r.motivoAnnullamento || '') + '</div>' : '') },
        { campo: 'azioni', titolo: '', ord: false, classe: 'azioni-riga no-barra', fmt: (v, r) => r.annullato ? (Store.puo('saldo.modifica') ? '<button type="button" data-azione="ripristina" data-id="' + esc(r.id) + '">Ripristina</button>' : '') :
          ((Store.puo('costo.modifica') && r.anno === Store.db.parametri.annoGestione ? '<button type="button" data-azione="modifica" data-id="' + esc(r.id) + '">Modifica</button>' : '') + (Store.puo('costo.annulla') ? '<button type="button" class="pericolo" data-azione="annulla" data-id="' + esc(r.id) + '">Annulla</button>' : '')) }
      ]);
    },
    righe(filtro) {
      return Store.db.costi.filter(filtro || (() => true)).map(k => {
        const c = Store.commessa(k.commessaId) || {};
        return Object.assign({}, k, { codice: c.codice || '?', cliente: c.cliente || '', cantiere: c.cantiere || '', etichetta: Engine.etichetta(c), anno: Engine.annoDi(k.data) });
      });
    },
    azione(az, id) { if (az === 'modifica') Costi.apriForm(id); else if (az === 'annulla') Costi.annulla(id); else if (az === 'ripristina') Costi.ripristina(id); },
    COLONNE_EXPORT: [
      { titolo: 'Data', valore: r => Fmt.data(r.data) }, { titolo: 'Codice', campo: 'codice' }, { titolo: 'Cliente', campo: 'cliente' }, { titolo: 'Cantiere', campo: 'cantiere' },
      { titolo: 'Macro-categoria', campo: 'macroCategoria' }, { titolo: 'Descrizione', campo: 'descrizione' }, { titolo: 'Importo', campo: 'importo' }, { titolo: 'Fornitore / Documento', campo: 'fornitore' },
      { titolo: 'Note', campo: 'note' }, { titolo: 'Annullato', valore: r => r.annullato ? 'SI' : '' }, { titolo: 'Motivo annullamento', campo: 'motivoAnnullamento' }
    ]
  };
  window.Costi = Costi;

  UI.registra('costi', function (cont) {
    const P = Store.db.parametri;
    if (F.anno === null) F.anno = P.annoGestione;
    const anni = Array.from(new Set(Store.db.costi.map(k => Engine.annoDi(k.data)).filter(x => x).concat([P.annoGestione]))).sort((a, b) => b - a);
    cont.innerHTML = UI.testata('Costi diretti ' + esc(P.annoGestione), 'Registrare esclusivamente i costi specifici della commessa non già assorbiti dal costo orario aziendale. Nessun margine o ricarico viene applicato.',
      (Store.puo('costo.crea') ? '<button type="button" class="primario" id="btn-nuovo-costo">+ Nuovo costo</button>' : '') +
      (Store.puo('parametri') ? '<button type="button" id="btn-voci-costo">Voci di costo…</button>' : '') + UI.pulsanteEsporta('costi')) +
      '<div id="costi-kpi"></div>' +
      '<div class="pannello compatto"><div class="filtri" id="costi-filtri">' +
      '<div class="campo largo"><label>Ricerca</label><input type="search" class="in" name="testo" value="' + esc(F.testo) + '" placeholder="codice, cliente, cantiere, descrizione, fornitore"></div>' +
      '<div class="campo"><label>Macro-categoria</label><select class="in" name="categoria"><option value="">Tutte</option>' + Store.db.liste.macroCategorie.map(t => '<option' + (F.categoria === t ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></div>' +
      '<div class="campo"><label>Anno</label><select class="in" name="anno">' + anni.map(a => '<option value="' + a + '"' + (+F.anno === a ? ' selected' : '') + '>' + a + (a !== P.annoGestione ? ' (storico)' : '') + '</option>').join('') + '</select></div>' +
      '<div class="campo"><label>Annullati</label><label style="text-transform:none;font-size:13px;margin-top:6px"><input type="checkbox" name="annullati"' + (F.annullati ? ' checked' : '') + '> mostra annullati</label></div>' +
      '</div></div>' + UI.legenda() + '<div id="costi-tab"></div>';
    function aggiorna() {
      let r = Costi.righe(k => Engine.annoDi(k.data) === +F.anno && (F.annullati || !k.annullato));
      if (F.categoria) r = r.filter(x => x.macroCategoria === F.categoria);
      r = UI.ricerca(r, F.testo, ['codice', 'cliente', 'cantiere', 'descrizione', 'fornitore', 'note', 'macroCategoria']);
      const att = r.filter(x => !x.annullato);
      const tot = att.reduce((t, x) => t + Engine.num(x.importo), 0);
      const ultima = att.reduce((m, x) => x.data > m ? x.data : m, '');
      const perCat = {};
      att.forEach(x => { const c = x.macroCategoria || '(senza categoria)'; perCat[c] = (perCat[c] || 0) + Engine.num(x.importo); });
      document.getElementById('costi-kpi').innerHTML = '<div class="kpi-griglia">' + UI.kpi('Totale costi (selezione)', Fmt.euro(tot), { sub: att.length + ' registrazioni' }) + UI.kpi('Ultima data', Fmt.data(ultima)) +
        Object.keys(perCat).sort().map(c => UI.kpi(c, Fmt.euro(perCat[c]))).join('') + '</div>';
      const t = document.getElementById('costi-tab');
      t.innerHTML = UI.tabella('costi', { colonne: Costi.colonne(true), righe: r, chiave: 'id', ordine: { campo: 'data', dir: 'desc' }, classeRiga: x => x.annullato ? 'annullato' : '', vuoto: 'Nessun costo per i criteri selezionati.', onAzione: Costi.azione, totali: { data: 'Totale', importo: Fmt.euro(tot) } });
      UI.legaTabelle(t);
    }
    const fil = document.getElementById('costi-filtri');
    const onCambio = UI.debounce(() => { fil.querySelectorAll('[name]').forEach(el => { F[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); aggiorna(); }, 150);
    fil.addEventListener('input', onCambio); fil.addEventListener('change', onCambio);
    const bn = document.getElementById('btn-nuovo-costo'); if (bn) bn.onclick = () => Costi.apriForm(null);
    const bv = document.getElementById('btn-voci-costo'); if (bv) bv.onclick = () => Costi.apriVoci();
    const be = cont.querySelector('[data-esporta="costi"]'); if (be) be.onclick = () => UI.esportaCsv('costi_diretti_' + F.anno, UI.righeOrdinate('costi'), Costi.COLONNE_EXPORT);
    aggiorna();
  });
})();
