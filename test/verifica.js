/*
 * Verifica di equivalenza con il DATABASE CONTRATTI FIDA EDILE – REV.14.
 * Esegui con:  node test/verifica.js
 *
 * I valori attesi delle commesse C042, C011 e TEST10 sono quelli calcolati da Excel
 * nel foglio CANTIERI (colonne visibili e colonne di appoggio AZ:BV) e nelle dashboard.
 * I casi A, B, C sono quelli richiesti dal documento "indicazioni".
 */
const Engine = require('../app/js/engine.js');
const Schema = require('../app/js/schema.js');
const DemoData = require('../app/js/demo-data.js');
const Dati = require('../app/js/dati.js');
const Xlsx = require('../app/js/xlsx.js');
const ImportaExcel = require('../app/js/importa-commesse.js');
const fs = require('fs');
const zlib = require('zlib');

let ok = 0, ko = 0;
function eq(nome, atteso, ottenuto, tol) {
  tol = tol === undefined ? 0.005 : tol;
  let pass;
  if (typeof atteso === 'number' && typeof ottenuto === 'number') pass = Math.abs(atteso - ottenuto) <= tol;
  else pass = JSON.stringify(atteso) === JSON.stringify(ottenuto);
  if (pass) ok++; else { ko++; console.log('  ✗ ' + nome + ': atteso ' + JSON.stringify(atteso) + ', ottenuto ' + JSON.stringify(ottenuto)); }
}
function sezione(t) { console.log('\n' + t); }

const db = DemoData.crea();
const rows = Engine.calcolaTutte(db);
const byCod = {}; rows.forEach(r => { byCod[r.codice] = r; });

// ------------------------------------------------------------------ C042 (riga 9 del foglio CANTIERI)
sezione('C042 – valori foglio CANTIERI');
{
  const r = byCod['C042'];
  eq('contratto aggiornato (AZ)', 143061.41, r.contrattoAggiornato);
  eq('SAL cumulato (BA)', 42770.9, r.salCum);
  eq('fatturato lordo (BB)', 42770.9, r.fattCum);
  eq('ritenute (BC)', 2010.23, r.ritenuteCum);
  eq('svincoli (BD)', 500, r.svincoliCum);
  eq('perdite SAL (BV)', 2000, r.perditeCum);
  eq('valore recuperabile (W)', 141061.41, r.valoreRecuperabile);
  eq('SAL non fatturato (M)', 0, r.salNonFatturato);
  eq('residuo lavori (N)', 98290.51, r.residuoLavori);
  eq('ritenute da sbloccare (O)', 1510.23, r.ritenuteDaSbloccare);
  eq('residuo da fatturare (BE)', 98290.51, r.residuoDaFatturare);
  eq('fatturato oltre recuperabile (BF)', 0, r.fatturatoOltreRecuperabile);
  eq('SAL % (BG)', 0.30320765969941743, r.salPct, 1e-9);
  eq('tempo % (BH)', 1, r.tempoPct, 1e-9);
  eq('scostamento tempo (BI)', -0.69679234030058257, r.scostTempo, 1e-9);
  eq('ore budget (BJ)', 1800, r.oreBudget);
  eq('ore usate (BK)', 680, r.oreUsate);
  eq('ore residue (BL)', 1120, r.oreResidue);
  eq('ore % (BM)', 0.37777777777777777, r.orePct, 1e-9);
  eq('scostamento ore (BN)', 0.074570118078360337, r.scostOre, 1e-9);
  eq('costi budget (BO)', 31308, r.costiBudget);
  eq('costi sostenuti (BP)', 32308, r.costiSostenuti);
  eq('costi residuo (BQ)', 0, r.costiResiduo);
  eq('costi sforamento (BR)', 1000, r.costiSforamento);
  eq('costo effettivo cumulato (BS)', 63445.2, r.costoEffettivo);
  eq('giorni ritardo produttivo (Q)', 0, r.giorniRitardo);
  eq('allerta (A)', 'CRITICO', r.alert);
  eq('motivi (B)', [
    'PERDITA SAL ACCETTATA (€ 2.000,00)', 'AVANZAMENTO PIÙ LENTO DEL TEMPO', "CONSUMO ORE SUPERIORE ALL'AVANZAMENTO", 'COSTI DIRETTI OLTRE BUDGET'
  ], r.motivi);
  eq('budget: costo ore (F)', 82422, r.budget.costoOre);
  eq('budget: costo totale (H)', 113730, r.budget.costoTotalePrevisto);
  eq('budget: margine teorico (I)', 0.2050267084603738, r.budget.margineTeorico, 1e-9);
}

// ------------------------------------------------------------------ C011 (riga 10)
sezione('C011 – valori foglio CANTIERI');
{
  const r = byCod['C011'];
  eq('contratto aggiornato', 182758, r.contrattoAggiornato);
  eq('SAL cumulato', 20000, r.salCum);
  eq('fatturato lordo', 9000, r.fattCum);
  eq('perdite', 1000, r.perditeCum);
  eq('valore recuperabile', 181758, r.valoreRecuperabile);
  eq('SAL non fatturato', 11000, r.salNonFatturato);
  eq('residuo lavori', 161758, r.residuoLavori);
  eq('residuo da fatturare', 172758, r.residuoDaFatturare);
  eq('tempo % (aggiornato al mancante)', null, r.tempoPct);
  eq('ore budget (assente = 0)', 0, r.oreBudget);
  eq('ore %', null, r.orePct);
  eq('giorni ritardo (budget assente)', null, r.giorniRitardo);
  eq('costo effettivo', 0, r.costoEffettivo);
  eq('allerta', 'ATTENZIONE', r.alert);
  eq('motivi', [
    'PERDITA SAL ACCETTATA (€ 1.000,00)', 'SAL MATURATO NON FATTURATO', 'CANTIERE FINITO CON RESIDUO LAVORI', 'DATA FINE EFFETTIVA MANCANTE', 'AGGIORNATO AL MANCANTE'
  ], r.motivi);
  eq('budget: margine teorico senza budget', 1, r.budget.margineTeorico, 1e-9);
}

// ------------------------------------------------------------------ TEST10 (riga 11)
sezione('TEST10 – valori foglio CANTIERI');
{
  const r = byCod['TEST10'];
  eq('contratto', 100000, r.contrattoAggiornato);
  eq('SAL', 25000, r.salCum);
  eq('fatturato', 40000, r.fattCum);
  eq('perdite', 5000, r.perditeCum);
  eq('valore recuperabile', 95000, r.valoreRecuperabile);
  eq('SAL non fatturato', 0, r.salNonFatturato);
  eq('residuo lavori', 70000, r.residuoLavori);
  eq('residuo da fatturare', 55000, r.residuoDaFatturare);
  eq('SAL %', 25000 / 95000, r.salPct, 1e-9);
  eq('tempo %', 0.29945054945054944, r.tempoPct, 1e-9);
  eq('ore usate', 300, r.oreUsate);
  eq('ore %', 0.3, r.orePct, 1e-9);
  eq('costi sostenuti', 6000, r.costiSostenuti);
  eq('costi residuo', 14000, r.costiResiduo);
  eq('costo effettivo', 19737, r.costoEffettivo);
  eq('giorni ritardo', 0, r.giorniRitardo);
  eq('allerta', 'ATTENZIONE', r.alert);
  eq('motivi', ['PERDITA SAL ACCETTATA (€ 5.000,00)'], r.motivi);
}

// ------------------------------------------------------------------ dashboard MOVIMENTI (foglio MOVIMENTI 2026, riga 3: TUTTE, Gennaio–Dicembre)
sezione('Dashboard MOVIMENTI – solo commesse Excel, Gennaio–Dicembre');
{
  const dbx = DemoData.crea();
  dbx.commesse = dbx.commesse.filter(c => ['C042', 'C011', 'TEST10'].includes(c.codice));
  const ids = dbx.commesse.map(c => c.id);
  dbx.movimenti = dbx.movimenti.filter(m => ids.includes(m.commessaId));
  dbx.costi = dbx.costi.filter(k => ids.includes(k.commessaId));
  const d = Engine.dashboardMovimenti(dbx, { meseDa: 1, meseA: 12 });
  eq('SAL periodo (G3)', 87770.9, d.sal);
  eq('fatturato lordo (H3)', 91770.9, d.fatturatoLordo);
  eq('ritenute (I3)', 2010.23, d.ritenute);
  eq('svincoli (J3)', 500, d.svincoli);
  eq('fatturato netto (K3)', 90260.67, d.fatturatoNetto);
  eq('ore (L3)', 980, d.ore);
  eq('perdite (M3)', 8000, d.perditeSal);
  eq('costi diretti (N3)', 38308, d.costiDiretti);
  const d2 = Engine.dashboardMovimenti(dbx, { meseDa: 7, meseA: 7 });
  eq('SAL luglio', 62770.9, d2.sal);
  eq('costi luglio', 7000, d2.costiDiretti);
  const d3 = Engine.dashboardMovimenti(dbx, { meseDa: 8, meseA: 3 });
  eq('periodo invertito = 0', 0, d3.sal);

  // tabella costo mensile (CANTIERI AA:AC) – TUTTE
  const cm = Engine.costoMensile(dbx, null);
  eq('costo mese gennaio (AB3)', 5579, cm[0].costoMese);
  eq('costo cumulato febbraio (AC4)', 13073.8, cm[1].cumulato);
  eq('costo mese marzo (AB5)', 3663.2, cm[2].costoMese);
  eq('costo mese aprile (AB6)', 3000, cm[3].costoMese);
  eq('costo mese luglio (AB9)', 38137.2, cm[6].costoMese);

  // riepilogo (CANTIERI riga 3/5 con TUTTE, senza la riga duplicata dell'Excel)
  const rr = Engine.riepilogo(Engine.calcolaTutte(dbx));
  eq('contratto aggiornato totale', 143061.41 + 182758 + 100000, rr.contrattoAggiornato);
  eq('cantieri critici (S5)', 1, rr.critiche);
  eq('cantieri in attenzione', 2, rr.attenzione);
  eq('aggiornato al massimo (P5)', '2026-08-25', rr.aggiornatoAlMax);

  // dashboard BUDGET (riga 3: periodo 01/01/2026–31/12/2026)
  const b = Engine.dashboardBudget(dbx, '2026-01-01', '2026-12-31');
  eq('commesse aperte (F3)', 2, b.n);
  eq('ore previste (H3)', 2800, b.orePreviste);
  eq('costo totale previsto (J3)', 179520, b.costoTotalePrevisto);
}

// ------------------------------------------------------------------ CASO A – commessa ordinaria 2026
sezione('CASO A – commessa ordinaria 2026');
{
  const r = byCod['A-2026-01'];
  eq('pregressa', false, r.pregressa);
  eq('contratto aggiornato', 220000, r.contrattoAggiornato);
  eq('SAL cumulato', 110000, r.salCum);
  eq('fatturato lordo', 100000, r.fattCum);
  eq('ritenute maturate', 5000, r.ritenuteCum);
  eq('ritenute da sbloccare', 5000, r.ritenuteDaSbloccare);
  eq('fatturato netto', 95000, r.fattNettoCum);
  eq('SAL non fatturato', 10000, r.salNonFatturato);
  eq('residuo lavori', 110000, r.residuoLavori);
  eq('residuo da fatturare', 120000, r.residuoDaFatturare);
  eq('ore usate', 1700, r.oreUsate);
  eq('ore residue', 1300, r.oreResidue);
  eq('costi sostenuti', 25000, r.costiSostenuti);
  eq('costi residuo', 25000, r.costiResiduo);
  eq('costo effettivo', 1700 * 45.79 + 25000, r.costoEffettivo);
  eq('SAL %', 0.5, r.salPct, 1e-9);
  eq('tempo %', (Engine.dayNum('2026-06-30') - Engine.dayNum('2026-03-02')) / (Engine.dayNum('2026-12-15') - Engine.dayNum('2026-03-02')), r.tempoPct, 1e-9);
  eq('allerta', 'REGOLARE', r.alert);
  eq('motivi', [], r.motivi);
}

// ------------------------------------------------------------------ CASO B – scostamento
sezione('CASO B – commessa con scostamento');
{
  const r = byCod['B-2026-02'];
  eq('SAL %', 0.3, r.salPct, 1e-9);
  eq('ore %', 0.9, r.orePct, 1e-9);
  eq('tempo % ≈ 90%', 0.9, r.tempoPct, 0.01);
  eq('scostamento ore > critico', true, r.scostOre > db.parametri.scartoOreCritico);
  eq('scostamento tempo < -critico', true, r.scostTempo < -db.parametri.scartoTempoCritico);
  eq('allerta', 'CRITICO', r.alert);
  eq('motivi', ['AVANZAMENTO PIÙ LENTO DEL TEMPO', "CONSUMO ORE SUPERIORE ALL'AVANZAMENTO"], r.motivi);
}

// ------------------------------------------------------------------ CASO C – pregressa
sezione('CASO C – commessa pregressa (saldo 31/12/2025 + movimenti 2026)');
{
  const r = byCod['C-2025-07'];
  eq('pregressa', true, r.pregressa);
  eq('saldo SAL', 120000, r.saldo.sal);
  eq('periodo SAL 2026', 30000, r.periodo.sal);
  eq('SAL cumulato = storico + 2026', 150000, r.salCum);
  eq('fatturato cumulato', 145000, r.fattCum);
  eq('ritenute cumulate', 7250, r.ritenuteCum);
  eq('ore cumulate', 2000, r.oreUsate);
  eq('costi cumulati', 42000, r.costiSostenuti);
  eq('costo effettivo', 2000 * 45.79 + 42000, r.costoEffettivo);
  eq('SAL %', 0.6, r.salPct, 1e-9);
  const dm = Engine.dashboardMovimenti(db, { commessaId: 'c_C25', meseDa: 1, meseA: 12 });
  eq('dashboard 2026: SAL solo 2026', 30000, dm.sal);
  eq('dashboard 2026: fatturato solo 2026', 35000, dm.fatturatoLordo);
  eq('dashboard 2026: ore solo 2026', 500, dm.ore);
  eq('dashboard 2026: costi solo 2026', 12000, dm.costiDiretti);
  eq('allerta', 'ATTENZIONE', r.alert);
  eq('motivi', ['AVANZAMENTO PIÙ LENTO DEL TEMPO', "CONSUMO ORE SUPERIORE ALL'AVANZAMENTO"], r.motivi);
}

// ------------------------------------------------------------------ validazioni
sezione('Controlli di coerenza');
{
  const v1 = Engine.validaMovimento({ commessaId: 'c_A26', data: '', tipo: 'SAL', sal: 100 }, db);
  eq('movimento senza data bloccato', true, v1.errori.some(e => /DATA MOVIMENTO/.test(e)));
  const v2 = Engine.validaMovimento({ commessaId: '', data: '2026-05-01', tipo: 'SAL', sal: 100 }, db);
  eq('movimento senza commessa bloccato', true, v2.errori.some(e => /commessa/.test(e)));
  const v3 = Engine.validaMovimento({ commessaId: 'c_A26', data: '2025-05-01', tipo: 'SAL', sal: 100 }, db);
  eq('movimento anno incoerente bloccato', true, v3.errori.some(e => /esercizio/.test(e)));
  const v4 = Engine.validaMovimento({ commessaId: 'c_A26', data: '2026-07-01', tipo: 'SVINCOLO RITENUTA', svincolo: 9000 }, db, byCod['A-2026-01']);
  eq('svincolo > ritenute maturate segnalato', true, v4.avvisi.some(a => /svincolata superiore/.test(a)));
  const v5 = Engine.validaCosto({ commessaId: '', data: '2026-01-01', importo: 10 }, db);
  eq('costo senza commessa bloccato', true, v5.errori.length > 0);
  const v6 = Engine.validaCommessa(Object.assign(Schema.nuovaCommessa(), { dataInserimento: '2026-01-01', codice: 'c042', cliente: 'X', cantiere: 'Y' }), db);
  eq('codice duplicato (case-insensitive) bloccato', true, v6.errori.some(e => /duplicato/.test(e)));
  const v7 = Engine.validaCommessa(Object.assign(Schema.nuovaCommessa(), { codice: 'NEW', cliente: 'X', cantiere: 'Y' }), db);
  eq('data inserimento obbligatoria', true, v7.errori.some(e => /INSERIMENTO/.test(e)));
  const v8 = Engine.validaCommessa(Object.assign(Schema.nuovaCommessa(), { dataInserimento: '2026-01-01', codice: 'NEW', cliente: 'X', cantiere: 'Y', dataInizioPrevista: '2026-05-01', dataFinePrevista: '2026-04-01' }), db);
  eq('fine precedente a inizio bloccata', true, v8.errori.some(e => /precedente/.test(e)));
  const v9 = Engine.validaCommessa(Object.assign(Schema.nuovaCommessa(), { dataInserimento: '2026-01-01', codice: 'NEW', cliente: 'X', cantiere: 'Y', stato: 'Finito con sblocco ritenute' }), db);
  eq('finita senza data fine effettiva segnalata', true, v9.avvisi.some(a => /FINE EFFETTIVA/.test(a)));
  const v10 = Engine.validaSaldo({ commessaId: 'c_A26', sal: 10 }, db);
  eq('saldo su commessa non pregressa bloccato', true, v10.errori.some(e => /pregressa/.test(e)));
  const v11 = Engine.validaSaldo({ commessaId: 'c_C25', sal: 10 }, db);
  eq('saldo duplicato bloccato', true, v11.errori.some(e => /già un saldo/.test(e)));
}

// ------------------------------------------------------------------ chiusura esercizio
sezione('Chiusura esercizio 2026 → 2027');
{
  const p = Engine.preparaChiusura(db);
  eq('nuovo anno', 2027, p.nuovoAnno);
  const sC = p.saldi.find(s => s.codice === 'C-2025-07');
  eq('saldo 2027 caso C = cumulativo 2026', 150000, sC.sal);
  eq('saldo 2027 caso C ore', 2000, sC.ore);
  // simulazione: applica e verifica che i movimenti 2026 escano dai cumulativi 2027
  const db2 = JSON.parse(JSON.stringify(db));
  p.saldi.forEach(s => db2.saldi.push(Object.assign(Schema.nuovoSaldo(2027), s)));
  db2.parametri.annoGestione = 2027;
  const r27 = Engine.calcolaTutte(db2).find(r => r.codice === 'C-2025-07');
  eq('cumulativo 2027 senza movimenti = saldo', 150000, r27.salCum);
  eq('storico 2026 conservato', true, db2.movimenti.length === db.movimenti.length);
  eq('dashboard 2027 vuota', 0, Engine.dashboardMovimenti(db2, {}).sal);
}

// ------------------------------------------------------------------ commesse finite: definizione alla chiusura
// Una commessa finita non deve essere riportata all'infinito: alla chiusura si DEFINISCE, esce dal
// portafoglio operativo e resta consultabile con i valori finali congelati.
sezione('Chiusura esercizio – commesse finite definite');
{
  function dbProva() {
    const d = Schema.migra(Schema.nuovoDb());
    d.parametri.annoGestione = 2026;
    const mk = (codice, stato, v) => {
      const c = Schema.nuovaCommessa();
      Object.assign(c, {
        codice, cliente: 'Alfa', cantiere: 'Opera ' + codice, stato,
        dataInizioEffettiva: '2024-03-01', dataFinePrevista: '2025-06-30', dataFinePrevistaOriginale: '2025-06-30',
        dataFineEffettiva: v.fine || '', ritenutePreviste: 'SI',
        contrattoIniziale: 100000, integrazioni: 0, aggiornatoAl: '2026-12-31'
      });
      c.budget.orePreviste = 1000; c.budget.costiDirettiPrevisti = 30000;
      d.commesse.push(c);
      d.saldi.push(Object.assign(Schema.nuovoSaldo(2026), { commessaId: c.id, sal: v.sal, fatturatoLordo: v.fatt, ritenute: v.rit, svincoli: v.svi, ore: v.ore, costiDiretti: v.costi }));
      return c;
    };
    mk('F900', 'Finito con sblocco ritenute', { sal: 100000, fatt: 100000, rit: 5000, svi: 5000, ore: 980, costi: 29000, fine: '2025-06-20' });
    mk('F901', 'Finito senza sblocco ritenute', { sal: 100000, fatt: 100000, rit: 5000, svi: 0, ore: 990, costi: 28000, fine: '2025-11-10' });
    mk('A902', 'In corso', { sal: 60000, fatt: 55000, rit: 3000, svi: 0, ore: 600, costi: 18000 });
    return d;
  }
  // applica una chiusura come fa la maschera Parametri
  function chiudi(d) {
    const pp = Engine.preparaChiusura(d);
    pp.saldi.forEach(s => {
      d.saldi.filter(x => x.commessaId === s.commessaId && x.anno === pp.nuovoAnno && !x.annullato).forEach(x => { x.annullato = true; });
      d.saldi.push(Object.assign(Schema.nuovoSaldo(pp.nuovoAnno), s, { id: Schema.genId('s'), annullato: false }));
    });
    pp.definite.forEach(s => {
      const cur = d.commesse.find(x => x.id === s.commessaId);
      if (!cur || cur.chiusuraDefinitiva) return;
      cur.chiusuraDefinitiva = { anno: pp.anno, data: '2026-12-31T00:00:00Z', utente: 'Test', sal: s.sal, fatturatoLordo: s.fatturatoLordo, ritenute: s.ritenute, svincoli: s.svincoli, perditeSal: s.perditeSal, ore: s.ore, costiDiretti: s.costiDiretti };
    });
    d.parametri.annoGestione = pp.nuovoAnno;
    return pp;
  }

  const d = dbProva();
  const pp = chiudi(d);
  eq('riportata solo la commessa aperta', 'A902', pp.saldi.map(s => s.codice).join(','));
  eq('definite entrambe le finite', 'F900,F901', pp.definite.map(s => s.codice).sort().join(','));
  eq('residui segnalati sulla finita con ritenute bloccate', true, /ritenute da sbloccare/.test(pp.definite.find(s => s.codice === 'F901').residui.join(' ')));
  eq('nessun residuo sulla finita regolata', 0, pp.definite.find(s => s.codice === 'F900').residui.length);

  eq('portafoglio 2027: solo la commessa aperta', 'A902', Engine.calcolaTutte(d).map(r => r.codice).join(','));
  eq('nessun saldo iniziale 2027 per le definite', 0, d.saldi.filter(x => !x.annullato && x.anno === 2027 && d.commesse.find(c => c.id === x.commessaId && c.chiusuraDefinitiva)).length);
  eq('saldo 2026 delle definite conservato', 2, d.saldi.filter(x => !x.annullato && x.anno === 2026 && d.commesse.find(c => c.id === x.commessaId && c.chiusuraDefinitiva)).length);
  eq('contratto aggregato senza le definite', 100000, Engine.riepilogo(Engine.calcolaTutte(d)).contrattoAggiornato);
  eq('definite fuori dalle commesse selezionabili', false, Engine.operative(d.commesse).some(c => c.codice === 'F900'));

  const arch = Engine.calcolaTutte(d, { soloDefinite: true });
  eq('archivio consultabile', 'F900,F901', arch.map(r => r.codice).sort().join(','));
  eq('nessuna allerta sulle definite', true, arch.every(r => r.alert === 'REGOLARE' && !r.motivi.length));
  eq('valori finali congelati', 100000, arch.find(r => r.codice === 'F901').chiusuraDefinitiva.sal);

  // il riporto non si autoalimenta: dopo tre chiusure il portafoglio resta quello
  chiudi(d); chiudi(d); chiudi(d);
  eq('nessun riporto perpetuo delle definite', 'A902', Engine.calcolaTutte(d).map(r => r.codice).join(','));
  eq('anno di definizione invariato', 2026, d.commesse.find(c => c.codice === 'F900').chiusuraDefinitiva.anno);
}

// ------------------------------------------------------------------ verifica di sostenibilità economica
// Valori attesi calcolati dal modello "MODELLO VUOTO 5 – Verifica di sostenibilità economica della commessa"
// (fogli "Analisi semplificata" e "Dettaglio strutturale"), con i suoi parametri originali.
sezione('Sostenibilità economica – equivalenza con il modello');
{
  const dbS = Schema.nuovoDb();
  dbS.parametri.costoOrario = 543494.63 / 11868;   // BEP strutturale mensile / ore produttive mensili
  dbS.parametri.rientroOrario = 80000 / 11868;     // rientro bancario mensile / ore produttive mensili
  const S = Engine.parametriSostenibilita(dbS.parametri);
  eq('costo strutturale €/h (Dettaglio B6)', 45.794963768115942, S.costoOrario, 1e-9);
  eq('rientro bancario €/h (Dettaglio B8)', 6.7408156386922817, S.rientroOrario, 1e-9);
  eq('rischio strutturale (D28)', 0.03, S.rischio);
  eq('redditività (F28)', 0.12, S.redditivita);
  eq('soglia minima di ricarico (D29)', 0.15, S.sogliaRicarico);
  eq('ricarico effettivo minimo (H29)', 0.30681818181818166, S.ricaricoEffettivoMinimo, 1e-12);

  // formazione del prezzo della parte strutturale (Dettaglio B37:B42) con 1.000 ore previste
  const str = Engine.prezzoStrutturale(dbS.parametri, 1000);
  eq('costo strutturale attribuito (B37)', 45794.963768115944, str.costo, 1e-6);
  eq('rischio sulla parte strutturale (B38)', 1373.8489130434782, str.rischio, 1e-6);
  eq('costo strutturale prudenziale (B39)', 47168.81268115942, str.prudenziale, 1e-6);
  eq('prezzo con redditività (B40)', 53600.92350131752, str.conRedditivita, 1e-6);
  eq('quota di rientro bancario (B41)', 6740.815638692282, str.rientro, 1e-6);
  eq('prezzo sostenibile della parte strutturale (B42)', 60341.7391400098, str.prezzo, 1e-6);

  // dettaglio dei pesi (Dettaglio C12:F34)
  const det = Engine.dettaglioStrutturale(dbS, 1000);
  eq('pesi strutturali: 22 voci', 22, det.righe.length);
  eq('pesi strutturali: somma 100 % (C34)', 1, det.tot.peso, 1e-12);
  eq('quota €/ora totale = costo strutturale (D34)', S.costoOrario, det.tot.quotaOraria, 1e-9);
  eq('quota commessa totale = costo attribuito (F34)', str.costo, det.tot.quota, 1e-6);
  eq('prima voce: personale operaio', 'Personale operaio', det.righe[0].voce);
  eq('prima voce: quota €/ora (D12)', 29.785338304684863, det.righe[0].quotaOraria, 1e-9);

  // ---------------------------------------------------------------- PREVENTIVO: tutto inserito a mano
  const unaVoce = [{ voce: 'Ponteggio', quantita: 120, um: 'm³', costoUnitario: 85, ricarico: 0.15 }];
  const preventivo = (prezzo, ore, voci, extra) => Object.assign(Schema.nuovoPreventivo(), {
    numero: 'P-2026-001', data: '2026-01-10', cliente: 'CLIENTE DI PROVA', oggetto: 'OGGETTO DI PROVA',
    prezzoProposto: prezzo, orePreviste: ore, voci: voci || [], datiVerificati: true
  }, extra || {});

  const r1 = Engine.calcolaSostenibilitaPreventivo(preventivo(100000, 1000, unaVoce), dbS);
  eq('voce: costo totale (F13)', 10200, r1.voci[0].costoTotale);
  eq('voce: maggiorazione € (H13)', 1530, r1.voci[0].maggiorazione);
  eq('voce: prezzo di vendita (I13)', 13329.545454545454, r1.voci[0].prezzoVendita, 1e-6);
  eq('totale costi specifici (F23)', 10200, r1.totVoci.costoTotale);
  eq('ricarico medio (G23)', 0.15, r1.totVoci.ricaricoMedio, 1e-12);
  eq('prezzo di vendita dei costi specifici (I33)', 13329.545454545454, r1.prezzoMinimoSpecifici, 1e-6);
  eq('parte strutturale (I32)', 60341.7391400098, r1.prezzoMinimoStrutturale, 1e-6);
  eq("prezzo minimo dall'analisi (I34)", 73671.28459455525, r1.prezzoMinimo, 1e-6);
  eq('prezzo del computo (I35)', 100000, r1.prezzoComputo);
  eq('scostamento (I36)', 26328.71540544475, r1.scostamento, 1e-6);
  eq('esito (G24)', 'CONGRUA', r1.esito);

  // gerarchia dell'esito, come nella formula G24 del modello
  eq('computo non dichiarato completo → DA COMPLETARE', 'DA COMPLETARE',
    Engine.calcolaSostenibilitaPreventivo(preventivo(100000, 1000, unaVoce, { datiVerificati: false }), dbS).esito);
  const sottoSoglia = [{ voce: 'Ponteggio', quantita: 120, um: 'm³', costoUnitario: 85, ricarico: 0.10 }];
  const r3 = Engine.calcolaSostenibilitaPreventivo(preventivo(1000000, 1000, sottoSoglia), dbS);
  eq('ricarico sotto la soglia → NON CONGRUO', 'NON CONGRUO', r3.esito);
  eq('voce marcata sotto soglia', true, r3.voci[0].sottoSoglia);
  const r4 = Engine.calcolaSostenibilitaPreventivo(preventivo(50000, 1000, unaVoce), dbS);
  eq('prezzo sotto il minimo → NON CONGRUA', 'NON CONGRUA', r4.esito);
  eq('scostamento negativo', -23671.28459455525, r4.scostamento, 1e-6);
  const r5 = Engine.calcolaSostenibilitaPreventivo(preventivo(100000, null, unaVoce), dbS);
  eq('ore mancanti → prezzo minimo non calcolabile', null, r5.prezzoMinimo);
  eq('ore mancanti → DA COMPLETARE', 'DA COMPLETARE', r5.esito);
  eq('prezzo proposto mancante → DA COMPLETARE', 'DA COMPLETARE',
    Engine.calcolaSostenibilitaPreventivo(preventivo(null, 1000, unaVoce), dbS).esito);
  const r7 = Engine.calcolaSostenibilitaPreventivo(preventivo(100000, 1000, []), dbS);
  eq('senza voci: prezzo minimo = sola parte strutturale', 60341.7391400098, r7.prezzoMinimo, 1e-6);
  eq('senza voci: esito', 'CONGRUA', r7.esito);

  // ---------------------------------------------------------------- COMMESSA: tutto dalle altre schede
  const commessa = (contratto, ore, costi, sost) => {
    const c = Schema.nuovaCommessa();
    c.codice = 'SOST1'; c.cliente = 'CLIENTE DI PROVA'; c.cantiere = 'CANTIERE DI PROVA';
    c.contrattoIniziale = contratto;
    c.budget.orePreviste = ore;
    c.budget.costiDirettiPrevisti = costi;
    c.sostenibilita = Object.assign({ ricarico: 0.15, datiVerificati: true, data: '2026-01-01', note: '' }, sost || {});
    return c;
  };
  const c1 = Engine.calcolaSostenibilita(commessa(100000, 1000, 10200), dbS);
  eq('commessa: una sola voce, automatica dal Budget', 1, c1.voci.length);
  eq('commessa: la voce è automatica', true, c1.voci[0].automatica);
  eq('commessa: costi specifici = costi diretti previsti', 10200, c1.totVoci.costoTotale);
  eq('commessa: stesso prezzo minimo del preventivo equivalente', 73671.28459455525, c1.prezzoMinimo, 1e-6);
  eq('commessa: esito', 'CONGRUA', c1.esito);

  const cAgg = commessa(100000, 1000, 10200);
  cAgg.budget.costiDirettiPrevistiAgg = 20000;
  cAgg.budget.orePrevisteAgg = 1200;
  const c2 = Engine.calcolaSostenibilita(cAgg, dbS);
  eq('commessa: prevalgono i valori aggiornati del Budget (costi)', 20000, c2.totVoci.costoTotale);
  eq('commessa: prevalgono i valori aggiornati del Budget (ore)', 1200, c2.ore);
  eq('commessa: parte strutturale sulle ore aggiornate', 72410.08696801176, c2.prezzoMinimoStrutturale, 1e-6);
  // versione iniziale: resta sui valori iniziali del Budget anche quando ci sono gli aggiornati
  const c2I = Engine.calcolaSostenibilita(cAgg, dbS, 'iniziale');
  eq('commessa iniziale: costi diretti previsti iniziali', 10200, c2I.totVoci.costoTotale);
  eq('commessa iniziale: ore previste iniziali', 1000, c2I.ore);
  eq('commessa iniziale: stesso prezzo minimo della commessa senza aggiornamenti', c1.prezzoMinimo, c2I.prezzoMinimo, 1e-6);
  eq('commessa iniziale: versione', 'iniziale', c2I.versione);
  // versione a consuntivo: fatturato lordo cumulato, ore consumate, costi diretti sostenuti
  const cC = Engine.calcolaSostenibilita(cAgg, dbS, 'consuntivo', { fatturato: 100000, ore: 1000, costi: 10200 });
  eq('commessa consuntivo: prezzo = fatturato lordo cumulato', 100000, cC.prezzoComputo);
  eq('commessa consuntivo: stesso prezzo minimo con gli stessi dati', c1.prezzoMinimo, cC.prezzoMinimo, 1e-6);
  eq('commessa consuntivo: senza fatturato → DA COMPLETARE', 'DA COMPLETARE',
    Engine.calcolaSostenibilita(cAgg, dbS, 'consuntivo', { fatturato: 0, ore: 1000, costi: 10200 }).esito);

  eq('commessa: ricarico sotto la soglia → NON CONGRUO', 'NON CONGRUO',
    Engine.calcolaSostenibilita(commessa(1000000, 1000, 10200, { ricarico: 0.10 }), dbS).esito);
  eq('commessa: computo non dichiarato completo → DA COMPLETARE', 'DA COMPLETARE',
    Engine.calcolaSostenibilita(commessa(100000, 1000, 10200, { datiVerificati: false }), dbS).esito);
  eq('commessa: prezzo sotto il minimo → NON CONGRUA', 'NON CONGRUA',
    Engine.calcolaSostenibilita(commessa(50000, 1000, 10200), dbS).esito);
  const c3 = Engine.calcolaSostenibilita(commessa(100000, 1000, null), dbS);
  eq('commessa: costi diretti previsti mancanti → DA COMPLETARE', 'DA COMPLETARE', c3.esito);
  eq('commessa: motivo sui costi diretti previsti', true, c3.motivi.some(m => /Costi diretti previsti/.test(m)));
  eq('commessa: contratto mancante → DA COMPLETARE', 'DA COMPLETARE',
    Engine.calcolaSostenibilita(commessa(null, 1000, 10200), dbS).esito);
  eq('commessa: ore mancanti → DA COMPLETARE', 'DA COMPLETARE',
    Engine.calcolaSostenibilita(commessa(100000, null, 10200), dbS).esito);
  const cInt = commessa(100000, 1000, 10200);
  cInt.integrazioni = 20000;
  eq('commessa: prezzo del computo = contratto iniziale + integrazioni', 120000, Engine.calcolaSostenibilita(cInt, dbS).prezzoComputo);
  eq('commessa iniziale: prezzo del computo = contratto iniziale', 100000, Engine.calcolaSostenibilita(cInt, dbS, 'iniziale').prezzoComputo);
  eq('commessa: ricarico assente = soglia minima della Direzione', 0.15,
    Engine.calcolaSostenibilita(commessa(100000, 1000, 10200, { ricarico: null }), dbS).ricarico, 1e-12);
  eq('commessa: verifica mai confermata', false, Engine.calcolaSostenibilita(Schema.nuovaCommessa(), dbS).compilata);

  // ---------------------------------------------------------------- conversione preventivo → commessa
  const pConv = preventivo(100000, 1000, unaVoce);
  const dati = Engine.commessaDaPreventivo(pConv, dbS, { codice: 'X1', dataInserimento: '2026-01-20' });
  eq('conversione: contratto iniziale = prezzo proposto', 100000, dati.contrattoIniziale);
  eq('conversione: ore di budget', 1000, dati.budget.orePreviste);
  eq('conversione: costi diretti previsti = totale costi specifici', 10200, dati.budget.costiDirettiPrevisti);
  eq('conversione: ricarico = ricarico medio del preventivo', 0.15, dati.sostenibilita.ricarico, 1e-12);
  eq('conversione: cliente e cantiere riportati', 'CLIENTE DI PROVA|OGGETTO DI PROVA', dati.cliente + '|' + dati.cantiere);
  const cGen = Object.assign(Schema.nuovaCommessa(), dati, {
    budget: Object.assign(Schema.nuovaCommessa().budget, dati.budget),
    sostenibilita: Object.assign(Schema.nuovaCommessa().sostenibilita, dati.sostenibilita)
  });
  const vGen = Engine.calcolaSostenibilita(cGen, dbS);
  eq('conversione: la commessa generata ha lo stesso prezzo minimo', r1.prezzoMinimo, vGen.prezzoMinimo, 1e-6);
  eq('conversione: la commessa generata ha lo stesso esito', r1.esito, vGen.esito);

  // ---------------------------------------------------------------- numerazione e controlli
  const dbP = Schema.nuovoDb();
  eq('primo numero proposto', 'P-2026-001', Engine.prossimoNumeroPreventivo(dbP, 2026));
  dbP.preventivi.push(Object.assign(Schema.nuovoPreventivo(), { numero: 'P-2026-001', data: '2026-01-10', cliente: 'A', oggetto: 'B' }));
  dbP.preventivi.push(Object.assign(Schema.nuovoPreventivo(), { numero: 'P-2026-007', data: '2026-02-10', cliente: 'A', oggetto: 'B' }));
  eq('numero proposto dopo il massimo esistente', 'P-2026-008', Engine.prossimoNumeroPreventivo(dbP, 2026));
  eq('numero proposto di un altro anno', 'P-2027-001', Engine.prossimoNumeroPreventivo(dbP, 2027));
  eq('numero preventivo duplicato bloccato', true,
    Engine.validaPreventivo({ numero: 'p-2026-001', data: '2026-03-01', cliente: 'A', oggetto: 'B' }, dbP).errori.some(e => /duplicato/.test(e)));
  eq('cliente obbligatorio', true,
    Engine.validaPreventivo({ numero: 'P-2026-009', data: '2026-03-01', cliente: '', oggetto: 'B' }, dbP).errori.some(e => /CLIENTE/.test(e)));
  eq('data obbligatoria', true,
    Engine.validaPreventivo({ numero: 'P-2026-009', data: '', cliente: 'A', oggetto: 'B' }, dbP).errori.some(e => /DATA/.test(e)));
  eq('voce senza descrizione bloccata', true,
    Engine.validaPreventivo({ numero: 'P-2026-009', data: '2026-03-01', cliente: 'A', oggetto: 'B', voci: [{ voce: '', quantita: 1, costoUnitario: 1, ricarico: 0.15 }] }, dbP).errori.some(e => /descrizione/.test(e)));
  eq('ricarico della commessa sotto soglia segnalato', true,
    Engine.validaSostenibilita({ ricarico: 0.05 }, dbP).avvisi.some(a => /soglia della Direzione/.test(a)));
  eq('conversione senza codice bloccata', true,
    Engine.validaConversione(dbP.preventivi[0], dbP, '').errori.some(e => /CODICE COMMESSA/.test(e)));
  const dbC = Schema.nuovoDb();
  dbC.commesse.push(Object.assign(Schema.nuovaCommessa(), { codice: 'C900', cliente: 'A', cantiere: 'B' }));
  dbC.preventivi.push(Object.assign(Schema.nuovoPreventivo(), { id: 'pp', numero: 'P-2026-001', data: '2026-01-10', cliente: 'A', oggetto: 'B', prezzoProposto: 1000 }));
  eq('conversione con codice commessa duplicato bloccata', true,
    Engine.validaConversione(dbC.preventivi[0], dbC, 'c900').errori.some(e => /duplicato/.test(e)));
  dbC.preventivi[0].commessaId = 'x';
  eq('preventivo già convertito non riconvertibile', true,
    Engine.validaConversione(dbC.preventivi[0], dbC, 'C901').errori.some(e => /già stato convertito/.test(e)));

  eq('pesi che non sommano a 100 % bloccati', true,
    Engine.validaPesiStrutturali([{ gruppo: 'SPESE GENERALI', voce: 'X', peso: 0.5 }]).errori.some(e => /somma dei pesi/.test(e)));
  eq('pesi corretti accettati', 0, Engine.validaPesiStrutturali(Engine.PESI_STRUTTURALI_DEFAULT).errori.length);
  eq('redditività al 100 % bloccata', true,
    Engine.validaParametri(Object.assign({}, dbS.parametri, { redditivita: 1 })).errori.some(e => /redditività/i.test(e)));
}

// ------------------------------------------------------------------ dati dimostrativi e regole Rev.14
sezione('Sostenibilità economica – dati dimostrativi');
{
  const s042 = byCod['C042'].sostenibilita;
  eq('C042: esito', 'NON CONGRUA', s042.esito);
  eq('C042: prezzo del computo = contratto aggiornato', 143061.41, s042.prezzoComputo);
  eq('C042: ore previste dal budget', 1800, s042.ore);
  eq('C042: costi specifici = costi diretti previsti', 31308, s042.totVoci.costoTotale, 0.005);
  eq('TEST10: esito', 'CONGRUA', byCod['TEST10'].sostenibilita.esito);
  eq('B-2026-02: esito', 'NON CONGRUO', byCod['B-2026-02'].sostenibilita.esito);
  eq('A-2026-01: esito', 'DA COMPLETARE', byCod['A-2026-01'].sostenibilita.esito);
  eq('C011: senza budget la verifica non è calcolabile', null, byCod['C011'].sostenibilita.prezzoMinimo);
  // la verifica non modifica le regole di allerta Rev.14: resta solo una nota informativa
  eq('C042: allerta Rev.14 invariata', 'CRITICO', byCod['C042'].alert);
  eq('C042: nessun motivo di allerta dalla sostenibilità', false, byCod['C042'].motivi.some(m => /SOSTENIBILIT/i.test(m)));
  eq('C042: nota informativa presente', true, byCod['C042'].note.some(n => /NON CONGRUA/.test(n)));
  eq('B-2026-02: allerta Rev.14 invariata', 'CRITICO', byCod['B-2026-02'].alert);

  // preventivi dimostrativi: i quattro esiti possibili
  eq('preventivi dimostrativi', 4, db.preventivi.length);
  const esito = n => Engine.calcolaSostenibilitaPreventivo(db.preventivi.find(p => p.numero === n), db).esito;
  eq('P-2026-001: esito', 'CONGRUA', esito('P-2026-001'));
  eq('P-2026-002: esito', 'NON CONGRUA', esito('P-2026-002'));
  eq('P-2026-003: esito', 'DA COMPLETARE', esito('P-2026-003'));
  eq('P-2026-004: esito', 'NON CONGRUO', esito('P-2026-004'));
  eq('nessun preventivo convertito nei dati dimostrativi', 0, db.preventivi.filter(p => p.commessaId).length);
  eq('i preventivi non entrano fra le commesse', 6, db.commesse.length);
  eq('prossimo numero sui dati dimostrativi', 'P-2026-005', Engine.prossimoNumeroPreventivo(db, 2026));
}


// ------------------------------------------------------------------ esportazione / importazione totale
// La busta deve contenere TUTTO e bastare a sé stessa: chi la riceve non ha questo codice, quindi
// deve trovarci dentro anche la descrizione della struttura (chiavi, campi, relazioni, ordine).
// Il giro completo esporta, reimporta e ricontrolla che nulla sia cambiato: è la garanzia che serve
// prima di portare l'archivio su un database diverso.
sezione('Esportazione / importazione totale dei dati');
{
  const pieno = DemoData.crea();
  // si sporca il database con i casi che in un database vero darebbero problemi o perdite di dati
  pieno.audit.push({ id: 'a_test', ts: '2026-05-05T10:00:00.000Z', utente: 'Tizio', ruolo: 'direzione', entita: 'commessa', entitaId: pieno.commesse[0].id, riferimento: 'x', azione: 'PROVA', modifiche: [{ campo: 'codice', prima: 'A', dopo: 'B' }] });
  pieno.esercizi.push({ anno: 2025, chiusoIl: '2026-01-02T08:00:00.000Z', utente: 'Direzione', saldiGenerati: 3, commesseDefinite: 1 });
  // i dati dimostrativi non hanno fasi, esercizi né registro: senza almeno una riga il giro completo
  // su quelle entità non proverebbe nulla
  pieno.fasi.push(Object.assign(Schema.nuovaFase(), { commessaId: pieno.commesse[0].id, fase: 'Scavi', inizioPrevisto: '2026-03-01', finePrevista: '2026-03-20', quantita: 120, um: 'm³', prezzoVendita: 4500 }));
  pieno.commesse[0].campoIgnoto = 'da non perdere';                      // campo aggiunto in futuro
  pieno.commesse[0].chiusuraDefinitiva = { anno: 2025, data: '2026-01-02', utente: 'Direzione', sal: 1, fatturatoLordo: 2, ritenute: 3, svincoli: 4, perditeSal: 5, ore: 6, costiDiretti: 7 };

  const busta = Dati.esporta(pieno, { modo: 'server', utente: 'Direzione' });

  eq('formato dichiarato', 'fida-edile.export', busta.formato);
  eq('versione del formato', 1, busta.versioneFormato);
  eq('entità descritte', Dati.ORDINE.length, Object.keys(busta.struttura.entita).length);
  eq('ordine di inserimento presente', true, Array.isArray(busta.struttura.ordine) && busta.struttura.ordine[0] === 'utenti');
  eq('impostazioni esportate', true, !!busta.impostazioni.parametri.costoOrario && Array.isArray(busta.impostazioni.liste.pesiStrutturali));
  eq('pesi strutturali non persi', pieno.liste.pesiStrutturali.length, busta.impostazioni.liste.pesiStrutturali.length);
  eq('etichette dei campi incluse', 'Codice commessa', busta.etichette.codice);

  // ogni entità porta con sé quello che serve a creare la tabella
  Dati.ORDINE.forEach(n => {
    eq('chiave di ' + n, Dati.CHIAVI[n], busta.struttura.entita[n].chiave);
    eq('righe di ' + n, pieno[n].length, busta.dati[n].length);
    eq('conteggio di ' + n, pieno[n].length, busta.conteggi[n]);
  });
  eq('riferimento movimenti → commesse', 'commesse', busta.struttura.entita.movimenti.riferimenti.commessaId);
  eq('preventivi: riferimento facoltativo', true, busta.struttura.entita.preventivi.riferimentiFacoltativi.indexOf('commessaId') >= 0);
  eq('oggetti annidati delle commesse', true, !!busta.struttura.entita.commesse.oggetti.budget && !!busta.struttura.entita.commesse.oggetti.sostenibilita);
  eq('budget descritto per intero', true, busta.struttura.entita.commesse.oggetti.budget.indexOf('costiDirettiPrevistiAgg') >= 0);
  eq('chiusura definitiva descritta', true, busta.struttura.entita.commesse.oggetti.chiusuraDefinitiva.indexOf('costiDiretti') >= 0);
  eq('collezione annidata dei preventivi', 'id', busta.struttura.entita.preventivi.collezioni.voci.chiave);
  eq('collezione annidata del registro', true, busta.struttura.entita.audit.collezioni.modifiche.campi.indexOf('prima') >= 0);
  // un campo comparso dopo non deve restare fuori dalla descrizione, altrimenti si perderebbe nella migrazione
  eq('campo ignoto descritto', true, busta.struttura.entita.commesse.campi.indexOf('campoIgnoto') >= 0);
  eq('gli oggetti annidati non sono anche campi', -1, busta.struttura.entita.commesse.campi.indexOf('budget'));

  // giro completo: quello che esce deve rientrare identico
  const letto = Dati.analizza(JSON.stringify(busta));
  eq('rilettura riuscita', true, letto.ok);
  eq('formato riconosciuto', 'portabile', letto.origine);
  eq('totale righe invariato', Dati.conteggi(pieno).totale, letto.conteggi.totale);
  Dati.ORDINE.forEach(n => eq('giro completo di ' + n, JSON.stringify(pieno[n]), JSON.stringify(letto.db[n])));
  eq('giro completo dei parametri', JSON.stringify(pieno.parametri), JSON.stringify(letto.db.parametri));
  eq('giro completo delle liste', JSON.stringify(pieno.liste), JSON.stringify(letto.db.liste));
  eq('campo ignoto sopravvissuto', 'da non perdere', letto.db.commesse[0].campoIgnoto);

  // i vecchi backup erano una copia diretta della struttura interna: devono restare importabili
  const vecchio = Dati.analizza(JSON.stringify(pieno));
  eq('vecchio backup riconosciuto', 'grezzo', vecchio.origine);
  eq('vecchio backup leggibile', true, vecchio.ok);
  eq('vecchio backup completo', Dati.conteggi(pieno).totale, vecchio.conteggi.totale);

  // file non validi: devono essere respinti con un motivo, non accettati a metà
  eq('JSON malformato respinto', false, Dati.analizza('{ questo non è json').ok);
  eq('file estraneo respinto', false, Dati.analizza('{"qualcosa":1}').ok);
  const futuro = JSON.parse(JSON.stringify(busta)); futuro.versioneFormato = 99;
  const daFuturo = Dati.analizza(JSON.stringify(futuro));
  eq('formato più recente respinto', false, daFuturo.ok);
  eq('formato più recente spiegato', true, /versione 99/.test(daFuturo.errori[0]));

  // controlli di integrità: sono quelli che un database con vincoli applicherebbe
  const rotto = DemoData.crea();
  rotto.movimenti[0].commessaId = 'c_inesistente';
  const esitoRotto = Dati.verifica(rotto);
  eq('riferimento orfano rilevato', false, esitoRotto.ok);
  eq('riferimento orfano spiegato', true, /movimenti\.commessaId/.test(esitoRotto.errori[0]));
  const doppio = DemoData.crea();
  doppio.commesse.push(JSON.parse(JSON.stringify(doppio.commesse[0])));
  eq('id ripetuto rilevato', false, Dati.verifica(doppio).ok);
  eq('archivio sano', true, Dati.verifica(DemoData.crea()).ok);
  // un archivio con riferimenti rotti non deve poter entrare
  eq('importazione bloccata se i dati sono incoerenti', false, Dati.analizza(JSON.stringify(Dati.esporta(rotto, {}))).ok);

  // archivio vuoto appena creato: deve esportarsi e rientrare senza inventare nulla
  const vuoto = Schema.migra(null);
  const giroVuoto = Dati.analizza(JSON.stringify(Dati.esporta(vuoto, {})));
  eq('archivio vuoto esportabile', true, giroVuoto.ok);
  eq('archivio vuoto: nessuna commessa', 0, giroVuoto.conteggi.commesse);
  eq('archivio vuoto: utenti predefiniti', vuoto.utenti.length, giroVuoto.conteggi.utenti);
}


// ------------------------------------------------------------------ importazione delle commesse da Excel
// Il .xlsx è scritto e riletto senza librerie esterne: qui si verifica che quello che il programma
// scrive sia rileggibile senza perdere né alterare nulla, che un file compilato a mano venga
// interpretato come lo intende chi lo compila e che si legga anche un file prodotto davvero da Excel
// (archivio compresso, testi condivisi, date come numero seriale).
// La lettura è asincrona: il riepilogo finale si stampa al termine, in fine().
async function verificaImportazioneExcel() {
  const commesse = db.commesse.filter(c => !c.annullato);

  sezione('Importazione da Excel – modello');
  const vuoto = Xlsx.crea(ImportaExcel.fogliModello(db, null));
  eq('firma ZIP del file generato', [0x50, 0x4b], [vuoto[0], vuoto[1]]);
  const cVuoto = await Xlsx.leggi(vuoto);
  eq('fogli del modello', ['ISTRUZIONI', 'COMMESSE', 'ELENCHI'], cVuoto.fogli.map(f => f.nome));
  const testata = cVuoto.foglio('COMMESSE')[0].map(c => Xlsx.testo(c));
  eq('una colonna per ogni campo inseribile a mano', ImportaExcel.COLONNE.length, testata.length);
  eq('i campi obbligatori sono marcati con *', ['Data di inserimento *', 'Codice commessa *', 'Cliente *', 'Descrizione / Cantiere *'], testata.slice(0, 4));
  eq('il modello vuoto non ha righe di dati', 1, cVuoto.foglio('COMMESSE').length);
  const elenchi = cVuoto.foglio('ELENCHI');
  eq('valori ammessi per lo stato', Engine.STATI[0], Xlsx.testo(elenchi[1][0]));
  eq('valori ammessi SI/NO', ['SI', 'NO'], [Xlsx.testo(elenchi[1][2]), Xlsx.testo(elenchi[2][2])]);

  // Andata e ritorno: esportare le commesse e rileggerle non deve cambiare un solo valore.
  sezione('Importazione da Excel – andata e ritorno');
  const pieno = Xlsx.crea(ImportaExcel.fogliModello(db, commesse));
  const cPieno = await Xlsx.leggi(pieno);
  eq('righe scritte', commesse.length + 1, cPieno.foglio('COMMESSE').length);
  const rPieno = ImportaExcel.prepara(cPieno, db);
  eq('nessuna colonna non riconosciuta', [], rPieno.colonneIgnorate);
  eq('nessuna colonna obbligatoria mancante', [], rPieno.colonneMancantiObbligatorie.map(c => c.titolo));
  eq('righe esaminate', commesse.length, rPieno.esiti.length);
  eq('nessuna commessa nuova', 0, rPieno.nNuove);
  eq('nessuna riga scartata', 0, rPieno.nScartate);
  eq('nessuna modifica: il file rispecchia l\'archivio', 0, rPieno.nAggiornate);
  eq('tutte invariate', commesse.length, rPieno.nInvariate);

  // File compilato a mano, come lo consegna il cliente: date e importi all'italiana, SI/NO, percentuali.
  sezione('Importazione da Excel – file compilato a mano');
  const T = campo => ImportaExcel.COLONNE.find(c => c.campo === campo).titolo;
  const campi = ['dataInserimento', 'codice', 'cliente', 'cantiere', 'stato', 'ritenutePreviste',
    'contrattoIniziale', 'integrazioni', 'dataInizioEffettiva', 'dataFinePrevista',
    'budget.orePreviste', 'budget.costiDirettiPrevisti', 'sostenibilita.ricarico', 'sostenibilita.datiVerificati'];
  const esistente = commesse[0];
  const righeProva = [
    campi.map(T).concat(['Colonna inventata']),
    ['15/01/2026', 'IMP001', 'Cliente Alfa', 'Rifacimento copertura', 'In corso', 'SI', '150.000,50', '1.000', '20/01/2026', '30/06/2026', '900', '25.000', '18', 'SI', 'x'],
    ['15/01/2026', esistente.codice, 'CLIENTE RINOMINATO', 'CANTIERE RINOMINATO', '', '', '', '', '', '', '', '', '', '', ''],
    ['15/01/2026', 'IMP003', '', 'Cantiere senza cliente', 'Stato inventato', '', '', '', '', '', '', '', '', '', ''],
    ['15/01/2026', 'IMP001', 'Cliente Beta', 'Doppione', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
  ];
  const fileProva = Xlsx.crea([{ nome: 'COMMESSE', righe: righeProva }]);
  const rProva = ImportaExcel.prepara(await Xlsx.leggi(fileProva), db);
  eq('le colonne non riconosciute sono elencate e ignorate', ['Colonna inventata'], rProva.colonneIgnorate);
  eq('la riga vuota è saltata senza segnalazioni', 4, rProva.esiti.length);
  eq('commesse nuove', 1, rProva.nNuove);
  eq('commesse aggiornate', 1, rProva.nAggiornate);
  eq('righe scartate', 2, rProva.nScartate);

  const nuova = rProva.esiti.find(x => x.esito === 'NUOVA').commessa;
  eq('data scritta gg/mm/aaaa', '2026-01-15', nuova.dataInserimento);
  eq('importo con migliaia e decimali all\'italiana', 150000.5, nuova.contrattoIniziale);
  eq('ritenute previste come SI/NO', 'SI', nuova.ritenutePreviste);
  eq('stato riconosciuto', 'In corso', nuova.stato);
  eq('ore di budget', 900, nuova.budget.orePreviste);
  eq('ricarico: 18 vale 18 %', 0.18, nuova.sostenibilita.ricarico, 1e-12);
  eq('dati del computo verificati', true, nuova.sostenibilita.datiVerificati);
  eq('alla creazione la data fine originaria è quella prevista', '2026-06-30', nuova.dataFinePrevistaOriginale);
  eq('alla creazione il costo orario arriva dai parametri', db.parametri.costoOrario, nuova.budget.costoOrario);
  eq('alla creazione "aggiornato al" è valorizzata', true, !!nuova.aggiornatoAl);

  const agg = rProva.esiti.find(x => x.esito === 'AGGIORNA');
  eq('l\'aggiornamento riconosce la commessa dal codice', esistente.id, agg.commessaId);
  eq('cambiano solo i campi compilati', ['cantiere', 'cliente', 'dataInserimento'], agg.modifiche.map(m => m.campo).sort());
  eq('le celle vuote non cancellano il contratto', esistente.contrattoIniziale, agg.commessa.contrattoIniziale);
  eq('le celle vuote non cancellano il budget', esistente.budget.orePreviste, agg.commessa.budget.orePreviste);

  const scarti = rProva.esiti.filter(x => x.esito === 'SCARTATA');
  eq('scartata: cliente obbligatorio', true, scarti[0].errori.some(x => /CLIENTE/i.test(x)));
  eq('scartata: stato non ammesso', true, scarti[0].errori.some(x => /non ammesso|non valido/i.test(x)));
  eq('scartata: codice ripetuto nello stesso file', true, scarti[1].errori.some(x => /compare già alla riga/i.test(x)));

  // Excel comprime sempre le parti dell'archivio: è la strada che percorrono i file veri.
  sezione('Importazione da Excel – archivio compresso e file originale');
  const cCompresso = await Xlsx.leggi(comprimi(fileProva));
  eq('un archivio compresso si legge come uno non compresso',
    righeProva[0], cCompresso.foglio('COMMESSE')[0].map(c => Xlsx.testo(c)));
  eq('e produce lo stesso esito', rProva.nNuove, ImportaExcel.prepara(cCompresso, db).nNuove);

  const rif = __dirname + '/../reference/DATABASE CONTRATTI FIDA EDILE – REV.14 DEFINITIVA.xlsx';
  if (fs.existsSync(rif)) {
    const orig = await Xlsx.leggi(fs.readFileSync(rif));
    eq('fogli del file Excel originale',
      ['ANAGRAFICA', 'SALDI AL 31.12.2025', 'BUDGET COMMESSA', 'MOVIMENTI 2026', 'COSTI DIRETTI', 'CANTIERI', 'PARAMETRI'],
      orig.fogli.map(f => f.nome));
    const ana = orig.foglio('ANAGRAFICA');
    eq('il foglio ANAGRAFICA si legge', true, ana.length > 5);
    eq('i testi condivisi si leggono', true, ana.some(r => r.some(c => c.tipo === 'testo' && /ANAGRAFICA COMMESSE/i.test(String(c.valore)))));
    eq('le date sono riconosciute e convertite', true, ana.some(r => r.some(c => c.tipo === 'data' && /^\d{4}-\d{2}-\d{2}$/.test(c.valore))));
    eq('i numeri sono riconosciuti', true, ana.some(r => r.some(c => c.tipo === 'numero')));
  } else {
    console.log('  (file Excel di riferimento non presente: prova saltata)');
  }
}

// Riscrive lo stesso archivio comprimendo ogni voce, come fa Excel quando salva.
function comprimi(buf) {
  const b = Buffer.from(buf), voci = [];
  let p = 0;
  while (p + 4 <= b.length && b.readUInt32LE(p) === 0x04034b50) {
    const lunNome = b.readUInt16LE(p + 26), lunExtra = b.readUInt16LE(p + 28), dim = b.readUInt32LE(p + 18);
    const inizio = p + 30 + lunNome + lunExtra;
    voci.push({ nome: b.slice(p + 30, p + 30 + lunNome), dati: b.slice(inizio, inizio + dim) });
    p = inizio + dim;
  }
  const locali = [], centrali = [];
  let off = 0;
  voci.forEach(v => {
    const dati = zlib.deflateRawSync(v.dati), crc = crcZip(v.dati);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(dati.length, 18); lh.writeUInt32LE(v.dati.length, 22); lh.writeUInt16LE(v.nome.length, 26);
    locali.push(lh, v.nome, dati);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(dati.length, 20);
    ch.writeUInt32LE(v.dati.length, 24); ch.writeUInt16LE(v.nome.length, 28); ch.writeUInt32LE(off, 42);
    centrali.push(ch, v.nome);
    off += 30 + v.nome.length + dati.length;
  });
  const dir = Buffer.concat(centrali), fine = Buffer.alloc(22);
  fine.writeUInt32LE(0x06054b50, 0); fine.writeUInt16LE(voci.length, 8); fine.writeUInt16LE(voci.length, 10);
  fine.writeUInt32LE(dir.length, 12); fine.writeUInt32LE(off, 16);
  return Buffer.concat([Buffer.concat(locali), dir, fine]);
}
let TAB_CRC = null;
function crcZip(buf) {
  if (!TAB_CRC) {
    TAB_CRC = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); TAB_CRC[n] = c; }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TAB_CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function fine() {
  console.log('\nRisultato: ' + ok + ' verifiche superate, ' + ko + ' fallite.');
  process.exit(ko ? 1 : 0);
}

// La lettura di un .xlsx richiede DecompressionStream (Node 18+): se manca, il resto della verifica vale comunque.
if (typeof DecompressionStream === 'function') {
  verificaImportazioneExcel().then(fine, e => { console.error(e); process.exit(1); });
} else {
  console.log('\n(Node troppo vecchio per leggere i file .xlsx: verifica dell\'importazione saltata)');
  fine();
}
