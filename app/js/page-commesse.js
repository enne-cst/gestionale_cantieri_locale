/* FIDA EDILE – Anagrafica commesse (sezione master) */
(function () {
  'use strict';
  const esc = UI.esc;
  const F = { testo: '', stato: '', tecnico: '', definite: false, annullate: false };
  const CAMPI_ANAGRAFICA = ['dataInserimento', 'codice', 'cliente', 'cantiere', 'indirizzo', 'ramo', 'tecnico', 'preposto', 'dataInizioPrevista', 'dataInizioEffettiva',
    'dataFinePrevista', 'dataFineEffettiva', 'dataFinePrevistaOriginale', 'stato', 'ritenutePreviste', 'contrattoIniziale', 'integrazioni', 'integrazioniRiferimento', 'causaAggiornamentoDataFine', 'note'];

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
        UI.campo({ nome: 'integrazioniRiferimento', etichetta: 'Riferimento documentale delle integrazioni', classe: 'largo', placeholder: 'integrazione contrattuale n. … del …', aiuto: 'Obbligatorio quando ci sono integrazioni: senza il documento che le giustifica la commessa va in alert CRITICO.' }, c.integrazioniRiferimento) +
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

    // Registrazioni che appartengono a una commessa e che spariscono con lei.
    collegati(id) {
      const db = Store.db, n = l => l.filter(x => x.commessaId === id).length;
      const c = { movimenti: n(db.movimenti), costi: n(db.costi), saldi: n(db.saldi), fasi: n(db.fasi) };
      c.totale = c.movimenti + c.costi + c.saldi + c.fasi;
      return c;
    },
    // Toglie dall'archivio la commessa con tutto ciò che le appartiene. I preventivi da cui è nata restano,
    // ma tornano liberi: puntare a una commessa che non esiste più romperebbe l'integrità dell'archivio.
    _rimuovi(db, id) {
      const cur = db.commesse.find(x => x.id === id);
      if (!cur) throw new Error('Commessa non più presente.');
      const tolti = {};
      ['movimenti', 'costi', 'saldi', 'fasi'].forEach(k => {
        tolti[k] = db[k].filter(x => x.commessaId === id).length;
        db[k] = db[k].filter(x => x.commessaId !== id);
      });
      db.preventivi.forEach(p => { if (p.commessaId === id) { p.commessaId = ''; p.convertitoIl = ''; p.convertitoDa = ''; } });
      db.commesse = db.commesse.filter(x => x.id !== id);
      Store.log(db, 'commessa', id, cur.codice, 'ELIMINAZIONE', Store.diff(cur, {}, CAMPI_ANAGRAFICA).concat(
        Object.keys(tolti).filter(k => tolti[k]).map(k => ({ campo: k, prima: tolti[k] + ' registrazioni', dopo: 'eliminate' }))));
    },

    // Una commessa si può ANNULLARE (sparisce da elenchi e dashboard ma resta nello storico, si può
    // ripristinare) oppure ELIMINARE davvero, insieme alle sue registrazioni. Fino alla Rev.5 una commessa
    // con registrazioni si poteva solo annullare, e una annullata non si poteva più togliere: restava
    // nell'archivio e ricompariva con "mostra le annullate", dando l'idea che l'eliminazione non funzionasse.
    async elimina(id) {
      if (!Store.puo('commessa.elimina')) return UI.permessoNegato();
      const c = Store.commessa(id); if (!c) return;
      const n = Commesse.collegati(id);
      const elenco = [['movimenti', n.movimenti], ['costi diretti', n.costi], ['saldi', n.saldi], ['fasi del Gantt', n.fasi]].filter(x => x[1]).map(x => x[1] + ' ' + x[0]).join(', ');
      const codice = String(c.codice || '').trim();
      // il codice si confronta senza badare a maiuscole e spazi: un codice importato in minuscolo o con uno
      // spazio in coda non deve rendere impossibile la conferma
      const uguale = v => String(v || '').trim().toUpperCase() === codice.toUpperCase();
      const corpo = '<p>Commessa <b>' + esc(Engine.etichetta(c)) + '</b>' + (c.annullato ? ' <span class="badge neutro">già annullata</span>' : '') + '</p>' +
        (n.totale ? '<div class="msg avviso">Ha <b>' + n.totale + '</b> registrazioni collegate: ' + esc(elenco) + '.</div>' : '<div class="msg info">Non ha registrazioni collegate.</div>') +
        '<ul class="sotto" style="margin:8px 0 12px 18px">' +
        (c.annullato ? '' : '<li><b>Annulla</b>: sparisce da elenchi e dashboard, resta nello storico con le sue registrazioni e si può ripristinare.</li>') +
        '<li><b>Elimina definitivamente</b>: la commessa' + (n.totale ? ' e le sue ' + n.totale + ' registrazioni vengono tolte' : ' viene tolta') + ' dall\'archivio. Non si può tornare indietro; resta solo la riga nel registro modifiche.</li></ul>' +
        '<div class="campo"><label>Per confermare digita il codice: <b>' + esc(codice) + '</b></label><input type="text" class="in" id="del-conf" autocomplete="off"></div>';
      const controlla = m => {
        if (uguale(m.el.querySelector('#del-conf').value)) return true;
        m.msg('<div class="msg errore">Il codice digitato non corrisponde a ' + esc(codice) + '.</div>');
        return false;
      };
      UI.modale({
        titolo: 'Elimina o annulla la commessa ' + codice, corpo, stretta: true,
        pulsanti: (c.annullato ? [] : [{
          testo: 'Annulla commessa', async azione(m) {
            if (!controlla(m)) return;
            await Store.salva(db => {
              const cur = db.commesse.find(x => x.id === id);
              if (!cur) throw new Error('Commessa non più presente.');
              cur.annullato = true; cur.annullatoIl = new Date().toISOString();
              Store.log(db, 'commessa', id, cur.codice, 'ANNULLAMENTO COMMESSA', [{ campo: 'annullato', prima: false, dopo: true }]);
            });
            m.chiudi(); UI.toast('Commessa annullata.'); UI.vai('#/commesse');
          }
        }]).concat([{
          testo: 'Elimina definitivamente', classe: 'pericolo', async azione(m) {
            if (!controlla(m)) return;
            await Store.salva(db => Commesse._rimuovi(db, id));
            m.chiudi(); UI.toast('Commessa eliminata' + (n.totale ? ' con ' + n.totale + ' registrazioni collegate.' : '.')); UI.vai('#/commesse');
          }
        }])
      });
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
      (Store.puo('commessa.crea') ? '<button type="button" class="primario" id="btn-nuova">+ Nuova commessa</button>' : '') +
      (Store.vedePagina('importa') ? '<a class="btn" href="#/importa">⤓ Importa da Excel</a>' : '') + UI.pulsanteEsporta('commesse')) +
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
      { campo: 'azioni', titolo: '', ord: false, classe: 'azioni-riga', fmt: (v, r) => r.annullato ? (Store.puo('commessa.elimina') ? '<button type="button" data-azione="ripristina" data-id="' + esc(r.id) + '">Ripristina</button><button type="button" class="pericolo" data-azione="elimina" data-id="' + esc(r.id) + '">Elimina</button>' : '') : '<a class="btn piccolo" href="#/commessa/' + esc(r.id) + '">Apri</a>' },
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
      t.innerHTML = UI.tabella('commesse', { colonne, righe: r, chiave: 'id', ordine: { campo: 'codice', dir: 'asc' }, classeRiga: x => x.annullato ? 'annullato' : (x.definita ? 'muto' : ''), onRiga: id => { const c = Store.commessa(id); if (c && !c.annullato) UI.vai('#/commessa/' + id); }, onAzione: (az, id) => { if (az === 'ripristina') Commesse.ripristina(id); else if (az === 'elimina') Commesse.elimina(id); } });
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
