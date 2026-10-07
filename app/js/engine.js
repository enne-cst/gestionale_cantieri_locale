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
    const get = id => (idx[id] || (idx[id] = { saldo: null, movimenti: [], costi: [] }));
    attivi(db.saldi).forEach(s => { if (s.anno === anno) get(s.commessaId).saldo = s; });
    attivi(db.movimenti).forEach(m => { if (annoDi(m.data) === anno) get(m.commessaId).movimenti.push(m); });
    attivi(db.costi).forEach(k => { if (annoDi(k.data) === anno) get(k.commessaId).costi.push(k); });
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

    // ---- severità
    const critico =
      (fatturatoOltreRecuperabile !== null && fatturatoOltreRecuperabile > 0) ||
      (contratto !== null && perditeCum > contratto) ||
      (giorniRitardo !== null && giorniRitardo > 0) ||
      (scostTempo !== null && scostTempo < -num(P.scartoTempoCritico)) ||
      (orePct !== null && orePct >= 1) ||
      (scostOre !== null && scostOre > num(P.scartoOreCritico)) ||
      costiSforamento > 0;
    const attenzione =
      contratto === null || codiceTemp || dI === null || dJ === null || dY === null ||
      (finito && !has(c.dataFineEffettiva)) ||
      dataFineIncompleta ||
      (scostTempo !== null && scostTempo < -num(P.scartoTempoAttenzione)) ||
      (scostOre !== null && scostOre > num(P.scartoOreAttenzione)) ||
      (valoreRecuperabile > 0 && salNonFatturato > valoreRecuperabile * soglia) ||
      (ritenuteDaSbloccare > 0 && finito) ||
      (salCum > 0 && costiBudget > 0 && costiSostenuti === 0) ||
      (finito && valoreRecuperabile > 0 && residuoLavori > valoreRecuperabile * soglia) ||
      perditeCum > 0;
    // Una commessa DEFINITA è chiusa e archiviata: non produce più allerte né note operative.
    // Senza saldo iniziale i suoi cumulativi sono a zero e ogni indicatore risulterebbe falsato.
    const alert = definita ? 'REGOLARE' : (critico ? 'CRITICO' : (attenzione ? 'ATTENZIONE' : 'REGOLARE'));

    // ---- motivi (stesso ordine della Rev.14)
    const motivi = [];
    if (fatturatoOltreRecuperabile !== null && fatturatoOltreRecuperabile > 0) motivi.push('FATTURATO OLTRE VALORE RECUPERABILE');
    if (contratto !== null && perditeCum > contratto) motivi.push('PERDITE ACCETTATE OLTRE CONTRATTO');
    if (perditeCum > 0) motivi.push('PERDITA SAL ACCETTATA (€ ' + fmtEuroSemplice(perditeCum) + ')');
    if (giorniRitardo !== null && giorniRitardo > 0) motivi.push('RITARDO PRODUTTIVO (' + Math.round(giorniRitardo) + ' GG)');
    if (scostTempo !== null && scostTempo < -num(P.scartoTempoAttenzione)) motivi.push('AVANZAMENTO PIÙ LENTO DEL TEMPO');
    if (orePct !== null && orePct > 1) motivi.push('ORE OLTRE BUDGET');
    if (orePct !== null && orePct === 1) motivi.push('ORE PREVENTIVATE ESAURITE');
    if (scostOre !== null && scostOre > num(P.scartoOreAttenzione)) motivi.push("CONSUMO ORE SUPERIORE ALL'AVANZAMENTO");
    if (costiSforamento > 0) motivi.push('COSTI DIRETTI OLTRE BUDGET');
    if (valoreRecuperabile > 0 && salNonFatturato > valoreRecuperabile * soglia) motivi.push('SAL MATURATO NON FATTURATO');
    if (ritenuteDaSbloccare > 0 && finito) motivi.push('RITENUTE DA SBLOCCARE');
    if (salCum > 0 && costiBudget > 0 && costiSostenuti === 0) motivi.push('COSTI DIRETTI NON REGISTRATI');
    if (finito && valoreRecuperabile > 0 && residuoLavori > valoreRecuperabile * soglia) motivi.push('CANTIERE FINITO CON RESIDUO LAVORI');
    if (finito && !has(c.dataFineEffettiva)) motivi.push('DATA FINE EFFETTIVA MANCANTE');
    if (dataFineIncompleta) motivi.push('GESTIONE DATA FINE INCOMPLETA');
    if (dY === null) motivi.push('AGGIORNATO AL MANCANTE');
    if (contratto === null || dI === null || dJ === null) motivi.push('DATI PREVISIONALI INCOMPLETI');
    if (codiceTemp) motivi.push('CODICE COMMESSA TEMPORANEO');

    // ---- dettaglio dei motivi per l'interfaccia: i codici (motivi) restano quelli del foglio CANTIERI Rev.14;
    // per i motivi di dati mancanti/incompleti si indica il campo interessato, il difetto e la maschera in cui correggerlo.
    const q = s => '«' + s + '»';
    const motiviDettaglio = motivi.map(m => {
      const d = { motivo: m, testo: m, campi: [], form: null };
      if (m === 'AGGIORNATO AL MANCANTE') {
        d.testo = 'Campo ' + q('Aggiornato al') + ' non compilato: senza questa data non si calcolano avanzamento temporale e ritardo';
        d.campi = ['aggiornatoAl']; d.form = 'note';
      } else if (m === 'DATI PREVISIONALI INCOMPLETI') {
        const manca = [];
        if (contratto === null) manca.push(['contrattoIniziale', 'Contratto iniziale']);
        if (dI === null) manca.push(['dataInizioEffettiva', 'Data di inizio effettivo']);
        if (dJ === null) manca.push(['dataFinePrevista', 'Data di fine prevista']);
        d.testo = 'Dati previsionali incompleti: ' + (manca.length === 1 ? 'campo ' : 'campi ') + manca.map(x => q(x[1])).join(', ') + ' non compilat' + (manca.length === 1 ? 'o' : 'i');
        d.campi = manca.map(x => x[0]); d.form = 'anagrafica';
      } else if (m === 'DATA FINE EFFETTIVA MANCANTE') {
        d.testo = 'Commessa finita ma campo ' + q('Data di fine effettiva') + ' non compilato';
        d.campi = ['dataFineEffettiva']; d.form = 'anagrafica';
      } else if (m === 'GESTIONE DATA FINE INCOMPLETA') {
        if (dJ === null) { d.testo = 'Campo ' + q('Data di fine prevista') + ' vuoto ma ' + q('Causa aggiornamento data fine') + ' indicata'; d.campi = ['dataFinePrevista']; }
        else { d.testo = 'Campo ' + q('Data di fine prevista') + ' modificato rispetto all\'originaria ma ' + q('Causa aggiornamento data fine') + ' non indicata'; d.campi = ['causaAggiornamentoDataFine']; }
        d.form = 'anagrafica';
      } else if (m === 'CODICE COMMESSA TEMPORANEO') {
        d.testo = 'Campo ' + q('Codice commessa') + ' temporaneo (inizia con TEMP): da sostituire con il codice definitivo';
        d.campi = ['codice']; d.form = 'anagrafica';
      }
      return d;
    });

    // ---- note informative (non incidono sulla severità, non presenti in Rev.14)
    const sostenibilita = calcolaSostenibilita(c, db);                            // aggiornata (vigente): esito, allerte, elenchi
    const sostenibilitaIniziale = calcolaSostenibilita(c, db, 'iniziale');        // storico, sui dati iniziali
    const sostenibilitaConsuntivo = calcolaSostenibilita(c, db, 'consuntivo',     // situazione maturata
      { fatturato: fattCum, ore: oreUsate, costi: costiSostenuti });

    const note = [];
    if (sostenibilita.compilata && sostenibilita.esito === 'NON CONGRUA') note.push('Verifica di sostenibilità economica NON CONGRUA');
    if (sostenibilita.compilata && sostenibilita.esito === 'NON CONGRUO') note.push('Verifica di sostenibilità economica non congrua: ricarico sotto la soglia della Direzione');
    if (!hasOreBudget) note.push('Budget ore non definito');
    if (!hasCostiBudget) note.push('Budget costi diretti non definito');
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
      alert, motivi, motiviDettaglio, note
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
      conAlert: count(r => r.alert !== 'REGOLARE'),
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
    PESI_STRUTTURALI_DEFAULT, GRUPPI_STRUTTURALI, ESITI_SOSTENIBILITA,
    parametriSostenibilita, pesiStrutturali, dettaglioStrutturale, prezzoStrutturale,
    vociSostenibilita, verificaSostenibilita, calcolaSostenibilita, calcolaSostenibilitaPreventivo,
    prossimoNumeroPreventivo, commessaDaPreventivo,
    validaSostenibilita, validaVociSostenibilita, validaPreventivo, validaConversione, validaPesiStrutturali,
    has, num, isoOk, dayNum, annoDi, meseDi, isFinito, attivi, isDefinita, operative, etichetta, contrattoAggiornato, isPregressa, dataSaldo, budgetDi,
    fatturatoNetto, aggregati, indicizza, serieUtile, calcolaCommessa, calcolaTutte, riepilogo, dashboardMovimenti, costoMensile, dashboardBudget,
    validaCommessa, validaMovimento, validaCosto, validaSaldo, validaParametri, preparaChiusura, residuiAperti
  };
});
