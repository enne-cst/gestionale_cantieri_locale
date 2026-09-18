/*
 * FIDA EDILE – Preventivi (ipotesi di commessa).
 *
 * Un preventivo è una commessa che ancora non esiste: non ha anagrafica, movimenti, costi né budget,
 * ha soltanto la VERIFICA DI SOSTENIBILITÀ ECONOMICA e per questo ogni dato è inserito a mano
 * (prezzo proposto, ore previste, voci di costo specifico con i rispettivi ricarichi).
 *
 * L'archivio è separato da tutto il resto: i preventivi non compaiono in Anagrafica, nelle dashboard
 * né nei cumulativi dell'esercizio. Quando un'offerta viene accettata si converte in commessa: nasce la
 * commessa in Anagrafica con contratto, ore e costi diretti previsti presi dal preventivo, e il preventivo
 * resta in archivio come storico, di sola lettura, collegato alla commessa generata.
 */
(function () {
  'use strict';
  const esc = UI.esc;
  const F = { testo: '', esito: '', soloDaConvertire: false, annullati: false };
  const E = v => Fmt.euro(v), O = v => Fmt.ore(v), Pc = (v, dec) => Fmt.pct(v, dec), Dt = v => Fmt.data(v), T = v => esc(Fmt.testo(v));
  const CAMPI = ['numero', 'data', 'cliente', 'oggetto', 'indirizzo', 'ramo', 'tecnico', 'prezzoProposto', 'orePreviste', 'voci', 'datiVerificati', 'note'];

  function kv(righe) {
    return '<table class="kv">' + righe.map(r => '<tr><th>' + esc(r[0]) + '</th><td class="' + (r[2] || '') + '">' + r[1] + '</td></tr>').join('') + '</table>';
  }
  function etichetta(p) {
    return [p.numero, p.cliente, p.oggetto].map(x => String(x || '').trim()).join(' | ');
  }
  // elenchi di supporto: si attingono sia alle commesse sia ai preventivi già inseriti
  function suggerimenti(campo, campoCommessa) {
    const a = Store.db.preventivi.map(p => p[campo]);
    const b = Store.db.commesse.map(c => c[campoCommessa || campo]);
    return a.concat(b).filter(x => x);
  }

  const Preventivi = {

    // ------------------------------------------------------------ maschera del preventivo
    apriForm(id, opt) {
      opt = opt || {};
      const esistente = id ? Store.preventivo(id) : null;
      if (!Store.puo(esistente ? 'preventivo.modifica' : 'preventivo.crea')) return UI.permessoNegato();
      if (esistente && esistente.annullato) return UI.toast('Il preventivo è annullato e non può essere modificato.', 'errore');
      if (esistente && esistente.commessaId) return UI.toast('Il preventivo è già stato convertito in commessa: resta come storico di sola lettura.', 'errore');

      const S = Engine.parametriSostenibilita(Store.db.parametri);
      const p = esistente ? JSON.parse(JSON.stringify(esistente))
        : Object.assign(Schema.nuovoPreventivo(), { numero: Engine.prossimoNumeroPreventivo(Store.db), data: Fmt.oggi() });
      const categorie = Store.db.liste.macroCategorie.slice();

      const corpo = '<form id="form-prev" onsubmit="return false">' +
        '<div class="msg info">Il preventivo è un\'<b>ipotesi di commessa</b>: tutti i dati si inseriscono qui a mano. Alla conversione in commessa diventeranno contratto, ore previste e costi diretti previsti.</div>' +
        '<fieldset><legend>Identificazione</legend><div class="form-griglia">' +
        UI.campo({ nome: 'numero', etichetta: 'Numero preventivo', req: true, aiuto: 'Proposto dall\'applicazione, modificabile. Deve essere unico.' }, p.numero) +
        UI.campo({ nome: 'data', etichetta: 'Data del preventivo', tipo: 'date', req: true }, p.data) +
        UI.campo({ nome: 'cliente', etichetta: 'Cliente', req: true, lista: 'dl-prev-clienti' }, p.cliente) +
        UI.campo({ nome: 'oggetto', etichetta: 'Oggetto / Cantiere', req: true, classe: 'doppio' }, p.oggetto) +
        UI.campo({ nome: 'indirizzo', etichetta: 'Indirizzo / Località' }, p.indirizzo) +
        UI.campo({ nome: 'ramo', etichetta: 'Ramo di attività', lista: 'dl-prev-rami' }, p.ramo) +
        UI.campo({ nome: 'tecnico', etichetta: 'Tecnico', lista: 'dl-prev-tecnici' }, p.tecnico) +
        '</div>' + UI.datalist('dl-prev-clienti', suggerimenti('cliente')) + UI.datalist('dl-prev-rami', Store.db.liste.rami.concat(suggerimenti('ramo'))) +
        UI.datalist('dl-prev-tecnici', Store.db.liste.tecnici.concat(suggerimenti('tecnico'))) + '</fieldset>' +
        '<fieldset><legend>Prezzo proposto e ore</legend><div class="form-griglia">' +
        UI.campo({ nome: 'prezzoProposto', etichetta: 'Prezzo proposto (€)', tipo: 'euro', aiuto: 'È il prezzo del computo da confrontare con il prezzo minimo sostenibile. Diventerà il contratto iniziale della commessa.' }, p.prezzoProposto) +
        UI.campo({ nome: 'orePreviste', etichetta: 'Ore totali previste', tipo: 'ore', step: '0.5', aiuto: 'Ore di manodopera stimate: determinano la parte strutturale del prezzo minimo.' }, p.orePreviste) +
        UI.campo({ nome: 'xCosto', etichetta: 'Costo strutturale (€/h)', tipo: 'sola', html: E(S.costoOrario), aiuto: 'Parametro aziendale protetto (Parametri).' }) +
        '</div></fieldset>' +
        '<fieldset><legend>Voci di costo specifico</legend><div id="prev-voci"></div>' +
        '<p class="aiuto">Costi non già assorbiti dal costo strutturale orario. Il ricarico minimo stabilito dalla Direzione è ' + Pc(S.sogliaRicarico) +
        ': un valore inferiore rende la verifica non congrua. Il prezzo di vendita è (costo + maggiorazione) portato a redditività ' + Pc(S.redditivita) + '.</p></fieldset>' +
        '<fieldset><legend>Esito della verifica</legend><div id="prev-esito"></div></fieldset>' +
        '<fieldset><legend>Dichiarazione e note</legend><div class="form-griglia">' +
        UI.campo({ nome: 'datiVerificati', etichetta: 'Dati del computo', tipo: 'checkbox', testoCheck: 'verificati e completi', aiuto: 'Finché non è spuntato l\'esito resta DA COMPLETARE.' }, !!p.datiVerificati) +
        UI.campo({ nome: 'note', etichetta: 'Note del preventivo', tipo: 'textarea', classe: 'largo' }, p.note) +
        '</div></fieldset></form>';

      let tabella = null;
      UI.modale({
        titolo: esistente ? 'Preventivo ' + p.numero : 'Nuovo preventivo', corpo, larga: true,
        pulsanti: [{
          testo: 'Salva', classe: 'primario', async azione(m) {
            const val = UI.leggiForm(m.el.querySelector('#form-prev'));
            const nuovo = Object.assign({}, p, val, {
              voci: tabella.righe.map(x => ({
                id: x.id || Schema.genId('v'), voce: x.voce || '', macroCategoria: x.macroCategoria || '',
                quantita: x.quantita, um: x.um || '', costoUnitario: x.costoUnitario, ricarico: x.ricarico
              }))
            });
            delete nuovo.xCosto;
            await UI.salvaConControlli(m, {
              valida: () => Engine.validaPreventivo(nuovo, Store.db, esistente ? esistente.id : null),
              salva: async () => {
                await Store.salva(db => {
                  if (esistente) {
                    const cur = db.preventivi.find(x => x.id === esistente.id);
                    const mod = Store.diff(cur, nuovo, CAMPI);
                    CAMPI.forEach(f => { cur[f] = nuovo[f]; });
                    if (mod.length) Store.log(db, 'preventivo', cur.id, etichetta(cur), 'MODIFICA PREVENTIVO', mod);
                  } else {
                    nuovo.creatoIl = new Date().toISOString(); nuovo.creatoDa = Store.utente.nome;
                    db.preventivi.push(nuovo);
                    Store.log(db, 'preventivo', nuovo.id, etichetta(nuovo), 'NUOVO PREVENTIVO', Store.diff(null, nuovo, CAMPI));
                  }
                });
                UI.toast('Preventivo salvato.');
                if (opt.onSalvato) opt.onSalvato(nuovo.id);
              }
            });
          }
        }],
        onMount(m) {
          const f = m.el.querySelector('#form-prev');
          const box = m.el.querySelector('#prev-esito');
          const mostra = () => {
            const val = UI.leggiForm(f);
            const finto = Object.assign({}, p, val, { voci: tabella ? tabella.righe : [] });
            box.innerHTML = Sostenibilita.riquadroEsito(Engine.calcolaSostenibilitaPreventivo(finto, Store.db));
          };
          tabella = UI.righeEditabili(m.el.querySelector('#prev-voci'), {
            colonne: [
              { nome: 'voce', titolo: 'Voce di costo specifico', tipo: 'text', larghezza: '220px', placeholder: 'es. Ponteggio di facciata' },
              { nome: 'macroCategoria', titolo: 'Macro-categoria', tipo: 'select', opzioni: categorie },
              { nome: 'quantita', titolo: 'Quantità', tipo: 'number', step: '0.01' },
              { nome: 'um', titolo: 'U.M.', tipo: 'text', larghezza: '70px', placeholder: 'm³' },
              { nome: 'costoUnitario', titolo: 'Costo unitario', tipo: 'euro' },
              { nome: 'ricarico', titolo: 'Ricarico %', tipo: 'pct', step: '0.5' },
              { nome: 'costoTotale', titolo: 'Costo totale', tipo: 'calc', calc: r => Fmt.isNum(r.quantita) && Fmt.isNum(r.costoUnitario) ? E(r.quantita * r.costoUnitario) : Fmt.VUOTO },
              { nome: 'maggiorazione', titolo: 'Maggiorazione €', tipo: 'calc', calc: r => Fmt.isNum(r.quantita) && Fmt.isNum(r.costoUnitario) ? E(r.quantita * r.costoUnitario * Engine.num(r.ricarico)) : Fmt.VUOTO },
              {
                nome: 'prezzoVendita', titolo: 'Prezzo di vendita', tipo: 'calc', calc: r => {
                  if (!Fmt.isNum(r.quantita) || !Fmt.isNum(r.costoUnitario) || S.fattoreRedditivita === null) return Fmt.VUOTO;
                  const sotto = Engine.num(r.ricarico) < S.sogliaRicarico - 1e-12 && r.costoUnitario > 0;
                  const prezzo = E(r.quantita * r.costoUnitario * (1 + Engine.num(r.ricarico)) * S.fattoreRedditivita);
                  return sotto ? '<span style="color:var(--rosso)" title="Ricarico sotto la soglia della Direzione">' + prezzo + ' ⚠</span>' : prezzo;
                }
              }
            ],
            righe: (p.voci || []).map(x => Object.assign({}, x)),
            nuova: () => Schema.nuovaVoceSostenibilita(S.sogliaRicarico),
            testoAggiungi: '+ Aggiungi voce di costo',
            vuoto: 'Nessuna voce di costo specifico: la verifica considera la sola parte strutturale.',
            totali: righe => {
              const costo = righe.reduce((t, r) => t + (Fmt.isNum(r.quantita) && Fmt.isNum(r.costoUnitario) ? r.quantita * r.costoUnitario : 0), 0);
              const magg = righe.reduce((t, r) => t + (Fmt.isNum(r.quantita) && Fmt.isNum(r.costoUnitario) ? r.quantita * r.costoUnitario * Engine.num(r.ricarico) : 0), 0);
              return {
                voce: 'Totale costi specifici', ricarico: costo > 0 ? Pc(magg / costo) : '',
                costoTotale: E(costo), maggiorazione: E(magg),
                prezzoVendita: S.fattoreRedditivita === null ? Fmt.VUOTO : E((costo + magg) * S.fattoreRedditivita)
              };
            },
            onCambio: mostra
          });
          f.addEventListener('input', mostra);
          f.addEventListener('change', mostra);
          mostra();
        }
      });
    },

    // ------------------------------------------------------------ conversione in commessa
    converti(id, onFatto) {
      if (!Store.puo('preventivo.converti')) return UI.permessoNegato();
      const p = Store.preventivo(id); if (!p) return;
      const v = Engine.calcolaSostenibilitaPreventivo(p, Store.db);
      const corpo = '<form id="form-conv" onsubmit="return false">' +
        '<div class="msg info">Dal preventivo <b>' + esc(p.numero) + '</b> nascerà una nuova commessa in Anagrafica. Il preventivo resterà in archivio come storico, di sola lettura, collegato alla commessa.</div>' +
        '<fieldset><legend>Nuova commessa</legend><div class="form-griglia">' +
        UI.campo({ nome: 'codice', etichetta: 'Codice commessa', req: true, aiuto: 'Codice definitivo da assegnare in Anagrafica: deve essere unico.' }, '') +
        UI.campo({ nome: 'dataInserimento', etichetta: 'Data di inserimento', tipo: 'date', req: true }, Fmt.oggi()) +
        '</div></fieldset>' +
        '<fieldset><legend>Valori che verranno riportati</legend>' + kv([
          ['Cliente', T(p.cliente), 'in'], ['Descrizione / Cantiere', T(p.oggetto), 'in'], ['Indirizzo / Località', T(p.indirizzo), 'in'],
          ['Ramo di attività', T(p.ramo), 'in'], ['Tecnico', T(p.tecnico), 'in'],
          ['Contratto iniziale (dal prezzo proposto)', '<b>' + E(v.prezzoComputo) + '</b>', 'calc'],
          ['Budget: ore previste', O(v.ore), 'calc'],
          ['Budget: costi diretti previsti (totale costi specifici)', E(v.totVoci.costoTotale), 'calc'],
          ['Verifica di sostenibilità: ricarico', Pc(v.totVoci.ricaricoMedio === null ? v.parametri.sogliaRicarico : v.totVoci.ricaricoMedio), 'calc'],
          ['Esito della verifica del preventivo', UI.badgeEsito(v.esito), 'calc']
        ]) + '<p class="sotto">Le ' + v.totVoci.n + ' voci di costo specifico confluiscono nel <b>totale</b> dei costi diretti previsti del Budget: nella commessa i costi specifici arrivano da lì, non voce per voce. Il dettaglio resta consultabile in questo preventivo.</p></fieldset></form>';
      UI.modale({
        titolo: 'Converti il preventivo ' + p.numero + ' in commessa', corpo,
        pulsanti: [{
          testo: 'Crea la commessa', classe: 'primario', async azione(m) {
            const val = UI.leggiForm(m.el.querySelector('#form-conv'));
            await UI.salvaConControlli(m, {
              testoConferma: 'Crea la commessa',
              valida: () => {
                const r = Engine.validaConversione(p, Store.db, val.codice);
                if (!Engine.isoOk(val.dataInserimento)) r.errori.push('La DATA DI INSERIMENTO è obbligatoria.');
                return r;
              },
              salva: async () => {
                const nuovoId = await Store.salva(db => {
                  const cur = db.preventivi.find(x => x.id === id);
                  const dati = Engine.commessaDaPreventivo(cur, db, { codice: val.codice, dataInserimento: val.dataInserimento });
                  const c = Object.assign(Schema.nuovaCommessa(), dati, {
                    budget: Object.assign(Schema.nuovaCommessa().budget, dati.budget),
                    sostenibilita: Object.assign(Schema.nuovaCommessa().sostenibilita, dati.sostenibilita),
                    creatoIl: new Date().toISOString(), creatoDa: Store.utente.nome
                  });
                  db.commesse.push(c);
                  cur.commessaId = c.id;
                  cur.convertitoIl = new Date().toISOString();
                  cur.convertitoDa = Store.utente.nome;
                  Store.log(db, 'commessa', c.id, c.codice, 'COMMESSA DA PREVENTIVO ' + cur.numero, Store.diff(null, c, ['codice', 'cliente', 'cantiere', 'contrattoIniziale']));
                  Store.log(db, 'preventivo', cur.id, etichetta(cur), 'CONVERSIONE IN COMMESSA', [{ campo: 'commessaId', prima: '', dopo: c.codice }]);
                  return c.id;
                });
                UI.toast('Commessa ' + val.codice + ' creata dal preventivo ' + p.numero + '.');
                if (onFatto) onFatto(nuovoId);
              }
            });
          }
        }]
      });
    },

    async annulla(id) {
      if (!Store.puo('preventivo.annulla')) return UI.permessoNegato();
      const p = Store.preventivo(id); if (!p) return;
      if (p.commessaId) return UI.toast('Il preventivo è stato convertito in commessa: non può essere annullato.', 'errore');
      const r = await UI.conferma({
        titolo: 'Annulla preventivo', pericolo: true, testoConferma: 'Annulla preventivo', motivo: 'Motivo dell\'annullamento', motivoObbligatorio: true,
        html: 'Il preventivo <b>' + esc(p.numero) + '</b> (' + esc(p.cliente) + ') verrà annullato: resta nello storico ma esce dagli elenchi e dai totali.'
      });
      if (!r) return;
      await Store.salva(db => {
        const cur = db.preventivi.find(x => x.id === id);
        cur.annullato = true; cur.motivoAnnullamento = r.motivo;
        cur.annullatoIl = new Date().toISOString(); cur.annullatoDa = Store.utente.nome;
        Store.log(db, 'preventivo', id, etichetta(cur), 'ANNULLAMENTO PREVENTIVO', [{ campo: 'annullato', prima: false, dopo: true }, { campo: 'motivoAnnullamento', prima: '', dopo: r.motivo }]);
      });
      UI.toast('Preventivo annullato.');
    },
    async ripristina(id) {
      if (!Store.puo('preventivo.modifica')) return UI.permessoNegato();
      await Store.salva(db => {
        const cur = db.preventivi.find(x => x.id === id);
        cur.annullato = false;
        Store.log(db, 'preventivo', id, etichetta(cur), 'RIPRISTINO PREVENTIVO', [{ campo: 'annullato', prima: true, dopo: false }]);
      });
      UI.toast('Preventivo ripristinato.');
    },

    // ------------------------------------------------------------ righe, colonne, esportazione
    righe(filtro) {
      return Store.db.preventivi.filter(filtro || (() => true)).map(p => {
        const v = Engine.calcolaSostenibilitaPreventivo(p, Store.db);
        const c = p.commessaId ? Store.commessa(p.commessaId) : null;
        return Object.assign({}, p, {
          esito: v.esito, prezzoComputo: v.prezzoComputo, ore: v.ore,
          nVoci: v.totVoci.n, costiSpecifici: v.totVoci.costoTotale, ricaricoMedio: v.totVoci.ricaricoMedio,
          prezzoSpecifici: v.prezzoMinimoSpecifici, prezzoStrutturale: v.prezzoMinimoStrutturale,
          prezzoMinimo: v.prezzoMinimo, scostamento: v.scostamento, marginePct: v.marginePct,
          motiviVerifica: v.motivi.join('; '), nSottoSoglia: v.nSottoSoglia,
          codiceCommessa: c ? c.codice : '', verifica: v
        });
      });
    },
    colonne() {
      return [
        { campo: 'numero', titolo: 'Numero', fmt: (v, r) => '<a href="#/preventivo/' + esc(r.id) + '" class="cod">' + esc(v) + '</a>' },
        { campo: 'data', titolo: 'Data', classe: 'nowrap', fmt: v => Dt(v) },
        { campo: 'cliente', titolo: 'Cliente' },
        { campo: 'oggetto', titolo: 'Oggetto / Cantiere', classe: 'desc' },
        { campo: 'tecnico', titolo: 'Tecnico' },
        { campo: 'esito', titolo: 'Esito', fmt: v => UI.badgeEsito(v) },
        { campo: 'prezzoProposto', titolo: 'Prezzo proposto', tipo: 'n', classe: 'in', fmt: v => E(v) },
        { campo: 'ore', titolo: 'Ore previste', tipo: 'n', classe: 'in', fmt: v => O(v) },
        { campo: 'nVoci', titolo: 'Voci', tipo: 'n', fmt: v => v || '<span class="muto">—</span>' },
        { campo: 'costiSpecifici', titolo: 'Costi specifici', tipo: 'n', classe: 'in', fmt: v => E(v) },
        { campo: 'ricaricoMedio', titolo: 'Ricarico medio', tipo: 'n', classe: 'calc', fmt: (v, r) => Pc(v) + (r.nSottoSoglia ? ' <span style="color:var(--rosso)" title="Voci con ricarico sotto la soglia della Direzione">⚠</span>' : '') },
        { campo: 'prezzoStrutturale', titolo: 'Parte strutturale', tipo: 'n', classe: 'calc', fmt: v => E(v) },
        { campo: 'prezzoMinimo', titolo: 'Prezzo minimo', tipo: 'n', classe: 'calc', fmt: v => '<b>' + E(v) + '</b>' },
        { campo: 'scostamento', titolo: 'Scostamento', tipo: 'n', classe: 'calc', fmt: v => Fmt.isNum(v) ? '<span style="color:var(--' + (v < 0 ? 'rosso' : 'verde') + ')">' + E(v) + '</span>' : Fmt.VUOTO },
        { campo: 'marginePct', titolo: '% sul prezzo', tipo: 'n', classe: 'calc', fmt: v => Pc(v) },
        {
          campo: 'codiceCommessa', titolo: 'Commessa', fmt: (v, r) => r.commessaId
            ? '<a href="#/commessa/' + esc(r.commessaId) + '" class="cod">' + esc(v) + '</a>'
            : (r.annullato ? '<span class="muto">—</span>' : '<span class="muto">da convertire</span>')
        },
        {
          campo: 'azioni', titolo: '', ord: false, classe: 'azioni-riga no-barra', fmt: (v, r) => r.annullato
            ? (Store.puo('preventivo.modifica') ? '<button type="button" data-azione="ripristina" data-id="' + esc(r.id) + '">Ripristina</button>' : '')
            : (r.commessaId ? ''
              : (Store.puo('preventivo.modifica') ? '<button type="button" data-azione="modifica" data-id="' + esc(r.id) + '">Modifica</button>' : '') +
              (Store.puo('preventivo.converti') ? '<button type="button" data-azione="converti" data-id="' + esc(r.id) + '">→ Commessa</button>' : ''))
        }
      ];
    },
    azione(az, id) {
      const dopo = () => UI.render();
      if (az === 'modifica') Preventivi.apriForm(id, { onSalvato: dopo });
      else if (az === 'converti') Preventivi.converti(id, () => UI.render());
      else if (az === 'annulla') Preventivi.annulla(id);
      else if (az === 'ripristina') Preventivi.ripristina(id);
    },
    COLONNE_EXPORT: [
      { titolo: 'Numero', campo: 'numero' }, { titolo: 'Data', valore: r => Dt(r.data) }, { titolo: 'Cliente', campo: 'cliente' },
      { titolo: 'Oggetto / Cantiere', campo: 'oggetto' }, { titolo: 'Indirizzo', campo: 'indirizzo' }, { titolo: 'Ramo', campo: 'ramo' }, { titolo: 'Tecnico', campo: 'tecnico' },
      { titolo: 'Esito verifica', campo: 'esito' }, { titolo: 'Motivo esito', campo: 'motiviVerifica' },
      { titolo: 'Prezzo proposto', campo: 'prezzoProposto' }, { titolo: 'Ore previste', campo: 'ore' },
      { titolo: 'Numero voci di costo specifico', campo: 'nVoci' }, { titolo: 'Costi specifici', campo: 'costiSpecifici' },
      { titolo: 'Ricarico medio %', valore: r => r.ricaricoMedio === null ? '' : Math.round(r.ricaricoMedio * 10000) / 100 },
      { titolo: 'Prezzo di vendita costi specifici', campo: 'prezzoSpecifici' }, { titolo: 'Parte strutturale', campo: 'prezzoStrutturale' },
      { titolo: 'Prezzo minimo dall\'analisi', campo: 'prezzoMinimo' }, { titolo: 'Scostamento', campo: 'scostamento' },
      { titolo: 'Scostamento % sul prezzo', valore: r => r.marginePct === null ? '' : Math.round(r.marginePct * 10000) / 100 },
      { titolo: 'Dati del computo verificati', valore: r => r.datiVerificati ? 'SI' : '' },
      { titolo: 'Commessa generata', campo: 'codiceCommessa' }, { titolo: 'Note', campo: 'note' },
      { titolo: 'Annullato', valore: r => r.annullato ? 'SI' : '' }, { titolo: 'Motivo annullamento', campo: 'motivoAnnullamento' }
    ]
  };
  window.Preventivi = Preventivi;

  // ------------------------------------------------------------ elenco dei preventivi
  UI.registra('preventivi', function (cont) {
    const S = Engine.parametriSostenibilita(Store.db.parametri);
    cont.innerHTML = UI.testata('Preventivi',
      'Ipotesi di commessa: esistono solo qui e hanno soltanto la verifica di sostenibilità economica, con tutti i dati inseriti a mano. Non entrano in Anagrafica, nelle dashboard né nei cumulativi finché non vengono convertite in commessa.',
      (Store.puo('preventivo.crea') ? '<button type="button" class="primario" id="btn-nuovo-prev">+ Nuovo preventivo</button>' : '') + UI.pulsanteEsporta('prev')) +
      '<div id="prev-kpi"></div>' +
      '<div class="pannello compatto"><div class="filtri" id="prev-filtri">' +
      '<div class="campo largo"><label>Ricerca</label><input type="search" class="in" name="testo" value="' + esc(F.testo) + '" placeholder="numero, cliente, oggetto, tecnico"></div>' +
      '<div class="campo"><label>Esito</label><select class="in" name="esito"><option value="">Tutti</option>' +
      Engine.ESITI_SOSTENIBILITA.map(e => '<option' + (F.esito === e ? ' selected' : '') + '>' + esc(e) + '</option>').join('') + '</select></div>' +
      '<div class="campo"><label>Conversione</label><label style="text-transform:none;font-size:13px;margin-top:6px"><input type="checkbox" name="soloDaConvertire"' + (F.soloDaConvertire ? ' checked' : '') + '> solo non ancora convertiti</label></div>' +
      '<div class="campo"><label>Annullati</label><label style="text-transform:none;font-size:13px;margin-top:6px"><input type="checkbox" name="annullati"' + (F.annullati ? ' checked' : '') + '> mostra annullati</label></div>' +
      '</div><p class="sotto">Parametri aziendali in uso: costo strutturale ' + E(S.costoOrario) + '/h · rischio ' + Pc(S.rischio) + ' · redditività ' + Pc(S.redditivita) + ' · rientro bancario ' + E(S.rientroOrario) + '/h · ricarico minimo ' + Pc(S.sogliaRicarico) + '.</p></div>' +
      UI.legenda() + '<div id="prev-tab"></div>';

    function aggiorna() {
      let r = Preventivi.righe(p => F.annullati || !p.annullato);
      if (F.soloDaConvertire) r = r.filter(x => !x.commessaId);
      if (F.esito) r = r.filter(x => x.esito === F.esito);
      r = UI.ricerca(r, F.testo, ['numero', 'cliente', 'oggetto', 'tecnico', 'ramo', 'note']);
      const att = r.filter(x => !x.annullato);
      const conta = e => att.filter(x => x.esito === e).length;
      const somma = f => att.reduce((t, x) => t + Engine.num(x[f]), 0);
      const scost = somma('prezzoProposto') - somma('prezzoMinimo');
      document.getElementById('prev-kpi').innerHTML = '<div class="kpi-griglia">' +
        UI.kpi('Preventivi nella selezione', att.length, { calc: false }) +
        UI.kpi('Congrui', conta('CONGRUA'), { colore: 'verde' }) +
        UI.kpi('Non congrui', conta('NON CONGRUA') + conta('NON CONGRUO'), { colore: 'rosso' }) +
        UI.kpi('Da completare', conta('DA COMPLETARE'), { colore: 'giallo' }) +
        UI.kpi('Convertiti in commessa', att.filter(x => x.commessaId).length, { calc: false }) +
        UI.kpi('Prezzi proposti', E(somma('prezzoProposto'))) +
        UI.kpi('Prezzo minimo dall\'analisi', E(somma('prezzoMinimo'))) +
        UI.kpi('Scostamento complessivo', E(scost), { colore: scost < 0 ? 'rosso' : 'verde' }) +
        '</div>';
      const t = document.getElementById('prev-tab');
      t.innerHTML = UI.tabella('prev', {
        colonne: Preventivi.colonne(), righe: r, chiave: 'id', ordine: { campo: 'numero', dir: 'desc' },
        classeRiga: x => x.annullato ? 'annullato' : ((x.esito === 'NON CONGRUA' || x.esito === 'NON CONGRUO') ? 'riga-non-congrua' : ''),
        vuoto: 'Nessun preventivo per i criteri selezionati.',
        onRiga: id => UI.vai('#/preventivo/' + id),
        onAzione: Preventivi.azione,
        totali: {
          numero: 'Totale', prezzoProposto: E(somma('prezzoProposto')), ore: O(somma('ore')),
          costiSpecifici: E(somma('costiSpecifici')), prezzoStrutturale: E(somma('prezzoStrutturale')),
          prezzoMinimo: E(somma('prezzoMinimo')), scostamento: E(scost)
        }
      });
      UI.legaTabelle(t);
    }
    const fil = document.getElementById('prev-filtri');
    const onCambio = UI.debounce(() => { fil.querySelectorAll('[name]').forEach(el => { F[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); aggiorna(); }, 150);
    fil.addEventListener('input', onCambio); fil.addEventListener('change', onCambio);
    const bn = document.getElementById('btn-nuovo-prev');
    if (bn) bn.onclick = () => Preventivi.apriForm(null, { onSalvato: id => UI.vai('#/preventivo/' + id) });
    const be = cont.querySelector('[data-esporta="prev"]');
    if (be) be.onclick = () => UI.esportaCsv('preventivi', UI.righeOrdinate('prev'), Preventivi.COLONNE_EXPORT);
    aggiorna();
  });

  // ------------------------------------------------------------ scheda del singolo preventivo
  UI.registra('preventivo', function (cont, params) {
    const id = params[0];
    const p = Store.preventivo(id);
    if (!p) { cont.innerHTML = UI.barraRitorno('<b>Preventivo</b>') + '<div class="msg errore">Preventivo non trovato.</div>'; return; }
    const v = Engine.calcolaSostenibilitaPreventivo(p, Store.db);
    const c = p.commessaId ? Store.commessa(p.commessaId) : null;
    const bloccato = !!p.commessaId || p.annullato;

    const azioni =
      (!bloccato && Store.puo('preventivo.modifica') ? '<button type="button" class="primario" id="b-mod">✎ Modifica preventivo</button>' : '') +
      (!bloccato && Store.puo('preventivo.converti') ? '<button type="button" id="b-conv">→ Converti in commessa</button>' : '') +
      UI.pulsanteEsporta('scheda-prev', 'Esporta (CSV)') + '<button type="button" onclick="window.print()">Stampa</button>' +
      (!bloccato && Store.puo('preventivo.annulla') ? '<button type="button" class="pericolo" id="b-ann">Annulla</button>' : '') +
      (p.annullato && Store.puo('preventivo.modifica') ? '<button type="button" id="b-rip">Ripristina</button>' : '');

    const stato = p.annullato ? ' &nbsp;<span class="badge neutro">PREVENTIVO ANNULLATO</span>'
      : (c ? ' &nbsp;<span class="badge esito-congrua">CONVERTITO IN COMMESSA ' + esc(c.codice) + '</span>' : '');

    cont.innerHTML = '<div class="scheda-commessa">' + UI.barraRitorno('<b>Preventivo ' + esc(p.numero) + '</b>') +
      UI.testata(p.numero + ' · ' + p.cliente, esc(p.oggetto) + ' &nbsp;·&nbsp; ' + UI.badgeEsito(v.esito) + (p.tecnico ? ' &nbsp;·&nbsp; tecnico ' + esc(p.tecnico) : '') + stato, azioni, 'Preventivo') +
      (c ? '<div class="msg info">Preventivo convertito il ' + Fmt.dataOra(p.convertitoIl) + ' da ' + esc(p.convertitoDa || '') + ' nella commessa <a href="#/commessa/' + esc(c.id) + '"><b>' + esc(c.codice) + '</b></a>: resta di sola lettura come storico dell\'offerta.</div>' : '') +
      (p.annullato ? '<div class="msg avviso">Preventivo annullato: ' + esc(p.motivoAnnullamento || '') + '</div>' : '') +
      UI.legenda() +
      '<div class="griglia-2"><div class="pannello"><h2>Dati del preventivo</h2>' + kv([
        ['Numero', '<b>' + esc(p.numero) + '</b>', 'in'], ['Data', Dt(p.data), 'in'], ['Cliente', T(p.cliente), 'in'],
        ['Oggetto / Cantiere', T(p.oggetto), 'in'], ['Indirizzo / Località', T(p.indirizzo), 'in'],
        ['Ramo di attività', T(p.ramo), 'in'], ['Tecnico', T(p.tecnico), 'in']
      ]) + '</div><div class="pannello"><h2>Proposta economica</h2>' + kv([
        ['Prezzo proposto', '<b>' + E(v.prezzoComputo) + '</b>', 'in'],
        ['Ore totali previste', O(v.ore), 'in'],
        ['Voci di costo specifico', v.totVoci.n, 'in'],
        ['Totale costi specifici', E(v.totVoci.costoTotale), 'calc'],
        ['Ricarico medio', Pc(v.totVoci.ricaricoMedio), 'calc'],
        ['Prezzo minimo dall\'analisi', '<b>' + E(v.prezzoMinimo) + '</b>', 'calc'],
        ['Scostamento', '<b>' + E(v.scostamento) + '</b>', 'calc']
      ]) + '</div></div>' +
      Sostenibilita.pannelli(v, { etichettaPrezzo: 'prezzo proposto nel preventivo' }) + '</div>';

    const b = x => document.getElementById(x);
    if (b('b-mod')) b('b-mod').onclick = () => Preventivi.apriForm(id, { onSalvato: () => UI.render() });
    if (b('b-conv')) b('b-conv').onclick = () => Preventivi.converti(id, () => UI.render());
    if (b('b-ann')) b('b-ann').onclick = () => Preventivi.annulla(id);
    if (b('b-rip')) b('b-rip').onclick = () => Preventivi.ripristina(id);
    const be = cont.querySelector('[data-esporta="scheda-prev"]');
    if (be) be.onclick = () => {
      const riga = Preventivi.righe(x => x.id === id)[0];
      UI.esportaCsv('preventivo_' + p.numero, [riga], Preventivi.COLONNE_EXPORT);
    };
  });
})();
