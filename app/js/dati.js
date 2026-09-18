/*
 * FIDA EDILE – Esportazione e importazione totale dei dati.
 *
 * Serve a portare via TUTTO il contenuto dell'applicazione in un formato che non dipenda da come i dati
 * sono conservati. Oggi l'archivio è un unico JSON (file data/database.json o localStorage); domani sarà
 * un database vero. Per questo il file esportato non è una copia della struttura interna, ma una busta
 * che si porta dietro anche la propria descrizione:
 *
 *   - `struttura.ordine`  l'ordine in cui inserire le entità perché i riferimenti esistano già;
 *   - `struttura.entita`  per ognuna: chiave primaria, elenco dei campi, riferimenti ad altre entità,
 *                         oggetti annidati (che in SQL diventano colonne o una colonna JSON) e
 *                         collezioni annidate (che in SQL diventano tabelle figlie);
 *   - `etichette`         il nome leggibile di ogni campo, per ricostruire un'interfaccia altrove.
 *
 * Chi importerà in PostgreSQL, MySQL o altro non deve conoscere questo codice: gli bastano la busta e
 * la sua descrizione. L'importazione qui dentro accetta sia la busta sia i vecchi backup grezzi, così
 * le copie di sicurezza già scaricate restano valide.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./schema.js'));
  else root.Dati = factory(root.Schema);
})(typeof self !== 'undefined' ? self : this, function (Schema) {
  'use strict';

  const FORMATO = 'fida-edile.export';
  const VERSIONE_FORMATO = 1;

  // Entità in ordine di dipendenza: chi viene prima non ha riferimenti a chi viene dopo.
  // È lo stesso ordine in cui vanno inserite le righe in un database con vincoli di integrità.
  const ORDINE = ['utenti', 'commesse', 'preventivi', 'saldi', 'movimenti', 'costi', 'fasi', 'esercizi', 'audit'];

  // Modello vuoto di ogni entità: dà l'elenco e l'ordine canonico dei campi. I record reali possono
  // averne altri (creatoIl, annullatoDa…), che vengono aggiunti in coda senza essere persi.
  const MODELLI = {
    utenti: () => ({ id: '', nome: '', ruolo: '', attivo: true }),
    commesse: () => Schema.nuovaCommessa(),
    preventivi: () => Schema.nuovoPreventivo(),
    saldi: () => Schema.nuovoSaldo(null),
    movimenti: () => Schema.nuovoMovimento(),
    costi: () => Schema.nuovoCosto(),
    fasi: () => Schema.nuovaFase(),
    esercizi: () => ({ anno: null, chiusoIl: '', utente: '', saldiGenerati: null, commesseDefinite: null }),
    audit: () => ({ id: '', ts: '', utente: '', ruolo: '', entita: '', entitaId: '', riferimento: '', azione: '', modifiche: [] })
  };

  // Chiave primaria di ogni entità. `esercizi` non ha un id: la chiave naturale è l'anno.
  const CHIAVI = { utenti: 'id', commesse: 'id', preventivi: 'id', saldi: 'id', movimenti: 'id', costi: 'id', fasi: 'id', esercizi: 'anno', audit: 'id' };

  // Riferimenti fra entità: campo → entità puntata. Diventano le chiavi esterne del database.
  // Il riferimento di `audit` è volutamente escluso: è un registro storico che cita anche righe
  // successivamente eliminate, e un vincolo di integrità lo rifiuterebbe.
  const RIFERIMENTI = {
    commesse: {}, utenti: {}, esercizi: {}, audit: {},
    preventivi: { commessaId: 'commesse' },   // valorizzato solo dopo la conversione in commessa
    saldi: { commessaId: 'commesse' },
    movimenti: { commessaId: 'commesse' },
    costi: { commessaId: 'commesse' },
    fasi: { commessaId: 'commesse' }
  };
  // Riferimenti che possono essere vuoti: un preventivo non ancora convertito non punta a nessuna commessa.
  const RIFERIMENTI_FACOLTATIVI = { preventivi: ['commessaId'] };

  // Oggetti annidati dentro un record: in un database relazionale diventano colonne con prefisso
  // (budget_orePreviste…) oppure una singola colonna JSON.
  const OGGETTI = { commesse: ['budget', 'sostenibilita', 'chiusuraDefinitiva'] };
  // Collezioni annidate: in un database relazionale diventano tabelle figlie, collegate alla riga padre.
  const COLLEZIONI = { preventivi: ['voci'], audit: ['modifiche'] };

  const MODELLI_ANNIDATI = {
    'commesse.budget': { orePreviste: null, costoOrario: null, costiDirettiPrevisti: null, orePrevisteAgg: null, costiDirettiPrevistiAgg: null, dataAggiornamento: '', note: '' },
    'commesse.sostenibilita': { ricarico: null, datiVerificati: false, data: '', note: '' },
    'commesse.chiusuraDefinitiva': { anno: null, data: '', utente: '', sal: null, fatturatoLordo: null, ritenute: null, svincoli: null, perditeSal: null, ore: null, costiDiretti: null },
    'preventivi.voci': { id: '', voce: '', macroCategoria: '', quantita: null, um: '', costoUnitario: null, ricarico: null },
    'audit.modifiche': { campo: '', prima: null, dopo: null }
  };

  function elenco(v) { return Array.isArray(v) ? v : []; }
  function oggetto(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }

  // Campi di un'entità: prima quelli del modello, nel loro ordine, poi quelli in più trovati nei dati.
  // Così l'elenco è stabile e leggibile, e nessun campo aggiunto nel tempo resta fuori.
  function campiDi(modello, righe, escludi) {
    const fuori = escludi || [];
    const out = Object.keys(modello).filter(k => fuori.indexOf(k) < 0);
    elenco(righe).forEach(r => Object.keys(oggetto(r)).forEach(k => {
      if (fuori.indexOf(k) < 0 && out.indexOf(k) < 0) out.push(k);
    }));
    return out;
  }

  // Descrizione di un'entità: quello che serve a chi deve creare la tabella e caricarla.
  function descriviEntita(nome, righe) {
    const modello = MODELLI[nome]();
    const annidati = (OGGETTI[nome] || []).concat(COLLEZIONI[nome] || []);
    const d = {
      chiave: CHIAVI[nome],
      campi: campiDi(modello, righe, annidati),
      riferimenti: RIFERIMENTI[nome] || {}
    };
    if (RIFERIMENTI_FACOLTATIVI[nome]) d.riferimentiFacoltativi = RIFERIMENTI_FACOLTATIVI[nome].slice();
    if (OGGETTI[nome]) {
      d.oggetti = {};
      OGGETTI[nome].forEach(k => {
        const valori = elenco(righe).map(r => oggetto(r)[k]).filter(x => x && typeof x === 'object');
        d.oggetti[k] = campiDi(MODELLI_ANNIDATI[nome + '.' + k], valori);
      });
    }
    if (COLLEZIONI[nome]) {
      d.collezioni = {};
      COLLEZIONI[nome].forEach(k => {
        const valori = [];
        elenco(righe).forEach(r => elenco(oggetto(r)[k]).forEach(x => valori.push(x)));
        const mod = MODELLI_ANNIDATI[nome + '.' + k];
        d.collezioni[k] = { chiave: Object.keys(mod).indexOf('id') >= 0 ? 'id' : null, campi: campiDi(mod, valori) };
      });
    }
    return d;
  }

  // ---------------------------------------------------------------- controlli di integrità
  // Sono gli stessi che un database con vincoli applicherebbe al momento dell'inserimento: meglio
  // scoprirli adesso, quando si può ancora correggere, che al momento della migrazione.
  function verifica(db) {
    const errori = [], avvisi = [];
    const indici = {};
    ORDINE.forEach(nome => {
      const chiave = CHIAVI[nome];
      const visti = Object.create(null), doppi = [];
      elenco(db[nome]).forEach(r => {
        const k = oggetto(r)[chiave];
        if (k === undefined || k === null || k === '') { avvisi.push(nome + ': una riga non ha ' + chiave); return; }
        if (visti[k]) { if (doppi.indexOf(k) < 0) doppi.push(k); } else visti[k] = true;
      });
      if (doppi.length) errori.push(nome + ': ' + chiave + ' ripetuto (' + doppi.slice(0, 5).join(', ') + (doppi.length > 5 ? '…' : '') + ')');
      indici[nome] = visti;
    });
    ORDINE.forEach(nome => {
      const rif = RIFERIMENTI[nome] || {};
      const facolt = RIFERIMENTI_FACOLTATIVI[nome] || [];
      Object.keys(rif).forEach(campo => {
        const orfani = [];
        elenco(db[nome]).forEach(r => {
          const v = oggetto(r)[campo];
          if (v === undefined || v === null || v === '') { if (facolt.indexOf(campo) < 0) orfani.push('(vuoto)'); return; }
          if (!indici[rif[campo]][v]) orfani.push(String(v));
        });
        if (orfani.length) {
          const unici = Array.from(new Set(orfani));
          errori.push(nome + '.' + campo + ': ' + orfani.length + ' righe puntano a ' + rif[campo] + ' inesistenti (' + unici.slice(0, 3).join(', ') + (unici.length > 3 ? '…' : '') + ')');
        }
      });
    });
    if (!elenco(db.utenti).some(u => u.ruolo === 'admin')) avvisi.push('nessun utente con ruolo admin: le pagine di Sistema resterebbero irraggiungibili');
    return { errori, avvisi, ok: !errori.length };
  }

  function conteggi(db) {
    const c = {};
    let totale = 0;
    ORDINE.forEach(nome => { c[nome] = elenco(db[nome]).length; totale += c[nome]; });
    c.totale = totale;
    return c;
  }

  // ---------------------------------------------------------------- esportazione
  // opt: { modo, utente } – solo per tracciare da dove viene il file.
  function esporta(db, opt) {
    opt = opt || {};
    const struttura = { ordine: ORDINE.slice(), entita: {} };
    ORDINE.forEach(nome => { struttura.entita[nome] = descriviEntita(nome, db[nome]); });
    const dati = {};
    ORDINE.forEach(nome => { dati[nome] = elenco(db[nome]).map(r => JSON.parse(JSON.stringify(r))); });
    return {
      formato: FORMATO,
      versioneFormato: VERSIONE_FORMATO,
      applicazione: db.app || 'FIDA EDILE – Gestione Cantieri',
      schemaVersion: db.schemaVersion || Schema.VERSIONE,
      generatoIl: new Date().toISOString(),
      generatoDa: opt.utente || '',
      origine: { modo: opt.modo || '', rev: typeof db.rev === 'number' ? db.rev : null, creatoIl: db.creatoIl || '' },
      struttura,
      // valori unici dell'applicazione: non sono righe di una tabella ma impostazioni
      impostazioni: {
        parametri: JSON.parse(JSON.stringify(oggetto(db.parametri))),
        liste: JSON.parse(JSON.stringify(oggetto(db.liste)))
      },
      dati,
      conteggi: conteggi(db),
      etichette: Object.assign({}, Schema.ETICHETTE)
    };
  }

  function testo(db, opt) { return JSON.stringify(esporta(db, opt), null, 1); }

  // ---------------------------------------------------------------- importazione
  // Legge la busta oppure un vecchio backup grezzo e restituisce il referto, senza applicare niente:
  // chi chiama decide se procedere dopo aver visto conteggi e problemi.
  function analizza(ingresso) {
    let obj = ingresso;
    if (typeof obj === 'string') {
      try { obj = JSON.parse(obj); }
      catch (e) { return { ok: false, errori: ['Il file non è un JSON leggibile: ' + e.message], avvisi: [] }; }
    } else if (obj && typeof obj === 'object') {
      // Schema.migra lavora sull'oggetto che riceve: si copia, così analizzare non modifica l'originale
      try { obj = JSON.parse(JSON.stringify(obj)); }
      catch (e) { return { ok: false, errori: ['I dati contengono riferimenti circolari e non sono leggibili.'], avvisi: [] }; }
    }
    if (!obj || typeof obj !== 'object') return { ok: false, errori: ['Il file non contiene un oggetto.'], avvisi: [] };

    let db = null, origine = '', versioneFormato = null, generatoIl = '', generatoDa = '';
    if (obj.formato === FORMATO) {
      origine = 'portabile';
      versioneFormato = obj.versioneFormato;
      generatoIl = obj.generatoIl || '';
      generatoDa = obj.generatoDa || '';
      if (typeof versioneFormato !== 'number' || versioneFormato > VERSIONE_FORMATO) {
        return { ok: false, origine, versioneFormato, errori: ['Il file è in formato versione ' + versioneFormato + ', questa applicazione arriva alla ' + VERSIONE_FORMATO + '. Aggiorna l\'applicazione prima di importarlo.'], avvisi: [] };
      }
      const dati = oggetto(obj.dati), imp = oggetto(obj.impostazioni);
      db = { app: obj.applicazione, schemaVersion: obj.schemaVersion, rev: 0, parametri: oggetto(imp.parametri), liste: oggetto(imp.liste) };
      ORDINE.forEach(nome => { db[nome] = elenco(dati[nome]); });
    } else if (Array.isArray(obj.commesse)) {
      // vecchio backup: era una copia diretta della struttura interna
      origine = 'grezzo';
      db = obj;
    } else {
      return { ok: false, errori: ['Il file non è né un\'esportazione di questa applicazione né una sua copia di sicurezza: manca l\'elenco delle commesse.'], avvisi: [] };
    }

    db = Schema.migra(db);
    const v = verifica(db);
    return {
      ok: v.ok, origine, versioneFormato, generatoIl, generatoDa,
      conteggi: conteggi(db), errori: v.errori, avvisi: v.avvisi, db
    };
  }

  return {
    FORMATO, VERSIONE_FORMATO, ORDINE, CHIAVI, RIFERIMENTI,
    descriviEntita, verifica, conteggi, esporta, testo, analizza
  };
});
