/*
 * FIDA EDILE – Importazione delle commesse da un foglio Excel.
 *
 * Qui c'è la sola logica, senza interfaccia: l'elenco dei campi che compongono il modello,
 * la costruzione del modello stesso e la lettura di un file compilato con tutti i controlli.
 * Nessuna dipendenza dal browser: lo stesso file gira in Node (test/verifica.js).
 *
 * Il modello contiene TUTTI e SOLI i campi che di una commessa si inseriscono a mano, una volta
 * sola ciascuno: anagrafica, budget, verifica di sostenibilità, note e data di aggiornamento.
 * Restano fuori i valori calcolati dal programma (contratto aggiornato, allerte, prezzo minimo),
 * le fasi del cronoprogramma e le registrazioni che non appartengono alla commessa
 * (movimenti, costi diretti, saldi iniziali), che hanno archivi propri.
 *
 * Una riga = una commessa. Il CODICE COMMESSA è la chiave: se non esiste la commessa viene creata,
 * se esiste viene aggiornata (le celle vuote non cancellano nulla).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./schema.js'), require('./xlsx.js'));
  else root.ImportaCommesse = factory(root.Engine, root.Schema, root.Xlsx);
})(typeof self !== 'undefined' ? self : this, function (Engine, Schema, Xlsx) {
  'use strict';

  const FOGLIO_DATI = 'COMMESSE';
  const FOGLIO_ELENCHI = 'ELENCHI';
  const FOGLIO_ISTRUZIONI = 'ISTRUZIONI';
  const RIGHE_MODELLO = 500; // righe su cui valgono i menu a tendina del modello

  const SI_NO = ['SI', 'NO'];

  // ---------------------------------------------------------------- campi del modello
  // campo: percorso nella commessa (il punto scende dentro budget / sostenibilita) e chiave della colonna.
  const COLONNE = [
    // --- identificazione
    {
      campo: 'dataInserimento', titolo: 'Data di inserimento', tipo: 'data', obbligatoria: true, larghezza: 16,
      aiuto: 'Obbligatoria per creare la commessa. Data in cui la commessa entra in anagrafica.'
    },
    {
      campo: 'codice', titolo: 'Codice commessa', tipo: 'testo', obbligatoria: true, larghezza: 16, maiuscolo: true,
      aiuto: 'Univoco: è la chiave dell\'importazione. Se non esiste la commessa viene creata, se esiste viene aggiornata. I codici che iniziano con TEMP sono segnalati come temporanei.'
    },
    { campo: 'cliente', titolo: 'Cliente', tipo: 'testo', obbligatoria: true, larghezza: 26, aiuto: 'Obbligatorio.' },
    { campo: 'cantiere', titolo: 'Descrizione / Cantiere', tipo: 'testo', obbligatoria: true, larghezza: 40, aiuto: 'Obbligatoria: descrive il cantiere.' },
    { campo: 'indirizzo', titolo: 'Indirizzo / Località', tipo: 'testo', larghezza: 30, aiuto: 'Dove si trova il cantiere.' },
    { campo: 'ramo', titolo: 'Ramo di attività', tipo: 'testo', larghezza: 22, elencoSuggerito: 'rami', aiuto: 'Testo libero. Nel foglio ELENCHI ci sono i rami già usati: usare gli stessi evita doppioni.' },
    { campo: 'tecnico', titolo: 'Tecnico', tipo: 'testo', larghezza: 20, elencoSuggerito: 'tecnici', aiuto: 'Testo libero. Nel foglio ELENCHI ci sono i tecnici già usati.' },
    { campo: 'preposto', titolo: 'Preposto', tipo: 'testo', larghezza: 20, elencoSuggerito: 'preposti', aiuto: 'Testo libero. Nel foglio ELENCHI ci sono i preposti già usati.' },

    // --- date e stato
    { campo: 'dataInizioPrevista', titolo: 'Data di inizio previsto', tipo: 'data', larghezza: 16, aiuto: 'Data prevista di apertura del cantiere.' },
    { campo: 'dataInizioEffettiva', titolo: 'Data di inizio effettivo', tipo: 'data', larghezza: 16, aiuto: 'Determina se la commessa è pregressa e l\'avanzamento temporale.' },
    { campo: 'dataFinePrevista', titolo: 'Data di fine prevista', tipo: 'data', larghezza: 16, aiuto: 'Alla creazione diventa anche la data di fine originaria. Se in seguito cambia, indicare la causa.' },
    { campo: 'dataFineEffettiva', titolo: 'Data di fine effettiva', tipo: 'data', larghezza: 16, aiuto: 'Obbligatoria quando la commessa è finita.' },
    { campo: 'stato', titolo: 'Stato cantiere', tipo: 'elenco', opzioni: () => Engine.STATI, larghezza: 26, aiuto: 'Uno dei valori del foglio ELENCHI. Se vuoto vale "Da iniziare".' },
    { campo: 'causaAggiornamentoDataFine', titolo: 'Causa aggiornamento data fine', tipo: 'elenco', opzioni: () => Engine.CAUSE_DATA_FINE, larghezza: 30, aiuto: 'Uno dei valori del foglio ELENCHI. Va indicata solo se la data di fine prevista è cambiata rispetto all\'originaria.' },
    { campo: 'ritenutePreviste', titolo: 'Ritenute previste', tipo: 'siNo', larghezza: 14, aiuto: 'SI oppure NO. Se vuoto vale NO.' },

    // --- valori contrattuali
    { campo: 'contrattoIniziale', titolo: 'Contratto iniziale (€)', tipo: 'euro', larghezza: 16, aiuto: 'Importo di contratto. Senza questo valore la commessa risulta con dati previsionali incompleti.' },
    { campo: 'integrazioni', titolo: 'Integrazioni / varianti (€)', tipo: 'euro', larghezza: 16, aiuto: 'Il contratto aggiornato è calcolato dal programma: contratto iniziale + integrazioni.' },
    { campo: 'note', titolo: 'Note anagrafiche', tipo: 'testoLungo', larghezza: 40, aiuto: 'Testo libero sull\'anagrafica della commessa.' },

    // --- budget
    { campo: 'budget.orePreviste', titolo: 'Ore previste iniziali (ore)', tipo: 'ore', larghezza: 18, aiuto: 'Prima stesura del budget: resta come storico. Senza ore non si calcolano il controllo ore/SAL né il ritardo produttivo.' },
    { campo: 'budget.costiDirettiPrevisti', titolo: 'Costi diretti previsti iniziali (€)', tipo: 'euro', larghezza: 22, aiuto: 'Prima stesura del budget: resta come storico.' },
    { campo: 'budget.costoOrario', titolo: 'Costo orario di budget (€/h)', tipo: 'euro', larghezza: 18, aiuto: 'Vale per budget iniziale e aggiornato. Se vuoto, in creazione viene messo il costo strutturale corrente dei Parametri.' },
    { campo: 'budget.orePrevisteAgg', titolo: 'Ore previste aggiornate (ore)', tipo: 'ore', larghezza: 18, aiuto: 'Da compilare solo se il budget è stato rivisto. Richiede la data di aggiornamento budget.' },
    { campo: 'budget.costiDirettiPrevistiAgg', titolo: 'Costi diretti previsti aggiornati (€)', tipo: 'euro', larghezza: 22, aiuto: 'Da compilare solo se il budget è stato rivisto. Richiede la data di aggiornamento budget.' },
    { campo: 'budget.dataAggiornamento', titolo: 'Data aggiornamento budget', tipo: 'data', larghezza: 18, aiuto: 'Obbligatoria se è indicato un valore aggiornato. Da sola significa: budget rivisto e confermato a quella data.' },
    { campo: 'budget.note', titolo: 'Note budget', tipo: 'testoLungo', larghezza: 34, aiuto: 'Testo libero sul budget.' },

    // --- verifica di sostenibilità economica
    { campo: 'sostenibilita.ricarico', titolo: 'Ricarico sui costi specifici (%)', tipo: 'percentuale', larghezza: 20, aiuto: 'In percentuale: scrivere 15 per 15 %. È l\'unico valore della verifica che si inserisce a mano. Se vuoto vale la soglia minima della Direzione.' },
    { campo: 'sostenibilita.datiVerificati', titolo: 'Dati del computo verificati', tipo: 'siNo', larghezza: 18, aiuto: 'SI oppure NO. Finché non è SI la verifica di sostenibilità resta DA COMPLETARE.' },
    { campo: 'sostenibilita.data', titolo: 'Data della verifica', tipo: 'data', larghezza: 16, aiuto: 'Data a cui si riferisce la verifica di sostenibilità.' },
    { campo: 'sostenibilita.note', titolo: 'Note della verifica', tipo: 'testoLungo', larghezza: 34, aiuto: 'Testo libero sulla verifica di sostenibilità.' },

    // --- controllo
    { campo: 'aggiornatoAl', titolo: 'Aggiornato al', tipo: 'data', larghezza: 16, aiuto: 'Data a cui i dati della commessa sono aggiornati: alimenta avanzamento temporale, ritardo e allerte. In creazione, se vuota, viene messa la data di oggi.' },
    { campo: 'noteAzione', titolo: 'Note / Azione', tipo: 'testoLungo', larghezza: 34, aiuto: 'Campo libero per la Direzione: es. chiamare cliente, verificare SAL, recuperare ritenuta.' }
  ];

  const CAMPI_ANAGRAFICA = COLONNE.filter(c => c.campo.indexOf('.') < 0 && c.campo !== 'aggiornatoAl' && c.campo !== 'noteAzione').map(c => c.campo);
  const CAMPI_BUDGET = ['orePreviste', 'costoOrario', 'costiDirettiPrevisti', 'orePrevisteAgg', 'costiDirettiPrevistiAgg', 'dataAggiornamento', 'note'];
  const CAMPI_SOSTENIBILITA = ['ricarico', 'datiVerificati', 'data', 'note'];

  function opzioniDi(c) { return typeof c.opzioni === 'function' ? c.opzioni() : (c.opzioni || []); }
  function stileColonna(c) {
    if (c.tipo === 'data') return 'data';
    if (c.tipo === 'euro') return 'euro';
    if (c.tipo === 'ore' || c.tipo === 'numero' || c.tipo === 'percentuale') return 'numero';
    if (c.tipo === 'testoLungo') return 'testo';
    return null;
  }
  function formatoDi(c) {
    switch (c.tipo) {
      case 'data': return 'gg/mm/aaaa';
      case 'euro': return 'numero (€)';
      case 'ore': return 'numero (ore)';
      case 'percentuale': return 'numero % (15 = 15 %)';
      case 'siNo': return 'SI / NO';
      case 'elenco': return 'a scelta (foglio ELENCHI)';
      default: return 'testo';
    }
  }

  // ---------------------------------------------------------------- lettura dei valori di cella
  function oggi() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function valoreDi(obj, campo) {
    const p = campo.split('.');
    let v = obj;
    for (let i = 0; i < p.length && v !== null && v !== undefined; i++) v = v[p[i]];
    return v === undefined ? null : v;
  }
  function imposta(obj, campo, valore) {
    const p = campo.split('.');
    let o = obj;
    for (let i = 0; i < p.length - 1; i++) {
      if (!o[p[i]] || typeof o[p[i]] !== 'object') o[p[i]] = {};
      o = o[p[i]];
    }
    o[p[p.length - 1]] = valore;
  }
  // Confronto fra due oggetti sui campi indicati, nello stesso formato del registro modifiche.
  function differenze(prima, dopo, campi) {
    const out = [];
    campi.forEach(k => {
      const a = prima ? valoreDi(prima, k) : null, b = valoreDi(dopo, k);
      const na = (a === undefined || a === null) ? '' : a, nb = (b === undefined || b === null) ? '' : b;
      if (String(na) !== String(nb)) out.push({ campo: k, prima: na, dopo: nb });
    });
    return out;
  }

  // Numero scritto a mano: "1.234,56", "1234,56", "€ 1.234,56", "1234.56" -> 1234.56
  function numeroDa(testo) {
    let s = String(testo).replace(/[€\s ]/g, '').replace(/h$/i, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // solo separatore di migliaia
    const n = Number(s);
    return isNaN(n) ? null : n;
  }
  function dataDa(testo) {
    const s = String(testo).trim().split(/[\sT]/)[0];
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
    if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
    if (m) {
      const anno = m[3].length === 2 ? (Number(m[3]) > 70 ? '19' + m[3] : '20' + m[3]) : m[3];
      return anno + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
    }
    return null;
  }

  // Restituisce { valore } se la cella è compilata, {} se è vuota, { errore } se non si capisce.
  function leggiCella(cella, col) {
    if (!cella || cella.tipo === 'vuoto') return {};
    if (cella.tipo === 'errore') return { errore: 'contiene un errore di Excel (' + cella.valore + ')' };
    const grezzo = cella.valore;
    const testo = String(grezzo === null || grezzo === undefined ? '' : grezzo).trim();

    switch (col.tipo) {
      case 'data': {
        if (cella.tipo === 'data') return { valore: grezzo };
        if (cella.tipo === 'numero') { const iso = Xlsx.isoDaSeriale(grezzo); return iso ? { valore: iso } : { errore: 'data non valida' }; }
        if (!testo) return {};
        const iso = dataDa(testo);
        return iso ? { valore: iso } : { errore: 'data non valida ("' + testo + '"): usare il formato gg/mm/aaaa' };
      }
      case 'euro': case 'ore': case 'numero': {
        if (cella.tipo === 'numero' || cella.tipo === 'percentuale') return { valore: grezzo };
        if (!testo) return {};
        const n = numeroDa(testo);
        return n === null ? { errore: 'valore non numerico ("' + testo + '")' } : { valore: n };
      }
      case 'percentuale': {
        // cella formattata come percentuale: Excel conserva già la frazione (15 % -> 0,15)
        if (cella.tipo === 'percentuale') return { valore: grezzo };
        if (cella.tipo === 'numero') return { valore: grezzo / 100, scrittoComeNumero: grezzo };
        if (!testo) return {};
        const conSegno = /%\s*$/.test(testo);
        const n = numeroDa(testo.replace(/%/g, ''));
        if (n === null) return { errore: 'ricarico non numerico ("' + testo + '")' };
        return { valore: n / 100, scrittoComeNumero: conSegno ? null : n };
      }
      case 'siNo': {
        if (cella.tipo === 'booleano') return { valore: grezzo };
        if (cella.tipo === 'numero') return { valore: grezzo !== 0 };
        if (!testo) return {};
        const t = testo.toUpperCase().replace(/Ì/g, 'I');
        if (['SI', 'S', 'X', 'VERO', 'TRUE', '1'].indexOf(t) >= 0) return { valore: true };
        if (['NO', 'N', 'FALSO', 'FALSE', '0'].indexOf(t) >= 0) return { valore: false };
        return { errore: 'valore "' + testo + '" non riconosciuto: scrivere SI oppure NO' };
      }
      case 'elenco': {
        if (!testo) return {};
        const op = opzioniDi(col);
        const trovato = op.find(o => o.toLowerCase() === testo.toLowerCase());
        return trovato ? { valore: trovato } : { errore: 'valore "' + testo + '" non ammesso: usare uno fra ' + op.join(' · ') };
      }
      default: {
        // un numero o una data finiti in una colonna di testo si riportano come sono scritti
        if (cella.tipo === 'numero') return { valore: String(grezzo) };
        if (!testo) return {};
        return { valore: col.maiuscolo ? testo.toUpperCase() : testo };
      }
    }
  }

  // ---------------------------------------------------------------- riconoscimento delle intestazioni
  function normalizza(s) {
    return String(s === null || s === undefined ? '' : s)
      .toLowerCase()
      .replace(/[àáâä]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i').replace(/[òóôö]/g, 'o').replace(/[ùúûü]/g, 'u')
      .replace(/\([^)]*\)/g, '')   // le unità di misura fra parentesi non fanno parte del nome
      .replace(/[^a-z0-9]/g, '');
  }
  // Ogni colonna è riconosciuta dal titolo del modello, dal nome tecnico del campo e da qualche variante d'uso.
  const ALIAS = {
    cantiere: ['cantiere', 'descrizione', 'descrizionecantiere', 'oggetto'],
    codice: ['codice', 'codicecommessa', 'commessa'],
    note: ['note', 'noteanagrafiche'],
    aggiornatoAl: ['aggiornatoal', 'dataaggiornamento'],
    'budget.orePreviste': ['orepreviste', 'orepervisteiniziali'],
    'budget.costiDirettiPrevisti': ['costidirettiprevisti'],
    'budget.costoOrario': ['costoorario'],
    'sostenibilita.ricarico': ['ricarico'],
    'sostenibilita.datiVerificati': ['dativerificati'],
    'sostenibilita.data': ['datadellaverifica', 'dataverifica']
  };
  function indiceIntestazioni() {
    const idx = {};
    COLONNE.forEach(c => {
      const aggiungi = t => { const n = normalizza(t); if (n && !idx[n]) idx[n] = c; };
      aggiungi(c.titolo);
      aggiungi(c.titolo.replace(/\s*\*\s*$/, ''));
      aggiungi(c.campo);
      aggiungi(c.campo.split('.').pop());
      (ALIAS[c.campo] || []).forEach(a => { if (!idx[a]) idx[a] = c; });
    });
    return idx;
  }

  // ---------------------------------------------------------------- costruzione del modello
  function elenchiModello(db) {
    const L = (db && db.liste) || {};
    const colonne = [
      { titolo: 'Stato cantiere', valori: Engine.STATI.slice() },
      { titolo: 'Causa aggiornamento data fine', valori: Engine.CAUSE_DATA_FINE.slice() },
      { titolo: 'SI / NO', valori: SI_NO.slice() },
      { titolo: 'Rami di attività (suggerimenti)', valori: (L.rami || []).slice() },
      { titolo: 'Tecnici (suggerimenti)', valori: (L.tecnici || []).slice() },
      { titolo: 'Preposti (suggerimenti)', valori: (L.preposti || []).slice() }
    ];
    const nRighe = colonne.reduce((m, c) => Math.max(m, c.valori.length), 0);
    const righe = [colonne.map(c => ({ v: c.titolo, s: 'testata' }))];
    for (let i = 0; i < nRighe; i++) righe.push(colonne.map(c => c.valori[i] || ''));
    return {
      foglio: {
        nome: FOGLIO_ELENCHI,
        colonne: colonne.map(() => ({ larghezza: 30 })),
        congelaRighe: 1,
        righe
      },
      // riferimenti alle colonne usati dai menu a tendina del foglio COMMESSE
      riferimento(i) {
        const lettera = Xlsx.colonnaLettera(i);
        return FOGLIO_ELENCHI + '!$' + lettera + '$2:$' + lettera + '$' + (colonne[i].valori.length + 1);
      },
      vuota(i) { return !colonne[i].valori.length; }
    };
  }

  function istruzioniModello() {
    const nota = t => [{ v: t, s: 'nota' }];
    const righe = [
      [{ v: 'FIDA EDILE – Modello per l\'importazione delle commesse', s: 'titolo' }],
      nota('Compilare il foglio COMMESSE: una riga per ogni commessa. Il foglio ELENCHI contiene i valori ammessi e i suggerimenti; questo foglio è solo una guida e non viene letto dal programma.'),
      [],
      [{ v: 'Come si compila', s: 'grassetto' }],
      nota('1. Una riga = una commessa. Le commesse possono essere quante si vuole: basta aggiungere righe.'),
      nota('2. Il CODICE COMMESSA è la chiave. Se il codice non esiste in anagrafica viene creata una nuova commessa; se esiste, quella commessa viene aggiornata.'),
      nota('3. In aggiornamento le celle lasciate vuote non cancellano nulla: restano i valori già presenti nel programma.'),
      nota('4. Non modificare i titoli della riga 1: servono a riconoscere le colonne. L\'ordine delle colonne può invece cambiare e le colonne che non servono si possono eliminare.'),
      nota('5. Le colonne con l\'intestazione arancione sono obbligatorie per creare una nuova commessa.'),
      nota('6. Date in formato gg/mm/aaaa. Importi in euro senza simbolo. Ricarico in percentuale: scrivere 15 per 15 %.'),
      nota('7. I valori calcolati dal programma non si inseriscono qui: contratto aggiornato, costo ore, margine teorico, allerte ed esito della verifica di sostenibilità si ricavano da soli.'),
      nota('8. Restano fuori da questo modello le fasi del cronoprogramma (Gantt), i movimenti, i costi diretti e i saldi iniziali: hanno archivi propri dentro il programma.'),
      nota('9. Salvare il file in formato .xlsx e caricarlo dal programma: menu Gestione → Importa da Excel.'),
      [],
      [{ v: 'Colonne del foglio COMMESSE', s: 'grassetto' }],
      [{ v: 'Colonna', s: 'testata' }, { v: 'Obbligatoria', s: 'testata' }, { v: 'Formato', s: 'testata' }, { v: 'A cosa serve', s: 'testata' }]
    ];
    COLONNE.forEach(c => righe.push([
      { v: c.titolo, s: 'testo' },
      { v: c.obbligatoria ? 'SI' : '', s: 'testo' },
      { v: formatoDi(c), s: 'testo' },
      { v: c.aiuto || '', s: 'testo' }
    ]));
    return {
      nome: FOGLIO_ISTRUZIONI,
      colonne: [{ larghezza: 38 }, { larghezza: 13 }, { larghezza: 24 }, { larghezza: 95 }],
      righe
    };
  }

  // Valore di una commessa già in archivio, pronto per essere scritto nella cella.
  function valoreDaCommessa(c, col) {
    const v = valoreDi(c, col.campo);
    if (v === null || v === undefined || v === '') return '';
    // "ritenute previste" è conservata come testo SI/NO, "dati verificati" come vero/falso
    if (col.tipo === 'siNo') {
      if (typeof v === 'string') return /^(si|sì|s|x|vero|true|1)$/i.test(v.trim()) ? 'SI' : 'NO';
      return v ? 'SI' : 'NO';
    }
    if (col.tipo === 'percentuale') return Math.round(Number(v) * 10000) / 100;
    return v;
  }

  // fogli pronti per Xlsx.crea(). Con `commesse` valorizzato il modello esce già compilato,
  // così lo stesso file serve anche per aggiornare in blocco quello che è già in archivio.
  function fogliModello(db, commesse) {
    const elenchi = elenchiModello(db);
    const intestazione = COLONNE.map(c => ({ v: c.titolo + (c.obbligatoria ? ' *' : ''), s: c.obbligatoria ? 'testataObbligatoria' : 'testata' }));
    const righe = [intestazione];
    (commesse || []).forEach(c => righe.push(COLONNE.map(col => {
      const v = valoreDaCommessa(c, col);
      return col.tipo === 'data' && v ? { v, s: 'data' } : v;
    })));

    const validazioni = [];
    const tendina = (campo, iElenco, messaggio) => {
      const i = COLONNE.findIndex(c => c.campo === campo);
      if (i < 0 || elenchi.vuota(iElenco)) return;
      validazioni.push({ colonna: i, da: 2, a: Math.max(RIGHE_MODELLO, righe.length), origine: elenchi.riferimento(iElenco), messaggio });
    };
    tendina('stato', 0, 'Scegliere uno stato fra quelli elencati nel foglio ELENCHI.');
    tendina('causaAggiornamentoDataFine', 1, 'Scegliere una causa fra quelle elencate nel foglio ELENCHI.');
    tendina('ritenutePreviste', 2, 'Scrivere SI oppure NO.');
    tendina('sostenibilita.datiVerificati', 2, 'Scrivere SI oppure NO.');

    return [
      istruzioniModello(),
      {
        nome: FOGLIO_DATI,
        colonne: COLONNE.map(c => ({ larghezza: c.larghezza || 18, stile: stileColonna(c) })),
        congelaRighe: 1,
        filtro: true,
        righe,
        validazioni
      },
      elenchi.foglio
    ];
  }

  // ---------------------------------------------------------------- lettura di un file compilato
  // cartella: risultato di Xlsx.leggi(). db: l'archivio attuale (non viene modificato).
  function prepara(cartella, db) {
    const righe = cartella.foglio(FOGLIO_DATI) || (cartella.fogli[0] ? cartella.fogli[0].righe : null);
    if (!righe || !righe.length) throw new Error('Il file non contiene il foglio "' + FOGLIO_DATI + '" e non ha fogli leggibili.');

    // L'intestazione è la prima riga che riconosce almeno tre colonne del modello: così un eventuale
    // titolo messo sopra la tabella non manda all'aria la lettura.
    const idx = indiceIntestazioni();
    let iTestata = -1, mappa = null;
    for (let i = 0; i < Math.min(righe.length, 12); i++) {
      const m = righe[i].map(c => idx[normalizza(Xlsx.testo(c))] || null);
      if (m.filter(x => x).length >= 3) { iTestata = i; mappa = m; break; }
    }
    if (iTestata < 0) throw new Error('Nel foglio "' + FOGLIO_DATI + '" non si riconosce la riga dei titoli. Scaricare di nuovo il modello e ricopiarci i dati senza cambiare le intestazioni.');

    const trovate = [], ignorate = [];
    righe[iTestata].forEach((c, j) => {
      const t = Xlsx.testo(c).trim();
      if (mappa[j]) trovate.push(mappa[j]);
      else if (t) ignorate.push(t);
    });
    const mancantiObbligatorie = COLONNE.filter(c => c.obbligatoria && trovate.indexOf(c) < 0);

    // copia di lavoro delle commesse: serve a riconoscere i duplicati anche fra righe dello stesso file
    const lavoro = (db.commesse || []).map(c => JSON.parse(JSON.stringify(c)));
    const dbFinto = { commesse: lavoro, parametri: db.parametri };
    const perCodice = {};
    lavoro.forEach(c => { if (!c.annullato) perCodice[String(c.codice || '').trim().toUpperCase()] = c; });
    const daQuestoFile = {};

    const esiti = [];
    for (let i = iTestata + 1; i < righe.length; i++) {
      const riga = righe[i];
      const numero = i + 1; // numero di riga come lo vede l'utente in Excel
      const errori = [], avvisi = [];
      const valori = {};
      let compilata = false;

      mappa.forEach((col, j) => {
        if (!col) return;
        const letto = leggiCella(riga[j], col);
        if (letto.errore) { errori.push(col.titolo + ': ' + letto.errore); compilata = true; return; }
        if (letto.valore === undefined) return;
        compilata = true;
        valori[col.campo] = letto.valore;
        // 0,15 scritto in una cella non formattata come percentuale diventerebbe 0,15 %: va detto
        if (col.tipo === 'percentuale' && letto.scrittoComeNumero !== null && letto.scrittoComeNumero !== undefined &&
          letto.scrittoComeNumero > 0 && letto.scrittoComeNumero < 1) {
          avvisi.push('Ricarico ' + letto.scrittoComeNumero + ' letto come ' + (letto.scrittoComeNumero) + ' % : per indicare il ' + Math.round(letto.scrittoComeNumero * 100) + ' % scrivere ' + Math.round(letto.scrittoComeNumero * 100) + '.');
        }
      });

      if (!compilata) continue; // riga vuota: si salta senza segnalare nulla

      const codice = String(valori.codice || '').trim().toUpperCase();
      let esistente = null;
      if (!codice) errori.push('Codice commessa: obbligatorio, senza codice la riga non si può importare.');
      else if (daQuestoFile[codice]) errori.push('Codice commessa: "' + codice + '" compare già alla riga ' + daQuestoFile[codice] + ' di questo file.');
      else esistente = perCodice[codice] || null;

      // costruzione della commessa risultante: in aggiornamento le celle vuote non toccano nulla
      const base = esistente ? JSON.parse(JSON.stringify(esistente)) : Schema.nuovaCommessa();
      const nuova = !esistente;
      if (nuova) base.budget = Object.assign({}, base.budget);
      Object.keys(valori).forEach(k => imposta(base, k, valori[k]));
      if (valori.codice !== undefined) base.codice = codice;

      if (nuova) {
        if (!base.stato) base.stato = 'Da iniziare';
        if (!base.ritenutePreviste) base.ritenutePreviste = 'NO';
        if (!base.causaAggiornamentoDataFine) base.causaAggiornamentoDataFine = 'Nessuna variazione';
        if (!base.aggiornatoAl) base.aggiornatoAl = oggi();
        base.dataFinePrevistaOriginale = base.dataFinePrevista || '';
        if (base.budget.orePreviste !== null && base.budget.costoOrario === null && db.parametri) base.budget.costoOrario = db.parametri.costoOrario;
      } else if (!base.dataFinePrevistaOriginale && base.dataFinePrevista) {
        base.dataFinePrevistaOriginale = base.dataFinePrevista;
      }
      // "ritenute previste" e "dati verificati" arrivano come SI/NO oppure come vero/falso
      if (typeof base.ritenutePreviste === 'boolean') base.ritenutePreviste = base.ritenutePreviste ? 'SI' : 'NO';

      // controlli: gli stessi delle maschere dell'applicazione
      const vc = Engine.validaCommessa(base, dbFinto, esistente ? esistente.id : null);
      vc.errori.forEach(e => errori.push(e));
      vc.avvisi.forEach(a => avvisi.push(a));

      const b = base.budget || {};
      CAMPI_BUDGET.forEach(f => {
        const v = b[f];
        if (typeof v === 'number' && v < 0) errori.push('Budget: valore negativo nel campo ' + (Schema.ETICHETTE[f] || f) + '.');
      });
      if ((b.orePrevisteAgg !== null && b.orePrevisteAgg !== undefined) || (b.costiDirettiPrevistiAgg !== null && b.costiDirettiPrevistiAgg !== undefined)) {
        if (!b.dataAggiornamento) errori.push('Budget: indicare la DATA AGGIORNAMENTO BUDGET quando si inserisce un valore aggiornato.');
      }
      if (b.dataAggiornamento && !Engine.isoOk(b.dataAggiornamento)) errori.push('Budget: data di aggiornamento non valida.');

      const vs = Engine.validaSostenibilita(base.sostenibilita || {}, dbFinto);
      vs.errori.forEach(e => errori.push('Sostenibilità: ' + e));
      vs.avvisi.forEach(a => avvisi.push('Sostenibilità: ' + a));

      const modifiche = esistente
        ? differenze(esistente, base, CAMPI_ANAGRAFICA.concat(['aggiornatoAl', 'noteAzione'])
          .concat(CAMPI_BUDGET.map(f => 'budget.' + f)).concat(CAMPI_SOSTENIBILITA.map(f => 'sostenibilita.' + f)))
        : [];

      const esito = errori.length ? 'SCARTATA' : (esistente ? (modifiche.length ? 'AGGIORNA' : 'INVARIATA') : 'NUOVA');
      if (!errori.length) {
        if (codice) daQuestoFile[codice] = numero;
        if (esistente) Object.assign(esistente, JSON.parse(JSON.stringify(base)));
        else { lavoro.push(base); perCodice[codice] = base; }
      }
      esiti.push({
        riga: numero, esito, codice: codice || '(senza codice)',
        cliente: base.cliente || '', cantiere: base.cantiere || '',
        commessaId: esistente ? esistente.id : null,
        commessa: base, valori, modifiche, errori, avvisi
      });
    }

    const conta = e => esiti.filter(x => x.esito === e).length;
    return {
      colonneTrovate: trovate, colonneIgnorate: ignorate, colonneMancantiObbligatorie: mancantiObbligatorie,
      rigaTestata: iTestata + 1,
      esiti,
      nNuove: conta('NUOVA'), nAggiornate: conta('AGGIORNA'), nInvariate: conta('INVARIATA'), nScartate: conta('SCARTATA'),
      nAvvisi: esiti.filter(x => x.esito !== 'SCARTATA' && x.avvisi.length).length
    };
  }

  return {
    FOGLIO_DATI, FOGLIO_ELENCHI, FOGLIO_ISTRUZIONI,
    COLONNE, CAMPI_ANAGRAFICA, CAMPI_BUDGET, CAMPI_SOSTENIBILITA,
    fogliModello, prepara, differenze, normalizza, numeroDa, dataDa, leggiCella, valoreDi, imposta, oggi, formatoDi
  };
});
