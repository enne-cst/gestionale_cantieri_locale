/*
 * FIDA EDILE – Importazione delle commesse da un foglio Excel.
 *
 * Qui c'è la sola logica, senza interfaccia: l'elenco dei campi che compongono il modello,
 * la costruzione del modello stesso e la lettura di un file compilato con tutti i controlli.
 * Nessuna dipendenza dal browser: lo stesso file gira in Node (test/verifica.js).
 *
 * Il foglio COMMESSE contiene TUTTI e SOLI i campi che di una commessa si inseriscono a mano, una
 * volta sola ciascuno: anagrafica, budget, verifica di sostenibilità, note e data di aggiornamento.
 * Restano fuori i valori calcolati dal programma (contratto aggiornato, allerte, prezzo minimo)
 * e le fasi del cronoprogramma, che si disegnano dentro il programma.
 *
 * Una riga = una commessa. Il CODICE COMMESSA è la chiave: se non esiste la commessa viene creata,
 * se esiste viene aggiornata (le celle vuote non cancellano nulla).
 *
 * Il secondo foglio da compilare è SALDI: i valori cumulativi maturati dalle commesse pregresse al
 * 31/12 di un anno, cioè il saldo iniziale dell'esercizio successivo. Serve a caricare in una volta
 * sola lo storico degli anni precedenti, che a mano si inserirebbe una commessa alla volta.
 * Una riga = una commessa + una data di saldo: la coppia è la chiave, quindi la stessa commessa può
 * avere il saldo al 31/12/2024, al 31/12/2025 e così via.
 *
 * Gli altri due fogli sono MOVIMENTI e COSTI, cioè le registrazioni dell'esercizio in gestione:
 * una riga = un evento datato di una commessa. Qui non c'è una chiave naturale (la stessa commessa
 * può avere due registrazioni identiche nello stesso giorno), quindi vale la colonna ID, che il
 * programma scrive quando il modello esce già compilato: con l'ID si AGGIORNA quella registrazione,
 * con la cella vuota se ne crea sempre una nuova. Le righe nuove che ripetono una registrazione già
 * presente sono segnalate con un avviso, così ricaricare due volte lo stesso file non raddoppia i
 * valori di nascosto.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./schema.js'), require('./xlsx.js'));
  else root.ImportaCommesse = factory(root.Engine, root.Schema, root.Xlsx);
})(typeof self !== 'undefined' ? self : this, function (Engine, Schema, Xlsx) {
  'use strict';

  const FOGLIO_DATI = 'COMMESSE';
  const FOGLIO_SALDI = 'SALDI';
  const FOGLIO_MOVIMENTI = 'MOVIMENTI';
  const FOGLIO_COSTI = 'COSTI';
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

  // ---------------------------------------------------------------- campi del foglio SALDI
  // Una riga = i valori cumulativi di una commessa a una certa data di saldo (sempre un 31 dicembre).
  // Il saldo al 31/12/2025 è il saldo iniziale dell'esercizio 2026: nell'archivio si conserva l'anno
  // dell'esercizio (2026), nel foglio si scrive la data perché è così che la si legge sui documenti.
  const COLONNE_SALDI = [
    {
      campo: 'codice', titolo: 'Codice commessa', tipo: 'testo', obbligatoria: true, larghezza: 16, maiuscolo: true,
      aiuto: 'Codice di una commessa del foglio COMMESSE oppure già in archivio. La commessa deve essere pregressa rispetto al saldo: data di inizio effettiva precedente al 1° gennaio dell\'anno successivo alla data del saldo.'
    },
    {
      campo: 'dataSaldo', titolo: 'Data saldo (31/12)', tipo: 'data', obbligatoria: true, larghezza: 16,
      aiuto: 'Sempre un 31 dicembre. 31/12/2025 = valori cumulativi maturati fino a quella data, cioè il saldo iniziale dell\'esercizio 2026. Per caricare più anni della stessa commessa si ripete il codice su più righe con date diverse.'
    },
    { campo: 'sal', titolo: 'SAL maturato (€)', tipo: 'euro', larghezza: 18, aiuto: 'Totale del SAL maturato dall\'inizio della commessa fino alla data del saldo.' },
    { campo: 'fatturatoLordo', titolo: 'Fatturato lordo (€)', tipo: 'euro', larghezza: 18, aiuto: 'Totale fatturato al lordo delle ritenute fino alla data del saldo.' },
    { campo: 'ritenute', titolo: 'Ritenute maturate (€)', tipo: 'euro', larghezza: 18, aiuto: 'Totale delle ritenute a garanzia maturate fino alla data del saldo.' },
    { campo: 'svincoli', titolo: 'Ritenute svincolate (€)', tipo: 'euro', larghezza: 18, aiuto: 'Quota delle ritenute già svincolata alla data del saldo.' },
    { campo: 'perditeSal', titolo: 'Perdite SAL accettate (€)', tipo: 'euro', larghezza: 20, aiuto: 'Quota di SAL che non verrà mai fatturata, accettata come perdita.' },
    { campo: 'ore', titolo: 'Ore effettive', tipo: 'ore', larghezza: 14, aiuto: 'Ore di manodopera già impiegate fino alla data del saldo.' },
    { campo: 'costiDiretti', titolo: 'Costi diretti (€)', tipo: 'euro', larghezza: 18, aiuto: 'Costi diretti già sostenuti fino alla data del saldo.' },
    { campo: 'note', titolo: 'Note saldo', tipo: 'testoLungo', larghezza: 34, aiuto: 'Testo libero: da dove arrivano i valori, cosa resta da verificare.' }
  ];
  // campi del saldo scritti nell'archivio (esclusi 'codice' e 'dataSaldo', che diventano commessaId e anno)
  const CAMPI_SALDO = COLONNE_SALDI.filter(c => c.campo !== 'codice' && c.campo !== 'dataSaldo').map(c => c.campo);

  // ---------------------------------------------------------------- campi dei fogli MOVIMENTI e COSTI
  // Registrazioni dell'esercizio in gestione. La colonna ID è tecnica: la scrive il programma quando
  // il modello esce già compilato ed è l'unico modo per aggiornare una registrazione invece di
  // aggiungerne una nuova. Il codice commessa dice a quale commessa appartiene la registrazione.
  const AIUTO_ID = 'Lo scrive il programma: serve solo per aggiornare una registrazione già in archivio. ' +
    'Da non inventare e da non modificare. Lasciando la cella vuota si registra sempre un movimento nuovo.';
  const AIUTO_CODICE_REG = 'Codice di una commessa del foglio COMMESSE oppure già in archivio.';

  const COLONNE_MOVIMENTI = [
    { campo: 'id', titolo: 'ID movimento (non modificare)', tipo: 'testo', larghezza: 20, aiuto: AIUTO_ID },
    { campo: 'codice', titolo: 'Codice commessa', tipo: 'testo', obbligatoria: true, larghezza: 16, maiuscolo: true, aiuto: AIUTO_CODICE_REG },
    {
      campo: 'data', titolo: 'Data movimento', tipo: 'data', obbligatoria: true, larghezza: 16,
      aiuto: 'Obbligatoria e sempre dentro l\'esercizio in gestione: i valori degli anni precedenti vanno nel foglio SALDI. È la data che usano tutte le dashboard temporali.'
    },
    {
      campo: 'tipo', titolo: 'Tipo movimento', tipo: 'elenco', opzioni: () => Engine.TIPI_MOVIMENTO, obbligatoria: true, larghezza: 24,
      aiuto: 'Obbligatorio, uno dei valori del foglio ELENCHI. Dice quali valori ci si aspetta di trovare compilati nella riga.'
    },
    { campo: 'numeroDocumento', titolo: 'Numero documento', tipo: 'testo', larghezza: 18, aiuto: 'Numero del SAL, della fattura o del documento che origina il movimento.' },
    { campo: 'descrizione', titolo: 'Descrizione', tipo: 'testoLungo', larghezza: 36, aiuto: 'Testo libero: che cosa registra il movimento.' },
    { campo: 'sal', titolo: 'SAL maturato (€)', tipo: 'euro', larghezza: 16, aiuto: 'Lavoro maturato con questo evento, non il cumulativo della commessa.' },
    { campo: 'fatturatoLordo', titolo: 'Fatturato lordo (€)', tipo: 'euro', larghezza: 16, aiuto: 'Importo fatturato al lordo della ritenuta a garanzia.' },
    { campo: 'ritenuta', titolo: 'Ritenuta maturata (€)', tipo: 'euro', larghezza: 18, aiuto: 'Ritenuta a garanzia trattenuta su questa fattura.' },
    { campo: 'svincolo', titolo: 'Svincolo ritenuta (€)', tipo: 'euro', larghezza: 18, aiuto: 'Quota di ritenuta svincolata con questo evento.' },
    { campo: 'ore', titolo: 'Ore effettive', tipo: 'ore', larghezza: 14, aiuto: 'Ore di manodopera impiegate nel periodo del movimento.' },
    { campo: 'perditaSal', titolo: 'Perdita SAL accettata (€)', tipo: 'euro', larghezza: 20, aiuto: 'Quota di SAL che non verrà mai fatturata, accettata come perdita.' },
    { campo: 'note', titolo: 'Note movimento', tipo: 'testoLungo', larghezza: 30, aiuto: 'Testo libero sul movimento.' }
  ];

  const COLONNE_COSTI = [
    { campo: 'id', titolo: 'ID costo (non modificare)', tipo: 'testo', larghezza: 20, aiuto: AIUTO_ID.replace('un movimento nuovo', 'un costo nuovo') },
    { campo: 'codice', titolo: 'Codice commessa', tipo: 'testo', obbligatoria: true, larghezza: 16, maiuscolo: true, aiuto: AIUTO_CODICE_REG },
    {
      campo: 'data', titolo: 'Data costo', tipo: 'data', obbligatoria: true, larghezza: 16,
      aiuto: 'Obbligatoria e sempre dentro l\'esercizio in gestione: i costi degli anni precedenti vanno nel foglio SALDI.'
    },
    {
      campo: 'macroCategoria', titolo: 'Macro-categoria', tipo: 'testo', larghezza: 26, elencoSuggerito: 'macroCategorie',
      aiuto: 'Testo libero. Nel foglio ELENCHI ci sono le macro-categorie già in uso: usare le stesse evita doppioni. Una categoria nuova viene aggiunta all\'elenco del programma.'
    },
    { campo: 'descrizione', titolo: 'Descrizione', tipo: 'testoLungo', larghezza: 36, aiuto: 'Testo libero: che cosa è stato acquistato o commissionato.' },
    {
      campo: 'importo', titolo: 'Importo (€)', tipo: 'euro', obbligatoria: true, larghezza: 16,
      aiuto: 'Obbligatorio. Costo effettivo puro: nessun margine, nessun ricarico.'
    },
    { campo: 'fornitore', titolo: 'Fornitore / Documento', tipo: 'testo', larghezza: 26, aiuto: 'Chi ha emesso il documento e, se serve, il suo numero.' },
    { campo: 'note', titolo: 'Note costo', tipo: 'testoLungo', larghezza: 30, aiuto: 'Testo libero sul costo.' }
  ];
  // campi scritti nell'archivio: fuori 'id' (chiave tecnica) e 'codice' (diventa commessaId)
  const CAMPI_MOVIMENTO = COLONNE_MOVIMENTI.filter(c => c.campo !== 'id' && c.campo !== 'codice').map(c => c.campo);
  const CAMPI_COSTO = COLONNE_COSTI.filter(c => c.campo !== 'id' && c.campo !== 'codice').map(c => c.campo);

  const CAMPI_ANAGRAFICA = COLONNE.filter(c => c.campo.indexOf('.') < 0 && c.campo !== 'aggiornatoAl' && c.campo !== 'noteAzione').map(c => c.campo);
  const CAMPI_BUDGET = ['orePreviste', 'costiDirettiPrevisti', 'orePrevisteAgg', 'costiDirettiPrevistiAgg', 'dataAggiornamento', 'note'];
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
  function dataItaliana(iso) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : String(iso || '');
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
    'sostenibilita.ricarico': ['ricarico'],
    'sostenibilita.datiVerificati': ['dativerificati'],
    'sostenibilita.data': ['datadellaverifica', 'dataverifica']
  };
  // Nel foglio SALDI "commessa" da sola non vale come codice: nel vecchio file Excel intesta il
  // riquadro dei totali, che finirebbe scambiato per la riga dei titoli.
  const ALIAS_SALDI = {
    codice: ['codice', 'codicecommessa'],
    dataSaldo: ['datasaldo', 'data', 'saldoal', 'al'],
    sal: ['sal', 'salmaturato'],
    ritenute: ['ritenute', 'ritenutematurate'],
    svincoli: ['svincoli', 'ritenutesvincolate'],
    perditeSal: ['perditesal', 'perditesalaccettate'],
    ore: ['ore', 'oreeffettive'],
    note: ['note', 'notesaldo']
  };
  const ALIAS_MOVIMENTI = {
    id: ['id', 'idmovimento'],
    codice: ['codice', 'codicecommessa', 'commessa'],
    data: ['data', 'datamovimento'],
    tipo: ['tipo', 'tipomovimento'],
    numeroDocumento: ['ndoc', 'ndocumento', 'numerodocumento', 'documento'],
    sal: ['sal', 'salmaturato'],
    fatturatoLordo: ['fatturatolordo', 'fattlordo'],
    ritenuta: ['ritenuta', 'ritenutamaturata'],
    svincolo: ['svincolo', 'svincoloritenuta'],
    ore: ['ore', 'oreeffettive'],
    perditaSal: ['perditasal', 'perditasalaccettata'],
    note: ['note', 'notemovimento']
  };
  const ALIAS_COSTI = {
    id: ['id', 'idcosto'],
    codice: ['codice', 'codicecommessa', 'commessa'],
    data: ['data', 'datacosto'],
    macroCategoria: ['macrocategoria', 'categoria', 'macrocategoriadaanalisi'],
    importo: ['importo', 'costo'],
    fornitore: ['fornitore', 'fornitoredocumento'],
    note: ['note', 'notecosto']
  };

  // Le due configurazioni con cui lo stesso codice scrive e rilegge i fogli MOVIMENTI e COSTI:
  // cambiano le colonne, i controlli e la firma con cui si riconosce un doppione, non il meccanismo.
  function numeroFirma(v) { const n = Number(v); return (v === null || v === undefined || v === '' || isNaN(n)) ? 0 : n; }
  function testoFirma(v) { return String(v === null || v === undefined ? '' : v).trim().toUpperCase(); }
  const REGISTRAZIONI = {
    movimenti: {
      foglio: FOGLIO_MOVIMENTI, archivio: 'movimenti', colonne: COLONNE_MOVIMENTI, alias: ALIAS_MOVIMENTI, campi: CAMPI_MOVIMENTO,
      nome: 'movimento', articolo: 'il movimento', unNuovo: 'un movimento nuovo',
      nuovo: () => Schema.nuovoMovimento(),
      // Senza riga calcolata: il controllo sulle ritenute svincolate oltre quelle maturate ha senso
      // su una registrazione alla volta, non su un file che le porta dentro tutte insieme.
      valida: (m, dbFinto) => Engine.validaMovimento(m, dbFinto, null),
      firma: m => [m.commessaId, m.data, m.tipo, testoFirma(m.numeroDocumento), testoFirma(m.descrizione),
        numeroFirma(m.sal), numeroFirma(m.fatturatoLordo), numeroFirma(m.ritenuta), numeroFirma(m.svincolo),
        numeroFirma(m.ore), numeroFirma(m.perditaSal)].join('|'),
      tendine: [{ campo: 'tipo', elenco: 6, messaggio: 'Scegliere un tipo fra quelli elencati nel foglio ELENCHI.' }]
    },
    costi: {
      foglio: FOGLIO_COSTI, archivio: 'costi', colonne: COLONNE_COSTI, alias: ALIAS_COSTI, campi: CAMPI_COSTO,
      nome: 'costo diretto', articolo: 'il costo', unNuovo: 'un costo nuovo',
      nuovo: () => Schema.nuovoCosto(),
      valida: (k, dbFinto) => Engine.validaCosto(k, dbFinto),
      firma: k => [k.commessaId, k.data, testoFirma(k.macroCategoria), testoFirma(k.descrizione),
        numeroFirma(k.importo), testoFirma(k.fornitore)].join('|'),
      tendine: []
    }
  };

  function indiceIntestazioni(colonne, alias) {
    const idx = {};
    colonne.forEach(c => {
      const aggiungi = t => { const n = normalizza(t); if (n && !idx[n]) idx[n] = c; };
      aggiungi(c.titolo);
      aggiungi(c.titolo.replace(/\s*\*\s*$/, ''));
      aggiungi(c.campo);
      aggiungi(c.campo.split('.').pop());
      ((alias || {})[c.campo] || []).forEach(a => { if (!idx[a]) idx[a] = c; });
    });
    return idx;
  }
  // Riga dei titoli: la prima, fra le prime 12, che riconosce almeno `minime` colonne del modello e
  // tutte quelle indicate in `richieste`. Così un titolo o un riquadro di totali messo sopra la
  // tabella non manda all'aria la lettura.
  function trovaTestata(righe, idx, minime, richieste) {
    for (let i = 0; i < Math.min(righe.length, 12); i++) {
      const m = righe[i].map(c => idx[normalizza(Xlsx.testo(c))] || null);
      const trovate = m.filter(x => x);
      if (trovate.length < minime) continue;
      if ((richieste || []).some(campo => !trovate.some(c => c.campo === campo))) continue;
      return { indice: i, mappa: m };
    }
    return null;
  }
  // Colonne del modello riconosciute nella riga dei titoli e intestazioni estranee, che vengono ignorate.
  function colonneDellaTestata(riga, mappa) {
    const trovate = [], ignorate = [];
    riga.forEach((c, j) => {
      const t = Xlsx.testo(c).trim();
      if (mappa[j]) trovate.push(mappa[j]);
      else if (t) ignorate.push(t);
    });
    return { trovate, ignorate };
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
      { titolo: 'Preposti (suggerimenti)', valori: (L.preposti || []).slice() },
      { titolo: 'Tipo movimento', valori: Engine.TIPI_MOVIMENTO.slice() },
      { titolo: 'Macro-categorie di costo (suggerimenti)', valori: (L.macroCategorie || []).slice() }
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

  function istruzioniModello(db) {
    const annoGestione = (db && db.parametri && db.parametri.annoGestione) || new Date().getFullYear();
    const nota = t => [{ v: t, s: 'nota' }];
    const tabellaColonne = (titolo, colonne) => {
      righe.push([]);
      righe.push([{ v: titolo, s: 'grassetto' }]);
      righe.push([{ v: 'Colonna', s: 'testata' }, { v: 'Obbligatoria', s: 'testata' }, { v: 'Formato', s: 'testata' }, { v: 'A cosa serve', s: 'testata' }]);
      colonne.forEach(c => righe.push([
        { v: c.titolo, s: 'testo' },
        { v: c.obbligatoria ? 'SI' : '', s: 'testo' },
        { v: formatoDi(c), s: 'testo' },
        { v: c.aiuto || '', s: 'testo' }
      ]));
    };
    const righe = [
      [{ v: 'FIDA EDILE – Modello per l\'importazione delle commesse', s: 'titolo' }],
      nota('Ci sono quattro fogli da compilare: COMMESSE (una riga per ogni commessa), SALDI (i valori cumulativi al 31/12 degli anni precedenti), MOVIMENTI e COSTI (le registrazioni dell\'esercizio ' + annoGestione + '). Si compilano solo i fogli che servono: quelli lasciati vuoti vengono ignorati. Il foglio ELENCHI contiene i valori ammessi e i suggerimenti; questo foglio è solo una guida e non viene letto dal programma.'),
      [],
      [{ v: 'Come si compila il foglio COMMESSE', s: 'grassetto' }],
      nota('1. Una riga = una commessa. Le commesse possono essere quante si vuole: basta aggiungere righe.'),
      nota('2. Il CODICE COMMESSA è la chiave. Se il codice non esiste in anagrafica viene creata una nuova commessa; se esiste, quella commessa viene aggiornata.'),
      nota('3. In aggiornamento le celle lasciate vuote non cancellano nulla: restano i valori già presenti nel programma.'),
      nota('4. Non modificare i titoli della riga 1: servono a riconoscere le colonne. L\'ordine delle colonne può invece cambiare e le colonne che non servono si possono eliminare.'),
      nota('5. Le colonne con l\'intestazione arancione sono obbligatorie per creare una nuova commessa.'),
      nota('6. Date in formato gg/mm/aaaa. Importi in euro senza simbolo. Ricarico in percentuale: scrivere 15 per 15 %.'),
      nota('7. I valori calcolati dal programma non si inseriscono qui: contratto aggiornato, costo ore, margine teorico, allerte ed esito della verifica di sostenibilità si ricavano da soli.'),
      nota('8. Restano fuori da questo modello le fasi del cronoprogramma (Gantt), che si disegnano dentro il programma. Movimenti e costi diretti hanno invece i loro fogli, più avanti in questo file.'),
      nota('9. Salvare il file in formato .xlsx e caricarlo dal programma: menu Gestione → Importa da Excel.'),
      [],
      [{ v: 'Come si compila il foglio SALDI', s: 'grassetto' }],
      nota('1. Serve solo per le commesse PREGRESSE, cioè iniziate prima dell\'esercizio in gestione: porta dentro quello che avevano già maturato. Le commesse partite nell\'esercizio in gestione non hanno saldo iniziale, i loro valori arrivano da movimenti e costi.'),
      nota('2. Una riga = una commessa a una data di saldo. La DATA SALDO è sempre un 31 dicembre: il saldo al 31/12/' + (annoGestione - 1) + ' è il saldo iniziale dell\'esercizio ' + annoGestione + '.'),
      nota('3. Per caricare più anni della stessa commessa si ripete il codice su più righe con date diverse: 31/12/' + (annoGestione - 2) + ', 31/12/' + (annoGestione - 1) + ' e così via. La coppia codice + data non si può ripetere.'),
      nota('4. I valori sono CUMULATIVI dall\'inizio della commessa fino a quella data, non i movimenti del singolo anno.'),
      nota('5. Il codice deve esistere: o è una commessa già in archivio, o è una commessa del foglio COMMESSE di questo stesso file. La commessa deve essere iniziata prima del 1° gennaio dell\'anno successivo alla data del saldo.'),
      nota('6. Solo il saldo al 31/12/' + (annoGestione - 1) + ' entra nei cumulativi dell\'esercizio ' + annoGestione + ': le date più vecchie si caricano come storico e vengono segnalate con un avviso, non bloccante.'),
      nota('7. Se la coppia codice + data esiste già nel programma il saldo viene aggiornato, non duplicato. Le celle vuote non cancellano nulla.'),
      nota('8. Se il foglio SALDI resta vuoto (o si elimina) viene semplicemente ignorato: si importano solo le commesse.'),
      [],
      [{ v: 'Come si compilano i fogli MOVIMENTI e COSTI', s: 'grassetto' }],
      nota('1. Sono le registrazioni dell\'esercizio in gestione: una riga = un evento datato di una commessa. MOVIMENTI porta SAL, fatturato, ritenute, svincoli, ore e perdite; COSTI porta i costi diretti (costo effettivo puro, senza margini).'),
      nota('2. La DATA deve cadere nell\'esercizio ' + annoGestione + '. Quello che è maturato negli anni precedenti non si registra qui: va nel foglio SALDI, in forma cumulativa.'),
      nota('3. Il CODICE COMMESSA collega la riga alla sua commessa: o è già in archivio, o è una commessa del foglio COMMESSE di questo stesso file.'),
      nota('4. Attenzione alla differenza con gli altri fogli: qui NON c\'è una chiave che riconosce la riga, perché la stessa commessa può avere due registrazioni identiche nello stesso giorno. Ogni riga con la colonna ID vuota crea sempre una registrazione NUOVA.'),
      nota('5. Per correggere una registrazione già in archivio si usa la colonna ID, che il programma scrive quando il modello si scarica già compilato: si cambiano le celle da correggere e si ricarica il file. L\'ID non si inventa e non si modifica.'),
      nota('6. Se una riga nuova ripete una registrazione già presente (stessa commessa, data, valori) compare un avviso: serve a non raddoppiare i valori ricaricando due volte lo stesso file. Se la ripetizione è voluta si importa lo stesso.'),
      nota('7. Nel foglio MOVIMENTI il TIPO dice quali valori ci si aspetta: SAL, FATTURA, SAL + FATTURA, SVINCOLO RITENUTA, ORE, PERDITA SAL ACCETTATA, ALTRO. Compilare i valori che non riguardano il tipo scelto non blocca l\'importazione, ma viene segnalato.'),
      nota('8. Gli importi sono quelli del singolo evento, non i cumulativi della commessa: il programma somma da sé.'),
      nota('9. Anche questi fogli, se restano vuoti o si eliminano, vengono semplicemente ignorati.')
    ];
    tabellaColonne('Colonne del foglio COMMESSE', COLONNE);
    tabellaColonne('Colonne del foglio SALDI', COLONNE_SALDI);
    tabellaColonne('Colonne del foglio MOVIMENTI', COLONNE_MOVIMENTI);
    tabellaColonne('Colonne del foglio COSTI', COLONNE_COSTI);
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

  // Foglio SALDI del modello. Con `commesse` valorizzato esce già compilato con i saldi in archivio
  // delle sole commesse esportate, in ordine di codice e di data: il file torna indietro aggiornabile.
  function foglioSaldi(db, commesse) {
    const intestazione = COLONNE_SALDI.map(c => ({ v: c.titolo + (c.obbligatoria ? ' *' : ''), s: c.obbligatoria ? 'testataObbligatoria' : 'testata' }));
    const righe = [intestazione];
    if (commesse && commesse.length) {
      const perId = {};
      commesse.forEach(c => { perId[c.id] = c; });
      (db && db.saldi ? db.saldi : []).filter(s => !s.annullato && perId[s.commessaId])
        .map(s => ({ saldo: s, codice: perId[s.commessaId].codice || '', data: Engine.dataSaldo(Number(s.anno)) }))
        .sort((a, b) => String(a.codice).localeCompare(String(b.codice), 'it') || String(a.data).localeCompare(String(b.data)))
        .forEach(x => righe.push(COLONNE_SALDI.map(col => {
          if (col.campo === 'codice') return x.codice;
          if (col.campo === 'dataSaldo') return { v: x.data, s: 'data' };
          const v = x.saldo[col.campo];
          return (v === null || v === undefined) ? '' : v;
        })));
    }
    return {
      nome: FOGLIO_SALDI,
      colonne: COLONNE_SALDI.map(c => ({ larghezza: c.larghezza || 18, stile: stileColonna(c) })),
      congelaRighe: 1,
      filtro: true,
      righe
    };
  }

  // Fogli MOVIMENTI e COSTI del modello. Con `commesse` valorizzato escono già compilati con le
  // registrazioni in archivio delle sole commesse esportate, ciascuna con il suo ID: così il file
  // che torna indietro le aggiorna invece di aggiungerne di nuove.
  function foglioRegistrazioni(cfg, db, commesse, elenchi) {
    const intestazione = cfg.colonne.map(c => ({ v: c.titolo + (c.obbligatoria ? ' *' : ''), s: c.obbligatoria ? 'testataObbligatoria' : 'testata' }));
    const righe = [intestazione];
    if (commesse && commesse.length) {
      const perId = {};
      commesse.forEach(c => { perId[c.id] = c; });
      (db && db[cfg.archivio] ? db[cfg.archivio] : []).filter(x => !x.annullato && perId[x.commessaId])
        .map(x => ({ reg: x, codice: perId[x.commessaId].codice || '' }))
        .sort((a, b) => String(a.codice).localeCompare(String(b.codice), 'it') || String(a.reg.data).localeCompare(String(b.reg.data)))
        .forEach(x => righe.push(cfg.colonne.map(col => {
          if (col.campo === 'codice') return x.codice;
          const v = x.reg[col.campo];
          if (v === null || v === undefined || v === '') return '';
          return col.tipo === 'data' ? { v, s: 'data' } : v;
        })));
    }
    const validazioni = [];
    (cfg.tendine || []).forEach(t => {
      const i = cfg.colonne.findIndex(c => c.campo === t.campo);
      if (i < 0 || elenchi.vuota(t.elenco)) return;
      validazioni.push({ colonna: i, da: 2, a: Math.max(RIGHE_MODELLO, righe.length), origine: elenchi.riferimento(t.elenco), messaggio: t.messaggio });
    });
    return {
      nome: cfg.foglio,
      colonne: cfg.colonne.map(c => ({ larghezza: c.larghezza || 18, stile: stileColonna(c) })),
      congelaRighe: 1,
      filtro: true,
      righe,
      validazioni
    };
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
      istruzioniModello(db),
      {
        nome: FOGLIO_DATI,
        colonne: COLONNE.map(c => ({ larghezza: c.larghezza || 18, stile: stileColonna(c) })),
        congelaRighe: 1,
        filtro: true,
        righe,
        validazioni
      },
      foglioSaldi(db, commesse),
      foglioRegistrazioni(REGISTRAZIONI.movimenti, db, commesse, elenchi),
      foglioRegistrazioni(REGISTRAZIONI.costi, db, commesse, elenchi),
      elenchi.foglio
    ];
  }

  // ---------------------------------------------------------------- lettura di un file compilato
  // cartella: risultato di Xlsx.leggi(). db: l'archivio attuale (non viene modificato).
  function prepara(cartella, db) {
    // Il foglio delle commesse è quello che si chiama COMMESSE; se non c'è, il primo foglio che non
    // sia uno degli altri del modello (un file vecchio può avere un altro nome).
    const altri = [FOGLIO_SALDI, FOGLIO_MOVIMENTI, FOGLIO_COSTI, FOGLIO_ELENCHI, FOGLIO_ISTRUZIONI];
    const primo = cartella.fogli.find(f => altri.indexOf(f.nome) < 0);
    const righe = cartella.foglio(FOGLIO_DATI) || (primo ? primo.righe : null);
    const testata = righe && righe.length ? trovaTestata(righe, indiceIntestazioni(COLONNE, ALIAS), 3) : null;

    // copia di lavoro delle commesse: serve a riconoscere i duplicati anche fra righe dello stesso file
    const lavoro = (db.commesse || []).map(c => JSON.parse(JSON.stringify(c)));
    const dbFinto = { commesse: lavoro, parametri: db.parametri };
    const perCodice = {};
    lavoro.forEach(c => { if (!c.annullato) perCodice[String(c.codice || '').trim().toUpperCase()] = c; });
    const daQuestoFile = {};

    // Senza foglio COMMESSE leggibile non si buttano via gli altri fogli: un file può portare solo
    // saldi, movimenti o costi di commesse già in archivio. L'errore diventa bloccante più sotto,
    // se non c'è proprio nulla da leggere.
    if (!testata) {
      const senzaCommesse = {
        errore: righe && righe.length
          ? 'Nel foglio "' + FOGLIO_DATI + '" non si riconosce la riga dei titoli.'
          : 'Il file non contiene il foglio "' + FOGLIO_DATI + '".',
        colonneTrovate: [], colonneIgnorate: [], colonneMancantiObbligatorie: [],
        rigaTestata: 0, esiti: [], nNuove: 0, nAggiornate: 0, nInvariate: 0, nScartate: 0, nAvvisi: 0,
        saldi: preparaSaldi(cartella, db, dbFinto, perCodice),
        movimenti: preparaRegistrazioni(REGISTRAZIONI.movimenti, cartella, db, dbFinto, perCodice),
        costi: preparaRegistrazioni(REGISTRAZIONI.costi, cartella, db, dbFinto, perCodice)
      };
      if (!senzaCommesse.saldi.presente && !senzaCommesse.movimenti.presente && !senzaCommesse.costi.presente) {
        throw new Error(senzaCommesse.errore + ' Scaricare di nuovo il modello e ricopiarci i dati senza cambiare le intestazioni.');
      }
      return senzaCommesse;
    }
    const iTestata = testata.indice, mappa = testata.mappa;

    const { trovate, ignorate } = colonneDellaTestata(righe[iTestata], mappa);
    const mancantiObbligatorie = COLONNE.filter(c => c.obbligatoria && trovate.indexOf(c) < 0);

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
      errore: '',
      colonneTrovate: trovate, colonneIgnorate: ignorate, colonneMancantiObbligatorie: mancantiObbligatorie,
      rigaTestata: iTestata + 1,
      esiti,
      nNuove: conta('NUOVA'), nAggiornate: conta('AGGIORNA'), nInvariate: conta('INVARIATA'), nScartate: conta('SCARTATA'),
      nAvvisi: esiti.filter(x => x.esito !== 'SCARTATA' && x.avvisi.length).length,
      saldi: preparaSaldi(cartella, db, dbFinto, perCodice),
      movimenti: preparaRegistrazioni(REGISTRAZIONI.movimenti, cartella, db, dbFinto, perCodice),
      costi: preparaRegistrazioni(REGISTRAZIONI.costi, cartella, db, dbFinto, perCodice)
    };
  }

  // ---------------------------------------------------------------- foglio SALDI
  // Si legge dopo le commesse, sulla stessa copia di lavoro: così un saldo può riferirsi a una
  // commessa creata dallo stesso file. Le righe di commessa scartate non entrano nella copia, quindi
  // i loro saldi risultano senza commessa e vengono scartati a loro volta, con il motivo scritto.
  function preparaSaldi(cartella, db, dbCommesse, perCodice) {
    const vuoto = {
      presente: false, rigaTestata: 0, errore: '',
      colonneTrovate: [], colonneIgnorate: [], colonneMancantiObbligatorie: [],
      esiti: [], nNuovi: 0, nAggiornati: 0, nInvariati: 0, nScartati: 0, nAvvisi: 0
    };
    const righe = cartella.foglio(FOGLIO_SALDI);
    if (!righe || !righe.length) return vuoto;

    const testata = trovaTestata(righe, indiceIntestazioni(COLONNE_SALDI, ALIAS_SALDI), 3, ['codice', 'dataSaldo']);
    if (!testata) {
      return Object.assign(vuoto, {
        presente: true,
        errore: 'Nel foglio "' + FOGLIO_SALDI + '" non si riconosce la riga dei titoli: servono almeno le colonne "' +
          COLONNE_SALDI[0].titolo + '" e "' + COLONNE_SALDI[1].titolo + '". I saldi non vengono importati; le commesse sì.'
      });
    }
    const iTestata = testata.indice, mappa = testata.mappa;
    const { trovate, ignorate } = colonneDellaTestata(righe[iTestata], mappa);

    // copia di lavoro dei saldi: riconosce i doppioni anche fra righe dello stesso file
    const lavoro = (db.saldi || []).map(s => JSON.parse(JSON.stringify(s)));
    const dbFinto = { commesse: dbCommesse.commesse, saldi: lavoro, parametri: db.parametri };
    const daQuestoFile = {};
    const esiti = [];

    for (let i = iTestata + 1; i < righe.length; i++) {
      const riga = righe[i];
      const numero = i + 1;
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
      });
      if (!compilata) continue; // riga vuota: si salta senza segnalare nulla

      // commessa: dal codice, fra quelle in archivio e quelle create da questo stesso file
      const codice = String(valori.codice || '').trim().toUpperCase();
      const commessa = codice ? (perCodice[codice] || null) : null;
      if (!codice) errori.push('Codice commessa: obbligatorio, senza codice il saldo non si può importare.');
      else if (!commessa) errori.push('Codice commessa: "' + codice + '" non esiste in archivio e non viene creato da questo file (o la sua riga nel foglio ' + FOGLIO_DATI + ' è stata scartata).');

      // data del saldo: sempre un 31 dicembre. L'esercizio del saldo è l'anno successivo.
      const data = valori.dataSaldo || '';
      let anno = null;
      if (!data) errori.push('Data saldo: obbligatoria. Scrivere il 31 dicembre dell\'anno cui si riferiscono i valori (es. 31/12/2025).');
      else if (data.slice(5) !== '12-31') errori.push('Data saldo: "' + dataItaliana(data) + '" non è un 31 dicembre. I saldi sono cumulativi di fine anno: usare 31/12/' + data.slice(0, 4) + '.');
      else anno = Number(data.slice(0, 4)) + 1;

      // una commessa chiusa in via definitiva non genera più saldi dall'esercizio della chiusura in poi
      if (commessa && anno && commessa.chiusuraDefinitiva && anno > Number(commessa.chiusuraDefinitiva.anno)) {
        errori.push('La commessa "' + codice + '" è stata chiusa in via definitiva con l\'esercizio ' + commessa.chiusuraDefinitiva.anno + ': dal ' + dataItaliana(Engine.dataSaldo(Number(commessa.chiusuraDefinitiva.anno) + 1)) + ' non ha più saldi iniziali.');
      }

      const chiave = codice + '|' + anno;
      let esistente = null;
      if (codice && anno) {
        if (daQuestoFile[chiave]) errori.push('Il saldo al ' + dataItaliana(data) + ' della commessa "' + codice + '" compare già alla riga ' + daQuestoFile[chiave] + ' di questo file.');
        else esistente = lavoro.find(s => !s.annullato && s.commessaId === (commessa ? commessa.id : null) && Number(s.anno) === anno) || null;
      }

      // in aggiornamento le celle vuote non cancellano nulla, come nel foglio COMMESSE
      const base = esistente ? JSON.parse(JSON.stringify(esistente)) : Schema.nuovoSaldo(anno);
      base.anno = anno;
      base.commessaId = commessa ? commessa.id : '';
      CAMPI_SALDO.forEach(f => { if (valori[f] !== undefined) base[f] = valori[f]; });

      if (commessa && anno) {
        const v = Engine.validaSaldo(base, dbFinto, esistente ? esistente.id : null);
        v.errori.forEach(e => errori.push(e));
        v.avvisi.forEach(a => avvisi.push(a));
      }

      const modifiche = esistente ? differenze(esistente, base, CAMPI_SALDO) : [];
      const esito = errori.length ? 'SCARTATO' : (esistente ? (modifiche.length ? 'AGGIORNA' : 'INVARIATO') : 'NUOVO');
      if (!errori.length) {
        daQuestoFile[chiave] = numero;
        if (esistente) Object.assign(esistente, JSON.parse(JSON.stringify(base)));
        else lavoro.push(base);
      }
      esiti.push({
        riga: numero, esito, codice: codice || '(senza codice)',
        dataSaldo: data, anno,
        etichetta: commessa ? Engine.etichetta(commessa) : '',
        saldoId: esistente ? esistente.id : null,
        commessaId: commessa ? commessa.id : '',
        saldo: base, valori, modifiche, errori, avvisi
      });
    }

    const conta = e => esiti.filter(x => x.esito === e).length;
    return {
      presente: true, errore: '',
      colonneTrovate: trovate, colonneIgnorate: ignorate,
      colonneMancantiObbligatorie: COLONNE_SALDI.filter(c => c.obbligatoria && trovate.indexOf(c) < 0),
      rigaTestata: iTestata + 1,
      esiti,
      nNuovi: conta('NUOVO'), nAggiornati: conta('AGGIORNA'), nInvariati: conta('INVARIATO'), nScartati: conta('SCARTATO'),
      nAvvisi: esiti.filter(x => x.esito !== 'SCARTATO' && x.avvisi.length).length
    };
  }

  // ---------------------------------------------------------------- fogli MOVIMENTI e COSTI
  // Stesso meccanismo per i due fogli, che cambiano solo nelle colonne e nei controlli (REGISTRAZIONI).
  // Si leggono dopo le commesse, sulla stessa copia di lavoro: così una registrazione può riferirsi a
  // una commessa creata dallo stesso file, e le righe di commessa scartate si portano dietro le loro.
  //
  // Differenza sostanziale dagli altri fogli: qui non esiste una chiave naturale, perché la stessa
  // commessa può avere due registrazioni identiche nello stesso giorno. Vale quindi la colonna ID:
  // compilata (l'ha scritta il programma) aggiorna quella registrazione, vuota ne crea sempre una
  // nuova. Perché ricaricare due volte lo stesso file non raddoppi i valori senza dirlo, le righe
  // nuove identiche a una registrazione già presente sono segnalate con un avviso.
  function preparaRegistrazioni(cfg, cartella, db, dbCommesse, perCodice) {
    const vuoto = {
      presente: false, rigaTestata: 0, errore: '',
      colonneTrovate: [], colonneIgnorate: [], colonneMancantiObbligatorie: [],
      esiti: [], nNuovi: 0, nAggiornati: 0, nInvariati: 0, nScartati: 0, nAvvisi: 0, nDoppi: 0
    };
    const righe = cartella.foglio(cfg.foglio);
    if (!righe || !righe.length) return vuoto;

    const colCodice = cfg.colonne.find(c => c.campo === 'codice');
    const colData = cfg.colonne.find(c => c.campo === 'data');
    const testata = trovaTestata(righe, indiceIntestazioni(cfg.colonne, cfg.alias), 3, ['codice', 'data']);
    if (!testata) {
      return Object.assign(vuoto, {
        presente: true,
        errore: 'Nel foglio "' + cfg.foglio + '" non si riconosce la riga dei titoli: servono almeno le colonne "' +
          colCodice.titolo + '" e "' + colData.titolo + '". Questo foglio non viene importato; gli altri sì.'
      });
    }
    const iTestata = testata.indice, mappa = testata.mappa;
    const { trovate, ignorate } = colonneDellaTestata(righe[iTestata], mappa);

    // copia di lavoro dell'archivio: riconosce gli ID e i doppioni anche fra righe dello stesso file
    const lavoro = (db[cfg.archivio] || []).map(x => JSON.parse(JSON.stringify(x)));
    const dbFinto = { commesse: dbCommesse.commesse, parametri: db.parametri };
    dbFinto[cfg.archivio] = lavoro;
    const inArchivio = {};
    lavoro.forEach(x => { if (!x.annullato) inArchivio[cfg.firma(x)] = true; });

    const idDaQuestoFile = {}, firmaDaQuestoFile = {};
    const esiti = [];

    for (let i = iTestata + 1; i < righe.length; i++) {
      const riga = righe[i];
      const numero = i + 1;
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
      });
      if (!compilata) continue; // riga vuota: si salta senza segnalare nulla

      // commessa: dal codice, fra quelle in archivio e quelle create da questo stesso file
      const codice = String(valori.codice || '').trim().toUpperCase();
      const commessa = codice ? (perCodice[codice] || null) : null;
      if (!codice) errori.push('Codice commessa: obbligatorio, senza codice la riga non si può importare.');
      else if (!commessa) errori.push('Codice commessa: "' + codice + '" non esiste in archivio e non viene creato da questo file (o la sua riga nel foglio ' + FOGLIO_DATI + ' è stata scartata).');

      // ID: compilato aggiorna una registrazione esistente, vuoto ne crea sempre una nuova
      const id = String(valori.id || '').trim();
      let esistente = null;
      if (id) {
        if (idDaQuestoFile[id]) errori.push('ID: "' + id + '" compare già alla riga ' + idDaQuestoFile[id] + ' di questo file.');
        else {
          const trovato = lavoro.find(x => x.id === id) || null;
          if (!trovato) errori.push('ID: "' + id + '" non corrisponde a nessun ' + cfg.nome + ' in archivio. Per registrarne uno nuovo lasciare la cella vuota.');
          else if (trovato.annullato) errori.push('ID: ' + cfg.articolo + ' "' + id + '" è annullato e non può essere modificato.');
          else esistente = trovato;
        }
      }

      // in aggiornamento le celle vuote non cancellano nulla, come negli altri fogli
      const base = esistente ? JSON.parse(JSON.stringify(esistente)) : cfg.nuovo();
      base.commessaId = commessa ? commessa.id : '';
      cfg.campi.forEach(f => { if (valori[f] !== undefined) base[f] = valori[f]; });

      // una commessa chiusa in via definitiva è uscita dal portafoglio operativo: non accetta nuove
      // registrazioni (correggerne una già in archivio, con il suo ID, resta possibile)
      if (commessa && !esistente && commessa.chiusuraDefinitiva) {
        errori.push('La commessa "' + codice + '" è stata chiusa in via definitiva con l\'esercizio ' +
          commessa.chiusuraDefinitiva.anno + ': non accetta nuove registrazioni.');
      }

      if (commessa) {
        const v = cfg.valida(base, dbFinto);
        v.errori.forEach(e => errori.push(e));
        v.avvisi.forEach(a => avvisi.push(a));
      }

      // doppioni: solo per le righe che creano una registrazione nuova
      let doppione = false;
      const firma = commessa ? cfg.firma(base) : null;
      if (!esistente && firma) {
        if (firmaDaQuestoFile[firma]) {
          doppione = true;
          avvisi.push('Registrazione identica a quella della riga ' + firmaDaQuestoFile[firma] + ' di questo file: se non è una ripetizione voluta, eliminarne una.');
        } else if (inArchivio[firma]) {
          doppione = true;
          avvisi.push('In archivio c\'è già una registrazione identica (stessa commessa, stessa data, stessi valori): importandola i valori si sommano. ' +
            'Per correggere quella esistente indicarne l\'ID; se la ripetizione è voluta, importare pure.');
        }
      }

      const modifiche = esistente ? differenze(esistente, base, ['commessaId'].concat(cfg.campi)) : [];
      const esito = errori.length ? 'SCARTATO' : (esistente ? (modifiche.length ? 'AGGIORNA' : 'INVARIATO') : 'NUOVO');
      if (!errori.length) {
        if (id) idDaQuestoFile[id] = numero;
        if (esistente) Object.assign(esistente, JSON.parse(JSON.stringify(base)));
        else {
          lavoro.push(base);
          if (firma) firmaDaQuestoFile[firma] = numero;
        }
      }
      esiti.push({
        riga: numero, esito, codice: codice || '(senza codice)',
        data: base.data || '', doppione,
        etichetta: commessa ? Engine.etichetta(commessa) : '',
        registrazioneId: esistente ? esistente.id : null,
        commessaId: commessa ? commessa.id : '',
        registrazione: base, valori, modifiche, errori, avvisi
      });
    }

    const conta = e => esiti.filter(x => x.esito === e).length;
    return {
      presente: true, errore: '',
      colonneTrovate: trovate, colonneIgnorate: ignorate,
      colonneMancantiObbligatorie: cfg.colonne.filter(c => c.obbligatoria && trovate.indexOf(c) < 0),
      rigaTestata: iTestata + 1,
      esiti,
      nNuovi: conta('NUOVO'), nAggiornati: conta('AGGIORNA'), nInvariati: conta('INVARIATO'), nScartati: conta('SCARTATO'),
      nAvvisi: esiti.filter(x => x.esito !== 'SCARTATO' && x.avvisi.length).length,
      nDoppi: esiti.filter(x => x.esito !== 'SCARTATO' && x.doppione).length
    };
  }

  return {
    FOGLIO_DATI, FOGLIO_SALDI, FOGLIO_MOVIMENTI, FOGLIO_COSTI, FOGLIO_ELENCHI, FOGLIO_ISTRUZIONI,
    COLONNE, COLONNE_SALDI, COLONNE_MOVIMENTI, COLONNE_COSTI,
    CAMPI_ANAGRAFICA, CAMPI_BUDGET, CAMPI_SOSTENIBILITA, CAMPI_SALDO, CAMPI_MOVIMENTO, CAMPI_COSTO,
    fogliModello, prepara, differenze, normalizza, numeroDa, dataDa, leggiCella, valoreDi, imposta, oggi, formatoDi, dataItaliana
  };
});
