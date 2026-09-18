/* FIDA EDILE – Anagrafica commesse (sezione master) */
(function () {
  'use strict';
  const esc = UI.esc;
  const F = { testo: '', stato: '', tecnico: '', definite: false, annullate: false };
  const CAMPI_ANAGRAFICA = ['dataInserimento', 'codice', 'cliente', 'cantiere', 'indirizzo', 'ramo', 'tecnico', 'preposto', 'dataInizioPrevista', 'dataInizioEffettiva',
    'dataFinePrevista', 'dataFineEffettiva', 'dataFinePrevistaOriginale', 'stato', 'ritenutePreviste', 'contrattoIniziale', 'integrazioni', 'causaAggiornamentoDataFine', 'note'];

  const Commesse = {
    opzioniSelect(conTutte) {
      const o = Store.commesseAttive().map(c => ({ v: c.id, t: Engine.etichetta(c) }));
      return conTutte ? [{ v: '', t: 'TUTTE' }].concat(o) : o;
    },

    // Maschera di creazione / modifica (usata anche dal dettaglio commessa)
    apriForm(id, onSalvato) {
      const esistente = id ? Store.commessa(id) : null;
      if (!Store.puo(esistente ? 'commessa.modifica' : 'commessa.crea')) return UI.permessoNegato();
      const c = esistente ? JSON.parse(JSON.stringify(esistente)) : Object.assign(Schema.nuovaCommessa(), { dataInserimento: Fmt.oggi() });
      const L = Store.db.liste;
      const tutte = Store.db.commesse;
      const corpo =
        UI.datalist('dl-rami', L.rami.concat(tutte.map(x => x.ramo))) + UI.datalist('dl-tecnici', L.tecnici.concat(tutte.map(x => x.tecnico))) +
        UI.datalist('dl-preposti', L.preposti.concat(tutte.map(x => x.preposto))) + UI.datalist('dl-clienti', tutte.map(x => x.cliente)) +
        '<form id="form-commessa" onsubmit="return false">' +
        '<fieldset><legend>Identificazione</legend><div class="form-griglia">' +
        UI.campo({ nome: 'dataInserimento', etichetta: 'Data di inserimento', tipo: 'date', req: true, aiuto: 'Obbligatoria: senza questa data la commessa non può essere creata.' }, c.dataInserimento) +
        UI.campo({ nome: 'codice', etichetta: 'Codice commessa', req: true, aiuto: 'Univoco. I codici che iniziano con TEMP sono segnalati come temporanei.' }, c.codice) +
        UI.campo({ nome: 'cliente', etichetta: 'Cliente', req: true, lista: 'dl-clienti' }, c.cliente) +
        UI.campo({ nome: 'cantiere', etichetta: 'Descrizione / Cantiere', req: true, classe: 'doppio' }, c.cantiere) +
        UI.campo({ nome: 'indirizzo', etichetta: 'Indirizzo / Località' }, c.indirizzo) +
        UI.campo({ nome: 'ramo', etichetta: 'Ramo di attività', lista: 'dl-rami' }, c.ramo) +
        UI.campo({ nome: 'tecnico', etichetta: 'Tecnico', lista: 'dl-tecnici' }, c.tecnico) +
        UI.campo({ nome: 'preposto', etichetta: 'Preposto', lista: 'dl-preposti' }, c.preposto) +
        '</div></fieldset>' +
        '<fieldset><legend>Date e stato</legend><div class="form-griglia">' +
        UI.campo({ nome: 'dataInizioPrevista', etichetta: 'Data di inizio previsto', tipo: 'date' }, c.dataInizioPrevista) +
        UI.campo({ nome: 'dataInizioEffettiva', etichetta: 'Data di inizio effettivo', tipo: 'date', aiuto: 'Determina se la commessa è pregressa e l\'avanzamento temporale.' }, c.dataInizioEffettiva) +
        UI.campo({ nome: 'dataFinePrevista', etichetta: 'Data di fine prevista', tipo: 'date', aiuto: esistente && c.dataFinePrevistaOriginale ? 'Originaria: ' + Fmt.data(c.dataFinePrevistaOriginale) + '. Se cambia, indicare la causa.' : 'Alla creazione diventa la data di fine originaria.' }, c.dataFinePrevista) +
        UI.campo({ nome: 'dataFineEffettiva', etichetta: 'Data di fine effettiva', tipo: 'date', aiuto: 'Obbligatoria quando la commessa è finita.' }, c.dataFineEffettiva) +
        UI.campo({ nome: 'stato', etichetta: 'Stato cantiere', tipo: 'select', opzioni: Engine.STATI, vuoto: false }, c.stato || 'Da iniziare') +
        UI.campo({ nome: 'causaAggiornamentoDataFine', etichetta: 'Causa aggiornamento data fine', tipo: 'select', opzioni: Engine.CAUSE_DATA_FINE, vuoto: false }, c.causaAggiornamentoDataFine || 'Nessuna variazione') +
        UI.campo({ nome: 'ritenutePreviste', etichetta: 'Ritenute previste', tipo: 'select', opzioni: ['SI', 'NO'], vuoto: false }, c.ritenutePreviste || 'NO') +
        '</div></fieldset>' +
        '<fieldset><legend>Valori contrattuali</legend><div class="form-griglia">' +
        UI.campo({ nome: 'contrattoIniziale', etichetta: 'Contratto iniziale (€)', tipo: 'euro' }, c.contrattoIniziale) +
        UI.campo({ nome: 'integrazioni', etichetta: 'Integrazioni / varianti (€)', tipo: 'euro' }, c.integrazioni) +
        UI.campo({ nome: 'contrattoAggiornato', etichetta: 'Contratto aggiornato (€)', tipo: 'sola', html: Fmt.euro(Engine.contrattoAggiornato(c)) }) +
        '</div></fieldset>' +
        '<fieldset><legend>Note</legend>' + UI.campo({ nome: 'note', etichetta: 'Note anagrafiche', tipo: 'textarea', classe: 'largo' }, c.note) + '</fieldset>' +
        '</form>';

      UI.modale({
        titolo: esistente ? 'Modifica commessa ' + esistente.codice : 'Nuova commessa', corpo,
        pulsanti: [{
          testo: 'Salva', classe: 'primario', async azione(m) {
            const form = m.el.querySelector('#form-commessa');
            const v = UI.leggiForm(form);
            const nuovo = Object.assign({}, c, v);
            delete nuovo.contrattoAggiornato;
            nuovo.codice = String(nuovo.codice || '').trim().toUpperCase();
            if (!esistente) nuovo.dataFinePrevistaOriginale = nuovo.dataFinePrevista || '';
            else if (!nuovo.dataFinePrevistaOriginale && nuovo.dataFinePrevista) nuovo.dataFinePrevistaOriginale = nuovo.dataFinePrevista;
            await UI.salvaConControlli(m, {
              valida: () => Engine.validaCommessa(nuovo, Store.db, esistente ? esistente.id : null),
              salva: async () => {
                const idOut = await Store.salva(db => {
                  const aggiungi = (lista, val) => { if (val && lista.indexOf(val) < 0) lista.push(val); };
                  aggiungi(db.liste.rami, nuovo.ramo); aggiungi(db.liste.tecnici, nuovo.tecnico); aggiungi(db.liste.preposti, nuovo.preposto);
                  if (esistente) {
                    const cur = db.commesse.find(x => x.id === esistente.id);
                    if (!cur) throw new Error('Commessa non più presente.');
                    const mod = Store.diff(cur, nuovo, CAMPI_ANAGRAFICA);
                    CAMPI_ANAGRAFICA.forEach(k => { cur[k] = nuovo[k]; });
                    if (mod.length) { Store.toccaCommessa(db, cur.id, mod); Store.log(db, 'commessa', cur.id, cur.codice, 'MODIFICA ANAGRAFICA', mod); }
                    return cur.id;
                  }
                  nuovo.aggiornatoAl = Fmt.oggi(); // una commessa appena creata è aggiornata a oggi
                  db.commesse.push(nuovo);
                  Store.log(db, 'commessa', nuovo.id, nuovo.codice, 'CREAZIONE', Store.diff(null, nuovo, CAMPI_ANAGRAFICA));
                  return nuovo.id;
                });
                UI.toast(esistente ? 'Commessa aggiornata.' : 'Commessa creata.');
                if (onSalvato) onSalvato(idOut);
              }
            });
          }
        }],
        onMount(m) {
          const form = m.el.querySelector('#form-commessa');
          const agg = () => {
            const v = UI.leggiForm(form);
            form.querySelector('#f-contrattoAggiornato').textContent = Fmt.euro(Engine.contrattoAggiornato(v));
          };
          form.addEventListener('input', agg);
        }
      });
    },

    // Eliminazione (solo senza registrazioni collegate) o annullamento
    async elimina(id) {
      if (!Store.puo('commessa.elimina')) return UI.permessoNegato();
      const c = Store.commessa(id); if (!c) return;
      const collegati = Store.db.movimenti.filter(m => m.commessaId === id).length + Store.db.costi.filter(k => k.commessaId === id).length + Store.db.saldi.filter(s => s.commessaId === id).length + Store.db.fasi.filter(f => f.commessaId === id).length;
      if (collegati > 0) {
        const ok = await UI.conferma({
          titolo: 'Annulla commessa ' + c.codice, pericolo: true, testoConferma: 'Annulla commessa', richiediTesto: c.codice,
          html: 'La commessa ha <b>' + collegati + '</b> registrazioni collegate (movimenti, costi, saldi o fasi del Gantt) e non può essere eliminata definitivamente.<br>' +
            'Può essere <b>annullata</b>: sparisce da elenchi e dashboard, ma resta nello storico con le sue registrazioni.'
        });
        if (!ok) return;
        await Store.salva(db => {
          const cur = db.commesse.find(x => x.id === id); cur.annullato = true; cur.annullatoIl = new Date().toISOString();
          Store.log(db, 'commessa', id, cur.codice, 'ANNULLAMENTO COMMESSA', [{ campo: 'annullato', prima: false, dopo: true }]);
        });
        UI.toast('Commessa annullata.'); UI.vai('#/commesse'); return;
      }
      const ok = await UI.conferma({ titolo: 'Elimina commessa ' + c.codice, pericolo: true, testoConferma: 'Elimina definitivamente', richiediTesto: c.codice, html: 'La commessa non ha registrazioni collegate e verrà <b>eliminata definitivamente</b> dall\'Anagrafica. L\'operazione resta tracciata nel registro.' });
      if (!ok) return;
      await Store.salva(db => {
        db.commesse = db.commesse.filter(x => x.id !== id);
        Store.log(db, 'commessa', id, c.codice, 'ELIMINAZIONE', Store.diff(c, {}, CAMPI_ANAGRAFICA));
      });
      UI.toast('Commessa eliminata.'); UI.vai('#/commesse');
    },
    async ripristina(id) {
      if (!Store.puo('commessa.elimina')) return UI.permessoNegato();
      await Store.salva(db => { const cur = db.commesse.find(x => x.id === id); cur.annullato = false; Store.log(db, 'commessa', id, cur.codice, 'RIPRISTINO COMMESSA', [{ campo: 'annullato', prima: true, dopo: false }]); });
      UI.toast('Commessa ripristinata.');
    }
  };
  window.Commesse = Commesse;

  UI.registra('commesse', function (cont) {
    const rows = Engine.calcolaTutte(Store.db);
    // Definite dalla chiusura esercizio: fuori dal portafoglio operativo, ma consultabili con il filtro.
    const definite = Engine.calcolaTutte(Store.db, { soloDefinite: true });
    const annullate = Store.db.commesse.filter(c => c.annullato);
    const tecnici = Array.from(new Set(rows.map(r => r.tecnico).filter(x => x))).sort();
    cont.innerHTML = UI.testata('Anagrafica commesse', 'Unica fonte master: ogni commessa si crea qui una sola volta e viene richiamata automaticamente nelle altre sezioni.',
      (Store.puo('commessa.crea') ? '<button type="button" class="primario" id="btn-nuova">+ Nuova commessa</button>' : '') + UI.pulsanteEsporta('commesse')) +
      '<div class="pannello compatto"><div class="filtri" id="com-filtri">' +
      '<div class="campo largo"><label>Ricerca</label><input type="search" class="in" name="testo" value="' + esc(F.testo) + '" placeholder="codice, cliente, cantiere, tecnico, preposto"></div>' +
      '<div class="campo"><label>Stato</label><select class="in" name="stato"><option value="">Tutti</option>' + Engine.STATI.map(s => '<option' + (F.stato === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select></div>' +
      '<div class="campo"><label>Tecnico</label><select class="in" name="tecnico"><option value="">Tutti</option>' + tecnici.map(s => '<option' + (F.tecnico === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select></div>' +
      (definite.length ? '<div class="campo"><label>Definite</label><label style="text-transform:none;font-size:13px;margin-top:6px"><input type="checkbox" name="definite"' + (F.definite ? ' checked' : '') + '> mostra le ' + definite.length + ' definite</label></div>' : '') +
      (annullate.length && Store.puo('commessa.elimina') ? '<div class="campo"><label>Annullate</label><label style="text-transform:none;font-size:13px;margin-top:6px"><input type="checkbox" name="annullate"' + (F.annullate ? ' checked' : '') + '> mostra le ' + annullate.length + ' annullate</label></div>' : '') +
      '<div class="campo"><label>&nbsp;</label><span class="pill" id="com-conta"></span></div>' +
      '</div></div><div id="com-tab"></div>';

    const colonne = [
      // il pulsante "Apri" sta nella prima colonna, accanto al codice della commessa
      { campo: 'azioni', titolo: '', ord: false, classe: 'azioni-riga', fmt: (v, r) => r.annullato ? (Store.puo('commessa.elimina') ? '<button type="button" data-azione="ripristina" data-id="' + esc(r.id) + '">Ripristina</button>' : '') : '<a class="btn piccolo" href="#/commessa/' + esc(r.id) + '">Apri</a>' },
      { campo: 'alert', titolo: 'Allerta', fmt: (v, r) => r.definita ? '<span class="badge neutro">definita ' + esc(r.chiusuraDefinitiva.anno) + '</span>' : UI.badgeAlert(v) },
      { campo: 'codice', titolo: 'Codice', fmt: (v, r) => r.annullato ? '<span class="cod">' + esc(v) + '</span>' : UI.linkCommessa(r) },
      { campo: 'cliente', titolo: 'Cliente' },
      { campo: 'cantiere', titolo: 'Descrizione / Cantiere', classe: 'desc' },
      { campo: 'ramo', titolo: 'Ramo' },
      { campo: 'tecnico', titolo: 'Tecnico' },
      { campo: 'preposto', titolo: 'Preposto' },
      { campo: 'stato', titolo: 'Stato', fmt: v => UI.badgeStato(v) },
      { campo: 'dataInizioEffettiva', titolo: 'Inizio eff.', fmt: (v, r) => Fmt.data(v) + (!v && r.dataInizioPrevista ? '<div class="muto piccolo">prev. ' + Fmt.data(r.dataInizioPrevista) + '</div>' : '') },
      { campo: 'dataFinePrevista', titolo: 'Fine prev.', fmt: v => Fmt.data(v) },
      { campo: 'dataFineEffettiva', titolo: 'Fine eff.', fmt: v => Fmt.data(v) },
      { campo: 'contrattoAggiornato', titolo: 'Contratto agg.', tipo: 'n', fmt: v => Fmt.euro(v) },
      { campo: 'pregressa', titolo: 'Pregressa', fmt: v => v ? '<span class="badge neutro">sì</span>' : '' }
    ];
    function aggiorna() {
      let r = F.definite ? rows.concat(definite) : rows;
      if (F.stato) r = r.filter(x => x.stato === F.stato);
      if (F.tecnico) r = r.filter(x => x.tecnico === F.tecnico);
      r = UI.ricerca(r, F.testo, ['codice', 'cliente', 'cantiere', 'tecnico', 'preposto', 'ramo']);
      if (F.annullate) r = r.concat(annullate.map(c => Object.assign({ annullato: true, alert: '', motivi: [], contrattoAggiornato: Engine.contrattoAggiornato(c) }, c)));
      document.getElementById('com-conta').textContent = r.length + ' commesse visibili su ' + rows.length + (F.definite ? ' operative + ' + definite.length + ' definite' : ' operative');
      const t = document.getElementById('com-tab');
      t.innerHTML = UI.tabella('commesse', { colonne, righe: r, chiave: 'id', ordine: { campo: 'codice', dir: 'asc' }, classeRiga: x => x.annullato ? 'annullato' : (x.definita ? 'muto' : ''), onRiga: id => { const c = Store.commessa(id); if (c && !c.annullato) UI.vai('#/commessa/' + id); }, onAzione: (az, id) => { if (az === 'ripristina') Commesse.ripristina(id); } });
      UI.legaTabelle(t);
    }
    const fil = document.getElementById('com-filtri');
    const onCambio = UI.debounce(() => { fil.querySelectorAll('[name]').forEach(el => { F[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); aggiorna(); }, 150);
    fil.addEventListener('input', onCambio); fil.addEventListener('change', onCambio);
    const bn = document.getElementById('btn-nuova'); if (bn) bn.onclick = () => Commesse.apriForm(null, id => UI.vai('#/commessa/' + id));
    const be = cont.querySelector('[data-esporta="commesse"]'); if (be) be.onclick = () => UI.esportaCsv('anagrafica_commesse', UI.righeOrdinate('commesse'), [
      { titolo: 'Data inserimento', valore: r => Fmt.data(r.dataInserimento || (Store.commessa(r.id) || {}).dataInserimento) }
    ].concat(UI.COLONNE_EXPORT_SCHEDA));
    aggiorna();
  });
})();
