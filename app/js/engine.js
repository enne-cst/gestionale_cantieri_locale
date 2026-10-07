/*
 * FIDA EDILE – Motore di calcolo (Rev.14)
 * ---------------------------------------
 * Riproduce le logiche del foglio CANTIERI, delle dashboard MOVIMENTI / BUDGET
 * e dei controlli di coerenza del DATABASE CONTRATTI FIDA EDILE – REV.14.
 * Nessuna dipendenza: usato sia nel browser (window.Engine) sia in Node (test).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- liste
  const STATI = [
    'Da iniziare',
    'In corso',
    'Quasi finito',
    'Finito ritenute non previste',
    'Finito con sblocco ritenute',
    'Finito senza sblocco ritenute'
  ];
  const STATI_FINITI = STATI.slice(3);
  const TIPI_MOVIMENTO = ['SAL', 'FATTURA', 'SAL + FATTURA', 'SVINCOLO RITENUTA', 'ORE', 'PERDITA SAL ACCETTATA', 'ALTRO'];
  const CAUSE_DATA_FINE = ['Nessuna variazione', 'Proroga/Sospensione autorizzata', 'Ritardo produttivo FIDA', 'Altra causa'];
  const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  // admin: ruolo tecnico di amministrazione dell'applicazione. Vede anche la Dashboard di analisi
  // e le pagine di Sistema (Parametri, Registro), che alla Direzione non sono mostrate.
  const RUOLI = ['admin', 'direzione', 'operativo', 'consultazione'];
  const MACRO_CATEGORIE_DEFAULT = ['Materiali e attrezzature', 'Noleggi', 'Subappalti', 'Trasporti', 'Smaltimenti', 'Altro'];

  const PARAMETRI_DEFAULT = {
    costoOrario: 45.79,
    scartoTempoAttenzione: 0.07,
    scartoTempoCritico: 0.15,
    scartoOreAttenzione: 0.07,
    scartoOreCritico: 0.15,
    sogliaSalNonFatturato: 0.05,
    annoGestione: 2026,
    giorniAggiornamentoRecente: 30,
    // Soglie degli alert CRITICI, impostabili dall'azienda (Parametri). Sotto la soglia lo stesso
    // problema resta un alert di ATTENZIONE.
    sogliaErroreAcquisizione: 0.05,   // prezzo venduto sotto il prezzo minimo sostenibile oltre questa quota
    sogliaOreOltrePreviste: 0.10,     // ore segnate oltre quelle previste
    sogliaCostiOltrePrevisti: 0.10,   // costi diretti segnati oltre quelli previsti
    sogliaPerditeAccettate: 0.05,     // perdite SAL accettate sul prezzo di vendita (contratto aggiornato)
    // Dashboard direzionale: rientro bancario desiderato nell'anno, in euro. Vuoto = ricavato dalle ore
    // previste del portafoglio × rientro bancario per ora.
    obiettivoRientroAnnuo: null,
    // Verifica di sostenibilità economica della commessa (modello "Analisi semplificata").
    // Il costo strutturale orario resta quello già definito sopra (costoOrario): una sola fonte per tutta l'app.
    rischioStrutturale: 0.03,
    redditivita: 0.12,
    rientroOrario: 6.74,
    sogliaRicaricoDirezione: 0.15
  };

  // Ripartizione del costo strutturale orario per voce (foglio "Dettaglio strutturale").
  // I pesi sommano a 1: la quota €/ora di ogni voce è costo strutturale orario × peso.
  const PESI_STRUTTURALI_DEFAULT = [
    { gruppo: 'COSTI DIRETTI/INDIRETTI', voce: 'Personale operaio', peso: 0.65040641707904268 },
    { gruppo: 'COSTI DIRETTI/INDIRETTI', voce: 'Altre voci del personale', peso: 0.019449091275596717 },
    { gruppo: 'COSTI DIRETTI/INDIRETTI', voce: 'Personale tecnico', peso: 0.028378225803874699 },
    { gruppo: 'COSTI DIRETTI/INDIRETTI', voce: 'Automezzi', peso: 0.066973216153641366 },
    { gruppo: 'COSTI DIRETTI/INDIRETTI', voce: 'Attrezzature', peso: 0.024450953023522362 },
    { gruppo: 'COSTI DIRETTI/INDIRETTI', voce: 'Oneri di cantiere', peso: 0.0014953321617915524 },
    { gruppo: 'COSTI DIRETTI/INDIRETTI', voce: 'Smaltimento rifiuti', peso: 0.0042331022356804767 },
    { gruppo: 'COSTI DIRETTI/INDIRETTI', voce: 'Ammortamenti', peso: 0.02545256672238571 },
    { gruppo: 'COSTI DIRETTI/INDIRETTI', voce: 'Altre voci mancanti', peso: 0.0070531208989743528 },
    { gruppo: 'SPESE GENERALI', voce: 'Personale impiegatizio', peso: 0.042832125130656769 },
    { gruppo: 'SPESE GENERALI', voce: 'Amministratore', peso: 0.029187427298039723 },
    { gruppo: 'SPESE GENERALI', voce: 'Utenze', peso: 0.0039469387213632631 },
    { gruppo: 'SPESE GENERALI', voce: 'Spese varie ufficio', peso: 0.0017123444255557779 },
    { gruppo: 'SPESE GENERALI', voce: 'Fabbricati', peso: 0.0085159811054618881 },
    { gruppo: 'SPESE GENERALI', voce: 'Pubblicità', peso: 0.0052525633969925326 },
    { gruppo: 'SPESE GENERALI', voce: 'Consulenze', peso: 0.028247326013138341 },
    { gruppo: 'SPESE GENERALI', voce: 'Pratiche amministrative e assicurazioni', peso: 0.020166712594750016 },
    { gruppo: 'SPESE GENERALI', voce: 'Finanza e banche', peso: 0.014294492661316636 },
    { gruppo: 'SPESE GENERALI', voce: 'Altre imposte', peso: 0.00042267206945540564 },
    { gruppo: 'SPESE GENERALI', voce: 'Perdite su crediti', peso: 0.0058170031965173235 },
    { gruppo: 'SPESE GENERALI', voce: 'Sanzioni', peso: 0.0024539708883600194 },
    { gruppo: 'SPESE GENERALI', voce: 'Sopravvenienze passive e altro', peso: 0.0092584171438823606 }
  ];

  const GRUPPI_STRUTTURALI = ['COSTI DIRETTI/INDIRETTI', 'SPESE GENERALI'];

  // Livelli di alert, dal più grave: la commessa prende il livello del suo motivo più grave.
  // INCOMPLETO = mancano dati; non è un giudizio sull'andamento della commessa.
  const LIVELLI_ALERT = ['CRITICO', 'ATTENZIONE', 'INCOMPLETO', 'REGOLARE'];

  // Esiti possibili della verifica di sostenibilità, nella stessa gerarchia del modello
  const ESITI_SOSTENIBILITA = ['CONGRUA', 'NON CONGRUA', 'NON CONGRUO', 'DA COMPLETARE'];

  // Campi tipici per tipo di movimento (solo suggerimento in maschera)
  const CAMPI_TIPO = {
    'SAL': ['sal'],
    'FATTURA': ['fatturatoLordo', 'ritenuta'],
    'SAL + FATTURA': ['sal', 'fatturatoLordo', 'ritenuta'],
    'SVINCOLO RITENUTA': ['svincolo'],
    'ORE': ['ore'],
    'PERDITA SAL ACCETTATA': ['perditaSal'],
    'ALTRO': []
  };

  // ---------------------------------------------------------------- utilità
  function has(v) { return !(v === null || v === undefined || v === ''); }
  function num(v) { if (!has(v)) return 0; const n = Number(v); return isNaN(n) ? 0 : n; }
  function isoOk(iso) { return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso); }
  function dayNum(iso) {
    if (!isoOk(iso)) return null;
    return Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
  }
  function annoDi(iso) { return isoOk(iso) ? +iso.slice(0, 4) : null; }
  function meseDi(iso) { return isoOk(iso) ? +iso.slice(5, 7) : null; }
  function isFinito(stato) { return STATI_FINITI.indexOf(stato) >= 0; }
  function attivi(list) { return (list || []).filter(x => !x.annullato); }
  // Commessa DEFINITA: finita e chiusa in via definitiva da una chiusura di esercizio.
  // Resta nello storico (elenco, scheda, movimenti e costi degli anni passati) ma non genera più
  // saldi iniziali e non entra nei cumulativi, nelle dashboard e nelle allerte degli esercizi successivi.
  function isDefinita(c) { return !!(c && c.chiusuraDefinitiva); }
  function operative(list) { return (list || []).filter(x => !x.annullato && !x.chiusuraDefinitiva); }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function etichetta(c) {
    return [c.codice, c.cliente, c.cantiere].map(x => (x || '').trim()).join(' | ');
  }
  function contrattoAggiornato(c) {
    if (!has(c.contrattoIniziale) && !has(c.integrazioni)) return null;
    return num(c.contrattoIniziale) + num(c.integrazioni);
  }
  function isPregressa(c, annoGestione) {
    const d = dayNum(c.dataInizioEffettiva);
    return d !== null && d < dayNum(annoGestione + '-01-01');
  }
  function dataSaldo(annoGestione) { return (annoGestione - 1) + '-12-31'; }
  // Budget sdoppiato: valori INIZIALI (storico) e valori AGGIORNATI alla data indicata.
  // I valori "vigenti" (senza suffisso) sono gli aggiornati quando ci sono, altrimenti gli iniziali.
  // Le ore si valorizzano sempre al costo strutturale corrente dei Parametri (P): una sola fonte per
  // tutta l'app, così cambiando il parametro si aggiornano insieme previsioni, consuntivo e verifica.
  function budgetDi(c, P) {
    const b = (c && c.budget) || {};
    const costoOrario = (P && has(P.costoOrario)) ? num(P.costoOrario) : null;
    const contratto = contrattoAggiornato(c || {});
    const oreIni = has(b.orePreviste) ? num(b.orePreviste) : null;
    const costiIni = has(b.costiDirettiPrevisti) ? num(b.costiDirettiPrevisti) : null;
    const oreAgg = has(b.orePrevisteAgg) ? num(b.orePrevisteAgg) : null;
    const costiAgg = has(b.costiDirettiPrevistiAgg) ? num(b.costiDirettiPrevistiAgg) : null;
    const ore = oreAgg !== null ? oreAgg : oreIni;
    const costiDiretti = costiAgg !== null ? costiAgg : costiIni;
    const costoOreDi = o => (o !== null && costoOrario !== null) ? o * costoOrario : null;
    const totaleDi = (o, k) => num(costoOreDi(o)) + num(k);
    const margineDi = t => (contratto !== null && contratto !== 0) ? (contratto - t) / contratto : null;
    const costoTotale = totaleDi(ore, costiDiretti), costoTotaleIni = totaleDi(oreIni, costiIni);
    return {
      costoOrario, note: b.note || '',
      // vigenti
      orePreviste: ore, costiDirettiPrevisti: costiDiretti, costoOre: costoOreDi(ore),
      costoTotalePrevisto: costoTotale, margineTeorico: margineDi(costoTotale),
      // iniziali (storico)
      orePrevisteIniziali: oreIni, costiDirettiPrevistiIniziali: costiIni, costoOreIniziale: costoOreDi(oreIni),
      costoTotalePrevistoIniziale: costoTotaleIni, margineTeoricoIniziale: margineDi(costoTotaleIni),
      // aggiornati (come inseriti: null se mai aggiornati)
      orePrevisteAgg: oreAgg, costiDirettiPrevistiAgg: costiAgg,
      dataAggiornamento: b.dataAggiornamento || '',
      // "rivisto" = valori aggiornati inseriti; "confermato" = solo la data, con i valori iniziali ritenuti ancora validi
      haValoriAggiornati: oreAgg !== null || costiAgg !== null,
      haAggiornamento: oreAgg !== null || costiAgg !== null || !!b.dataAggiornamento
    };
  }

  // ---------------------------------------------------------------- aggregati
  // Cumulativo commessa = saldo iniziale (esercizio) + movimenti/costi dell'esercizio.
  function indicizza(db) {
    const anno = db.parametri.annoGestione;
    const idx = {};
    const get = id => (idx[id] || (idx[id] = { saldo: null, movimenti: [], costi: [], fasi: [], orePerFase: {} }));
    attivi(db.saldi).forEach(s => { if (s.anno === anno) get(s.commessaId).saldo = s; });
    attivi(db.movimenti).forEach(m => { if (annoDi(m.data) === anno) get(m.commessaId).movimenti.push(m); });
    attivi(db.costi).forEach(k => { if (annoDi(k.data) === anno) get(k.commessaId).costi.push(k); });
    // Cronoprogramma: le ore di una fase si contano su tutti gli anni, perché il saldo iniziale porta
    // le ore degli anni passati in un solo numero e non sa a quale fase appartenevano.
    (db.fasi || []).forEach(f => { get(f.commessaId).fasi.push(f); });
    attivi(db.movimenti).forEach(m => {
      if (!m.faseId || !num(m.ore)) return;
      const o = get(m.commessaId).orePerFase;
      o[m.faseId] = (o[m.faseId] || 0) + num(m.ore);
    });
    return idx;
  }
  // opz.senzaSaldi: il saldo iniziale non entra nei cumulativi. Serve a leggere la commessa come se
  // partisse da zero il 1° gennaio, cioè a vedere il solo esercizio in corso senza ciò che è stato prima.
  // Il saldo scartato resta disponibile in `saldoEscluso`, per poter dire che cosa si sta lasciando fuori.
  function aggregati(db, commessaId, idx, opz) {
    const a = (idx || indicizza(db))[commessaId] || { saldo: null, movimenti: [], costi: [] };
    const sum = (arr, f) => arr.reduce((t, x) => t + num(x[f]), 0);
    const s = a.saldo || {};
    const senzaSaldi = !!(opz && opz.senzaSaldi);
    const saldoReale = {
      sal: num(s.sal), fatturatoLordo: num(s.fatturatoLordo), ritenute: num(s.ritenute), svincoli: num(s.svincoli),
      perditeSal: num(s.perditeSal), ore: num(s.ore), costiDiretti: num(s.costiDiretti)
    };
    const saldo = {};
    Object.keys(saldoReale).forEach(k => { saldo[k] = senzaSaldi ? 0 : saldoReale[k]; });
    const periodo = {
      sal: sum(a.movimenti, 'sal'), fatturatoLordo: sum(a.movimenti, 'fatturatoLordo'), ritenute: sum(a.movimenti, 'ritenuta'),
      svincoli: sum(a.movimenti, 'svincolo'), perditeSal: sum(a.movimenti, 'perditaSal'), ore: sum(a.movimenti, 'ore'),
      costiDiretti: sum(a.costi, 'importo')
    };
    const cumulato = {};
    Object.keys(saldo).forEach(k => { cumulato[k] = saldo[k] + periodo[k]; });
    return {
      saldo, periodo, cumulato, hasSaldo: !!a.saldo,
      senzaSaldi, saldoEscluso: (senzaSaldi && a.saldo) ? saldoReale : null,
      nMovimenti: a.movimenti.length, nCosti: a.costi.length
    };
  }

  // Ore del cronoprogramma (Gantt): per ogni fase le ore previste, gli uomini e le ore effettive, cioè
  // quelle dei movimenti attribuiti alla fase. Serve a capire in quale fase il cantiere ha sforato.
  function oreFasi(db, commessaId, idx) {
    const a = (idx || indicizza(db))[commessaId] || { fasi: [], orePerFase: {} };
    const righe = (a.fasi || []).map(f => {
      // fase in subappalto: le ore sono del subappaltatore e non si controllano, qualunque cosa sia scritta
      const subappalto = f.esecutore === 'subappalto';
      const previste = (!subappalto && has(f.orePreviste)) ? num(f.orePreviste) : null;
      const effettive = num((a.orePerFase || {})[f.id]);
      return {
        id: f.id, fase: f.fase || '', uomini: (!subappalto && has(f.uomini)) ? num(f.uomini) : null,
        subappalto, subappaltatore: subappalto ? (f.subappaltatore || '') : '',
        previste, effettive,
        scostamento: previste === null ? null : effettive - previste,
        pct: (previste === null || previste <= 0) ? null : effettive / previste,
        oltre: previste !== null && effettive > previste + 1e-9
      };
    });
    const conOre = righe.filter(r => r.previste !== null);
    const attribuite = righe.reduce((t, r) => t + r.effettive, 0);
    const nSubappalto = righe.filter(r => r.subappalto).length;
    return {
      // nFasi = fasi eseguite dall'azienda, le sole di cui si contano le ore
      righe, nFasi: righe.length - nSubappalto, nSubappalto, nConOre: conOre.length,
      previste: conOre.length ? conOre.reduce((t, r) => t + r.previste, 0) : null,
      attribuite, oltre: righe.filter(r => r.oltre)
    };
  }

  // Andamento dell'utile maturato: un punto per ogni data in cui la commessa si è mossa (un movimento
  // o un costo diretto). L'utile è quello della colonna "Maturato" del conto della commessa:
  // fatturato lordo − perdite SAL accettate − costi diretti sostenuti − ore consumate × costo orario.
  // Il saldo iniziale, quando c'è ed è incluso, è il primo punto: la curva parte da lì, non da zero.
  function serieUtile(c, db, idx, opz) {
    const P = db.parametri;
    const co = num(P.costoOrario);
    const a = (idx || indicizza(db))[(c && c.id) || ''] || { saldo: null, movimenti: [], costi: [] };
    const s = (opz && opz.senzaSaldi) ? null : a.saldo;
    const eventi = {};
    const agg = (data, campo, v) => {
      if (!isoOk(data) || !num(v)) return;
      (eventi[data] || (eventi[data] = { fatt: 0, perdite: 0, costi: 0, ore: 0 }))[campo] += num(v);
    };
    a.movimenti.forEach(m => { agg(m.data, 'fatt', m.fatturatoLordo); agg(m.data, 'perdite', m.perditaSal); agg(m.data, 'ore', m.ore); });
    a.costi.forEach(k => agg(k.data, 'costi', k.importo));
    const cum = { fatt: 0, perdite: 0, costi: 0, ore: 0 };
    const punti = [];
    const segna = (data, saldo) => punti.push({
      data, saldo: !!saldo, fatt: cum.fatt, perdite: cum.perdite, costi: cum.costi, ore: cum.ore,
      costoOre: cum.ore * co, utile: cum.fatt - cum.perdite - cum.costi - cum.ore * co
    });
    if (s) {
      cum.fatt = num(s.fatturatoLordo); cum.perdite = num(s.perditeSal); cum.costi = num(s.costiDiretti); cum.ore = num(s.ore);
      segna(dataSaldo(P.annoGestione), true);
    } else {
      // senza saldo iniziale la commessa parte da zero alla sua data di inizio: è lì che comincia la storia.
      // Se l'inizio manca, o è successivo al primo movimento, si ripiega sul 1° gennaio dell'esercizio.
      const prima = Object.keys(eventi).sort()[0] || '';
      const inizio = c ? (c.dataInizioEffettiva || c.dataInizioPrevista || '') : '';
      const buono = isoOk(inizio) && (!prima || dayNum(inizio) < dayNum(prima));
      segna(buono ? inizio : P.annoGestione + '-01-01', false);
    }
    Object.keys(eventi).sort().forEach(d => {
      const e = eventi[d];
      cum.fatt += e.fatt; cum.perdite += e.perdite; cum.costi += e.costi; cum.ore += e.ore;
      segna(d, false);
    });
    return { punti, costoOrario: co, nEventi: punti.length - 1 };
  }

  // ---------------------------------------------------------------- scheda commessa (foglio CANTIERI)
  function calcolaCommessa(c, db, idx, opz) {
    const P = db.parametri;
    const agg = aggregati(db, c.id, idx, opz);
    const cum = agg.cumulato;
    const bud = budgetDi(c, P);
    const finito = isFinito(c.stato);
    const definita = isDefinita(c);

    const contratto = contrattoAggiornato(c);                                  // AZ
    const salCum = cum.sal, fattCum = cum.fatturatoLordo;                       // BA BB
    const ritenuteCum = cum.ritenute, svincoliCum = cum.svincoli;               // BC BD
    const perditeCum = cum.perditeSal;                                          // BV
    const valoreRecuperabile = contratto === null ? null : Math.max(contratto - perditeCum, 0); // W
    const salNonFatturato = Math.max(salCum - fattCum, 0);                      // M
    const residuoLavori = valoreRecuperabile === null ? null : Math.max(valoreRecuperabile - salCum, 0); // N
    const ritenuteDaSbloccare = Math.max(ritenuteCum - svincoliCum, 0);         // O
    const residuoDaFatturare = valoreRecuperabile === null ? null : Math.max(valoreRecuperabile - fattCum, 0); // BE
    const fatturatoOltreRecuperabile = valoreRecuperabile === null ? null : Math.max(fattCum - valoreRecuperabile, 0); // BF
    const salPct = (valoreRecuperabile === null || valoreRecuperabile <= 0) ? null : salCum / valoreRecuperabile; // BG

    const dI = dayNum(c.dataInizioEffettiva), dJ = dayNum(c.dataFinePrevista), dY = dayNum(c.aggiornatoAl), dT = dayNum(c.dataFinePrevistaOriginale);
    let tempoPct = null;                                                        // BH
    if (dI !== null && dJ !== null && dJ > dI && dY !== null) tempoPct = finito ? 1 : clamp01((dY - dI) / (dJ - dI));
    const scostTempo = (salPct === null || tempoPct === null) ? null : salPct - tempoPct; // BI

    const hasOreBudget = bud.orePreviste !== null && bud.orePreviste > 0;
    const oreBudget = num(bud.orePreviste);                                     // BJ (0 se assente, come Excel)
    const oreUsate = cum.ore;                                                   // BK
    const oreResidue = Math.max(oreBudget - oreUsate, 0);                       // BL
    const orePct = oreBudget <= 0 ? null : oreUsate / oreBudget;                // BM
    const scostOre = (orePct === null || salPct === null) ? null : orePct - salPct; // BN

    const costiBudget = num(bud.costiDirettiPrevisti);                          // BO
    const hasCostiBudget = bud.costiDirettiPrevisti !== null;
    const costiSostenuti = cum.costiDiretti;                                    // BP
    const costiResiduo = Math.max(costiBudget - costiSostenuti, 0);             // BQ
    const costiSforamento = Math.max(costiSostenuti - costiBudget, 0);          // BR
    const costoEffettivo = oreUsate * num(P.costoOrario) + costiSostenuti;      // BS
    // costo della manodopera, previsto ed effettivo: ore × costo strutturale corrente (Parametri)
    const costoOrario = num(P.costoOrario);
    const costoOrePreviste = oreBudget * costoOrario;
    const costoOreEffettive = oreUsate * costoOrario;

    // stessi calcoli sui valori INIZIALI del budget (storico), per il confronto con i vigenti
    const oreBudgetIni = num(bud.orePrevisteIniziali);
    const oreResidueIni = Math.max(oreBudgetIni - oreUsate, 0);
    const orePctIni = oreBudgetIni <= 0 ? null : oreUsate / oreBudgetIni;
    const scostOreIni = (orePctIni === null || salPct === null) ? null : orePctIni - salPct;
    const costiBudgetIni = num(bud.costiDirettiPrevistiIniziali);
    const costiResiduoIni = Math.max(costiBudgetIni - costiSostenuti, 0);
    const costiSforamentoIni = Math.max(costiSostenuti - costiBudgetIni, 0);
    const costoOrePrevisteIni = oreBudgetIni * costoOrario;

    // Q – giorni di ritardo produttivo (logica Rev.14)
    let giorniRitardo = null;
    if (hasOreBudget && dJ !== null) {
      if (finito) giorniRitardo = 0;
      else if (oreUsate >= oreBudget && c.causaAggiornamentoDataFine === 'Ritardo produttivo FIDA') {
        if (dT !== null) giorniRitardo = Math.max(0, dJ - dT);
        else giorniRitardo = dY === null ? 0 : Math.max(0, dY - dJ);
      } else giorniRitardo = 0;
    }

    // Gestione data fine (Anagrafica: colonne J, T, R)
    const causa = c.causaAggiornamentoDataFine || '';
    const dataFineIncompleta =
      (dT !== null && dJ !== dT && (causa === '' || causa === 'Nessuna variazione')) ||
      (dJ === null && causa !== '' && causa !== 'Nessuna variazione');
    const codiceTemp = String(c.codice || '').toUpperCase().slice(0, 4) === 'TEMP';
    const soglia = num(P.sogliaSalNonFatturato);

    // ---- risultato economico
    // Utile maturato: quello della colonna "Maturato" del conto della commessa.
    const utileMaturato = fattCum - perditeCum - costiSostenuti - costoOreEffettive;
    // Utile a finire: quanto resterà a commessa conclusa. Ore e costi a finire non possono essere meno
    // di quelli già consumati: se il budget è già superato, vale il consumato.
    const oreAFinire = Math.max(oreBudget, oreUsate);
    const costiAFinire = Math.max(costiBudget, costiSostenuti);
    const utileAFinire = (valoreRecuperabile === null || !hasOreBudget || !hasCostiBudget) ? null
      : valoreRecuperabile - costiAFinire - oreAFinire * costoOrario;
    // La commessa ha una storia (movimenti, costi o un saldo iniziale)? Senza, gli indicatori di
    // avanzamento non dicono nulla: una commessa appena inserita in Anagrafica non è in ritardo.
    const hasDati = agg.nMovimenti > 0 || agg.nCosti > 0 || agg.hasSaldo;

    // le tre versioni della verifica di sostenibilità servono già qui: l'iniziale decide l'errore di acquisizione
    const sostenibilita = calcolaSostenibilita(c, db);                            // aggiornata (vigente): esito, allerte, elenchi
    const sostenibilitaIniziale = calcolaSostenibilita(c, db, 'iniziale');        // storico, sui dati iniziali
    const sostenibilitaConsuntivo = calcolaSostenibilita(c, db, 'consuntivo',     // situazione maturata
      { fatturato: fattCum, ore: oreUsate, costi: costiSostenuti });
    const fasiOre = oreFasi(db, c.id, idx);

    // ---- motivi di alert, ciascuno con il suo livello.
    // CRITICO: solo i casi elencati qui sotto, con le soglie di Parametri. ATTENZIONE: tutti gli altri
    // problemi di andamento. INCOMPLETO: dati mancanti.
    const q = s => '«' + s + '»';
    const E = v => (num(v) < 0 ? '−' : '') + '€ ' + fmtEuroSemplice(Math.abs(num(v)));
    const Pz = v => fmtPctSemplice(v);
    const M = [];
    const segna = (livello, motivo, testo, extra) => M.push(Object.assign({ livello, motivo, testo: testo || motivo, campi: [], form: null }, extra || {}));

    // 1-2. risultato economico
    if (finito && hasDati && utileMaturato < 0)
      segna('CRITICO', 'COMMESSA FINITA IN PERDITA', 'Commessa finita in perdita: utile maturato ' + E(utileMaturato));
    if (!finito && utileAFinire !== null && utileAFinire < 0)
      segna('CRITICO', 'COMMESSA IN PERDITA A FINIRE', 'Commessa in perdita a finire: utile previsto a commessa finita ' + E(utileAFinire));
    // 3. errore di acquisizione: il prezzo venduto (contratto iniziale) sta sotto il prezzo minimo sostenibile
    const sI = sostenibilitaIniziale;
    if (sI.prezzoComputo !== null && sI.prezzoMinimo !== null && !sI.mancanti.length && sI.scostamentoPct !== null &&
      sI.scostamentoPct < -num(P.sogliaErroreAcquisizione) - 1e-12)
      segna('CRITICO', 'ERRORE DI ACQUISIZIONE', 'Errore di acquisizione: prezzo venduto ' + E(sI.prezzoComputo) + ' sotto il prezzo minimo sostenibile ' + E(sI.prezzoMinimo) + ' del ' + Pz(-sI.scostamentoPct) + ' (soglia ' + Pz(P.sogliaErroreAcquisizione) + ')');
    // 4. SAL in ritardo rispetto alle ore segnate
    if (scostOre !== null && scostOre > num(P.scartoOreCritico))
      segna('CRITICO', 'SAL DA EMETTERE', 'SAL da emettere: ore consumate ' + Pz(orePct) + ' contro SAL ' + Pz(salPct) + ' (scarto oltre ' + Pz(P.scartoOreCritico) + ')');
    else if (scostOre !== null && scostOre > num(P.scartoOreAttenzione))
      segna('ATTENZIONE', "CONSUMO ORE SUPERIORE ALL'AVANZAMENTO", "Consumo ore superiore all'avanzamento: ore " + Pz(orePct) + ' contro SAL ' + Pz(salPct));
    // 5. integrazioni senza riferimento documentale
    if (num(c.integrazioni) !== 0 && !String(c.integrazioniRiferimento || '').trim())
      segna('CRITICO', 'INTEGRAZIONI SENZA RIFERIMENTO DOCUMENTALE', 'Integrazioni di ' + E(num(c.integrazioni)) + ' senza riferimento documentale (integrazione contrattuale n. … del …)',
        { campi: ['integrazioniRiferimento'], form: 'anagrafica' });
    // 6. ore oltre le previste
    if (orePct !== null && orePct > 1 + num(P.sogliaOreOltrePreviste) + 1e-12)
      segna('CRITICO', 'ORE OLTRE IL PREVISTO', 'Ore segnate ' + fmtNumSemplice(oreUsate) + ' h contro ' + fmtNumSemplice(oreBudget) + ' h previste: +' + Pz(orePct - 1) + ' (soglia ' + Pz(P.sogliaOreOltrePreviste) + ')');
    else if (orePct !== null && orePct > 1) segna('ATTENZIONE', 'ORE OLTRE BUDGET', 'Ore oltre il budget: +' + Pz(orePct - 1));
    else if (orePct !== null && orePct === 1) segna('ATTENZIONE', 'ORE PREVENTIVATE ESAURITE', 'Ore preventivate esaurite');
    // 7. costi diretti oltre i previsti (senza budget costi non si giudica: è un dato mancante)
    if (hasCostiBudget && costiSforamento > 0) {
      if (costiSostenuti > costiBudget * (1 + num(P.sogliaCostiOltrePrevisti)) + 1e-9)
        segna('CRITICO', 'COSTI DIRETTI OLTRE IL PREVISTO', 'Costi diretti ' + E(costiSostenuti) + ' contro ' + E(costiBudget) + ' previsti' + (costiBudget > 0 ? ': +' + Pz(costiSforamento / costiBudget) : '') + ' (soglia ' + Pz(P.sogliaCostiOltrePrevisti) + ')');
      else segna('ATTENZIONE', 'COSTI DIRETTI OLTRE BUDGET', 'Costi diretti oltre il budget di ' + E(costiSforamento));
    }
    // 8. perdite accettate sul prezzo di vendita
    if (perditeCum > 0) {
      if (contratto !== null && perditeCum > contratto * num(P.sogliaPerditeAccettate) + 1e-9)
        segna('CRITICO', 'PERDITE ACCETTATE OLTRE SOGLIA', 'Perdite SAL accettate ' + E(perditeCum) + (contratto > 0 ? ': ' + Pz(perditeCum / contratto) + ' del prezzo di vendita' : '') + ' (soglia ' + Pz(P.sogliaPerditeAccettate) + ')');
      else segna('ATTENZIONE', 'PERDITA SAL ACCETTATA (€ ' + fmtEuroSemplice(perditeCum) + ')', 'Perdita SAL accettata: ' + E(perditeCum));
    }

    // ---- attenzione: tutti gli altri problemi di andamento
    if (fatturatoOltreRecuperabile !== null && fatturatoOltreRecuperabile > 0)
      segna('ATTENZIONE', 'FATTURATO OLTRE VALORE RECUPERABILE', 'Fatturato oltre il valore recuperabile di ' + E(fatturatoOltreRecuperabile));
    if (giorniRitardo !== null && giorniRitardo > 0) segna('ATTENZIONE', 'RITARDO PRODUTTIVO (' + Math.round(giorniRitardo) + ' GG)', 'Ritardo produttivo di ' + Math.round(giorniRitardo) + ' giorni');
    // l'avanzamento contro il tempo si giudica solo su una commessa aperta che ha già una storia:
    // su una finita il residuo lavori dice la stessa cosa, su una appena inserita non c'è nulla da giudicare
    if (!finito && hasDati && scostTempo !== null && scostTempo < -num(P.scartoTempoAttenzione))
      segna('ATTENZIONE', 'AVANZAMENTO PIÙ LENTO DEL TEMPO', 'Avanzamento più lento del tempo: SAL ' + Pz(salPct) + ' contro tempo trascorso ' + Pz(tempoPct));
    if (valoreRecuperabile > 0 && salNonFatturato > valoreRecuperabile * soglia)
      segna('ATTENZIONE', 'SAL MATURATO NON FATTURATO', 'SAL maturato non fatturato: ' + E(salNonFatturato));
    if (ritenuteDaSbloccare > 0 && finito) segna('ATTENZIONE', 'RITENUTE DA SBLOCCARE', 'Ritenute da sbloccare: ' + E(ritenuteDaSbloccare));
    if (salCum > 0 && costiBudget > 0 && costiSostenuti === 0) segna('ATTENZIONE', 'COSTI DIRETTI NON REGISTRATI', 'Costi diretti previsti ma nessuno registrato');
    if (finito && hasDati && valoreRecuperabile > 0 && residuoLavori > valoreRecuperabile * soglia)
      segna('ATTENZIONE', 'CANTIERE FINITO CON RESIDUO LAVORI', 'Cantiere finito con residuo lavori: SAL maturato ' + E(salCum) + ' su ' + E(valoreRecuperabile) + ' di valore recuperabile, mancano ' + E(residuoLavori));
    if (finito && !has(c.dataFineEffettiva))
      segna('ATTENZIONE', 'DATA FINE EFFETTIVA MANCANTE', 'Commessa finita ma campo ' + q('Data di fine effettiva') + ' non compilato', { campi: ['dataFineEffettiva'], form: 'anagrafica' });
    fasiOre.oltre.forEach(f => segna('ATTENZIONE', 'ORE OLTRE IL PREVISTO NELLA FASE ' + String(f.fase).toUpperCase(),
      'Fase ' + q(f.fase) + ': ' + fmtNumSemplice(f.effettive) + ' h segnate contro ' + fmtNumSemplice(f.previste) + ' h previste'));

    // ---- incompleto: dati mancanti, con il campo interessato e la maschera in cui correggerlo
    if (dataFineIncompleta) {
      if (dJ === null) segna('INCOMPLETO', 'GESTIONE DATA FINE INCOMPLETA', 'Campo ' + q('Data di fine prevista') + ' vuoto ma ' + q('Causa aggiornamento data fine') + ' indicata', { campi: ['dataFinePrevista'], form: 'anagrafica' });
      else segna('INCOMPLETO', 'GESTIONE DATA FINE INCOMPLETA', 'Campo ' + q('Data di fine prevista') + " modificato rispetto all'originaria ma " + q('Causa aggiornamento data fine') + ' non indicata', { campi: ['causaAggiornamentoDataFine'], form: 'anagrafica' });
    }
    if (dY === null) segna('INCOMPLETO', 'AGGIORNATO AL MANCANTE', 'Campo ' + q('Aggiornato al') + ' non compilato: senza questa data non si calcolano avanzamento temporale e ritardo', { campi: ['aggiornatoAl'], form: 'note' });
    {
      // una commessa ancora da iniziare non ha, per forza, una data di inizio effettivo
      const manca = [];
      if (contratto === null) manca.push(['contrattoIniziale', 'Contratto iniziale']);
      if (dI === null && c.stato !== 'Da iniziare') manca.push(['dataInizioEffettiva', 'Data di inizio effettivo']);
      if (dJ === null) manca.push(['dataFinePrevista', 'Data di fine prevista']);
      if (manca.length) segna('INCOMPLETO', 'DATI PREVISIONALI INCOMPLETI',
        'Dati previsionali incompleti: ' + (manca.length === 1 ? 'campo ' : 'campi ') + manca.map(x => q(x[1])).join(', ') + ' non compilat' + (manca.length === 1 ? 'o' : 'i'),
        { campi: manca.map(x => x[0]), form: 'anagrafica' });
    }
    if (codiceTemp) segna('INCOMPLETO', 'CODICE COMMESSA TEMPORANEO', 'Campo ' + q('Codice commessa') + ' temporaneo (inizia con TEMP): da sostituire con il codice definitivo', { campi: ['codice'], form: 'anagrafica' });
    if (!hasOreBudget) segna('INCOMPLETO', 'BUDGET ORE NON DEFINITO', 'Budget ore non definito: ore previste da indicare nel Budget', { form: 'budget', campi: ['orePreviste'] });
    if (!hasCostiBudget) segna('INCOMPLETO', 'BUDGET COSTI DIRETTI NON DEFINITO', 'Budget costi diretti non definito: costi diretti previsti da indicare nel Budget (0 se non ce ne sono)', { form: 'budget', campi: ['costiDirettiPrevisti'] });

    // i motivi si leggono dal più grave; a parità di livello resta l'ordine in cui sono stati rilevati
    const peso = l => LIVELLI_ALERT.indexOf(l);
    const motiviDettaglio = M.map((m, i) => ({ m, i })).sort((x, y) => peso(x.m.livello) - peso(y.m.livello) || x.i - y.i).map(x => x.m);
    const motivi = motiviDettaglio.map(m => m.motivo);
    const conta = l => motiviDettaglio.filter(m => m.livello === l).length;
    // Una commessa DEFINITA è chiusa e archiviata: non produce più allerte né note operative.
    // Senza saldo iniziale i suoi cumulativi sono a zero e ogni indicatore risulterebbe falsato.
    const alert = (definita || !motiviDettaglio.length) ? 'REGOLARE' : motiviDettaglio[0].livello;

    // ---- note informative (non incidono sulla severità, non presenti in Rev.14)
    const note = [];
    if (sostenibilita.compilata && sostenibilita.esito === 'NON CONGRUA') note.push('Verifica di sostenibilità economica NON CONGRUA');
    if (sostenibilita.compilata && sostenibilita.esito === 'NON CONGRUO') note.push('Verifica di sostenibilità economica non congrua: ricarico sotto la soglia della Direzione');
    if (dJ !== null && dI !== null && dJ <= dI) note.push('Data fine prevista non successiva alla data inizio');
    if (definita) { motivi.length = 0; motiviDettaglio.length = 0; note.length = 0; }

    return {
      id: c.id, codice: c.codice, cliente: c.cliente, cantiere: c.cantiere, etichetta: etichetta(c),
      ramo: c.ramo || '', tecnico: c.tecnico || '', preposto: c.preposto || '', stato: c.stato || '',
      finito, pregressa: isPregressa(c, P.annoGestione), aggiornatoAl: c.aggiornatoAl || '', noteAzione: c.noteAzione || '',
      dataInizioPrevista: c.dataInizioPrevista || '', dataInizioEffettiva: c.dataInizioEffettiva || '',
      dataFinePrevista: c.dataFinePrevista || '', dataFineEffettiva: c.dataFineEffettiva || '',
      contrattoIniziale: has(c.contrattoIniziale) ? num(c.contrattoIniziale) : null,
      integrazioni: has(c.integrazioni) ? num(c.integrazioni) : null,
      contrattoAggiornato: contratto,
      salCum, fattCum, ritenuteCum, svincoliCum, perditeCum,
      fattNettoCum: fattCum - ritenuteCum + svincoliCum,
      valoreRecuperabile, salNonFatturato, residuoLavori, ritenuteDaSbloccare, residuoDaFatturare, fatturatoOltreRecuperabile,
      salPct, tempoPct, scostTempo,
      oreBudget, hasOreBudget, oreUsate, oreResidue, orePct, scostOre,
      costiBudget, hasCostiBudget, costiSostenuti, costiResiduo, costiSforamento, costoEffettivo,
      costoOrePreviste, costoOreEffettive, costoOrario,
      // valori basati sul budget iniziale (storico)
      oreBudgetIni, oreResidueIni, orePctIni, scostOreIni,
      costiBudgetIni, costiResiduoIni, costiSforamentoIni, costoOrePrevisteIni,
      budgetAggiornatoAl: bud.dataAggiornamento, budgetHaAggiornamento: bud.haAggiornamento,
      giorniRitardo, dataFineIncompleta,
      budget: bud, sostenibilita, sostenibilitaIniziale, sostenibilitaConsuntivo, saldo: agg.saldo, periodo: agg.periodo, hasSaldo: agg.hasSaldo,
      senzaSaldi: agg.senzaSaldi, saldoEscluso: agg.saldoEscluso, nMovimenti: agg.nMovimenti, nCosti: agg.nCosti,
      definita, chiusuraDefinitiva: c.chiusuraDefinitiva || null,
      utileMaturato, utileAFinire, oreAFinire, costiAFinire, hasDati, fasiOre,
      integrazioniRiferimento: c.integrazioniRiferimento || '',
      alert, motivi, motiviDettaglio, note,
      nCritici: definita ? 0 : conta('CRITICO'), nAttenzione: definita ? 0 : conta('ATTENZIONE'), nIncompleti: definita ? 0 : conta('INCOMPLETO')
    };
  }

  // Di norma si calcolano solo le commesse OPERATIVE. Le definite si ottengono con { soloDefinite: true }
  // (vista di archivio) oppure insieme alle altre con { includiDefinite: true }.
  function calcolaTutte(db, opz) {
    const idx = indicizza(db);
    const o = opz || {};
    let cs = attivi(db.commesse);
    if (o.soloDefinite) cs = cs.filter(isDefinita);
    else if (!o.includiDefinite) cs = cs.filter(c => !isDefinita(c));
    return cs.map(c => calcolaCommessa(c, db, idx, o));
  }

  // ---------------------------------------------------------------- dashboard direzionale
  function riepilogo(rows) {
    const sum = f => rows.reduce((t, r) => t + num(r[f]), 0);
    const count = f => rows.filter(f).length;
    // valore comune a tutte le righe (es. il costo orario): se le commesse non concordano resta null
    const unico = f => { const v = rows.map(r => r[f]).filter(x => x !== null && x !== undefined); return v.length && v.every(x => x === v[0]) ? v[0] : null; };
    return {
      n: rows.length,
      daIniziare: count(r => r.stato === 'Da iniziare'),
      inCorso: count(r => r.stato === 'In corso'),
      quasiFinite: count(r => r.stato === 'Quasi finito'),
      finite: count(r => r.finito),
      critiche: count(r => r.alert === 'CRITICO'),
      attenzione: count(r => r.alert === 'ATTENZIONE'),
      incomplete: count(r => r.alert === 'INCOMPLETO'),
      regolari: count(r => r.alert === 'REGOLARE'),
      // "con alert" = con un problema di andamento: i soli dati mancanti non contano
      conAlert: count(r => r.alert === 'CRITICO' || r.alert === 'ATTENZIONE'),
      contrattoAggiornato: sum('contrattoAggiornato'),
      salCum: sum('salCum'), fattCum: sum('fattCum'), salNonFatturato: sum('salNonFatturato'),
      residuoLavori: sum('residuoLavori'), residuoDaFatturare: sum('residuoDaFatturare'),
      fatturatoOltreRecuperabile: sum('fatturatoOltreRecuperabile'),
      ritenuteCum: sum('ritenuteCum'), svincoliCum: sum('svincoliCum'), ritenuteDaSbloccare: sum('ritenuteDaSbloccare'),
      oreBudget: sum('oreBudget'), oreUsate: sum('oreUsate'), oreResidue: sum('oreResidue'),
      oreBudgetIni: sum('oreBudgetIni'), oreResidueIni: sum('oreResidueIni'),
      costiBudget: sum('costiBudget'), costiSostenuti: sum('costiSostenuti'), costoEffettivo: sum('costoEffettivo'),
      costiBudgetIni: sum('costiBudgetIni'),
      perditeCum: sum('perditeCum'), valoreRecuperabile: sum('valoreRecuperabile'),
      // margine operativo previsto = contratto iniziale − costi diretti previsti (budget); % sul contratto iniziale
      // sdoppiato fra budget iniziale (storico) e budget aggiornato (vigente)
      contrattoIniziale: sum('contrattoIniziale'), integrazioni: sum('integrazioni'),
      margineOperativoPrevisto: sum('contrattoIniziale') - sum('costiBudget'),
      margineOperativoPrevistoPct: sum('contrattoIniziale') > 0 ? 1 - sum('costiBudget') / sum('contrattoIniziale') : null,
      margineOperativoPrevistoIni: sum('contrattoIniziale') - sum('costiBudgetIni'),
      margineOperativoPrevistoIniPct: sum('contrattoIniziale') > 0 ? 1 - sum('costiBudgetIni') / sum('contrattoIniziale') : null,
      // margine operativo effettivo a consuntivo = fatturato lordo cumulato − costi diretti effettivi cumulati
      margineOperativoEffettivo: sum('fattCum') - sum('costiSostenuti'),
      margineOperativoEffettivoPct: sum('fattCum') > 0 ? 1 - sum('costiSostenuti') / sum('fattCum') : null,
      // margine finale = margine operativo al netto del costo della manodopera (ore × costo orario)
      costoOrePreviste: sum('costoOrePreviste'), costoOreEffettive: sum('costoOreEffettive'),
      costoOrePrevisteIni: sum('costoOrePrevisteIni'),
      costoOrario: unico('costoOrario'),
      margineFinalePrevisto: sum('contrattoIniziale') - sum('costiBudget') - sum('costoOrePreviste'),
      margineFinalePrevistoIni: sum('contrattoIniziale') - sum('costiBudgetIni') - sum('costoOrePrevisteIni'),
      margineFinaleEffettivo: sum('fattCum') - sum('costiSostenuti') - sum('costoOreEffettive'),
      // data più recente fra gli aggiornamenti di budget delle commesse selezionate
      budgetAggiornatoAlMax: rows.reduce((m, r) => (r.budgetAggiornatoAl && r.budgetAggiornatoAl > m) ? r.budgetAggiornatoAl : m, ''),
      nBudgetAggiornati: count(r => r.budgetHaAggiornamento),
      aggiornatoAlMax: rows.reduce((m, r) => (r.aggiornatoAl && r.aggiornatoAl > m) ? r.aggiornatoAl : m, '')
    };
  }

  // ---------------------------------------------------------------- dashboard direzionale: obiettivi e stato
  // Da un lato gli obiettivi (redditività richiesta e rientro bancario desiderato, dai Parametri), dall'altro
  // a che punto si è. Le formule sono quelle del conto della commessa, sommate sul portafoglio:
  //   utile maturato            = fatturato − perdite SAL − costi diretti − ore consumate × costo orario
  //   redditività effettiva (%) = utile maturato ÷ prezzo sostenibile della parte strutturale delle ore consumate
  //   rientro bancario effettivo = utile maturato − redditività richiesta sulle ore consumate
  // Il rientro bancario si può leggere in due modi, secondo le righe che si passano:
  //   - sul solo esercizio: righe calcolate senza i saldi iniziali (calcolaTutte con senzaSaldi). Il desiderato
  //     è l'obiettivo dell'anno dei Parametri oppure, se non impostato, le ore ancora da fare a inizio anno;
  //   - sull'intera vita delle commesse (opz.vita): righe con i saldi iniziali. L'obiettivo dell'anno non
  //     c'entra: il desiderato viene sempre dalle ore previste dell'intero budget.
  function direzionale(rows, P, opz) {
    const S = parametriSostenibilita(P);
    const somma = (l, f) => l.reduce((t, r) => t + num(f(r)), 0);
    const finite = rows.filter(r => r.finito);
    const inCorso = rows.filter(r => !r.finito);
    // "eseguite": commesse su cui si è già lavorato, le sole su cui un risultato effettivo ha senso
    const eseguite = rows.filter(r => r.oreUsate > 0);
    const baseDi = r => num(r.sostenibilitaConsuntivo.strutturale.conRedditivita);
    const reddRichiestaDi = r => num(r.sostenibilitaConsuntivo.strutturale.redditivita);
    const rientroDi = r => r.utileMaturato - reddRichiestaDi(r);

    // ---- redditività
    const conBudget = rows.filter(r => r.hasOreBudget);
    const reddObiettivo = somma(conBudget, r => r.sostenibilita.strutturale.redditivita);   // sull'intero portafoglio, a budget
    const reddRichiestaEseguito = somma(eseguite, reddRichiestaDi);                         // sul lavoro già fatto
    const utileEseguito = somma(eseguite, r => r.utileMaturato);
    const baseEseguito = somma(eseguite, baseDi);

    // ---- rientro bancario
    // ore su cui si chiede il rientro: l'intero budget, meno quelle già fatte negli anni precedenti quando
    // il saldo iniziale è escluso (cioè quando si guarda il solo esercizio)
    const oreDaRientrare = r => Math.max(0, r.oreBudget - (r.saldoEscluso ? num(r.saldoEscluso.ore) : 0));
    const rientroDaOre = somma(conBudget, oreDaRientrare) * S.rientroOrario;
    const obiettivoImpostato = !(opz && opz.vita) && has(P.obiettivoRientroAnnuo) && num(P.obiettivoRientroAnnuo) > 0;
    const finiteEseguite = finite.filter(r => r.oreUsate > 0);

    // ---- fatturazione dell'esercizio: quanto si è fatturato nell'anno contro quanto si poteva fatturare
    // nell'anno. Di ogni commessa conta solo il contributo dell'esercizio: ciò che era già stato fatturato
    // negli anni precedenti (saldo iniziale) non è né fatturato né fatturabile quest'anno.
    //   fatturabile = valore recuperabile (contratto aggiornato − perdite SAL accettate) − fatturato del saldo
    const conContratto = rows.filter(r => r.valoreRecuperabile !== null);
    const fatturabileDi = r => Math.max(0, r.valoreRecuperabile - num(r.saldo.fatturatoLordo));
    const fatturazione = {
      fatturato: somma(rows, r => r.periodo.fatturatoLordo),
      fatturabile: somma(conContratto, fatturabileDi),
      daFatturare: somma(conContratto, r => Math.max(0, fatturabileDi(r) - num(r.periodo.fatturatoLordo))),
      // di quel che resta, la parte già maturata come SAL: si può fatturare subito
      salDaFatturare: somma(rows, r => r.salNonFatturato),
      nSenzaContratto: rows.length - conContratto.length
    };
    fatturazione.quota = fatturazione.fatturabile > 0 ? fatturazione.fatturato / fatturazione.fatturabile : null;

    // ---- stato del portafoglio dagli alert: basta una commessa critica per il rosso
    const n = l => rows.filter(r => r.alert === l).length;
    const critiche = n('CRITICO'), attenzione = n('ATTENZIONE'), incomplete = n('INCOMPLETO'), regolari = n('REGOLARE');
    const utile = (l, f) => {
      const v = l.map(f).filter(x => x !== null && x !== undefined);
      return { n: l.length, nCalcolabili: v.length, totale: v.reduce((t, x) => t + x, 0), inUtile: v.filter(x => x >= 0).length, inPerdita: v.filter(x => x < 0).length };
    };
    return {
      n: rows.length,
      stato: critiche ? 'CRITICO' : (attenzione ? 'ATTENZIONE' : 'REGOLARE'),
      critiche, attenzione, incomplete, regolari,
      fatturazione,
      redditivita: {
        richiestaPct: S.redditivita, richiesta: reddObiettivo, richiestaEseguito: reddRichiestaEseguito,
        effettiva: utileEseguito, effettivaPct: baseEseguito > 0 ? utileEseguito / baseEseguito : null,
        nEseguite: eseguite.length
      },
      rientro: {
        desiderato: obiettivoImpostato ? num(P.obiettivoRientroAnnuo) : rientroDaOre, desideratoImpostato: obiettivoImpostato,
        orario: S.rientroOrario,
        effettivo: somma(eseguite, rientroDi),
        effettivoFinite: somma(finiteEseguite, rientroDi),
        dovutoFinite: somma(finiteEseguite, r => r.oreUsate) * S.rientroOrario,
        // rientro che il lavoro già eseguito avrebbe dovuto dare: è il metro con cui giudicare l'effettivo
        // (il desiderato riguarda l'intero portafoglio, anche il lavoro ancora da fare)
        dovutoEseguito: somma(eseguite, r => r.oreUsate) * S.rientroOrario,
        nFinite: finiteEseguite.length
      },
      // finite: il risultato è quello effettivo; in corso: quello previsto a finire (null se manca il budget)
      finite: utile(finite, r => r.utileMaturato),
      inCorso: utile(inCorso, r => r.utileAFinire)
    };
  }

  // ---------------------------------------------------------------- dashboard MOVIMENTI (periodo = solo data movimento)
  function dashboardMovimenti(db, opt) {
    const anno = (opt && opt.anno) || db.parametri.annoGestione;
    const m1 = (opt && opt.meseDa) || 1, m2 = (opt && opt.meseA) || 12;
    const cid = (opt && opt.commessaId) || null;
    const z = { sal: 0, fatturatoLordo: 0, ritenute: 0, svincoli: 0, fatturatoNetto: 0, ore: 0, perditeSal: 0, costiDiretti: 0, nMovimenti: 0, nCosti: 0 };
    if (m1 > m2) return z;
    const inPeriodo = d => annoDi(d) === anno && meseDi(d) >= m1 && meseDi(d) <= m2;
    attivi(db.movimenti).forEach(m => {
      if (!inPeriodo(m.data) || (cid && m.commessaId !== cid)) return;
      z.sal += num(m.sal); z.fatturatoLordo += num(m.fatturatoLordo); z.ritenute += num(m.ritenuta);
      z.svincoli += num(m.svincolo); z.fatturatoNetto += fatturatoNetto(m); z.ore += num(m.ore); z.perditeSal += num(m.perditaSal); z.nMovimenti++;
    });
    attivi(db.costi).forEach(k => {
      if (!inPeriodo(k.data) || (cid && k.commessaId !== cid)) return;
      z.costiDiretti += num(k.importo); z.nCosti++;
    });
    return z;
  }
  function fatturatoNetto(m) { return num(m.fatturatoLordo) - num(m.ritenuta) + num(m.svincolo); }

  // Fatturato lordo dell'esercizio mese per mese, per le commesse indicate (di norma quelle operative).
  // La somma dei dodici mesi è il fatturato dell'anno della dashboard direzionale.
  function fatturatoMensile(db, commesseId) {
    const anno = db.parametri.annoGestione;
    const ammesse = {};
    (commesseId || []).forEach(id => { ammesse[id] = true; });
    const mesi = MESI.map((nome, i) => ({ mese: i + 1, nome, fatturato: 0 }));
    attivi(db.movimenti).forEach(m => {
      if (annoDi(m.data) !== anno || !ammesse[m.commessaId]) return;
      mesi[meseDi(m.data) - 1].fatturato += num(m.fatturatoLordo);
    });
    return mesi;
  }

  // Tabella costo mensile (foglio CANTIERI, AA:AC): ore mese × costo orario + costi diretti mese
  function costoMensile(db, commessaId) {
    const anno = db.parametri.annoGestione, co = num(db.parametri.costoOrario);
    const righe = MESI.map((nome, i) => ({ mese: i + 1, nome, ore: 0, costiDiretti: 0, costoMese: 0, cumulato: 0 }));
    attivi(db.movimenti).forEach(m => {
      if (annoDi(m.data) !== anno || (commessaId && m.commessaId !== commessaId)) return;
      righe[meseDi(m.data) - 1].ore += num(m.ore);
    });
    attivi(db.costi).forEach(k => {
      if (annoDi(k.data) !== anno || (commessaId && k.commessaId !== commessaId)) return;
      righe[meseDi(k.data) - 1].costiDiretti += num(k.importo);
    });
    let cum = 0;
    righe.forEach(r => { r.costoMese = r.ore * co + r.costiDiretti; cum += r.costoMese; r.cumulato = cum; });
    return righe;
  }

  // Dashboard BUDGET: commesse aperte con data fine prevista nel periodo
  function dashboardBudget(db, da, a) {
    const d1 = dayNum(da), d2 = dayNum(a);
    if (d1 === null || d2 === null || d1 > d2) return null;
    const sel = operative(db.commesse).filter(c => {
      const dj = dayNum(c.dataFinePrevista);
      return dj !== null && dj >= d1 && dj <= d2 && !has(c.dataFineEffettiva) && !isFinito(c.stato) && has(c.codice);
    });
    return {
      n: sel.length,
      orePreviste: sel.reduce((t, c) => t + num(budgetDi(c, db.parametri).orePreviste), 0),
      costoTotalePrevisto: sel.reduce((t, c) => t + num(budgetDi(c, db.parametri).costoTotalePrevisto), 0),
      orePrevisteIniziali: sel.reduce((t, c) => t + num(budgetDi(c, db.parametri).orePrevisteIniziali), 0),
      costoTotalePrevistoIniziale: sel.reduce((t, c) => t + num(budgetDi(c, db.parametri).costoTotalePrevistoIniziale), 0),
      commesse: sel.map(c => c.id)
    };
  }

  // ---------------------------------------------------------------- verifica di sostenibilità economica
  // Modello "VERIFICA DI SOSTENIBILITÀ ECONOMICA DELLA COMMESSA".
  // Il PREZZO DEL COMPUTO viene confrontato con il PREZZO MINIMO SOSTENIBILE, formato da due parti:
  //   1) parte strutturale: ore previste × costo strutturale orario (Parametri), maggiorate del rischio
  //      strutturale, portate a redditività e aumentate della quota di rientro bancario;
  //   2) prezzo di vendita dei costi specifici: ogni voce è caricata del proprio ricarico e portata a redditività.
  //
  // La stessa verifica serve a due oggetti diversi:
  //   - COMMESSA: prezzo, ore e costi specifici arrivano da Anagrafica e Budget, non si digitano (una sola
  //     fonte per ogni dato). L'unico valore inserito a mano è il ricarico sui costi diretti previsti.
  //   - PREVENTIVO: non esiste ancora nulla in archivio, quindi tutto è inserito a mano, voce per voce.
  function parametriSostenibilita(P) {
    P = P || {};
    const costoOrario = num(P.costoOrario);
    const rischio = num(P.rischioStrutturale);
    const redditivita = num(P.redditivita);
    const rientroOrario = num(P.rientroOrario);
    const sogliaRicarico = num(P.sogliaRicaricoDirezione);
    // portare un costo a redditività significa dividerlo per (1 − redditività)
    const fattore = redditivita < 1 ? 1 / (1 - redditivita) : null;
    return {
      costoOrario, rischio, redditivita, rientroOrario, sogliaRicarico, fattoreRedditivita: fattore,
      // ricarico che, applicato al costo, lascia davvero il margine minimo voluto dalla Direzione
      ricaricoEffettivoMinimo: fattore === null ? null : (1 + sogliaRicarico) * fattore - 1
    };
  }

  // Pesi del costo strutturale orario: quelli impostati in Parametri, altrimenti quelli del modello.
  function pesiStrutturali(db) {
    const l = db && db.liste && db.liste.pesiStrutturali;
    return (Array.isArray(l) && l.length) ? l : PESI_STRUTTURALI_DEFAULT;
  }

  // Ripartizione per voce della parte strutturale attribuita (foglio "Dettaglio strutturale").
  function dettaglioStrutturale(db, ore) {
    const S = parametriSostenibilita(db.parametri);
    const o = num(ore);
    const righe = pesiStrutturali(db).map(x => {
      const peso = num(x.peso);
      const quotaOraria = S.costoOrario * peso;
      return { gruppo: x.gruppo || '', voce: x.voce || '', peso, quotaOraria, ore: o, quota: quotaOraria * o };
    });
    const tot = {
      peso: righe.reduce((t, r) => t + r.peso, 0),
      quotaOraria: righe.reduce((t, r) => t + r.quotaOraria, 0),
      ore: o,
      quota: righe.reduce((t, r) => t + r.quota, 0)
    };
    return { righe, tot, pesiCoerenti: Math.abs(tot.peso - 1) < 1e-6 };
  }

  // Formazione del prezzo sostenibile della sola parte strutturale.
  function prezzoStrutturale(P, ore) {
    const S = parametriSostenibilita(P);
    const o = num(ore);
    const costo = o * S.costoOrario;                                  // costo strutturale attribuito
    const rischio = costo * S.rischio;                                // rischio / imprevisti
    const prudenziale = costo + rischio;                              // costo strutturale prudenziale
    const conRedditivita = S.fattoreRedditivita === null ? null : prudenziale * S.fattoreRedditivita;
    const redditivita = conRedditivita === null ? null : conRedditivita - prudenziale; // quota di redditività pura
    const rientro = o * S.rientroOrario;                              // quota di rientro bancario
    return { ore: o, costo, rischio, prudenziale, redditivita, conRedditivita, rientro, prezzo: conRedditivita === null ? null : conRedditivita + rientro };
  }

  // Voci di costo specifico: l'importo può essere indicato direttamente (voce automatica dal Budget)
  // oppure ricavato da quantità × costo unitario (voci di un preventivo).
  function vociSostenibilita(voci, S) {
    return (Array.isArray(voci) ? voci : []).map((v, i) => {
      const quantita = has(v.quantita) ? num(v.quantita) : null;
      const costoUnitario = has(v.costoUnitario) ? num(v.costoUnitario) : null;
      const importo = has(v.importo) ? num(v.importo) : null;
      const ricarico = has(v.ricarico) ? num(v.ricarico) : S.sogliaRicarico;
      const costoTotale = importo !== null ? importo
        : ((quantita === null || costoUnitario === null) ? null : quantita * costoUnitario);
      const maggiorazione = costoTotale === null ? null : costoTotale * ricarico;
      const prezzoVendita = (costoTotale === null || S.fattoreRedditivita === null) ? null : (costoTotale + maggiorazione) * S.fattoreRedditivita;
      return {
        n: i + 1, id: v.id || '', voce: v.voce || '', macroCategoria: v.macroCategoria || '', um: v.um || '',
        quantita, costoUnitario, ricarico, costoTotale, maggiorazione, prezzoVendita,
        automatica: !!v.automatica,
        sottoSoglia: costoTotale !== null && costoTotale > 0 && ricarico < S.sogliaRicarico - 1e-12
      };
    });
  }

  // Nucleo del calcolo, comune a commesse e preventivi.
  // d: { origine, prezzo, ore, voci, datiVerificati, data, note, mancanti, etichettaPrezzo, etichettaOre }
  function verificaSostenibilita(db, d) {
    const S = parametriSostenibilita(db.parametri);
    const voci = vociSostenibilita(d.voci, S);
    const totVoci = {
      n: voci.length,
      costoTotale: voci.reduce((t, v) => t + num(v.costoTotale), 0),
      maggiorazione: voci.reduce((t, v) => t + num(v.maggiorazione), 0),
      prezzoVendita: voci.reduce((t, v) => t + num(v.prezzoVendita), 0)
    };
    totVoci.ricaricoMedio = totVoci.costoTotale > 0 ? totVoci.maggiorazione / totVoci.costoTotale : null;

    const prezzoComputo = has(d.prezzo) ? num(d.prezzo) : null;
    const ore = has(d.ore) ? num(d.ore) : null;
    const strutturale = prezzoStrutturale(db.parametri, ore);
    const prezzoMinimoStrutturale = ore === null ? null : strutturale.prezzo;
    const prezzoMinimoSpecifici = totVoci.prezzoVendita;
    const prezzoMinimo = prezzoMinimoStrutturale === null ? null : prezzoMinimoStrutturale + prezzoMinimoSpecifici;
    const scostamento = (prezzoComputo === null || prezzoMinimo === null) ? null : prezzoComputo - prezzoMinimo;
    const scostamentoPct = (scostamento === null || !(prezzoMinimo > 0)) ? null : scostamento / prezzoMinimo;
    // quota del prezzo proposto che resta oltre il minimo sostenibile
    const marginePct = (scostamento === null || !(prezzoComputo > 0)) ? null : scostamento / prezzoComputo;
    // costo strutturale + costi specifici al costo (senza ricarico) e quanto il prezzo minimo lo supera
    const costoStrutturaleConDiretti = ore === null ? null : strutturale.costo + totVoci.costoTotale;
    // quello che resta in tasca: prezzo di vendita meno i costi della commessa (ore attribuite + costi diretti)
    const restaInTasca = (prezzoComputo === null || costoStrutturaleConDiretti === null) ? null : prezzoComputo - costoStrutturaleConDiretti;

    const sottoSoglia = voci.filter(v => v.sottoSoglia);
    const datiVerificati = !!d.datiVerificati;

    // dati indispensabili che mancano: l'ordine è quello in cui si incontrano compilando
    const mancanti = (d.mancanti || []).slice();
    if (prezzoComputo === null) mancanti.push(d.etichettaPrezzo || 'Prezzo del computo non indicato');
    if (ore === null) mancanti.push(d.etichettaOre || 'Ore previste non indicate: la parte strutturale non è calcolabile');

    // ---- esito, con la stessa gerarchia del modello
    const motivi = [];
    let esito;
    if (!datiVerificati) {
      esito = 'DA COMPLETARE';
      motivi.push('I dati del computo non sono ancora stati dichiarati verificati e completi');
    } else if (sottoSoglia.length) {
      esito = 'NON CONGRUO';
      motivi.push('Ricarico sotto la soglia della Direzione (' + fmtPctSemplice(S.sogliaRicarico) + ')' +
        (voci.length > 1 ? ' nelle voci ' + sottoSoglia.map(v => v.n).join(', ') : ''));
    } else if (mancanti.length) {
      esito = 'DA COMPLETARE';
      mancanti.forEach(m => motivi.push(m));
    } else if (scostamento >= 0) {
      esito = 'CONGRUA';
      motivi.push('Il prezzo del computo copre il prezzo minimo sostenibile (margine € ' + fmtEuroSemplice(scostamento) + ')');
    } else {
      esito = 'NON CONGRUA';
      motivi.push('Il prezzo del computo è sotto il prezzo minimo sostenibile di € ' + fmtEuroSemplice(-scostamento));
    }

    // avvertenze che non cambiano l'esito
    const avvisi = [];
    if (!totVoci.costoTotale) avvisi.push('Nessun costo specifico: la verifica considera la sola parte strutturale');

    return {
      origine: d.origine || '', datiVerificati, data: d.data || '', note: d.note || '',
      parametri: S,
      prezzoComputo, ore, voci, totVoci,
      strutturale, prezzoMinimoStrutturale, prezzoMinimoSpecifici,
      prezzoMinimo, scostamento, scostamentoPct, marginePct,
      costoStrutturaleConDiretti, restaInTasca,
      esito, motivi, avvisi, mancanti, nSottoSoglia: sottoSoglia.length
    };
  }

  // ---- COMMESSA: prezzo dall'Anagrafica, ore e costi specifici dal Budget, ricarico inserito a mano.
  // Tre versioni:
  //  'iniziale'   = contratto iniziale e ore / costi diretti iniziali del Budget (storico);
  //  'consuntivo' = fatturato lordo cumulato, ore consumate e costi diretti sostenuti (situazione maturata),
  //                 passati in `consuntivo` = { fatturato, ore, costi } perché sono cumulativi della commessa;
  //  senza versione (o 'aggiornata') = contratto aggiornato e valori vigenti del Budget.
  function calcolaSostenibilita(c, db, versione, consuntivo) {
    const S = parametriSostenibilita(db.parametri);
    const s = (c && c.sostenibilita) || {};
    const bud = budgetDi(c || {}, db.parametri);
    const ricarico = has(s.ricarico) ? num(s.ricarico) : S.sogliaRicarico;
    const k = consuntivo || {};
    const cfg = versione === 'iniziale' ? {
      prezzo: c && has(c.contrattoIniziale) ? num(c.contrattoIniziale) : null, ore: bud.orePrevisteIniziali, costi: bud.costiDirettiPrevistiIniziali,
      voce: 'Costi diretti previsti a budget',
      mancaPrezzo: 'Contratto iniziale non indicato in Anagrafica: manca il prezzo del computo',
      mancaOre: 'Ore previste iniziali non indicate nel Budget: la parte strutturale non è calcolabile',
      mancaCosti: 'Costi diretti previsti iniziali non indicati nel Budget: i costi specifici non sono determinati'
    } : versione === 'consuntivo' ? {
      // senza fatturato o senza ore la verifica a consuntivo non ha ancora senso: resta DA COMPLETARE
      prezzo: num(k.fatturato) > 0 ? num(k.fatturato) : null, ore: num(k.ore) > 0 ? num(k.ore) : null, costi: num(k.costi),
      voce: 'Costi diretti sostenuti cumulati',
      mancaPrezzo: 'Nessun fatturato lordo cumulato: la verifica a consuntivo non è ancora calcolabile',
      mancaOre: 'Nessuna ora consumata: la parte strutturale a consuntivo non è calcolabile',
      mancaCosti: ''
    } : {
      prezzo: contrattoAggiornato(c || {}), ore: bud.orePreviste, costi: bud.costiDirettiPrevisti,
      voce: 'Costi diretti previsti a budget',
      mancaPrezzo: 'Contratto non indicato in Anagrafica: manca il prezzo del computo',
      mancaOre: 'Ore previste non indicate nel Budget: la parte strutturale non è calcolabile',
      mancaCosti: 'Costi diretti previsti non indicati nel Budget: i costi specifici non sono determinati'
    };
    const costi = cfg.costi;
    const mancanti = [];
    if (costi === null && cfg.mancaCosti) mancanti.push(cfg.mancaCosti);
    const r = verificaSostenibilita(db, {
      origine: 'commessa',
      prezzo: cfg.prezzo,
      ore: cfg.ore,
      voci: costi === null ? [] : [{ voce: cfg.voce, importo: costi, ricarico, automatica: true }],
      datiVerificati: s.datiVerificati, data: s.data, note: s.note,
      mancanti,
      etichettaPrezzo: cfg.mancaPrezzo,
      etichettaOre: cfg.mancaOre
    });
    const aggiornata = versione !== 'iniziale' && versione !== 'consuntivo';
    r.versione = aggiornata ? 'aggiornata' : versione;
    r.automatica = true;
    r.ricarico = ricarico;
    r.ricaricoImpostato = has(s.ricarico);
    r.costiDirettiPrevisti = costi;
    r.oreDaBudgetAggiornato = aggiornata && bud.orePrevisteAgg !== null;
    r.costiDaBudgetAggiornato = aggiornata && bud.costiDirettiPrevistiAgg !== null;
    // "compilata" = la Direzione o il tecnico ci hanno messo mano: prima di allora è solo un calcolo automatico
    r.compilata = !!s.datiVerificati || !!s.data || !!String(s.note || '').trim() || has(s.ricarico);
    return r;
  }

  // ---- PREVENTIVO (ipotesi di commessa): non esiste nulla in archivio, tutto è inserito a mano.
  function calcolaSostenibilitaPreventivo(p, db) {
    p = p || {};
    const r = verificaSostenibilita(db, {
      origine: 'preventivo',
      prezzo: p.prezzoProposto, ore: p.orePreviste, voci: p.voci,
      datiVerificati: p.datiVerificati, data: p.data, note: p.note,
      etichettaPrezzo: 'PREZZO PROPOSTO non indicato',
      etichettaOre: 'ORE PREVISTE non indicate: la parte strutturale non è calcolabile'
    });
    r.automatica = false;
    r.ricarico = r.totVoci.ricaricoMedio;
    r.compilata = true;
    r.convertito = !!p.commessaId;
    return r;
  }

  // Numero progressivo proposto per un nuovo preventivo: P-<anno>-<progressivo a tre cifre>.
  function prossimoNumeroPreventivo(db, anno) {
    const a = anno || (db.parametri && db.parametri.annoGestione) || new Date().getFullYear();
    const pref = 'P-' + a + '-';
    let max = 0;
    (db.preventivi || []).forEach(p => {
      const n = String(p.numero || '').trim().toUpperCase();
      if (n.indexOf(pref) !== 0) return;
      const k = parseInt(n.slice(pref.length), 10);
      if (!isNaN(k) && k > max) max = k;
    });
    return pref + String(max + 1).padStart(3, '0');
  }

  // Conversione di un preventivo in commessa: restituisce i campi da applicare alla nuova commessa.
  // Il preventivo resta in archivio come storico, collegato alla commessa generata.
  function commessaDaPreventivo(p, db, dati) {
    dati = dati || {};
    const S = parametriSostenibilita(db.parametri);
    const v = calcolaSostenibilitaPreventivo(p, db);
    const rif = 'Da preventivo ' + (p.numero || '') + ' del ' + (p.data || '');
    return {
      dataInserimento: dati.dataInserimento || '',
      codice: String(dati.codice || '').trim(),
      cliente: p.cliente || '', cantiere: p.oggetto || '', indirizzo: p.indirizzo || '',
      ramo: p.ramo || '', tecnico: p.tecnico || '',
      contrattoIniziale: v.prezzoComputo,
      budget: {
        orePreviste: v.ore,
        costiDirettiPrevisti: v.totVoci.n ? v.totVoci.costoTotale : null,
        orePrevisteAgg: null, costiDirettiPrevistiAgg: null, dataAggiornamento: '',
        note: rif + ': ' + v.totVoci.n + ' voci di costo specifico.'
      },
      sostenibilita: {
        ricarico: v.totVoci.ricaricoMedio === null ? S.sogliaRicarico : v.totVoci.ricaricoMedio,
        datiVerificati: !!p.datiVerificati, data: p.data || '',
        note: (String(p.note || '').trim() ? p.note + '\n' : '') + rif + '.'
      }
    };
  }

  // ---------------------------------------------------------------- validazioni
  function validaCommessa(c, db, idEscluso) {
    const errori = [], avvisi = [];
    if (!isoOk(c.dataInserimento)) errori.push('La DATA DI INSERIMENTO è obbligatoria.');
    const cod = String(c.codice || '').trim();
    if (!cod) errori.push('Il CODICE COMMESSA è obbligatorio.');
    else if (attivi(db.commesse).some(x => x.id !== idEscluso && String(x.codice).trim().toUpperCase() === cod.toUpperCase()))
      errori.push('Codice commessa duplicato: "' + cod + '" esiste già in Anagrafica.');
    if (!String(c.cliente || '').trim()) errori.push('Il CLIENTE è obbligatorio.');
    if (!String(c.cantiere || '').trim()) errori.push('La DESCRIZIONE / CANTIERE è obbligatoria.');
    if (has(c.stato) && STATI.indexOf(c.stato) < 0) errori.push('Stato commessa non valido.');
    if (has(c.causaAggiornamentoDataFine) && CAUSE_DATA_FINE.indexOf(c.causaAggiornamentoDataFine) < 0) errori.push('Causa aggiornamento data fine non valida.');
    ['dataInserimento', 'dataInizioPrevista', 'dataInizioEffettiva', 'dataFinePrevista', 'dataFineEffettiva', 'aggiornatoAl'].forEach(f => {
      if (has(c[f]) && !isoOk(c[f])) errori.push('Data non valida nel campo ' + f + '.');
    });
    const dIp = dayNum(c.dataInizioPrevista), dIe = dayNum(c.dataInizioEffettiva), dFp = dayNum(c.dataFinePrevista), dFe = dayNum(c.dataFineEffettiva);
    if (dIp !== null && dFp !== null && dFp < dIp) errori.push('La DATA DI FINE PREVISTA è precedente alla DATA DI INIZIO PREVISTA.');
    if (dIe !== null && dFp !== null && dFp < dIe) errori.push('La DATA DI FINE PREVISTA è precedente alla DATA DI INIZIO EFFETTIVA.');
    if (dIe !== null && dFe !== null && dFe < dIe) errori.push('La DATA DI FINE EFFETTIVA è precedente alla DATA DI INIZIO EFFETTIVA.');
    ['contrattoIniziale', 'integrazioni'].forEach(f => { if (has(c[f]) && num(c[f]) < 0) avvisi.push('Valore negativo nel campo ' + f + '.'); });
    if (isFinito(c.stato) && !has(c.dataFineEffettiva)) avvisi.push('Commessa dichiarata finita ma senza DATA DI FINE EFFETTIVA.');
    if (has(c.dataFineEffettiva) && !isFinito(c.stato)) avvisi.push('È presente una DATA DI FINE EFFETTIVA ma lo stato non è "Finito".');
    if (has(c.dataInizioEffettiva) && c.stato === 'Da iniziare') avvisi.push('È presente una DATA DI INIZIO EFFETTIVA ma lo stato è "Da iniziare".');
    const dT = dayNum(c.dataFinePrevistaOriginale);
    const causa = c.causaAggiornamentoDataFine || '';
    if (dT !== null && dFp !== null && dFp !== dT && (causa === '' || causa === 'Nessuna variazione'))
      avvisi.push('La DATA DI FINE PREVISTA è stata modificata rispetto a quella originaria: indicare la CAUSA AGGIORNAMENTO DATA FINE.');
    if (dT !== null && dFp === dT && causa !== '' && causa !== 'Nessuna variazione')
      avvisi.push('È indicata una causa di aggiornamento ma la DATA DI FINE PREVISTA non è cambiata.');
    if (!has(c.stato)) avvisi.push('Stato commessa non indicato.');
    if (!has(c.dataFinePrevista)) avvisi.push('DATA DI FINE PREVISTA mancante: la scheda cantiere segnalerà dati previsionali incompleti.');
    return { errori, avvisi };
  }

  function validaMovimento(m, db, rowCalcolata) {
    const errori = [], avvisi = [];
    const anno = db.parametri.annoGestione;
    if (!m.commessaId || !attivi(db.commesse).some(c => c.id === m.commessaId)) errori.push('Selezionare una commessa esistente.');
    if (!isoOk(m.data)) errori.push('La DATA MOVIMENTO è obbligatoria.');
    else if (annoDi(m.data) !== anno) errori.push('La data del movimento (' + m.data.slice(0, 4) + ') non appartiene all\'esercizio in gestione ' + anno + '. I valori di anni precedenti vanno nei SALDI INIZIALI.');
    if (!has(m.tipo)) errori.push('Selezionare il TIPO MOVIMENTO.');
    else if (TIPI_MOVIMENTO.indexOf(m.tipo) < 0) errori.push('Tipo movimento non valido.');
    ['sal', 'fatturatoLordo', 'ritenuta', 'svincolo', 'ore', 'perditaSal'].forEach(f => {
      if (has(m[f]) && isNaN(Number(m[f]))) errori.push('Valore non numerico nel campo ' + f + '.');
      else if (num(m[f]) < 0) avvisi.push('Valore negativo nel campo ' + f + ' (non previsto).');
    });
    const tot = ['sal', 'fatturatoLordo', 'ritenuta', 'svincolo', 'ore', 'perditaSal'].reduce((t, f) => t + Math.abs(num(m[f])), 0);
    if (tot === 0 && m.tipo !== 'ALTRO') avvisi.push('Il movimento non contiene alcun valore economico o di ore.');
    const attesi = CAMPI_TIPO[m.tipo] || [];
    attesi.forEach(f => { if (f !== 'ritenuta' && num(m[f]) === 0) avvisi.push('Tipo "' + m.tipo + '" ma il campo ' + f + ' è vuoto.'); });
    if (num(m.ritenuta) > num(m.fatturatoLordo)) avvisi.push('La ritenuta supera il fatturato lordo del movimento.');
    if (num(m.svincolo) > 0 && rowCalcolata) {
      const maturate = rowCalcolata.ritenuteCum, svincolate = rowCalcolata.svincoliCum;
      const giaSvincolate = svincolate - (m._svincoloPrecedente || 0);
      if (giaSvincolate + num(m.svincolo) > maturate + 1e-9)
        avvisi.push('Ritenuta svincolata superiore alla ritenuta maturata: maturate € ' + fmtEuroSemplice(maturate) + ', svincolate finora € ' + fmtEuroSemplice(giaSvincolate) + '.');
    }
    return { errori, avvisi };
  }

  function validaCosto(k, db) {
    const errori = [], avvisi = [];
    const anno = db.parametri.annoGestione;
    if (!k.commessaId || !attivi(db.commesse).some(c => c.id === k.commessaId)) errori.push('Selezionare una commessa esistente.');
    if (!isoOk(k.data)) errori.push('La DATA COSTO è obbligatoria.');
    else if (annoDi(k.data) !== anno) errori.push('La data del costo (' + k.data.slice(0, 4) + ') non appartiene all\'esercizio in gestione ' + anno + '.');
    if (!has(k.importo) || isNaN(Number(k.importo))) errori.push('Indicare l\'IMPORTO.');
    else if (num(k.importo) < 0) avvisi.push('Importo negativo (non previsto).');
    if (!String(k.descrizione || '').trim()) avvisi.push('Descrizione mancante.');
    if (!has(k.macroCategoria)) avvisi.push('Macro-categoria non indicata.');
    return { errori, avvisi };
  }

  // Il saldo porta con sé l'esercizio cui appartiene (anno): le maschere lavorano sempre sull'anno in
  // gestione, l'importazione da Excel può caricare anche i saldi al 31/12 degli anni passati.
  function validaSaldo(s, db, idEscluso) {
    const errori = [], avvisi = [];
    const annoGestione = db.parametri.annoGestione;
    const anno = has(s.anno) ? num(s.anno) : annoGestione;
    if (!(anno >= 1990 && anno <= 2200 && anno === Math.round(anno))) errori.push('Esercizio del saldo non valido.');
    else if (anno > annoGestione) errori.push('Il saldo è al ' + fmtDataSemplice(dataSaldo(anno)) + ', successivo all\'esercizio in gestione (' + annoGestione + '): non si può inserire.');
    else if (anno < annoGestione) avvisi.push('Saldo al ' + fmtDataSemplice(dataSaldo(anno)) + ': riguarda l\'esercizio ' + anno + ', già chiuso. Resta nello storico ma non entra nei cumulativi dell\'esercizio in gestione (' + annoGestione + ').');
    const c = attivi(db.commesse).find(x => x.id === s.commessaId);
    if (!c) errori.push('Selezionare una commessa esistente.');
    else if (!isPregressa(c, anno)) errori.push('La commessa non è pregressa: la DATA DI INIZIO EFFETTIVA deve essere precedente al 01/01/' + anno + '.');
    if (attivi(db.saldi).some(x => x.id !== idEscluso && x.commessaId === s.commessaId && num(x.anno) === anno))
      errori.push('Esiste già un saldo iniziale per questa commessa nell\'esercizio ' + anno + '.');
    ['sal', 'fatturatoLordo', 'ritenute', 'svincoli', 'perditeSal', 'ore', 'costiDiretti'].forEach(f => {
      if (has(s[f]) && isNaN(Number(s[f]))) errori.push('Valore non numerico nel campo ' + f + '.');
      else if (num(s[f]) < 0) avvisi.push('Valore negativo nel campo ' + f + '.');
    });
    if (num(s.svincoli) > num(s.ritenute)) avvisi.push('Svincoli superiori alle ritenute maturate.');
    if (num(s.fatturatoLordo) > num(s.sal)) avvisi.push('Fatturato lordo superiore al SAL maturato.');
    return { errori, avvisi };
  }

  function validaParametri(p) {
    const errori = [];
    if (!(num(p.costoOrario) > 0)) errori.push('Il costo strutturale deve essere maggiore di zero.');
    ['scartoTempoAttenzione', 'scartoTempoCritico', 'scartoOreAttenzione', 'scartoOreCritico', 'sogliaSalNonFatturato'].forEach(f => {
      if (!(num(p[f]) >= 0 && num(p[f]) <= 1)) errori.push('Il parametro ' + f + ' deve essere una percentuale tra 0 e 100.');
    });
    if (num(p.scartoTempoCritico) < num(p.scartoTempoAttenzione)) errori.push('Scarto tempo critico inferiore alla soglia di attenzione.');
    if (num(p.scartoOreCritico) < num(p.scartoOreAttenzione)) errori.push('Scarto ore critico inferiore alla soglia di attenzione.');
    const a = num(p.annoGestione);
    if (!(a >= 2000 && a <= 2099)) errori.push('Anno di gestione non valido.');
    const g = num(p.giorniAggiornamentoRecente);
    if (!(g >= 1 && g <= 3650 && g === Math.round(g))) errori.push('I giorni per "aggiornamento recente" devono essere un numero intero di giorni maggiore di zero.');
    ['sogliaErroreAcquisizione', 'sogliaPerditeAccettate'].forEach(f => {
      if (!(num(p[f]) >= 0 && num(p[f]) <= 1)) errori.push('Il parametro ' + f + ' deve essere una percentuale tra 0 e 100.');
    });
    // ore e costi possono sforare anche di più del 100 % del previsto
    ['sogliaOreOltrePreviste', 'sogliaCostiOltrePrevisti'].forEach(f => {
      if (!(num(p[f]) >= 0 && num(p[f]) <= 10)) errori.push('Il parametro ' + f + ' deve essere una percentuale tra 0 e 1000.');
    });
    if (has(p.obiettivoRientroAnnuo) && num(p.obiettivoRientroAnnuo) < 0) errori.push("Il rientro bancario desiderato nell'anno non può essere negativo.");
    ['rischioStrutturale', 'sogliaRicaricoDirezione'].forEach(f => {
      if (!(num(p[f]) >= 0 && num(p[f]) <= 1)) errori.push('Il parametro ' + f + ' deve essere una percentuale tra 0 e 100.');
    });
    if (!(num(p.redditivita) >= 0 && num(p.redditivita) < 1)) errori.push('La redditività deve essere una percentuale tra 0 e 99,99: con il 100 % il prezzo minimo sarebbe infinito.');
    if (num(p.rientroOrario) < 0) errori.push('Il rientro bancario orario non può essere negativo.');
    return { errori, avvisi: [] };
  }

  // Verifica di sostenibilità di una COMMESSA: l'unico dato inserito a mano è il ricarico.
  function validaSostenibilita(s, db) {
    const errori = [], avvisi = [];
    const S = parametriSostenibilita(db.parametri);
    if (has(s.data) && !isoOk(s.data)) errori.push('Data della verifica non valida.');
    if (has(s.ricarico)) {
      if (isNaN(Number(s.ricarico))) errori.push('Ricarico non numerico.');
      else if (num(s.ricarico) < 0 || num(s.ricarico) > 10) errori.push('Ricarico fuori intervallo (0 – 1000 %).');
      else if (num(s.ricarico) < S.sogliaRicarico - 1e-12)
        avvisi.push('Ricarico ' + fmtPctSemplice(s.ricarico) + ' sotto la soglia della Direzione (' + fmtPctSemplice(S.sogliaRicarico) + '): la verifica risulterà NON CONGRUO.');
    }
    return { errori, avvisi };
  }

  // Voci di costo specifico inserite a mano (preventivi).
  function validaVociSostenibilita(voci, S) {
    const errori = [], avvisi = [];
    (Array.isArray(voci) ? voci : []).forEach((v, i) => {
      const n = 'Voce ' + (i + 1) + ': ';
      if (!String(v.voce || '').trim()) errori.push(n + 'indicare la descrizione della voce di costo specifico.');
      ['quantita', 'costoUnitario'].forEach(f => {
        if (has(v[f]) && isNaN(Number(v[f]))) errori.push(n + 'valore non numerico nel campo ' + f + '.');
        else if (num(v[f]) < 0) errori.push(n + 'valore negativo nel campo ' + f + '.');
      });
      if (has(v.ricarico) && (num(v.ricarico) < 0 || num(v.ricarico) > 10)) errori.push(n + 'ricarico fuori intervallo (0 – 1000 %).');
      if (!has(v.quantita) || !has(v.costoUnitario)) avvisi.push(n + 'quantità o costo unitario mancanti: la voce non concorre al prezzo.');
      else if (num(v.costoUnitario) > 0 && num(v.ricarico) < S.sogliaRicarico - 1e-12)
        avvisi.push(n + 'ricarico ' + fmtPctSemplice(v.ricarico) + ' sotto la soglia della Direzione (' + fmtPctSemplice(S.sogliaRicarico) + '): la verifica risulterà NON CONGRUO.');
    });
    return { errori, avvisi };
  }

  // Preventivo (ipotesi di commessa): tutti i dati sono inseriti a mano.
  function validaPreventivo(p, db, idEscluso) {
    const errori = [], avvisi = [];
    const S = parametriSostenibilita(db.parametri);
    const n = String(p.numero || '').trim();
    if (!n) errori.push('Il NUMERO PREVENTIVO è obbligatorio.');
    else if (attivi(db.preventivi || []).some(x => x.id !== idEscluso && String(x.numero || '').trim().toUpperCase() === n.toUpperCase()))
      errori.push('Numero preventivo duplicato: "' + n + '" esiste già.');
    if (!isoOk(p.data)) errori.push('La DATA DEL PREVENTIVO è obbligatoria.');
    if (!String(p.cliente || '').trim()) errori.push('Il CLIENTE è obbligatorio.');
    if (!String(p.oggetto || '').trim()) errori.push("L'OGGETTO / CANTIERE è obbligatorio.");
    ['prezzoProposto', 'orePreviste'].forEach(f => {
      if (has(p[f]) && isNaN(Number(p[f]))) errori.push('Valore non numerico nel campo ' + f + '.');
      else if (num(p[f]) < 0) errori.push('Valore negativo nel campo ' + f + '.');
    });
    if (!has(p.prezzoProposto)) avvisi.push('PREZZO PROPOSTO non indicato: la verifica resterà DA COMPLETARE.');
    if (!has(p.orePreviste)) avvisi.push('ORE PREVISTE non indicate: la parte strutturale non è calcolabile.');
    if (p.datiVerificati && !(Array.isArray(p.voci) && p.voci.length)) avvisi.push('Nessuna voce di costo specifico: la verifica considererà la sola parte strutturale.');
    const v = validaVociSostenibilita(p.voci, S);
    return { errori: errori.concat(v.errori), avvisi: avvisi.concat(v.avvisi) };
  }

  // Conversione di un preventivo in commessa.
  function validaConversione(p, db, codice) {
    const errori = [], avvisi = [];
    if (!p) { errori.push('Preventivo non trovato.'); return { errori, avvisi }; }
    if (p.annullato) errori.push('Il preventivo è annullato: non può essere convertito.');
    if (p.commessaId) errori.push('Il preventivo è già stato convertito in commessa.');
    const cod = String(codice || '').trim();
    if (!cod) errori.push('Indicare il CODICE COMMESSA da assegnare.');
    else if (attivi(db.commesse).some(x => String(x.codice || '').trim().toUpperCase() === cod.toUpperCase()))
      errori.push('Codice commessa duplicato: "' + cod + '" esiste già in Anagrafica.');
    const v = calcolaSostenibilitaPreventivo(p, db);
    if (v.prezzoComputo === null) errori.push('Il preventivo non ha un PREZZO PROPOSTO: non si può formare il contratto della commessa.');
    if (v.ore === null) avvisi.push('Il preventivo non ha le ORE PREVISTE: il budget della commessa nascerà senza ore.');
    if (v.esito === 'NON CONGRUA' || v.esito === 'NON CONGRUO') avvisi.push('La verifica di sostenibilità del preventivo è ' + v.esito + '.');
    if (v.esito === 'DA COMPLETARE') avvisi.push('La verifica di sostenibilità del preventivo non è stata completata.');
    return { errori, avvisi };
  }

  function validaPesiStrutturali(pesi) {
    const errori = [], avvisi = [];
    if (!Array.isArray(pesi) || !pesi.length) { errori.push('Indicare almeno una voce di peso del costo strutturale.'); return { errori, avvisi }; }
    pesi.forEach((x, i) => {
      if (!String(x.voce || '').trim()) errori.push('Riga ' + (i + 1) + ': indicare la voce di costo.');
      if (!(num(x.peso) >= 0 && num(x.peso) <= 1)) errori.push('Riga ' + (i + 1) + ': il peso deve essere una percentuale tra 0 e 100.');
    });
    const tot = pesi.reduce((t, x) => t + num(x.peso), 0);
    if (Math.abs(tot - 1) > 1e-6) errori.push('La somma dei pesi è ' + fmtPctSemplice(tot) + ': deve essere 100 %.');
    return { errori, avvisi };
  }

  // ---------------------------------------------------------------- chiusura esercizio
  // Politica di riporto, esplicita:
  //   - commessa NON finita con valori cumulativi -> si riporta: il cumulativo al 31/12/anno diventa
  //     il suo saldo iniziale dell'esercizio successivo;
  //   - commessa FINITA (stato fra quelli di STATI_FINITI) -> si DEFINISCE: niente saldo iniziale,
  //     esce dal portafoglio operativo. I valori finali restano nella commessa (chiusuraDefinitiva)
  //     e movimenti, costi e saldi degli anni passati non si toccano: lo storico resta consultabile.
  // Senza questa distinzione una commessa conclusa e interamente fatturata verrebbe riportata ogni anno
  // all'infinito, perché il saldo generato ricrea da solo il cumulativo che supera il filtro l'anno dopo.
  function preparaChiusura(db) {
    const anno = db.parametri.annoGestione;
    const rows = calcolaTutte(db);
    const conValori = r => !!(r.salCum || r.fattCum || r.ritenuteCum || r.svincoliCum || r.perditeCum || r.oreUsate || r.costiSostenuti);
    const valori = r => ({
      commessaId: r.id, codice: r.codice, etichetta: r.etichetta, anno: anno + 1,
      sal: r.salCum, fatturatoLordo: r.fattCum, ritenute: r.ritenuteCum, svincoli: r.svincoliCum,
      perditeSal: r.perditeCum, ore: r.oreUsate, costiDiretti: r.costiSostenuti, finito: r.finito
    });
    const saldi = rows.filter(r => !r.finito && conValori(r)).map(valori);
    // Le finite si definiscono tutte, anche senza valori: la chiusura è il momento in cui escono dal portafoglio.
    const definite = rows.filter(r => r.finito).map(r => Object.assign(valori(r), {
      anno: anno,
      residui: residuiAperti(r)
    }));
    const senzaInizio = rows.filter(r => !r.finito && !r.dataInizioEffettiva && (r.salCum || r.oreUsate || r.costiSostenuti)).map(r => r.codice);
    return { anno, nuovoAnno: anno + 1, saldi, definite, senzaInizio };
  }

  // Residui ancora aperti su una commessa finita: non impediscono di definirla, ma vanno mostrati
  // prima di confermare la chiusura, perché dopo escono dal portafoglio operativo.
  function residuiAperti(r) {
    const v = [];
    if (r.ritenuteDaSbloccare > 0) v.push('ritenute da sbloccare ' + fmtEuroSemplice(r.ritenuteDaSbloccare) + ' €');
    if (r.salNonFatturato > 0) v.push('SAL non fatturato ' + fmtEuroSemplice(r.salNonFatturato) + ' €');
    if (r.residuoDaFatturare) v.push('residuo da fatturare ' + fmtEuroSemplice(r.residuoDaFatturare) + ' €');
    if (!r.dataFineEffettiva) v.push('data di fine effettiva mancante');
    return v;
  }

  function fmtPctSemplice(n) {
    const v = Math.round(num(n) * 10000) / 100;
    return String(v).replace('.', ',') + ' %';
  }
  function fmtNumSemplice(n) {
    const v = Math.round(num(n) * 100) / 100;
    const parti = String(v).split('.');
    return parti[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (parti[1] ? ',' + parti[1] : '');
  }
  function fmtDataSemplice(iso) {
    return isoOk(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : String(iso || '');
  }
  function fmtEuroSemplice(n) {
    const s = (Math.round(num(n) * 100) / 100).toFixed(2);
    const parti = s.split('.');
    return parti[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + parti[1];
  }

  return {
    STATI, STATI_FINITI, TIPI_MOVIMENTO, CAUSE_DATA_FINE, MESI, RUOLI, MACRO_CATEGORIE_DEFAULT, PARAMETRI_DEFAULT, CAMPI_TIPO,
    PESI_STRUTTURALI_DEFAULT, GRUPPI_STRUTTURALI, ESITI_SOSTENIBILITA, LIVELLI_ALERT,
    parametriSostenibilita, pesiStrutturali, dettaglioStrutturale, prezzoStrutturale,
    vociSostenibilita, verificaSostenibilita, calcolaSostenibilita, calcolaSostenibilitaPreventivo,
    prossimoNumeroPreventivo, commessaDaPreventivo,
    validaSostenibilita, validaVociSostenibilita, validaPreventivo, validaConversione, validaPesiStrutturali,
    has, num, isoOk, dayNum, annoDi, meseDi, isFinito, attivi, isDefinita, operative, etichetta, contrattoAggiornato, isPregressa, dataSaldo, budgetDi,
    fatturatoNetto, aggregati, indicizza, oreFasi, serieUtile, calcolaCommessa, calcolaTutte, riepilogo, direzionale, dashboardMovimenti, fatturatoMensile, costoMensile, dashboardBudget,
    validaCommessa, validaMovimento, validaCosto, validaSaldo, validaParametri, preparaChiusura, residuiAperti
  };
});
