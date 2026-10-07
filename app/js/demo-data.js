/*
 * FIDA EDILE – Dati dimostrativi.
 * Contiene le tre commesse di prova presenti nel file Excel Rev.14 (C042, C011, TEST10),
 * usate per verificare l'equivalenza dei calcoli, più i casi di test richiesti dalle
 * indicazioni: CASO A (ordinaria 2026), CASO B (scostamento), CASO C (pregressa).
 * Contiene inoltre quattro preventivi (ipotesi di commessa) che coprono i quattro esiti della verifica
 * di sostenibilità economica.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./schema.js'));
  else root.DemoData = factory(root.Schema);
})(typeof self !== 'undefined' ? self : this, function (Schema) {
  'use strict';

  function commessa(o) {
    return Object.assign(Schema.nuovaCommessa(), o, {
      budget: Object.assign(Schema.nuovaCommessa().budget, o.budget || {}),
      sostenibilita: Object.assign(Schema.nuovaCommessa().sostenibilita, o.sostenibilita || {})
    });
  }
  // voce di costo specifico della verifica di sostenibilità
  function voce(descrizione, categoria, quantita, um, costoUnitario, ricarico) {
    return Object.assign(Schema.nuovaVoceSostenibilita(), { voce: descrizione, macroCategoria: categoria, quantita, um, costoUnitario, ricarico });
  }

  function crea() {
    const db = Schema.nuovoDb();
    db.parametri.annoGestione = 2026;

    // ------------------------------------------------------------ commesse dell'Excel Rev.14
    const c042 = commessa({
      id: 'c_C042', dataInserimento: '2026-06-01', codice: 'C042', cliente: 'CARRON BAU',
      cantiere: 'MURATURE IN LATERIZIO C/O COSMO SPA - PESCHIERA DEL GARDA', ramo: 'MURATURA', tecnico: 'DAVIDE', preposto: 'AHMET MOUSTAFA',
      dataInizioEffettiva: '2026-06-08', dataFinePrevista: '2026-08-25', dataFinePrevistaOriginale: '2026-08-15',
      stato: 'In corso', ritenutePreviste: 'SI', contrattoIniziale: 143061.41, integrazioni: null,
      causaAggiornamentoDataFine: 'Proroga/Sospensione autorizzata', aggiornatoAl: '2026-08-25',
      budget: { orePreviste: 1800, costiDirettiPrevisti: 31308, note: 'DATI DIMOSTRATIVI — da sostituire con l\'Analisi di fattibilità approvata' },
      sostenibilita: { ricarico: 0.15, datiVerificati: true, data: '2026-06-02', note: 'VERIFICA DIMOSTRATIVA: il prezzo del computo non copre il prezzo minimo sostenibile.' }
    });
    const c011 = commessa({
      id: 'c_C011', dataInserimento: '2026-01-10', codice: 'C011', cliente: 'CARRON', cantiere: 'ZABARELLA 2023 - COD. CANTIERE 774',
      ramo: 'MURATURA+ECONOMIE', tecnico: 'ALBAN', preposto: 'NA', dataInizioEffettiva: '2026-01-15', dataFinePrevista: '2026-03-31',
      dataFinePrevistaOriginale: '2026-03-31', stato: 'Finito ritenute non previste', ritenutePreviste: 'NO',
      contrattoIniziale: 55228, integrazioni: 127530, causaAggiornamentoDataFine: 'Nessuna variazione', aggiornatoAl: ''
    });
    const t10 = commessa({
      id: 'c_TEST10', dataInserimento: '2026-01-01', codice: 'TEST10', cliente: 'COMMESSA DIMOSTRATIVA', cantiere: 'TEST REV.10 - PERDITE SAL E COSTI MENSILI',
      ramo: 'TEST', tecnico: 'DIREZIONE', preposto: 'PREPOSTO TEST', dataInizioEffettiva: '2026-01-01', dataFinePrevista: '2026-12-31',
      dataFinePrevistaOriginale: '2026-12-31', stato: 'In corso', ritenutePreviste: 'NO', contrattoIniziale: 100000, integrazioni: 0,
      causaAggiornamentoDataFine: 'Nessuna variazione', aggiornatoAl: '2026-04-20',
      budget: { orePreviste: 1000, costiDirettiPrevisti: 20000, note: '' },
      sostenibilita: { ricarico: 0.15, datiVerificati: true, data: '2026-01-02', note: 'VERIFICA DIMOSTRATIVA: commessa congrua.' }
    });

    // ------------------------------------------------------------ CASO A – commessa ordinaria 2026
    const casoA = commessa({
      id: 'c_A26', dataInserimento: '2026-02-01', codice: 'A-2026-01', cliente: 'IMMOBILIARE VERDE SRL', cantiere: 'NUOVA PALAZZINA RESIDENZIALE - VERONA',
      indirizzo: 'Via Roma 10, Verona', ramo: 'MURATURA', tecnico: 'DAVIDE', preposto: 'AHMET MOUSTAFA',
      dataInizioPrevista: '2026-03-01', dataInizioEffettiva: '2026-03-02', dataFinePrevista: '2026-12-15', dataFinePrevistaOriginale: '2026-12-15',
      stato: 'In corso', ritenutePreviste: 'SI', contrattoIniziale: 200000, integrazioni: 20000, integrazioniRiferimento: 'Integrazione contrattuale n. 1 del 15/04/2026', causaAggiornamentoDataFine: 'Nessuna variazione',
      aggiornatoAl: '2026-06-30', budget: { orePreviste: 3000, costiDirettiPrevisti: 50000, note: '' },
      sostenibilita: { ricarico: 0.15, datiVerificati: false, data: '2026-02-02', note: 'VERIFICA DIMOSTRATIVA: computo ancora da confermare.' }
    });

    // ------------------------------------------------------------ CASO B – commessa con scostamento
    const casoB = commessa({
      id: 'c_B26', dataInserimento: '2026-01-20', codice: 'B-2026-02', cliente: 'CONDOMINIO AURORA', cantiere: 'RIFACIMENTO FACCIATE - PADOVA',
      indirizzo: 'Via Aurora 5, Padova', ramo: 'RISTRUTTURAZIONE', tecnico: 'ALBAN', preposto: 'MARIO ROSSI',
      dataInizioPrevista: '2026-02-01', dataInizioEffettiva: '2026-02-01', dataFinePrevista: '2026-06-30', dataFinePrevistaOriginale: '2026-06-30',
      stato: 'In corso', ritenutePreviste: 'SI', contrattoIniziale: 120000, integrazioni: 0, causaAggiornamentoDataFine: 'Nessuna variazione',
      aggiornatoAl: '2026-06-15', budget: { orePreviste: 1000, costiDirettiPrevisti: 20000, note: '' },
      sostenibilita: { ricarico: 0.10, datiVerificati: true, data: '2026-01-21', note: 'VERIFICA DIMOSTRATIVA: ricarico sotto la soglia della Direzione.' }
    });

    // ------------------------------------------------------------ CASO C – commessa pregressa (iniziata nel 2025)
    const casoC = commessa({
      id: 'c_C25', dataInserimento: '2025-02-15', codice: 'C-2025-07', cliente: 'COMUNE DI VICENZA', cantiere: 'AMPLIAMENTO SCUOLA PRIMARIA - VICENZA',
      indirizzo: 'Via Scuole 1, Vicenza', ramo: 'OPERE PUBBLICHE', tecnico: 'DAVIDE', preposto: 'MARIO ROSSI',
      dataInizioPrevista: '2025-03-01', dataInizioEffettiva: '2025-03-10', dataFinePrevista: '2026-10-31', dataFinePrevistaOriginale: '2026-10-31',
      stato: 'In corso', ritenutePreviste: 'SI', contrattoIniziale: 250000, integrazioni: 0, causaAggiornamentoDataFine: 'Nessuna variazione',
      aggiornatoAl: '2026-04-30', budget: { orePreviste: 2800, costiDirettiPrevisti: 60000, note: '' }
    });

    db.commesse.push(c042, c011, t10, casoA, casoB, casoC);

    // ------------------------------------------------------------ movimenti (dall'Excel)
    const mov = (o) => db.movimenti.push(Object.assign(Schema.nuovoMovimento(), o));
    mov({ commessaId: 'c_TEST10', data: '2026-01-15', tipo: 'SAL + FATTURA', numeroDocumento: 'T10-01', descrizione: 'SAL/Fattura test gennaio', sal: 10000, fatturatoLordo: 15000, ritenuta: 0, svincolo: 0, ore: 100, perditaSal: 0, note: 'TEST REV.10 - MESE 1' });
    mov({ commessaId: 'c_TEST10', data: '2026-02-15', tipo: 'SAL + FATTURA', numeroDocumento: 'T10-02', descrizione: 'SAL/Fattura e perdita accettata', sal: 10000, fatturatoLordo: 15000, ritenuta: 0, svincolo: 0, ore: 120, perditaSal: 5000, note: 'TEST REV.10 - PERDITA DEFINITIVA' });
    mov({ commessaId: 'c_TEST10', data: '2026-03-15', tipo: 'SAL + FATTURA', numeroDocumento: 'T10-03', descrizione: 'SAL/Fattura test marzo', sal: 5000, fatturatoLordo: 10000, ritenuta: 0, svincolo: 0, ore: 80, perditaSal: 0, note: 'TEST REV.10 - MESE 3' });
    mov({ commessaId: 'c_C042', data: '2026-07-15', tipo: 'SAL + FATTURA', numeroDocumento: '210', descrizione: 'SAL 1', sal: 20000, fatturatoLordo: 18000, ritenuta: 900, svincolo: 0, ore: 300, perditaSal: 2000, note: 'PRIMO MOVIMENTO DI PROVA' });
    mov({ commessaId: 'c_C042', data: '2026-07-31', tipo: 'SAL + FATTURA', numeroDocumento: '259', descrizione: 'SAL 2', sal: 22770.9, fatturatoLordo: 24770.9, ritenuta: 1110.23, svincolo: 0, ore: 380, perditaSal: null, note: 'SECONDO MOVIMENTO DELLA STESSA COMMESSA' });
    mov({ commessaId: 'c_C011', data: '2026-07-31', tipo: 'SAL + FATTURA', numeroDocumento: '', descrizione: '', sal: 10000, fatturatoLordo: 9000, ritenuta: null, svincolo: null, ore: null, perditaSal: 1000 });
    mov({ commessaId: 'c_C011', data: '2026-07-31', tipo: 'SAL', numeroDocumento: '', descrizione: '', sal: 10000 });
    mov({ commessaId: 'c_C042', data: '2026-08-25', tipo: 'SVINCOLO RITENUTA', numeroDocumento: 'SV-01', descrizione: 'SVINCOLO PARZIALE', sal: 0, fatturatoLordo: 0, ritenuta: 0, svincolo: 500, ore: 0, perditaSal: null, note: 'SVINCOLO PARZIALE DI PROVA' });

    // CASO A
    mov({ commessaId: 'c_A26', data: '2026-03-31', tipo: 'ORE', descrizione: 'Ore marzo', ore: 400 });
    mov({ commessaId: 'c_A26', data: '2026-04-30', tipo: 'SAL + FATTURA', numeroDocumento: 'FT 12', descrizione: 'SAL 1', sal: 60000, fatturatoLordo: 60000, ritenuta: 3000, ore: 450 });
    mov({ commessaId: 'c_A26', data: '2026-05-31', tipo: 'ORE', descrizione: 'Ore maggio', ore: 420 });
    mov({ commessaId: 'c_A26', data: '2026-06-30', tipo: 'SAL + FATTURA', numeroDocumento: 'FT 31', descrizione: 'SAL 2', sal: 50000, fatturatoLordo: 40000, ritenuta: 2000, ore: 430 });
    // CASO B
    mov({ commessaId: 'c_B26', data: '2026-03-31', tipo: 'SAL + FATTURA', numeroDocumento: 'FT 8', descrizione: 'SAL 1', sal: 36000, fatturatoLordo: 36000, ritenuta: 1800, ore: 450 });
    mov({ commessaId: 'c_B26', data: '2026-05-31', tipo: 'ORE', descrizione: 'Ore aprile-maggio', ore: 450 });
    // CASO C (movimenti 2026)
    mov({ commessaId: 'c_C25', data: '2026-02-20', tipo: 'SAL + FATTURA', numeroDocumento: 'FT 4', descrizione: 'SAL 5', sal: 30000, fatturatoLordo: 35000, ritenuta: 1750, ore: 300 });
    mov({ commessaId: 'c_C25', data: '2026-03-31', tipo: 'ORE', descrizione: 'Ore marzo', ore: 200 });

    // ------------------------------------------------------------ costi diretti (dall'Excel + casi)
    const costo = (o) => db.costi.push(Object.assign(Schema.nuovoCosto(), o));
    costo({ commessaId: 'c_C042', data: '2026-07-12', macroCategoria: 'Materiali e attrezzature', descrizione: 'Laterizi e malte', importo: 5000, fornitore: 'Fornitore di prova', note: 'VALORE DIMOSTRATIVO' });
    costo({ commessaId: 'c_C042', data: '2026-07-24', macroCategoria: 'Materiali e attrezzature', descrizione: 'Piattaforma dedicata', importo: 2000, fornitore: 'Noleggio di prova', note: 'VALORE DIMOSTRATIVO' });
    costo({ commessaId: 'c_C042', data: '2026-08-05', macroCategoria: 'Materiali e attrezzature', descrizione: 'Trasporto straordinario', importo: 1000, fornitore: 'Documento di prova', note: 'VALORE DIMOSTRATIVO' });
    costo({ commessaId: 'c_C042', data: '2026-08-20', macroCategoria: 'Materiali e attrezzature', descrizione: 'Fornitura aggiuntiva di prova', importo: 24308, fornitore: 'Fornitore di prova', note: 'VALORE DIMOSTRATIVO PER TEST SFORAMENTO' });
    costo({ commessaId: 'c_TEST10', data: '2026-01-20', macroCategoria: 'Materiali e attrezzature', descrizione: 'Costo diretto test gennaio', importo: 1000 });
    costo({ commessaId: 'c_TEST10', data: '2026-02-20', macroCategoria: 'Materiali e attrezzature', descrizione: 'Costo diretto test febbraio', importo: 2000 });
    costo({ commessaId: 'c_TEST10', data: '2026-04-20', macroCategoria: 'Materiali e attrezzature', descrizione: 'Costo diretto test aprile', importo: 3000 });
    costo({ commessaId: 'c_A26', data: '2026-04-10', macroCategoria: 'Materiali e attrezzature', descrizione: 'Laterizi', importo: 18000, fornitore: 'Laterizi Veneti - DDT 55' });
    costo({ commessaId: 'c_A26', data: '2026-05-20', macroCategoria: 'Noleggi', descrizione: 'Gru a torre', importo: 7000, fornitore: 'Noleggi Nord - FT 101' });
    costo({ commessaId: 'c_B26', data: '2026-04-15', macroCategoria: 'Noleggi', descrizione: 'Ponteggio', importo: 9000, fornitore: 'Ponteggi Srl - FT 77' });
    costo({ commessaId: 'c_C25', data: '2026-02-05', macroCategoria: 'Materiali e attrezzature', descrizione: 'Serramenti', importo: 8000, fornitore: 'Serramenti Berici - FT 9' });
    costo({ commessaId: 'c_C25', data: '2026-03-25', macroCategoria: 'Subappalti', descrizione: 'Impianto elettrico 2° lotto', importo: 4000, fornitore: 'Elettro Vicenza - FT 21' });

    // ------------------------------------------------------------ saldi al 31/12/2025 (solo commessa pregressa)
    db.saldi.push(Object.assign(Schema.nuovoSaldo(2026), {
      id: 's_C25', commessaId: 'c_C25', sal: 120000, fatturatoLordo: 110000, ritenute: 5500, svincoli: 0, perditeSal: 0, ore: 1500, costiDiretti: 30000, note: 'Cumulativo al 31/12/2025'
    }));

    // ------------------------------------------------------------ preventivi (ipotesi di commessa)
    const prev = (o) => db.preventivi.push(Object.assign(Schema.nuovoPreventivo(), o));
    prev({
      id: 'p_2026_001', numero: 'P-2026-001', data: '2026-01-12', cliente: 'EDILTECNICA SPA',
      oggetto: 'NUOVO CAPANNONE INDUSTRIALE - LEGNAGO', indirizzo: 'Via dell\'Industria 22, Legnago',
      ramo: 'MURATURA', tecnico: 'DAVIDE', prezzoProposto: 150000, orePreviste: 1200, datiVerificati: true,
      note: 'PREVENTIVO DIMOSTRATIVO: offerta congrua.',
      voci: [
        voce('Ponteggio perimetrale', 'Noleggi', 800, 'm²', 18, 0.15),
        voce('Smaltimento materiali di risulta', 'Smaltimenti', 40, 't', 95, 0.2),
        voce('Impianti in subappalto', 'Subappalti', 1, 'corpo', 25000, 0.15)
      ]
    });
    prev({
      id: 'p_2026_002', numero: 'P-2026-002', data: '2026-02-05', cliente: 'COSTRUZIONI BERICHE SRL',
      oggetto: 'RISTRUTTURAZIONE UFFICI - VICENZA', indirizzo: 'Corso Palladio 4, Vicenza',
      ramo: 'RISTRUTTURAZIONE', tecnico: 'ALBAN', prezzoProposto: 90000, orePreviste: 1100, datiVerificati: true,
      note: 'PREVENTIVO DIMOSTRATIVO: prezzo proposto sotto il minimo sostenibile.',
      voci: [
        voce('Cartongessi e controsoffitti', 'Materiali e attrezzature', 600, 'm²', 35, 0.15),
        voce('Noleggio trabattelli', 'Noleggi', 60, 'gg', 150, 0.15)
      ]
    });
    prev({
      id: 'p_2026_003', numero: 'P-2026-003', data: '2026-03-18', cliente: 'COMUNE DI SOAVE',
      oggetto: 'MANUTENZIONE MURA STORICHE - SOAVE', ramo: 'OPERE PUBBLICHE', tecnico: 'DAVIDE',
      prezzoProposto: 130000, orePreviste: 900, datiVerificati: false,
      note: 'PREVENTIVO DIMOSTRATIVO: computo ancora da verificare.',
      voci: [voce('Malte e inerti speciali', 'Materiali e attrezzature', 45, 't', 260, 0.15)]
    });
    prev({
      id: 'p_2026_004', numero: 'P-2026-004', data: '2026-04-02', cliente: 'IMMOBILIARE ADIGE SRL',
      oggetto: 'RIFACIMENTO COPERTURA - VERONA', ramo: 'RISTRUTTURAZIONE', tecnico: 'ALBAN',
      prezzoProposto: 80000, orePreviste: 600, datiVerificati: true,
      note: 'PREVENTIVO DIMOSTRATIVO: una voce ha il ricarico sotto la soglia della Direzione.',
      voci: [
        voce('Manto di copertura', 'Materiali e attrezzature', 450, 'm²', 42, 0.08),
        voce('Smaltimento eternit', 'Smaltimenti', 12, 't', 380, 0.2)
      ]
    });

    db.liste.rami = ['MURATURA', 'MURATURA+ECONOMIE', 'RISTRUTTURAZIONE', 'OPERE PUBBLICHE', 'TEST'];
    db.liste.tecnici = ['DAVIDE', 'ALBAN', 'DIREZIONE'];
    db.liste.preposti = ['AHMET MOUSTAFA', 'MARIO ROSSI', 'PREPOSTO TEST', 'NA'];
    return db;
  }

  return { crea };
});
