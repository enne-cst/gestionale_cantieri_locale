/* FIDA EDILE – Importazione delle commesse da un foglio Excel (modello, anteprima, conferma) */
(function () {
  'use strict';
  const esc = UI.esc;
  const IC = () => window.ImportaCommesse;
  const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  // Stato della pagina: l'ultimo file letto (per rifare i conti al momento del salvataggio),
  // l'esame delle righe e l'esito dell'ultima importazione conclusa.
  const S = { cartella: null, nomeFile: '', esame: null, errore: '', soloProblemi: false, fatto: null };

  const BADGE = {
    NUOVA: '<span class="badge REGOLARE">nuova</span>',
    AGGIORNA: '<span class="badge stato">aggiorna</span>',
    INVARIATA: '<span class="badge neutro">invariata</span>',
    SCARTATA: '<span class="badge CRITICO">scartata</span>',
    NUOVO: '<span class="badge REGOLARE">nuovo</span>',
    INVARIATO: '<span class="badge neutro">invariato</span>',
    SCARTATO: '<span class="badge CRITICO">scartato</span>'
  };

  // I saldi iniziali sono un archivio a parte: si importano solo se il ruolo può gestirli.
  function puoSaldi() { return Store.puo('saldo.crea') || Store.puo('saldo.modifica'); }
  // Righe del foglio SALDI che l'importazione scriverà davvero.
  function saldiDaScrivere(e) { return e && e.saldi && puoSaldi() ? e.saldi.nNuovi + e.saldi.nAggiornati : 0; }

  // Movimenti e costi diretti: archivi a parte anche loro, con i loro permessi. Le due configurazioni
  // tengono insieme tutto quello che cambia fra i due fogli; il resto della pagina è lo stesso codice.
  const REG = {
    movimenti: {
      sezione: 5, archivio: 'movimenti', entita: 'movimento', permesso: 'movimento',
      foglio: 'MOVIMENTI', titolo: 'Anteprima dei movimenti', plurale: 'movimenti', singolare: 'movimento',
      campi: () => IC().CAMPI_MOVIMENTO, colonne: () => IC().COLONNE_MOVIMENTI,
      tabella: 'imp-tab-mov', chiaveTabella: 'imp-mov',
      riferimento: e => e.codice + ' · ' + Fmt.data(e.data) + ' · ' + (e.registrazione.tipo || ''),
      valori: x => ({ tipo: x.tipo, numeroDocumento: x.numeroDocumento, descrizione: x.descrizione, sal: x.sal, fatturatoLordo: x.fatturatoLordo, ore: x.ore, perditaSal: x.perditaSal })
    },
    costi: {
      sezione: 6, archivio: 'costi', entita: 'costo', permesso: 'costo',
      foglio: 'COSTI', titolo: 'Anteprima dei costi diretti', plurale: 'costi diretti', singolare: 'costo',
      campi: () => IC().CAMPI_COSTO, colonne: () => IC().COLONNE_COSTI,
      tabella: 'imp-tab-costi', chiaveTabella: 'imp-costi',
      riferimento: e => e.codice + ' · ' + Fmt.data(e.data) + ' · ' + Fmt.euro(e.registrazione.importo),
      valori: x => ({ macroCategoria: x.macroCategoria, descrizione: x.descrizione, importo: x.importo, fornitore: x.fornitore })
    }
  };
  function puoReg(cfg) { return Store.puo(cfg.permesso + '.crea') || Store.puo(cfg.permesso + '.modifica'); }
  // Righe di un foglio di registrazioni che l'importazione scriverà davvero.
  function regDaScrivere(e, cfg) {
    const r = e && e[cfg.archivio];
    return r && puoReg(cfg) ? r.nNuovi + r.nAggiornati : 0;
  }
  function totaleDaScrivere(e) {
    return e.nNuove + e.nAggiornate + saldiDaScrivere(e) + regDaScrivere(e, REG.movimenti) + regDaScrivere(e, REG.costi);
  }

  // Scrive nell'archivio le righe di un foglio di registrazioni (movimenti o costi diretti).
  // Ogni scrittura finisce nel Registro modifiche e riporta a oggi la data "aggiornato al" della
  // commessa, esattamente come quando la registrazione si inserisce dalla sua maschera.
  function scrivi(db, r, cfg) {
    let creati = 0, aggiornati = 0;
    if (!r || !puoReg(cfg)) return { creati, aggiornati };
    const CAMPI = cfg.campi();
    r.esiti.forEach(e => {
      if (e.esito === 'SCARTATO' || e.esito === 'INVARIATO') return;
      const rif = cfg.riferimento(e);
      if (e.registrazioneId) {
        const cur = db[cfg.archivio].find(x => x.id === e.registrazioneId);
        if (!cur) return;
        const mod = IC().differenze(cur, e.registrazione, ['commessaId'].concat(CAMPI));
        if (!mod.length) return;
        ['commessaId'].concat(CAMPI).forEach(k => { cur[k] = e.registrazione[k]; });
        cur.modificatoIl = new Date().toISOString();
        Store.log(db, cfg.entita, cur.id, rif, 'MODIFICA ' + cfg.entita.toUpperCase() + ' DA IMPORTAZIONE EXCEL', mod);
        Store.toccaCommessa(db, cur.commessaId);
        aggiornati++;
      } else {
        e.registrazione.creatoIl = new Date().toISOString();
        e.registrazione.creatoDa = Store.utente.nome;
        db[cfg.archivio].push(e.registrazione);
        Store.log(db, cfg.entita, e.registrazione.id, rif, 'NUOVO ' + cfg.entita.toUpperCase() + ' DA IMPORTAZIONE EXCEL',
          IC().differenze(null, e.registrazione, ['commessaId'].concat(CAMPI)));
        Store.toccaCommessa(db, e.registrazione.commessaId);
        creati++;
      }
      // una macro-categoria nuova entra nell'elenco del programma, come fanno rami, tecnici e preposti
      const cat = e.registrazione.macroCategoria;
      if (cat && db.liste.macroCategorie.indexOf(cat) < 0) db.liste.macroCategorie.push(cat);
    });
    return { creati, aggiornati };
  }

  const Importa = {
    // Scarica il modello vuoto oppure già compilato con le commesse in archivio (per aggiornarle in blocco).
    scaricaModello(conDati) {
      if (!Store.puo('esporta')) return UI.permessoNegato();
      try {
        const commesse = conDati ? Store.db.commesse.filter(c => !c.annullato) : null;
        const dati = Xlsx.crea(IC().fogliModello(Store.db, commesse));
        const nome = conDati ? 'commesse_da_aggiornare' : 'modello_commesse';
        Fmt.scarica(Fmt.nomeFileData(nome, 'xlsx'), dati, TIPO_XLSX);
        UI.toast(conDati ? 'Modello scaricato con ' + commesse.length + ' commesse.' : 'Modello vuoto scaricato.');
      } catch (e) {
        console.error(e);
        UI.toast('Impossibile creare il modello: ' + (e.message || e), 'errore');
      }
    },

    // Legge il file scelto e prepara l'anteprima, senza toccare l'archivio.
    async analizza(file) {
      S.cartella = null; S.esame = null; S.errore = ''; S.fatto = null;
      S.nomeFile = file ? file.name : '';
      try {
        if (!/\.xlsx$/i.test(S.nomeFile)) {
          throw new Error('Il file deve essere in formato .xlsx. Se arriva da un vecchio Excel (.xls) o è un .csv, aprirlo in Excel e salvarlo come "Cartella di lavoro di Excel (*.xlsx)".');
        }
        const cartella = await Xlsx.leggi(await file.arrayBuffer());
        S.cartella = cartella;
        S.esame = IC().prepara(cartella, Store.db);
      } catch (e) {
        console.error(e);
        S.errore = e.message || String(e);
      }
      UI.render();
    },

    // Applica l'importazione. I conti si rifanno da capo sull'archivio appena riletto, così anche
    // se nel frattempo qualcun altro ha modificato le commesse il risultato resta corretto.
    async esegui() {
      if (!Store.puo('commessa.crea') && !Store.puo('commessa.modifica')) return UI.permessoNegato();
      const cartella = S.cartella;
      if (!cartella) return;
      const CAMPI = IC().COLONNE.map(c => c.campo);
      const CAMPI_REGISTRO = CAMPI.concat(['dataFinePrevistaOriginale']);
      const CAMPI_SALDO = IC().CAMPI_SALDO;
      const conSaldi = puoSaldi();
      const esito = await Store.salva(db => {
        const r = IC().prepara(cartella, db);
        let create = 0, aggiornate = 0;
        const aggiungi = (lista, val) => { if (val && lista.indexOf(val) < 0) lista.push(val); };
        r.esiti.forEach(e => {
          if (e.esito === 'SCARTATA' || e.esito === 'INVARIATA') return;
          if (e.commessaId) {
            const cur = db.commesse.find(x => x.id === e.commessaId);
            if (!cur) return;
            const mod = IC().differenze(cur, e.commessa, CAMPI_REGISTRO);
            if (!mod.length) return;
            CAMPI_REGISTRO.forEach(k => IC().imposta(cur, k, IC().valoreDi(e.commessa, k)));
            Store.log(db, 'commessa', cur.id, cur.codice, 'AGGIORNAMENTO DA IMPORTAZIONE EXCEL', mod);
            aggiornate++;
          } else {
            db.commesse.push(e.commessa);
            Store.log(db, 'commessa', e.commessa.id, e.commessa.codice, 'CREAZIONE DA IMPORTAZIONE EXCEL', IC().differenze(null, e.commessa, CAMPI_REGISTRO));
            create++;
          }
          aggiungi(db.liste.rami, e.commessa.ramo);
          aggiungi(db.liste.tecnici, e.commessa.tecnico);
          aggiungi(db.liste.preposti, e.commessa.preposto);
        });

        // Saldi iniziali: dopo le commesse, perché una riga del foglio SALDI può riferirsi a una
        // commessa appena creata (prepara() le assegna già l'identificativo definitivo).
        let saldiCreati = 0, saldiAggiornati = 0;
        if (conSaldi) r.saldi.esiti.forEach(e => {
          if (e.esito === 'SCARTATO' || e.esito === 'INVARIATO') return;
          const rif = e.codice + ' · saldo al ' + IC().dataItaliana(e.dataSaldo);
          if (e.saldoId) {
            const cur = db.saldi.find(x => x.id === e.saldoId);
            if (!cur) return;
            const mod = IC().differenze(cur, e.saldo, CAMPI_SALDO);
            if (!mod.length) return;
            CAMPI_SALDO.forEach(k => { cur[k] = e.saldo[k]; });
            Store.log(db, 'saldo', cur.id, rif, 'AGGIORNAMENTO SALDO INIZIALE DA IMPORTAZIONE EXCEL', mod);
            saldiAggiornati++;
          } else {
            e.saldo.creatoIl = new Date().toISOString();
            db.saldi.push(e.saldo);
            Store.log(db, 'saldo', e.saldo.id, rif, 'CREAZIONE SALDO INIZIALE DA IMPORTAZIONE EXCEL',
              IC().differenze(null, e.saldo, ['commessaId', 'anno'].concat(CAMPI_SALDO)));
            saldiCreati++;
          }
        });

        // Movimenti e costi diretti: per ultimi, perché sono registrazioni di una commessa che può
        // essere appena stata creata. La colonna ID dice se la riga aggiorna una registrazione già
        // in archivio; senza ID se ne aggiunge sempre una nuova.
        const mov = scrivi(db, r.movimenti, REG.movimenti);
        const kos = scrivi(db, r.costi, REG.costi);

        Store.log(db, 'dati', '', S.nomeFile, 'IMPORTAZIONE COMMESSE DA EXCEL', [
          { campo: 'file', prima: '', dopo: S.nomeFile },
          { campo: 'commesse create', prima: '', dopo: create },
          { campo: 'commesse aggiornate', prima: '', dopo: aggiornate },
          { campo: 'righe scartate', prima: '', dopo: r.nScartate },
          { campo: 'saldi iniziali creati', prima: '', dopo: saldiCreati },
          { campo: 'saldi iniziali aggiornati', prima: '', dopo: saldiAggiornati },
          { campo: 'righe saldo scartate', prima: '', dopo: r.saldi.nScartati },
          { campo: 'movimenti creati', prima: '', dopo: mov.creati },
          { campo: 'movimenti aggiornati', prima: '', dopo: mov.aggiornati },
          { campo: 'righe movimento scartate', prima: '', dopo: r.movimenti.nScartati },
          { campo: 'costi creati', prima: '', dopo: kos.creati },
          { campo: 'costi aggiornati', prima: '', dopo: kos.aggiornati },
          { campo: 'righe costo scartate', prima: '', dopo: r.costi.nScartati }
        ]);
        return {
          create, aggiornate, invariate: r.nInvariate, scartate: r.nScartate, scarti: r.esiti.filter(x => x.esito === 'SCARTATA'),
          saldiCreati, saldiAggiornati, saldiInvariati: r.saldi.nInvariati, saldiScartati: r.saldi.nScartati,
          scartiSaldi: r.saldi.esiti.filter(x => x.esito === 'SCARTATO'),
          movimenti: Object.assign(mov, { invariati: r.movimenti.nInvariati, scartati: r.movimenti.nScartati, scarti: r.movimenti.esiti.filter(x => x.esito === 'SCARTATO') }),
          costi: Object.assign(kos, { invariati: r.costi.nInvariati, scartati: r.costi.nScartati, scarti: r.costi.esiti.filter(x => x.esito === 'SCARTATO') })
        };
      });
      S.cartella = null; S.esame = null; S.fatto = esito;
      UI.toast('Importazione completata: ' + esito.create + ' create, ' + esito.aggiornate + ' aggiornate' +
        (esito.scartate ? ', ' + esito.scartate + ' scartate' : '') +
        (esito.saldiCreati + esito.saldiAggiornati ? ' · saldi: ' + esito.saldiCreati + ' nuovi, ' + esito.saldiAggiornati + ' aggiornati' : '') +
        (esito.movimenti.creati + esito.movimenti.aggiornati ? ' · movimenti: ' + esito.movimenti.creati + ' nuovi, ' + esito.movimenti.aggiornati + ' aggiornati' : '') +
        (esito.costi.creati + esito.costi.aggiornati ? ' · costi: ' + esito.costi.creati + ' nuovi, ' + esito.costi.aggiornati + ' aggiornati' : '') + '.');
      UI.render();
    }
  };
  window.Importa = Importa;

  // ---------------------------------------------------------------- pagina
  UI.registra('importa', function (cont) {
    const puoImportare = Store.puo('commessa.crea') || Store.puo('commessa.modifica');
    const nCommesse = Store.db.commesse.filter(c => !c.annullato).length;
    const annoGestione = Store.db.parametri.annoGestione;
    const e = S.esame;

    const ruoloSenza = cfg => puoImportare && !puoReg(cfg)
      ? ' <b>Il ruolo ' + esc(Store.ruolo()) + ' non può però inserire ' + cfg.plurale + ':</b> il foglio ' + cfg.foglio + ' viene letto e mostrato in anteprima, ma non importato.' : '';

    cont.innerHTML = UI.testata('Importa da Excel',
      'Un foglio Excel con una riga per commessa, più i fogli dei saldi al 31/12 degli anni precedenti, dei movimenti e dei costi diretti dell\'esercizio ' + annoGestione + '. Il <b>codice commessa</b> decide cosa succede: se non esiste viene creata una nuova commessa, se esiste viene aggiornata. Prima di scrivere qualsiasi cosa viene mostrata l\'anteprima riga per riga.',
      '<a class="btn" href="#/commesse">← Anagrafica commesse</a>') +

      '<div class="pannello"><h2>1 · Scarica il modello</h2>' +
      '<p class="sotto">Il foglio COMMESSE contiene tutti e soli i campi di una commessa che si inseriscono a mano: anagrafica, budget, verifica di sostenibilità, note e data di aggiornamento. ' +
      'I valori calcolati dal programma (contratto aggiornato, allerte, prezzo minimo sostenibile) non vanno indicati. Restano fuori le fasi del cronoprogramma, che si disegnano dentro il programma.</p>' +
      '<div class="btn-gruppo"><button type="button" class="primario" id="imp-modello">⤓ Scarica il modello vuoto (.xlsx)</button>' +
      (nCommesse ? '<button type="button" id="imp-modello-dati">⤓ Scarica il modello con le ' + nCommesse + ' commesse in archivio</button>' : '') + '</div>' +
      '<p class="sotto" style="margin-top:8px">Il file ha sei fogli: <b>ISTRUZIONI</b> (guida e significato di ogni colonna), <b>COMMESSE</b>, <b>SALDI</b>, <b>MOVIMENTI</b> e <b>COSTI</b> (da compilare, anche solo quelli che servono) ed <b>ELENCHI</b> (valori ammessi e suggerimenti). ' +
      'Le colonne con l\'intestazione arancione sono obbligatorie. ' +
      (nCommesse ? 'La seconda versione esce già compilata con l\'archivio attuale — saldi, movimenti e costi compresi: si correggono le celle che servono e si ricarica il file per aggiornare in blocco.' : '') + '</p>' +
      '<p class="sotto" style="margin-top:8px">Nel foglio <b>SALDI</b> si caricano i valori cumulativi delle commesse pregresse: una riga per commessa e data, con la <b>data saldo</b> sempre al 31 dicembre. ' +
      'Ripetendo il codice su più righe con date diverse si carica lo storico di più anni in una volta sola. Solo il saldo al ' + esc(Fmt.data(Engine.dataSaldo(annoGestione))) + ' entra nei cumulativi dell\'esercizio ' + annoGestione + '.' +
      (puoImportare && !puoSaldi() ? ' <b>Il ruolo ' + esc(Store.ruolo()) + ' non può però inserire i saldi iniziali:</b> il foglio SALDI viene letto e mostrato in anteprima, ma non importato.' : '') + '</p>' +
      '<p class="sotto" style="margin-top:8px">Nei fogli <b>MOVIMENTI</b> e <b>COSTI</b> si caricano le registrazioni dell\'esercizio ' + annoGestione + ': una riga = un evento datato di una commessa. ' +
      'Qui non c\'è una chiave che riconosce la riga (la stessa commessa può avere due registrazioni identiche nello stesso giorno): <b>ogni riga con la colonna ID vuota crea una registrazione nuova</b>. ' +
      'Per correggerne una già in archivio si riparte dal modello compilato, che porta con sé gli ID. Le righe che ripetono una registrazione già presente vengono segnalate con un avviso.' +
      ruoloSenza(REG.movimenti) + ruoloSenza(REG.costi) + '</p></div>' +

      '<div class="pannello"><h2>2 · Carica il file compilato</h2>' +
      (puoImportare
        ? '<div class="btn-gruppo"><button type="button" class="primario" id="imp-scegli">Scegli il file .xlsx…</button>' +
          '<input type="file" id="imp-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>' +
          (S.nomeFile ? '<span class="pill">' + esc(S.nomeFile) + '</span>' : '') + '</div>' +
          '<p class="sotto" style="margin-top:8px">Si può anche trascinare il file su questo riquadro. Nulla viene salvato finché non si conferma l\'importazione.</p>'
        : '<div class="msg avviso">Il ruolo <b>' + esc(Store.ruolo()) + '</b> può scaricare il modello ma non importare commesse.</div>') +
      '</div>' +

      (S.errore ? '<div class="msg errore"><b>Il file non può essere letto:</b><br>' + esc(S.errore) + '</div>' : '') +
      (S.fatto ? risultato(S.fatto) : '') +
      (e ? anteprima(e) : '') +
      '<div id="imp-tab"></div>' +
      (e ? anteprimaSaldi(e.saldi) : '') +
      '<div id="imp-tab-saldi"></div>' +
      (e ? anteprimaReg(e.movimenti, REG.movimenti) : '') +
      '<div id="' + REG.movimenti.tabella + '"></div>' +
      (e ? anteprimaReg(e.costi, REG.costi) : '') +
      '<div id="' + REG.costi.tabella + '"></div>' +
      (e && righeLette(e) ? '<div class="pannello"><div class="btn-gruppo">' +
        '<button type="button" class="primario" id="imp-esegui"' + (totaleDaScrivere(e) ? '' : ' disabled') + '>' +
        'Importa ' + riepilogoPulsante(e) + '</button>' +
        '<button type="button" id="imp-annulla">Annulla</button></div>' +
        '<p class="sotto" style="margin-top:8px">Le righe scartate e quelle invariate non vengono toccate. Ogni creazione e ogni modifica finisce nel <a href="#/registro">Registro modifiche</a> con autore, data e valori precedenti.</p></div>' : '');

    // righe compilate trovate in tutti i fogli del file
    function righeLette(r) { return r.esiti.length + r.saldi.esiti.length + r.movimenti.esiti.length + r.costi.esiti.length; }
    // "3 commesse (2 nuove, 1 da aggiornare) · 12 movimenti (12 nuovi)"
    function pezzo(nome, nuovi, aggiornati) {
      if (!nuovi && !aggiornati) return '';
      const d = [nuovi ? nuovi + ' nuovi' : '', aggiornati ? aggiornati + ' da aggiornare' : ''].filter(x => x);
      return (nuovi + aggiornati) + ' ' + nome + ' (' + d.join(', ') + ')';
    }
    function riepilogoPulsante(r) {
      const pezzi = [
        pezzo('commesse', r.nNuove, r.nAggiornate).replace('nuovi', 'nuove'),
        puoSaldi() ? pezzo('saldi', r.saldi.nNuovi, r.saldi.nAggiornati) : '',
        puoReg(REG.movimenti) ? pezzo('movimenti', r.movimenti.nNuovi, r.movimenti.nAggiornati) : '',
        puoReg(REG.costi) ? pezzo('costi', r.costi.nNuovi, r.costi.nAggiornati) : ''
      ].filter(x => x);
      return pezzi.length ? pezzi.join(' · ') : 'i dati del file: non c\'è nulla da scrivere';
    }

    // ---- riquadro di riepilogo dell'anteprima
    function anteprima(r) {
      // file senza foglio COMMESSE leggibile: gli altri fogli si importano lo stesso
      if (r.errore) {
        return '<div class="msg info"><b>' + esc(r.errore) + '</b> Non si importano commesse: il file viene letto solo per ' +
          [r.saldi.presente ? 'i saldi' : '', r.movimenti.presente ? 'i movimenti' : '', r.costi.presente ? 'i costi diretti' : ''].filter(x => x).join(', ') +
          '. Le registrazioni si agganciano alle commesse già in archivio tramite il codice commessa.</div>';
      }
      const avvisiColonne =
        (r.colonneMancantiObbligatorie.length
          ? '<div class="msg avviso"><b>Colonne obbligatorie non presenti nel file:</b> ' +
            r.colonneMancantiObbligatorie.map(c => esc(c.titolo)).join(' · ') +
            '. Le righe che devono creare una nuova commessa saranno scartate; gli aggiornamenti di commesse esistenti restano possibili.</div>'
          : '') +
        (r.colonneIgnorate.length
          ? '<div class="msg info"><b>Colonne non riconosciute e ignorate:</b> ' + r.colonneIgnorate.map(esc).join(' · ') +
            '. Se una di queste doveva essere importata, controllare che il titolo sia identico a quello del modello.</div>'
          : '');
      return '<h2>3 · Anteprima delle commesse</h2>' + avvisiColonne +
        '<div class="kpi-griglia">' +
        UI.kpi('Righe con dati', r.esiti.length, { calc: false }) +
        UI.kpi('Nuove commesse', r.nNuove, { colore: r.nNuove ? 'verde' : '', calc: false }) +
        UI.kpi('Da aggiornare', r.nAggiornate, { calc: false }) +
        UI.kpi('Invariate', r.nInvariate, { calc: false }) +
        UI.kpi('Scartate', r.nScartate, { colore: r.nScartate ? 'rosso' : '', calc: false, sub: r.nScartate ? 'con errori bloccanti' : '' }) +
        UI.kpi('Con avvisi', r.nAvvisi, { colore: r.nAvvisi ? 'giallo' : '', calc: false, sub: 'da verificare, non bloccanti' }) +
        '</div>' +
        '<div class="pannello compatto"><div class="filtri" id="imp-filtri">' +
        '<div class="campo"><label>Righe</label><label style="text-transform:none;font-size:13px;margin-top:6px">' +
        '<input type="checkbox" name="soloProblemi"' + (S.soloProblemi ? ' checked' : '') + '> mostra solo le righe con errori o avvisi</label></div>' +
        '<div class="campo"><label>&nbsp;</label><span class="pill">titoli letti dalla riga ' + r.rigaTestata + ' · ' + r.colonneTrovate.length + ' colonne riconosciute</span></div>' +
        '</div></div>';
    }

    // ---- riquadro di riepilogo del foglio SALDI
    function anteprimaSaldi(r) {
      if (!r.presente) {
        return '<div class="msg info"><b>Il file non ha il foglio SALDI</b> (o è vuoto): non si importano saldi iniziali. ' +
          'Per caricare i valori cumulativi al 31/12 degli anni precedenti scaricare di nuovo il modello e compilare quel foglio.</div>';
      }
      if (r.errore) return '<div class="msg avviso"><b>Foglio SALDI:</b> ' + esc(r.errore) + '</div>';
      return '<h2>4 · Anteprima dei saldi al 31/12</h2>' +
        (r.colonneMancantiObbligatorie.length
          ? '<div class="msg avviso"><b>Foglio SALDI, colonne obbligatorie non presenti:</b> ' +
            r.colonneMancantiObbligatorie.map(c => esc(c.titolo)).join(' · ') + '.</div>'
          : '') +
        (r.colonneIgnorate.length
          ? '<div class="msg info"><b>Foglio SALDI, colonne non riconosciute e ignorate:</b> ' + r.colonneIgnorate.map(esc).join(' · ') + '.</div>'
          : '') +
        (r.esiti.length && !puoSaldi()
          ? '<div class="msg avviso">Il ruolo <b>' + esc(Store.ruolo()) + '</b> non può inserire o modificare i saldi iniziali: queste righe vengono mostrate ma <b>non</b> importate.</div>'
          : '') +
        '<div class="kpi-griglia">' +
        UI.kpi('Righe con dati', r.esiti.length, { calc: false }) +
        UI.kpi('Nuovi saldi', r.nNuovi, { colore: r.nNuovi ? 'verde' : '', calc: false }) +
        UI.kpi('Da aggiornare', r.nAggiornati, { calc: false }) +
        UI.kpi('Invariati', r.nInvariati, { calc: false }) +
        UI.kpi('Scartati', r.nScartati, { colore: r.nScartati ? 'rosso' : '', calc: false, sub: r.nScartati ? 'con errori bloccanti' : '' }) +
        UI.kpi('Con avvisi', r.nAvvisi, { colore: r.nAvvisi ? 'giallo' : '', calc: false, sub: 'da verificare, non bloccanti' }) +
        '</div>' +
        '<div class="pannello compatto"><span class="pill">titoli letti dalla riga ' + r.rigaTestata + ' · ' + r.colonneTrovate.length + ' colonne riconosciute</span></div>';
    }

    // ---- riquadro di riepilogo dei fogli MOVIMENTI e COSTI (stesso codice per i due)
    function anteprimaReg(r, cfg) {
      if (!r.presente) {
        return '<div class="msg info"><b>Il file non ha il foglio ' + cfg.foglio + '</b> (o è vuoto): non si importano ' + cfg.plurale + '. ' +
          'Per caricarli scaricare di nuovo il modello e compilare quel foglio.</div>';
      }
      if (r.errore) return '<div class="msg avviso"><b>Foglio ' + cfg.foglio + ':</b> ' + esc(r.errore) + '</div>';
      return '<h2>' + cfg.sezione + ' · ' + cfg.titolo + '</h2>' +
        (r.colonneMancantiObbligatorie.length
          ? '<div class="msg avviso"><b>Foglio ' + cfg.foglio + ', colonne obbligatorie non presenti:</b> ' +
            r.colonneMancantiObbligatorie.map(c => esc(c.titolo)).join(' · ') + '.</div>'
          : '') +
        (r.colonneIgnorate.length
          ? '<div class="msg info"><b>Foglio ' + cfg.foglio + ', colonne non riconosciute e ignorate:</b> ' + r.colonneIgnorate.map(esc).join(' · ') + '.</div>'
          : '') +
        (r.esiti.length && !puoReg(cfg)
          ? '<div class="msg avviso">Il ruolo <b>' + esc(Store.ruolo()) + '</b> non può inserire o modificare ' + cfg.plurale + ': queste righe vengono mostrate ma <b>non</b> importate.</div>'
          : '') +
        (r.nDoppi
          ? '<div class="msg avviso"><b>' + (r.nDoppi === 1 ? '1 riga ripete' : r.nDoppi + ' righe ripetono') + ' una registrazione già presente</b> (stessa commessa, stessa data, stessi valori). ' +
            'Succede quando si ricarica un file già importato: importandole i valori si sommano. Controllare le righe segnalate prima di confermare.</div>'
          : '') +
        '<div class="kpi-griglia">' +
        UI.kpi('Righe con dati', r.esiti.length, { calc: false }) +
        UI.kpi('Nuovi', r.nNuovi, { colore: r.nNuovi ? 'verde' : '', calc: false }) +
        UI.kpi('Da aggiornare', r.nAggiornati, { calc: false, sub: r.nAggiornati ? 'righe con ID' : '' }) +
        UI.kpi('Invariati', r.nInvariati, { calc: false }) +
        UI.kpi('Scartati', r.nScartati, { colore: r.nScartati ? 'rosso' : '', calc: false, sub: r.nScartati ? 'con errori bloccanti' : '' }) +
        UI.kpi('Con avvisi', r.nAvvisi, { colore: r.nAvvisi ? 'giallo' : '', calc: false, sub: 'da verificare, non bloccanti' }) +
        '</div>' +
        '<div class="pannello compatto"><span class="pill">titoli letti dalla riga ' + r.rigaTestata + ' · ' + r.colonneTrovate.length + ' colonne riconosciute</span></div>';
    }

    // ---- riquadro dell'importazione appena conclusa
    function risultato(f) {
      return '<div class="msg ok"><b>Importazione completata.</b> ' + f.create + ' commesse create, ' + f.aggiornate + ' aggiornate' +
        (f.invariate ? ', ' + f.invariate + ' già allineate' : '') + (f.scartate ? ', ' + f.scartate + ' scartate' : '') + '.' +
        (f.saldiCreati + f.saldiAggiornati + f.saldiInvariati + f.saldiScartati
          ? '<br>Saldi al 31/12: ' + f.saldiCreati + ' creati, ' + f.saldiAggiornati + ' aggiornati' +
            (f.saldiInvariati ? ', ' + f.saldiInvariati + ' già allineati' : '') + (f.saldiScartati ? ', ' + f.saldiScartati + ' scartati' : '') + '.'
          : '') +
        rigaEsito('Movimenti', f.movimenti) + rigaEsito('Costi diretti', f.costi) + '</div>' +
        (f.scartiSaldi && f.scartiSaldi.length
          ? '<div class="pannello"><h2>Righe del foglio SALDI scartate</h2>' +
            '<div class="tabella-wrap"><table class="tab"><thead><tr><th class="n">Riga</th><th>Codice</th><th>Data saldo</th><th>Motivo</th></tr></thead><tbody>' +
            f.scartiSaldi.map(x => '<tr><td class="n">' + x.riga + '</td><td><span class="cod">' + esc(x.codice) + '</span></td><td class="nowrap">' + esc(Fmt.data(x.dataSaldo)) + '</td><td>' +
              x.errori.map(m => '<div>' + esc(m) + '</div>').join('') + '</td></tr>').join('') +
            '</tbody></table></div></div>'
          : '') +
        scartiReg('MOVIMENTI', f.movimenti) + scartiReg('COSTI', f.costi) +
        (f.scarti && f.scarti.length
          ? '<div class="pannello"><h2>Righe scartate</h2><p class="sotto">Non sono state importate. Correggere il file e ricaricarlo: le commesse già importate verranno riconosciute dal codice e aggiornate, non duplicate.</p>' +
            '<div class="tabella-wrap"><table class="tab"><thead><tr><th class="n">Riga</th><th>Codice</th><th>Motivo</th></tr></thead><tbody>' +
            f.scarti.map(x => '<tr><td class="n">' + x.riga + '</td><td><span class="cod">' + esc(x.codice) + '</span></td><td>' +
              x.errori.map(m => '<div>' + esc(m) + '</div>').join('') + '</td></tr>').join('') +
            '</tbody></table></div></div>'
          : '');
    }
    // riga di riepilogo di un foglio di registrazioni, dentro il riquadro verde
    function rigaEsito(nome, x) {
      if (!x || !(x.creati + x.aggiornati + x.invariati + x.scartati)) return '';
      return '<br>' + nome + ': ' + x.creati + ' creati, ' + x.aggiornati + ' aggiornati' +
        (x.invariati ? ', ' + x.invariati + ' già allineati' : '') + (x.scartati ? ', ' + x.scartati + ' scartati' : '') + '.';
    }
    // elenco delle righe scartate di un foglio di registrazioni
    function scartiReg(foglio, x) {
      if (!x || !x.scarti || !x.scarti.length) return '';
      return '<div class="pannello"><h2>Righe del foglio ' + foglio + ' scartate</h2>' +
        '<div class="tabella-wrap"><table class="tab"><thead><tr><th class="n">Riga</th><th>Codice</th><th>Data</th><th>Motivo</th></tr></thead><tbody>' +
        x.scarti.map(s => '<tr><td class="n">' + s.riga + '</td><td><span class="cod">' + esc(s.codice) + '</span></td><td class="nowrap">' + esc(Fmt.data(s.data)) + '</td><td>' +
          s.errori.map(m => '<div>' + esc(m) + '</div>').join('') + '</td></tr>').join('') +
        '</tbody></table></div></div>';
    }

    // ---- tabella delle righe
    function disegnaTabella() {
      if (!e) return;
      const cont0 = document.getElementById('imp-tab');
      if (e.errore) { cont0.innerHTML = ''; disegnaAltreTabelle(); return; }
      let righe = e.esiti;
      if (S.soloProblemi) righe = righe.filter(x => x.errori.length || x.avvisi.length);
      const colonne = [
        { campo: 'riga', titolo: 'Riga', tipo: 'n' },
        { campo: 'esito', titolo: 'Esito', fmt: v => BADGE[v] || esc(v) },
        { campo: 'codice', titolo: 'Codice', fmt: v => '<span class="cod">' + esc(v) + '</span>' },
        { campo: 'cliente', titolo: 'Cliente' },
        { campo: 'cantiere', titolo: 'Descrizione / Cantiere', classe: 'desc' },
        {
          campo: 'modifiche', titolo: 'Cosa cambia', ord: false, classe: 'desc',
          fmt: (v, r) => r.esito === 'NUOVA' ? '<span class="muto">nuova commessa</span>'
            : (!v.length ? '<span class="muto">—</span>'
              : '<div class="motivi">' + v.map(m => '<span title="' + esc(String(m.prima) + ' → ' + String(m.dopo)) + '">' +
                esc(etichettaCampo(m.campo)) + '</span>').join('') + '</div>')
        },
        {
          campo: 'errori', titolo: 'Errori e avvisi', ord: false, classe: 'desc',
          fmt: (v, r) => (v.length ? '<div class="motivi CRITICO">' + v.map(x => '<span>' + esc(x) + '</span>').join('') + '</div>' : '') +
            (r.avvisi.length ? '<div class="motivi ATTENZIONE">' + r.avvisi.map(x => '<span>' + esc(x) + '</span>').join('') + '</div>' : '') +
            (!v.length && !r.avvisi.length ? '<span class="muto">—</span>' : '')
        }
      ];
      const t = document.getElementById('imp-tab');
      t.innerHTML = UI.tabella('imp', {
        colonne, righe, chiave: 'riga', ordine: { campo: 'riga', dir: 'asc' },
        vuoto: S.soloProblemi ? 'Nessuna riga con errori o avvisi.' : 'Il foglio non contiene righe compilate.',
        classeRiga: x => x.esito === 'SCARTATA' ? 'riga-non-congrua' : (x.esito === 'INVARIATA' ? 'muto' : '')
      });
      UI.legaTabelle(t);
      disegnaAltreTabelle();
    }
    // tabelle degli altri fogli: si disegnano sempre, anche quando quello delle commesse non c'è
    function disegnaAltreTabelle() {
      disegnaTabellaSaldi();
      disegnaTabellaReg(REG.movimenti);
      disegnaTabellaReg(REG.costi);
    }
    // ---- tabella delle righe del foglio SALDI
    function disegnaTabellaSaldi() {
      const t = document.getElementById('imp-tab-saldi');
      if (!t) return;
      if (!e || !e.saldi.presente || e.saldi.errore) { t.innerHTML = ''; return; }
      // i valori del saldo si portano sulla riga: così le colonne numeriche si ordinano davvero
      let righe = e.saldi.esiti.map(x => Object.assign({
        sal: x.saldo.sal, fatturatoLordo: x.saldo.fatturatoLordo, ore: x.saldo.ore, costiDiretti: x.saldo.costiDiretti
      }, x));
      if (S.soloProblemi) righe = righe.filter(x => x.errori.length || x.avvisi.length);
      const colonne = [
        { campo: 'riga', titolo: 'Riga', tipo: 'n' },
        { campo: 'esito', titolo: 'Esito', fmt: v => BADGE[v] || esc(v) },
        { campo: 'codice', titolo: 'Codice', fmt: v => '<span class="cod">' + esc(v) + '</span>' },
        { campo: 'dataSaldo', titolo: 'Data saldo', classe: 'nowrap', fmt: (v, r) => esc(Fmt.data(v)) + (r.anno ? ' <span class="muto">esercizio ' + r.anno + '</span>' : '') },
        { campo: 'etichetta', titolo: 'Commessa', classe: 'desc', fmt: v => v ? esc(v) : '<span class="muto">—</span>' },
        { campo: 'sal', titolo: 'SAL maturato', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v) },
        { campo: 'fatturatoLordo', titolo: 'Fatturato lordo', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v) },
        { campo: 'ore', titolo: 'Ore', tipo: 'n', classe: 'in', fmt: v => Fmt.ore(v) },
        { campo: 'costiDiretti', titolo: 'Costi diretti', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v) },
        {
          campo: 'modifiche', titolo: 'Cosa cambia', ord: false, classe: 'desc',
          fmt: (v, r) => r.esito === 'NUOVO' ? '<span class="muto">nuovo saldo</span>'
            : (!v.length ? '<span class="muto">—</span>'
              : '<div class="motivi">' + v.map(m => '<span title="' + esc(String(m.prima) + ' → ' + String(m.dopo)) + '">' +
                esc(Schema.ETICHETTE[m.campo] || m.campo) + '</span>').join('') + '</div>')
        },
        {
          campo: 'errori', titolo: 'Errori e avvisi', ord: false, classe: 'desc',
          fmt: (v, r) => (v.length ? '<div class="motivi CRITICO">' + v.map(x => '<span>' + esc(x) + '</span>').join('') + '</div>' : '') +
            (r.avvisi.length ? '<div class="motivi ATTENZIONE">' + r.avvisi.map(x => '<span>' + esc(x) + '</span>').join('') + '</div>' : '') +
            (!v.length && !r.avvisi.length ? '<span class="muto">—</span>' : '')
        }
      ];
      t.innerHTML = UI.tabella('imp-saldi', {
        colonne, righe, chiave: 'riga', ordine: { campo: 'riga', dir: 'asc' },
        vuoto: S.soloProblemi ? 'Nessuna riga con errori o avvisi.' : 'Il foglio SALDI non contiene righe compilate.',
        classeRiga: x => x.esito === 'SCARTATO' ? 'riga-non-congrua' : (x.esito === 'INVARIATO' ? 'muto' : '')
      });
      UI.legaTabelle(t);
    }
    // ---- tabella delle righe dei fogli MOVIMENTI e COSTI
    function disegnaTabellaReg(cfg) {
      const t = document.getElementById(cfg.tabella);
      if (!t) return;
      const r = e && e[cfg.archivio];
      if (!r || !r.presente || r.errore) { t.innerHTML = ''; return; }
      // i valori della registrazione si portano sulla riga: così le colonne si ordinano davvero
      let righe = r.esiti.map(x => Object.assign(cfg.valori(x.registrazione), x));
      if (S.soloProblemi) righe = righe.filter(x => x.errori.length || x.avvisi.length);
      const comuni = [
        { campo: 'riga', titolo: 'Riga', tipo: 'n' },
        { campo: 'esito', titolo: 'Esito', fmt: (v, x) => (BADGE[v] || esc(v)) + (x.doppione ? ' <span class="badge ATTENZIONE">doppione?</span>' : '') },
        { campo: 'codice', titolo: 'Codice', fmt: v => '<span class="cod">' + esc(v) + '</span>' },
        { campo: 'data', titolo: 'Data', classe: 'nowrap', fmt: v => esc(Fmt.data(v)) },
        { campo: 'etichetta', titolo: 'Commessa', classe: 'desc', fmt: v => v ? esc(v) : '<span class="muto">—</span>' }
      ];
      const propri = cfg === REG.movimenti
        ? [
          { campo: 'tipo', titolo: 'Tipo', fmt: v => v ? '<span class="badge neutro">' + esc(v) + '</span>' : '<span class="muto">—</span>' },
          { campo: 'numeroDocumento', titolo: 'N. doc.' },
          { campo: 'descrizione', titolo: 'Descrizione', classe: 'desc' },
          { campo: 'sal', titolo: 'SAL', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v, { zeroVuoto: true }) },
          { campo: 'fatturatoLordo', titolo: 'Fatt. lordo', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v, { zeroVuoto: true }) },
          { campo: 'ore', titolo: 'Ore', tipo: 'n', classe: 'in', fmt: v => Fmt.ore(v, { zeroVuoto: true }) },
          { campo: 'perditaSal', titolo: 'Perdita SAL', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v, { zeroVuoto: true }) }
        ]
        : [
          { campo: 'macroCategoria', titolo: 'Macro-categoria', fmt: v => v ? esc(v) : '<span class="muto">—</span>' },
          { campo: 'descrizione', titolo: 'Descrizione', classe: 'desc' },
          { campo: 'importo', titolo: 'Importo', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v) },
          { campo: 'fornitore', titolo: 'Fornitore / Documento' }
        ];
      const colonne = comuni.concat(propri, [
        {
          campo: 'modifiche', titolo: 'Cosa cambia', ord: false, classe: 'desc',
          fmt: (v, x) => x.esito === 'NUOVO' ? '<span class="muto">nuovo ' + cfg.singolare + '</span>'
            : (!v.length ? '<span class="muto">—</span>'
              : '<div class="motivi">' + v.map(m => '<span title="' + esc(String(m.prima) + ' → ' + String(m.dopo)) + '">' +
                esc(Schema.ETICHETTE[m.campo] || m.campo) + '</span>').join('') + '</div>')
        },
        {
          campo: 'errori', titolo: 'Errori e avvisi', ord: false, classe: 'desc',
          fmt: (v, x) => (v.length ? '<div class="motivi CRITICO">' + v.map(m => '<span>' + esc(m) + '</span>').join('') + '</div>' : '') +
            (x.avvisi.length ? '<div class="motivi ATTENZIONE">' + x.avvisi.map(m => '<span>' + esc(m) + '</span>').join('') + '</div>' : '') +
            (!v.length && !x.avvisi.length ? '<span class="muto">—</span>' : '')
        }
      ]);
      t.innerHTML = UI.tabella(cfg.chiaveTabella, {
        colonne, righe, chiave: 'riga', ordine: { campo: 'riga', dir: 'asc' },
        vuoto: S.soloProblemi ? 'Nessuna riga con errori o avvisi.' : 'Il foglio ' + cfg.foglio + ' non contiene righe compilate.',
        classeRiga: x => x.esito === 'SCARTATO' ? 'riga-non-congrua' : (x.esito === 'INVARIATO' ? 'muto' : '')
      });
      UI.legaTabelle(t);
    }
    function etichettaCampo(campo) {
      const col = IC().COLONNE.find(c => c.campo === campo);
      if (col) return col.titolo.replace(/\s*\([^)]*\)\s*$/, '');
      return Schema.ETICHETTE[campo] || campo;
    }

    // ---- riepilogo di un foglio di registrazioni nella richiesta di conferma
    function confermaReg(cfg) {
      const r = e[cfg.archivio];
      if (!r.presente) return '';
      const scartate = r.nScartati ? '<br>Le <b>' + r.nScartati + '</b> righe scartate non verranno importate.' : '';
      if (!regDaScrivere(e, cfg)) return scartate ? '<br><br>Foglio ' + cfg.foglio + '.' + scartate : '';
      return '<br><br>Dal foglio ' + cfg.foglio + ' verranno registrati <b>' + r.nNuovi + '</b> nuovi ' + cfg.plurale +
        ' e corretti <b>' + r.nAggiornati + '</b> già in archivio.' + scartate +
        (r.nDoppi ? '<br><b>Attenzione:</b> ' + r.nDoppi + ' righe ripetono una registrazione già presente e verranno registrate una seconda volta.' : '');
    }

    // ---- collegamenti
    const b = id => document.getElementById(id);
    b('imp-modello').onclick = () => Importa.scaricaModello(false);
    if (b('imp-modello-dati')) b('imp-modello-dati').onclick = () => Importa.scaricaModello(true);
    if (b('imp-scegli')) {
      b('imp-scegli').onclick = () => b('imp-file').click();
      b('imp-file').onchange = ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) Importa.analizza(f); };
      const zona = b('imp-scegli').closest('.pannello');
      ['dragover', 'dragenter'].forEach(n => zona.addEventListener(n, ev => { ev.preventDefault(); zona.style.outline = '2px dashed var(--primario2)'; }));
      ['dragleave', 'drop'].forEach(n => zona.addEventListener(n, ev => { ev.preventDefault(); zona.style.outline = ''; }));
      zona.addEventListener('drop', ev => { const f = ev.dataTransfer.files[0]; if (f) Importa.analizza(f); });
    }
    if (b('imp-esegui')) b('imp-esegui').onclick = async () => {
      const ok = await UI.conferma({
        titolo: 'Conferma importazione',
        testoConferma: 'Importa',
        html: 'Verranno create <b>' + e.nNuove + '</b> commesse e aggiornate <b>' + e.nAggiornate + '</b> commesse già in archivio.' +
          (e.nScartate ? '<br>Le <b>' + e.nScartate + '</b> righe scartate non verranno importate.' : '') +
          (e.nAvvisi ? '<br>Ci sono <b>' + e.nAvvisi + '</b> righe con avvisi: verranno importate comunque.' : '') +
          (saldiDaScrivere(e)
            ? '<br><br>Dal foglio SALDI verranno creati <b>' + e.saldi.nNuovi + '</b> saldi al 31/12 e aggiornati <b>' + e.saldi.nAggiornati + '</b> già in archivio.' +
              (e.saldi.nScartati ? '<br>Le <b>' + e.saldi.nScartati + '</b> righe di saldo scartate non verranno importate.' : '')
            : (e.saldi.nScartati ? '<br><br>Le <b>' + e.saldi.nScartati + '</b> righe del foglio SALDI scartate non verranno importate.' : '')) +
          confermaReg(REG.movimenti) + confermaReg(REG.costi) +
          '<br><br>L\'operazione è tracciata nel Registro modifiche.'
      });
      if (ok) await Importa.esegui();
    };
    if (b('imp-annulla')) b('imp-annulla').onclick = () => { S.cartella = null; S.esame = null; S.nomeFile = ''; UI.render(); };
    const fil = b('imp-filtri');
    if (fil) fil.addEventListener('change', () => {
      fil.querySelectorAll('[name]').forEach(el => { S[el.name] = el.checked; });
      disegnaTabella();
    });
    disegnaTabella();
  });
})();
