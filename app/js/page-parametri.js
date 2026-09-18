/* FIDA EDILE – Parametri di controllo, liste, utenti, esercizio, dati */
(function () {
  'use strict';
  const esc = UI.esc;
  const GRUPPI = ['Controllo cantieri', 'Sostenibilità economica della commessa'];
  const PARAMETRI = [
    { nome: 'costoOrario', gruppo: 0, etichetta: 'Costo strutturale aziendale corrente', tipo: 'euro', unita: '€/h', spiegazione: 'Parametro unico FIDA EDILE utilizzato per valorizzare economicamente le ore effettive delle commesse. Il costo effettivo cumulato è determinato da: ore effettive cumulative × costo strutturale corrente + costi diretti cumulativi. È anche il costo strutturale orario della verifica di sostenibilità economica: una sola fonte per tutta l\'applicazione.' },
    { nome: 'scartoTempoAttenzione', etichetta: 'Scarto tempo – attenzione', tipo: 'pct', spiegazione: 'Soglia di attenzione quando la % di SAL maturato risulta inferiore alla % di avanzamento temporale della commessa oltre questo scostamento.' },
    { nome: 'scartoTempoCritico', etichetta: 'Scarto tempo – critico', tipo: 'pct', spiegazione: 'Soglia critica quando la % di SAL maturato risulta inferiore alla % di avanzamento temporale della commessa oltre questo scostamento.' },
    { nome: 'scartoOreAttenzione', etichetta: 'Scarto ore – attenzione', tipo: 'pct', spiegazione: 'Soglia di attenzione quando la % di ore consumate supera la % di SAL maturato oltre questo scostamento.' },
    { nome: 'scartoOreCritico', etichetta: 'Scarto ore – critico', tipo: 'pct', spiegazione: 'Soglia critica quando la % di ore consumate supera la % di SAL maturato oltre questo scostamento.' },
    { nome: 'sogliaSalNonFatturato', etichetta: 'Soglia SAL non fatturato', tipo: 'pct', spiegazione: 'Percentuale del valore contrattuale oltre la quale il SAL maturato ma non ancora fatturato viene considerato significativo.' },
    { nome: 'annoGestione', etichetta: 'Anno di gestione', tipo: 'number', spiegazione: 'Anno operativo utilizzato per distinguere saldi iniziali e movimenti dell\'esercizio. Si modifica di norma con la funzione "Chiusura esercizio".' },
    { nome: 'giorniAggiornamentoRecente', etichetta: 'Giorni per "aggiornamento recente"', tipo: 'number', unita: 'gg', spiegazione: 'Numero intero di giorni oltre il quale una commessa è considerata non aggiornata: alimenta il filtro "senza aggiornamento da oltre N gg" della Dashboard, confrontando la data AGGIORNATO AL con oggi.' },
    { nome: 'rischioStrutturale', gruppo: 1, etichetta: 'Rischio strutturale', tipo: 'pct', spiegazione: 'Maggiorazione prudenziale applicata al costo strutturale attribuito alla commessa, a copertura di imprevisti: costo strutturale prudenziale = costo strutturale × (1 + rischio).' },
    { nome: 'redditivita', gruppo: 1, etichetta: 'Redditività', tipo: 'pct', spiegazione: 'Margine che l\'azienda deve conservare sul prezzo. Un costo viene "portato a redditività" dividendolo per (1 − redditività): vale sia per la parte strutturale sia per i costi specifici.' },
    { nome: 'rientroOrario', gruppo: 1, etichetta: 'Rientro bancario per ora', tipo: 'euro', unita: '€/h', spiegazione: 'Quota oraria destinata al rientro bancario, che si somma al prezzo della parte strutturale: si ottiene dividendo il rientro bancario mensile per le ore produttive aziendali mensili.' },
    { nome: 'sogliaRicaricoDirezione', gruppo: 1, etichetta: 'Soglia minima di ricarico (Direzione)', tipo: 'pct', spiegazione: 'Ricarico minimo stabilito dalla Direzione sulle voci di costo specifico. Nelle righe il ricarico può essere aumentato, ma un valore inferiore rende la verifica NON CONGRUO.' }
  ];
  function valoreParam(p, v) { return p.tipo === 'pct' ? Fmt.pct(v, 2) : (p.tipo === 'euro' ? Fmt.euro(v) + (p.unita ? '/h' : '') : (Fmt.isNum(v) ? String(v) + (p.unita ? ' ' + p.unita : '') : '—')); }

  function apriParametri() {
    if (!Store.puo('parametri')) return UI.permessoNegato();
    const P = Store.db.parametri;
    const campi = g => PARAMETRI.filter(x => (x.gruppo || 0) === g).map(x => UI.campo({ nome: x.nome, etichetta: x.etichetta + (x.unita ? ' (' + x.unita + ')' : (x.tipo === 'pct' ? ' (%)' : '')), tipo: x.tipo === 'number' ? 'number' : x.tipo, step: x.tipo === 'number' ? '1' : undefined, aiuto: x.spiegazione }, P[x.nome])).join('');
    const corpo = '<form id="form-par" onsubmit="return false"><div class="msg info">Le percentuali si inseriscono come numero (es. 7 = 7 %).</div>' +
      GRUPPI.map((g, i) => '<fieldset><legend>' + esc(g) + '</legend><div class="form-griglia">' + campi(i) + '</div>' +
        (i === 1 ? '<p class="aiuto">Il costo strutturale orario non si ripete qui: è quello del gruppo «Controllo cantieri».</p>' : '') + '</fieldset>').join('') +
      '</form>';
    UI.modale({
      titolo: 'Modifica parametri di controllo', corpo,
      pulsanti: [{
        testo: 'Salva', classe: 'primario', async azione(m) {
          const v = UI.leggiForm(m.el.querySelector('#form-par'));
          const nuovo = Object.assign({}, P, v);
          const val = Engine.validaParametri(nuovo);
          const avvisi = [];
          if (nuovo.annoGestione !== P.annoGestione) avvisi.push('Stai cambiando l\'ANNO DI GESTIONE da ' + P.annoGestione + ' a ' + nuovo.annoGestione + ' senza chiusura esercizio: i cumulativi useranno i saldi e i movimenti del nuovo anno.');
          await UI.salvaConControlli(m, {
            valida: () => ({ errori: val.errori, avvisi }),
            salva: async () => {
              await Store.salva(db => {
                const mod = Store.diff(db.parametri, nuovo, PARAMETRI.map(p => p.nome));
                Object.assign(db.parametri, nuovo);
                if (mod.length) Store.log(db, 'parametri', '', '', 'MODIFICA PARAMETRI', mod);
              });
              UI.toast('Parametri salvati.');
            }
          });
        }
      }]
    });
  }

  function apriListe() {
    if (!Store.puo('parametri')) return UI.permessoNegato();
    const L = Store.db.liste;
    const corpo = '<form id="form-liste" onsubmit="return false"><div class="form-griglia">' +
      UI.campo({ nome: 'macroCategorie', etichetta: 'Macro-categorie costi diretti (una per riga)', tipo: 'textarea', classe: 'largo' }, L.macroCategorie.join('\n')) +
      UI.campo({ nome: 'rami', etichetta: 'Rami di attività suggeriti', tipo: 'textarea' }, L.rami.join('\n')) +
      UI.campo({ nome: 'tecnici', etichetta: 'Tecnici suggeriti', tipo: 'textarea' }, L.tecnici.join('\n')) +
      UI.campo({ nome: 'preposti', etichetta: 'Preposti suggeriti', tipo: 'textarea' }, L.preposti.join('\n')) +
      '</div></form>';
    UI.modale({
      titolo: 'Liste di supporto', corpo,
      pulsanti: [{
        testo: 'Salva', classe: 'primario', async azione(m) {
          const v = UI.leggiForm(m.el.querySelector('#form-liste'));
          const norm = s => Array.from(new Set(String(s || '').split('\n').map(x => x.trim()).filter(x => x)));
          await Store.salva(db => {
            const nuovo = { macroCategorie: norm(v.macroCategorie), rami: norm(v.rami), tecnici: norm(v.tecnici), preposti: norm(v.preposti) };
            const mod = Store.diff(db.liste, nuovo, Object.keys(nuovo));
            Object.assign(db.liste, nuovo);
            if (mod.length) Store.log(db, 'parametri', '', '', 'MODIFICA LISTE', mod);
          });
          m.chiudi(); UI.toast('Liste salvate.');
        }
      }]
    });
  }

  function apriPesi() {
    if (!Store.puo('parametri')) return UI.permessoNegato();
    const P = Store.db.parametri;
    const attuali = Engine.pesiStrutturali(Store.db);
    const corpo = '<div class="msg info">Ripartizione del costo strutturale orario di <b>' + Fmt.euro(P.costoOrario) + '/h</b> fra le voci di costo aziendali. ' +
      'Serve al dettaglio della verifica di sostenibilità: la quota €/ora di ogni voce è il costo strutturale per il suo peso. <b>La somma dei pesi deve fare 100 %.</b></div>' +
      '<div id="pesi-righe"></div>';
    let tabella = null;
    UI.modale({
      titolo: 'Pesi del costo strutturale', corpo, larga: true,
      pulsanti: [{
        testo: 'Salva', classe: 'primario', async azione(m) {
          const nuovo = tabella.righe.map(x => ({ gruppo: x.gruppo || '', voce: String(x.voce || '').trim(), peso: Engine.num(x.peso) }));
          await UI.salvaConControlli(m, {
            valida: () => Engine.validaPesiStrutturali(nuovo),
            salva: async () => {
              await Store.salva(db => {
                const mod = Store.diff({ pesiStrutturali: Engine.pesiStrutturali(db) }, { pesiStrutturali: nuovo }, ['pesiStrutturali']);
                db.liste.pesiStrutturali = nuovo;
                if (mod.length) Store.log(db, 'parametri', '', '', 'MODIFICA PESI DEL COSTO STRUTTURALE', [{ campo: 'pesiStrutturali', prima: attuali.length + ' voci', dopo: nuovo.length + ' voci' }]);
              });
              UI.toast('Pesi del costo strutturale salvati.');
            }
          });
        }
      }, {
        testo: 'Ripristina i pesi del modello', azione(m) {
          tabella.imposta(Engine.PESI_STRUTTURALI_DEFAULT);
          m.msg('<div class="msg info">Pesi originali del modello ripristinati nella tabella: premere <b>Salva</b> per confermare.</div>');
        }
      }],
      onMount(m) {
        const box = m.el.querySelector('#pesi-righe');
        tabella = UI.righeEditabili(box, {
          colonne: [
            { nome: 'gruppo', titolo: 'Gruppo', tipo: 'select', opzioni: Engine.GRUPPI_STRUTTURALI, larghezza: '200px' },
            { nome: 'voce', titolo: 'Voce di costo', tipo: 'text', larghezza: '260px' },
            { nome: 'peso', titolo: 'Peso %', tipo: 'pct', step: '0.000001', decimali: 6 },
            { nome: 'quota', titolo: 'Quota €/ora', tipo: 'calc', calc: r => Fmt.euro(Engine.num(P.costoOrario) * Engine.num(r.peso)) }
          ],
          righe: attuali.map(x => Object.assign({}, x)),
          nuova: () => ({ gruppo: Engine.GRUPPI_STRUTTURALI[0], voce: '', peso: null }),
          testoAggiungi: '+ Aggiungi voce di peso',
          min: 1,
          totali: righe => {
            const tot = righe.reduce((t, r) => t + Engine.num(r.peso), 0);
            const ok = Math.abs(tot - 1) < 1e-6;
            return {
              voce: 'Totale',
              peso: '<span style="color:var(--' + (ok ? 'verde' : 'rosso') + ')">' + Fmt.pct(tot, 2) + '</span>',
              quota: Fmt.euro(Engine.num(P.costoOrario) * tot)
            };
          }
        });
      }
    });
  }

  function apriUtente(id) {
    if (!Store.puo('utenti')) return UI.permessoNegato();
    const u = id ? Store.db.utenti.find(x => x.id === id) : { id: Schema.genId('u'), nome: '', ruolo: 'operativo', attivo: true };
    const corpo = '<form id="form-utente" onsubmit="return false"><div class="form-griglia">' +
      UI.campo({ nome: 'nome', etichetta: 'Nome', req: true }, u.nome) +
      UI.campo({ nome: 'ruolo', etichetta: 'Ruolo', tipo: 'select', opzioni: Engine.RUOLI, vuoto: false, aiuto: 'Admin: tutto, comprese Dashboard di analisi e pagine di Sistema · Direzione: tutto tranne quelle · Operativo: movimenti, costi, anagrafica, aggiornato al · Consultazione: sola lettura.' }, u.ruolo) +
      UI.campo({ nome: 'attivo', etichetta: 'Stato', tipo: 'checkbox', testoCheck: 'utente attivo' }, u.attivo !== false) +
      '</div></form>';
    UI.modale({
      titolo: id ? 'Modifica utente' : 'Nuovo utente', corpo, stretta: true,
      pulsanti: [{
        testo: 'Salva', classe: 'primario', async azione(m) {
          const v = UI.leggiForm(m.el.querySelector('#form-utente'));
          if (!v.nome) { m.msg('<div class="msg errore">Il nome è obbligatorio.</div>'); return; }
          if (id === Store.utente.id && (v.ruolo !== Store.utente.ruolo || !v.attivo)) { m.msg('<div class="msg errore">Non puoi cambiare il ruolo o disattivare l\'utente con cui sei collegato.</div>'); return; }
          await Store.salva(db => {
            const nuovo = { id: u.id, nome: v.nome, ruolo: v.ruolo, attivo: !!v.attivo };
            const cur = db.utenti.find(x => x.id === u.id);
            const mod = Store.diff(cur, nuovo, ['nome', 'ruolo', 'attivo']);
            if (cur) Object.assign(cur, nuovo); else db.utenti.push(nuovo);
            if (!db.utenti.some(x => x.ruolo === 'admin' && x.attivo !== false)) throw new Error('Deve restare almeno un utente Amministratore attivo: senza di lui questa pagina diventa irraggiungibile.');
            Store.log(db, 'utenti', nuovo.id, nuovo.nome, cur ? 'MODIFICA UTENTE' : 'NUOVO UTENTE', mod);
          });
          m.chiudi(); UI.toast('Utente salvato.');
        }
      }]
    });
  }

  async function chiusuraEsercizio() {
    if (!Store.puo('chiusura')) return UI.permessoNegato();
    const p = Engine.preparaChiusura(Store.db);
    const riga = (s, extra) => '<tr><td><span class="cod">' + esc(s.codice) + '</span> ' + esc(s.etichetta.slice(s.codice.length)) + (extra || '') + '</td><td class="n">' + Fmt.euro(s.sal) + '</td><td class="n">' + Fmt.euro(s.fatturatoLordo) + '</td><td class="n">' + Fmt.euro(s.ritenute) + '</td><td class="n">' + Fmt.euro(s.svincoli) + '</td><td class="n">' + Fmt.euro(s.perditeSal) + '</td><td class="n">' + Fmt.ore(s.ore) + '</td><td class="n">' + Fmt.euro(s.costiDiretti) + '</td></tr>';
    const tabella = (righe, vuoto) => '<div class="tabella-wrap"><table class="tab"><thead><tr><th>Commessa</th><th class="n">SAL</th><th class="n">Fatturato</th><th class="n">Ritenute</th><th class="n">Svincoli</th><th class="n">Perdite</th><th class="n">Ore</th><th class="n">Costi diretti</th></tr></thead><tbody>' +
      (righe.length ? righe.join('') : '<tr><td colspan="8" class="vuoto">' + esc(vuoto) + '</td></tr>') + '</tbody></table></div>';
    const corpo = '<div class="msg avviso"><b>Operazione di fine anno.</b> Le commesse ancora APERTE passano all\'esercizio ' + p.nuovoAnno + ' con il cumulativo al 31/12/' + p.anno + ' come SALDO INIZIALE. ' +
      'Le commesse già FINITE vengono invece DEFINITE: non ricevono saldo iniziale ed escono dal portafoglio operativo, ma restano consultabili con tutti i loro valori. ' +
      'I movimenti e i costi ' + p.anno + ' restano conservati nello storico ma escono dai cumulativi. Prima di procedere viene scaricata una copia di sicurezza.</div>' +
      (p.senzaInizio.length ? '<div class="msg errore">Commesse con valori ma senza DATA DI INIZIO EFFETTIVA (non risulteranno pregresse): ' + p.senzaInizio.map(esc).join(', ') + '. Compilare la data prima di chiudere.</div>' : '') +
      '<h3>Riportate nell\'esercizio ' + p.nuovoAnno + ' (' + p.saldi.length + ')</h3>' +
      tabella(p.saldi.map(s => riga(s)), 'Nessuna commessa aperta con valori cumulativi.') +
      '<h3 style="margin-top:16px">Definite, senza saldo iniziale (' + p.definite.length + ')</h3>' +
      (p.definite.some(s => s.residui.length) ? '<div class="msg avviso">Alcune commesse finite hanno ancora partite aperte (indicate sotto): definendole escono comunque dal portafoglio. Se una va seguita anche l\'anno prossimo, annulla, riportala a uno stato non finito e richiama la chiusura.</div>' : '') +
      tabella(p.definite.map(s => riga(s, ' <span class="badge neutro">definita</span>' + (s.residui.length ? '<div class="muto piccolo">' + esc(s.residui.join(' – ')) + '</div>' : ''))), 'Nessuna commessa finita da definire.') +
      '<div class="campo" style="margin-top:12px"><label>Per confermare digita l\'anno da chiudere: <b>' + p.anno + '</b></label><input type="text" class="in" id="chiusura-conf" autocomplete="off"></div>';
    UI.modale({
      titolo: 'Chiusura esercizio ' + p.anno + ' → apertura ' + p.nuovoAnno, corpo,
      pulsanti: [{
        testo: 'Chiudi esercizio ' + p.anno, classe: 'pericolo', async azione(m) {
          if (m.el.querySelector('#chiusura-conf').value.trim() !== String(p.anno)) { m.msg('<div class="msg errore">Digitare l\'anno per confermare.</div>'); return; }
          if (p.senzaInizio.length) { m.msg('<div class="msg errore">Completare le date di inizio effettiva prima della chiusura.</div>'); return; }
          Fmt.scarica('backup_prima_chiusura_' + p.anno + '.json', Store.esportaJson(), 'application/json');
          await Store.salva(db => {
            const pp = Engine.preparaChiusura(db);
            pp.saldi.forEach(s => {
              db.saldi.filter(x => x.commessaId === s.commessaId && x.anno === pp.nuovoAnno && !x.annullato).forEach(x => { x.annullato = true; x.motivoAnnullamento = 'Sostituito dalla chiusura esercizio'; });
              db.saldi.push(Object.assign(Schema.nuovoSaldo(pp.nuovoAnno), { commessaId: s.commessaId, sal: s.sal, fatturatoLordo: s.fatturatoLordo, ritenute: s.ritenute, svincoli: s.svincoli, perditeSal: s.perditeSal, ore: s.ore, costiDiretti: s.costiDiretti, note: 'Generato dalla chiusura esercizio ' + pp.anno, creatoIl: new Date().toISOString() }));
            });
            // Le commesse finite non ricevono saldo iniziale: si definiscono, congelando i valori finali
            // sulla commessa stessa. Movimenti, costi e saldi degli anni passati restano intatti.
            const adesso = new Date().toISOString();
            pp.definite.forEach(s => {
              const cur = db.commesse.find(x => x.id === s.commessaId);
              if (!cur || cur.chiusuraDefinitiva) return;
              cur.chiusuraDefinitiva = {
                anno: pp.anno, data: adesso, utente: Store.utente.nome,
                sal: s.sal, fatturatoLordo: s.fatturatoLordo, ritenute: s.ritenute, svincoli: s.svincoli,
                perditeSal: s.perditeSal, ore: s.ore, costiDiretti: s.costiDiretti
              };
              Store.log(db, 'commessa', cur.id, cur.codice, 'COMMESSA DEFINITA', [{ campo: 'chiusuraDefinitiva', prima: '', dopo: 'chiusura esercizio ' + pp.anno }]);
            });
            db.esercizi.push({ anno: pp.anno, chiusoIl: adesso, utente: Store.utente.nome, saldiGenerati: pp.saldi.length, commesseDefinite: pp.definite.length });
            db.parametri.annoGestione = pp.nuovoAnno;
            Store.log(db, 'esercizio', String(pp.anno), '', 'CHIUSURA ESERCIZIO', [{ campo: 'annoGestione', prima: pp.anno, dopo: pp.nuovoAnno }, { campo: 'saldiGenerati', prima: '', dopo: pp.saldi.length }, { campo: 'commesseDefinite', prima: '', dopo: pp.definite.length }]);
          });
          m.chiudi(); UI.toast('Esercizio ' + p.anno + ' chiuso: ' + p.saldi.length + ' commesse riportate, ' + p.definite.length + ' definite. Ora sei nell\'esercizio ' + p.nuovoAnno + '.'); UI.render();
        }
      }]
    });
  }

  UI.registra('parametri', function (cont) {
    const P = Store.db.parametri, puo = Store.puo('parametri');
    cont.innerHTML = UI.testata('Parametri di controllo', 'Solo i parametri realmente modificabili dall\'utente. Ogni modifica viene tracciata nel registro.',
      (puo ? '<button type="button" class="primario" id="btn-par">Modifica parametri</button>' : '')) +
      '<div class="tabella-wrap"><table class="tab"><thead><tr><th>Parametro</th><th class="n">Valore</th><th>Spiegazione</th></tr></thead><tbody>' +
      GRUPPI.map((g, i) => '<tr class="totale"><td colspan="3">' + esc(g) + '</td></tr>' +
        PARAMETRI.filter(x => (x.gruppo || 0) === i).map(x => '<tr><td><b>' + esc(x.etichetta) + '</b></td><td class="n in">' + valoreParam(x, P[x.nome]) + '</td><td class="sotto">' + esc(x.spiegazione) + '</td></tr>').join('')).join('') + '</tbody></table></div>' +
      '<p class="sotto">Ricarico effettivo minimo derivato: <b>' + Fmt.pct(Engine.parametriSostenibilita(P).ricaricoEffettivoMinimo) + '</b> = (1 + soglia minima di ricarico) ÷ (1 − redditività) − 1.</p>' +

      '<h2 style="margin-top:26px">Liste di supporto</h2><div class="pannello"><div class="griglia-2"><div><b>Macro-categorie costi diretti</b><div class="sotto">' + esc(Store.db.liste.macroCategorie.join(' · ')) + '</div></div>' +
      '<div><b>Rami / tecnici / preposti suggeriti</b><div class="sotto">' + esc(Store.db.liste.rami.join(' · ') || '—') + '<br>' + esc(Store.db.liste.tecnici.join(' · ') || '—') + '<br>' + esc(Store.db.liste.preposti.join(' · ') || '—') + '</div></div></div>' +
      (puo ? '<p><button type="button" id="btn-liste">Modifica liste</button></p>' : '') + '</div>' +

      '<h2>Pesi del costo strutturale</h2><div class="pannello"><p class="sotto">Ripartizione del costo strutturale di ' + Fmt.euro(P.costoOrario) + '/h usata dal dettaglio della verifica di sostenibilità economica.</p>' +
      '<div class="tabella-wrap"><table class="tab"><thead><tr><th>Gruppo</th><th>Voce di costo</th><th class="n">Peso</th><th class="n">Quota €/ora</th></tr></thead><tbody>' +
      (function () {
        const d = Engine.dettaglioStrutturale(Store.db, 0);
        return d.righe.map(x => '<tr><td class="piccolo">' + esc(x.gruppo) + '</td><td>' + esc(x.voce) + '</td><td class="n in">' + Fmt.pct(x.peso, 2) + '</td><td class="n calc">' + Fmt.euro(x.quotaOraria) + '</td></tr>').join('') +
          '<tr class="totale"><td></td><td>Totale</td><td class="n">' + Fmt.pct(d.tot.peso, 2) + '</td><td class="n">' + Fmt.euro(d.tot.quotaOraria) + '</td></tr>';
      })() + '</tbody></table></div>' +
      (Engine.dettaglioStrutturale(Store.db, 0).pesiCoerenti ? '' : '<div class="msg avviso">La somma dei pesi non è 100 %: la ripartizione non è coerente con il costo strutturale.</div>') +
      (puo ? '<p><button type="button" id="btn-pesi">Modifica pesi</button></p>' : '') + '</div>' +

      '<h2>Utenti e livelli di utilizzo</h2><div class="pannello"><div class="tabella-wrap"><table class="tab"><thead><tr><th>Nome</th><th>Ruolo</th><th>Stato</th><th></th></tr></thead><tbody>' +
      Store.db.utenti.map(u => '<tr><td><b>' + esc(u.nome) + '</b></td><td><span class="badge neutro">' + esc(u.ruolo) + '</span></td><td>' + (u.attivo === false ? '<span class="badge neutro">disattivato</span>' : 'attivo') + '</td><td class="azioni-riga">' + (Store.puo('utenti') ? '<button type="button" data-utente="' + esc(u.id) + '">Modifica</button>' : '') + '</td></tr>').join('') +
      '</tbody></table></div>' + (Store.puo('utenti') ? '<p><button type="button" id="btn-utente">+ Nuovo utente</button></p>' : '') +
      '<p class="sotto">Direzione: vede e modifica tutto (parametri, saldi iniziali, budget, note direzionali). Operativo: anagrafica, movimenti, costi diretti, aggiornato al. Consultazione: sola visualizzazione ed esportazione. L\'utente si sceglie dalla tendina nella barra laterale (all\'avvio l\'app si apre come Operativo); solo Direzione richiede la password. Le pagine Dashboard e Controllo cantieri sono visibili solo alla Direzione.</p></div>' +

      '<h2>Gestione annuale</h2><div class="pannello"><p>Esercizio in gestione: <b>' + esc(P.annoGestione) + '</b> · cumulativi = saldi al ' + Fmt.data(Engine.dataSaldo(P.annoGestione)) + ' + movimenti ' + esc(P.annoGestione) + '.</p>' +
      (Store.db.esercizi.length ? '<div class="sotto">Chiusure effettuate: ' + Store.db.esercizi.map(e => e.anno + ' (' + Fmt.dataOra(e.chiusoIl) + ', ' + esc(e.utente) + ', ' + e.saldiGenerati + ' saldi)').join(' · ') + '</div>' : '') +
      (Store.puo('chiusura') ? '<p><button type="button" class="pericolo" id="btn-chiusura">Chiusura esercizio ' + esc(P.annoGestione) + ' → ' + esc(P.annoGestione + 1) + '</button></p>' : '') + '</div>' +

      '<h2>Dati e copie di sicurezza</h2><div class="pannello"><p>Modalità: <span class="pill ' + Store.modo + '">' + (Store.modo === 'server' ? 'server locale – i dati sono nel file data/database.json (con backup giornaliero in data/backup)' : 'file – i dati sono salvati nel browser di questo PC') + '</span></p>' +
      '<p class="sotto">Commesse: ' + Store.db.commesse.length + ' · Movimenti: ' + Store.db.movimenti.length + ' · Costi: ' + Store.db.costi.length + ' · Saldi: ' + Store.db.saldi.length + ' · Voci registro: ' + Store.db.audit.length + '</p>' +
      '<div class="btn-gruppo"><button type="button" id="btn-backup">Scarica copia di sicurezza (JSON)</button>' +
      '<button type="button" id="btn-modello-commesse">Scarica il modello Excel delle commesse</button>' +
      (Store.puo('dati') ? '<button type="button" id="btn-ripristino">Ripristina da copia di sicurezza…</button><input type="file" id="file-ripristino" accept=".json,application/json" hidden>' : '') +
      (Store.puo('dati') && Store.db.commesse.length === 0 ? '<button type="button" id="btn-demo">Carica dati dimostrativi (casi di test A, B, C)</button>' : '') + '</div>' +
      (Store.modo === 'file' ? '<p class="sotto">In modalità file, per condividere i dati con un altro PC: scarica la copia di sicurezza e ripristinala sull\'altro PC. Per un archivio condiviso in rete avviare l\'app con server.js (vedi README).</p>' : '') + '</div>';

    const b = id => document.getElementById(id);
    if (b('btn-par')) b('btn-par').onclick = apriParametri;
    if (b('btn-liste')) b('btn-liste').onclick = apriListe;
    if (b('btn-pesi')) b('btn-pesi').onclick = apriPesi;
    if (b('btn-utente')) b('btn-utente').onclick = () => apriUtente(null);
    cont.querySelectorAll('[data-utente]').forEach(x => x.onclick = () => apriUtente(x.dataset.utente));
    if (b('btn-chiusura')) b('btn-chiusura').onclick = chiusuraEsercizio;
    b('btn-backup').onclick = () => { Fmt.scarica(Fmt.nomeFileData('backup_fida_edile', 'json'), Store.esportaJson(), 'application/json'); UI.toast('Copia di sicurezza scaricata.'); };
    b('btn-modello-commesse').onclick = () => Importa.scaricaModello(false);
    if (b('btn-ripristino')) {
      b('btn-ripristino').onclick = () => b('file-ripristino').click();
      b('file-ripristino').onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        const ok = await UI.conferma({ titolo: 'Ripristino da copia di sicurezza', pericolo: true, testoConferma: 'Sostituisci tutti i dati', richiediTesto: 'RIPRISTINA', html: 'Tutti i dati attuali verranno <b>sostituiti</b> dal contenuto del file <b>' + esc(f.name) + '</b>. Scarica prima una copia di sicurezza se necessario.' });
        if (!ok) { e.target.value = ''; return; }
        try { await Store.importaJson(await f.text()); UI.toast('Dati ripristinati.'); UI.render(); }
        catch (err) { UI.toast('Ripristino non riuscito: ' + err.message, 'errore'); }
        e.target.value = '';
      };
    }
    if (b('btn-demo')) b('btn-demo').onclick = async () => {
      const ok = await UI.conferma({ titolo: 'Carica dati dimostrativi', testoConferma: 'Carica', html: 'Verranno inserite 6 commesse di prova (le 3 del file Excel Rev.14 e i casi di test A, B, C) con movimenti, costi e saldi. Potrai eliminarle in seguito o ripristinare un backup.' });
      if (!ok) return;
      const demo = DemoData.crea();
      await Store.salva(db => {
        ['commesse', 'saldi', 'movimenti', 'costi'].forEach(k => { db[k] = demo[k]; });
        db.liste = Object.assign({}, db.liste, demo.liste);
        Store.log(db, 'dati', '', '', 'CARICAMENTO DATI DIMOSTRATIVI', [{ campo: 'commesse', prima: 0, dopo: demo.commesse.length }]);
      });
      UI.toast('Dati dimostrativi caricati.'); UI.vai('#/' + Store.paginaIniziale());
    };
  });
})();
