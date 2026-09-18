/*
 * FIDA EDILE – Schema del database e migrazioni.
 * Il database è un unico oggetto JSON (file data/database.json in modalità server,
 * localStorage in modalità file). Una sola fonte per ogni dato.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.Schema = factory(root.Engine);
})(typeof self !== 'undefined' ? self : this, function (Engine) {
  'use strict';

  const VERSIONE = 1;

  function genId(prefisso) {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 8);
    return (prefisso || 'x') + '_' + t + r;
  }

  function nuovoDb() {
    return {
      app: 'FIDA EDILE – Gestione Cantieri',
      schemaVersion: VERSIONE,
      rev: 0,
      creatoIl: new Date().toISOString(),
      parametri: Object.assign({}, Engine.PARAMETRI_DEFAULT),
      liste: {
        macroCategorie: Engine.MACRO_CATEGORIE_DEFAULT.slice(),
        rami: [],
        tecnici: [],
        preposti: [],
        // ripartizione del costo strutturale orario usata dalla verifica di sostenibilità economica
        pesiStrutturali: Engine.PESI_STRUTTURALI_DEFAULT.map(x => Object.assign({}, x))
      },
      utenti: [
        { id: 'u_admin', nome: 'Amministratore', ruolo: 'admin', attivo: true },
        { id: 'u_direzione', nome: 'Direzione', ruolo: 'direzione', attivo: true },
        { id: 'u_operativo', nome: 'Operativo', ruolo: 'operativo', attivo: true },
        { id: 'u_consultazione', nome: 'Consultazione', ruolo: 'consultazione', attivo: true }
      ],
      commesse: [],
      preventivi: [],
      saldi: [],
      movimenti: [],
      costi: [],
      // fasi di lavoro del cronoprogramma (Gantt) di ciascuna commessa
      fasi: [],
      audit: [],
      esercizi: []
    };
  }

  // Porta un database eventualmente vecchio alla versione corrente senza perdere dati.
  function migra(db) {
    if (!db || typeof db !== 'object') return nuovoDb();
    const base = nuovoDb();
    ['parametri', 'liste'].forEach(k => { db[k] = Object.assign({}, base[k], db[k] || {}); });
    ['utenti', 'commesse', 'preventivi', 'saldi', 'movimenti', 'costi', 'fasi', 'audit', 'esercizi'].forEach(k => { if (!Array.isArray(db[k])) db[k] = base[k]; });
    if (!db.utenti.length) db.utenti = base.utenti;
    // ruolo admin introdotto dopo: i database precedenti non hanno un amministratore, senza il quale
    // la Dashboard di analisi e le pagine di Sistema resterebbero irraggiungibili.
    if (!db.utenti.some(u => u.ruolo === 'admin')) db.utenti.unshift({ id: 'u_admin', nome: 'Amministratore', ruolo: 'admin', attivo: true });
    // commesse definite dalla chiusura esercizio: i database precedenti non hanno il campo
    db.commesse.forEach(c => { if (!c.chiusuraDefinitiva) c.chiusuraDefinitiva = null; });
    // budget sdoppiato in iniziale/aggiornato: i database precedenti hanno solo i valori iniziali
    db.commesse.forEach(c => { c.budget = Object.assign({ orePreviste: null, costoOrario: null, costiDirettiPrevisti: null, orePrevisteAgg: null, costiDirettiPrevistiAgg: null, dataAggiornamento: '', note: '' }, c.budget || {}); });
    // Verifica di sostenibilità economica della commessa: i costi specifici arrivano dal Budget, si inserisce
    // solo il ricarico. Nelle versioni intermedie le voci erano inserite a mano: se ce ne sono, il loro ricarico
    // medio diventa il ricarico della commessa, così il risultato della verifica non cambia.
    db.commesse.forEach(c => {
      const v = c.sostenibilita || {};
      let ricarico = (v.ricarico === null || v.ricarico === undefined || v.ricarico === '') ? null : Number(v.ricarico);
      if (ricarico === null && Array.isArray(v.voci) && v.voci.length) {
        const costo = v.voci.reduce((t, x) => t + (Number(x.quantita) || 0) * (Number(x.costoUnitario) || 0), 0);
        const magg = v.voci.reduce((t, x) => t + (Number(x.quantita) || 0) * (Number(x.costoUnitario) || 0) * (Number(x.ricarico) || 0), 0);
        if (costo > 0) ricarico = magg / costo;
      }
      c.sostenibilita = { ricarico, datiVerificati: !!v.datiVerificati, data: v.data || '', note: v.note || '' };
    });
    // preventivi (ipotesi di commessa): archivio separato, tutto inserito a mano
    db.preventivi = db.preventivi.map(p => Object.assign(nuovoPreventivo(), p, {
      voci: (Array.isArray(p.voci) ? p.voci : []).map(x => Object.assign(nuovaVoceSostenibilita(), x))
    }));
    if (!Array.isArray(db.liste.pesiStrutturali) || !db.liste.pesiStrutturali.length) db.liste.pesiStrutturali = base.liste.pesiStrutturali;
    if (typeof db.rev !== 'number') db.rev = 0;
    db.schemaVersion = VERSIONE;
    db.app = base.app;
    return db;
  }

  // Modello vuoto di una commessa (tutti i campi dell'Anagrafica Rev.14 + budget + controllo)
  function nuovaCommessa() {
    return {
      id: genId('c'),
      dataInserimento: '',
      codice: '', cliente: '', cantiere: '', indirizzo: '',
      ramo: '', tecnico: '', preposto: '',
      dataInizioPrevista: '', dataInizioEffettiva: '', dataFinePrevista: '', dataFineEffettiva: '',
      dataFinePrevistaOriginale: '',
      stato: 'Da iniziare',
      ritenutePreviste: 'NO',
      contrattoIniziale: null, integrazioni: null,
      causaAggiornamentoDataFine: 'Nessuna variazione',
      note: '',
      // Budget: valori INIZIALI (storico, si congelano alla prima stesura) e valori AGGIORNATI con la data
      // dell'aggiornamento. Se gli aggiornati non ci sono, i vigenti coincidono con gli iniziali.
      budget: { orePreviste: null, costoOrario: null, costiDirettiPrevisti: null, orePrevisteAgg: null, costiDirettiPrevistiAgg: null, dataAggiornamento: '', note: '' },
      // Verifica di sostenibilità economica: nulla si duplica qui. Prezzo del computo = contratto (Anagrafica),
      // ore previste e costi specifici = ore e costi diretti previsti vigenti (Budget). Si inserisce solo il
      // ricarico da applicare ai costi specifici: vuoto = soglia minima della Direzione (Parametri).
      sostenibilita: { ricarico: null, datiVerificati: false, data: '', note: '' },
      aggiornatoAl: '', noteAzione: '',
      // Chiusura definitiva: valorizzata dalla chiusura di esercizio quando la commessa è finita.
      // { anno, data, utente, sal, fatturatoLordo, ritenute, svincoli, perditeSal, ore, costiDiretti }
      // Da quel momento la commessa non genera più saldi iniziali ed esce dal portafoglio operativo.
      chiusuraDefinitiva: null,
      annullato: false
    };
  }
  function nuovoMovimento() {
    return { id: genId('m'), commessaId: '', data: '', tipo: '', numeroDocumento: '', descrizione: '', sal: null, fatturatoLordo: null, ritenuta: null, svincolo: null, ore: null, perditaSal: null, note: '', annullato: false };
  }
  function nuovoCosto() {
    return { id: genId('k'), commessaId: '', data: '', macroCategoria: '', descrizione: '', importo: null, fornitore: '', note: '', annullato: false };
  }
  // Fase di lavoro del cronoprogramma: date previste obbligatorie, effettive a mano quando la fase parte e finisce
  function nuovaFase() {
    return { id: genId('f'), commessaId: '', fase: '', inizioPrevisto: '', inizioEffettivo: '', finePrevista: '', fineEffettiva: '', quantita: null, um: '', prezzoVendita: null };
  }
  // Riga di costo specifico della verifica di sostenibilità (righe gialle del modello)
  function nuovaVoceSostenibilita(sogliaRicarico) {
    return { id: genId('v'), voce: '', macroCategoria: '', quantita: null, um: '', costoUnitario: null, ricarico: (sogliaRicarico === undefined ? 0.15 : sogliaRicarico) };
  }
  // Preventivo / ipotesi di commessa: esiste prima della commessa, quindi ogni dato è inserito a mano.
  // Ha solo la verifica di sostenibilità; una volta convertito resta come storico collegato (commessaId).
  function nuovoPreventivo() {
    return {
      id: genId('p'),
      numero: '', data: '',
      cliente: '', oggetto: '', indirizzo: '', ramo: '', tecnico: '',
      prezzoProposto: null, orePreviste: null,
      voci: [],
      datiVerificati: false, note: '',
      commessaId: '', convertitoIl: '', convertitoDa: '',
      annullato: false
    };
  }
  function nuovoSaldo(anno) {
    return { id: genId('s'), commessaId: '', anno: anno, sal: null, fatturatoLordo: null, ritenute: null, svincoli: null, perditeSal: null, ore: null, costiDiretti: null, note: '', annullato: false };
  }

  // Etichette leggibili dei campi (usate nel registro modifiche e negli export)
  const ETICHETTE = {
    dataInserimento: 'Data di inserimento', codice: 'Codice commessa', cliente: 'Cliente', cantiere: 'Descrizione / Cantiere', indirizzo: 'Indirizzo / Località',
    ramo: 'Ramo di attività', tecnico: 'Tecnico', preposto: 'Preposto',
    dataInizioPrevista: 'Data inizio prevista', dataInizioEffettiva: 'Data inizio effettiva', dataFinePrevista: 'Data fine prevista', dataFineEffettiva: 'Data fine effettiva',
    dataFinePrevistaOriginale: 'Data fine prevista originaria', stato: 'Stato cantiere', ritenutePreviste: 'Ritenute previste',
    contrattoIniziale: 'Contratto iniziale', integrazioni: 'Integrazioni', causaAggiornamentoDataFine: 'Causa aggiornamento data fine', note: 'Note',
    aggiornatoAl: 'Aggiornato al', noteAzione: 'Note / Azione',
    orePreviste: 'Ore previste iniziali', costoOrario: 'Costo orario', costiDirettiPrevisti: 'Costi diretti previsti iniziali',
    orePrevisteAgg: 'Ore previste aggiornate', costiDirettiPrevistiAgg: 'Costi diretti previsti aggiornati', dataAggiornamento: 'Data aggiornamento budget',
    data: 'Data', tipo: 'Tipo movimento', numeroDocumento: 'Numero documento', descrizione: 'Descrizione',
    sal: 'SAL maturato', fatturatoLordo: 'Fatturato lordo', ritenuta: 'Ritenuta', ritenute: 'Ritenute', svincolo: 'Svincolo ritenuta', svincoli: 'Svincoli',
    ore: 'Ore', perditaSal: 'Perdita SAL accettata', perditeSal: 'Perdite SAL accettate', costiDiretti: 'Costi diretti',
    macroCategoria: 'Macro-categoria', importo: 'Importo', fornitore: 'Fornitore / Documento',
    commessaId: 'Commessa', annullato: 'Annullato', motivoAnnullamento: 'Motivo annullamento',
    chiusuraDefinitiva: 'Chiusura definitiva',
    scartoTempoAttenzione: 'Scarto tempo – attenzione', scartoTempoCritico: 'Scarto tempo – critico',
    scartoOreAttenzione: 'Scarto ore – attenzione', scartoOreCritico: 'Scarto ore – critico',
    sogliaSalNonFatturato: 'Soglia SAL non fatturato', annoGestione: 'Anno di gestione', giorniAggiornamentoRecente: 'Giorni per aggiornamento recente',
    nome: 'Nome', ruolo: 'Ruolo', attivo: 'Attivo',
    rischioStrutturale: 'Rischio strutturale', redditivita: 'Redditività', rientroOrario: 'Rientro bancario orario',
    sogliaRicaricoDirezione: 'Soglia minima di ricarico (Direzione)', pesiStrutturali: 'Pesi del costo strutturale',
    voci: 'Voci di costo specifico', datiVerificati: 'Dati del computo verificati e completi',
    numero: 'Numero preventivo', oggetto: 'Oggetto / Cantiere', prezzoProposto: 'Prezzo proposto',
    voce: 'Voce di costo specifico', quantita: 'Quantità', um: 'Unità di misura', costoUnitario: 'Costo unitario', ricarico: 'Ricarico',
    fase: 'Fase di lavoro', inizioPrevisto: 'Inizio previsto', inizioEffettivo: 'Inizio effettivo', finePrevista: 'Fine prevista', fineEffettiva: 'Fine effettiva',
    prezzoVendita: 'Prezzo di vendita materiale'
  };

  return { VERSIONE, genId, nuovoDb, migra, nuovaCommessa, nuovoMovimento, nuovoCosto, nuovoSaldo, nuovaFase, nuovoPreventivo, nuovaVoceSostenibilita, ETICHETTE };
});
