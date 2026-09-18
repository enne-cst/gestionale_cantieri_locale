/* FIDA EDILE – Dashboard di analisi (riservata all'amministratore)
 * Versione integrale di tutti gli indicatori. La Dashboard della Direzione (page-dashboard.js)
 * ne e' una copia ridotta: le due pagine sono indipendenti. */
(function () {
  'use strict';
  const esc = UI.esc;
  const F = { tecnico: '', preposto: '', cliente: '', stato: '', ramo: '', inizioDa: '', inizioA: '', fineDa: '', fineA: '', iniziaEntro: '', terminaEntro: '', alert: '', nonAggiornate: false, testo: '' };
  let codiceEsatto = false; // true quando il codice è stato scelto dalla tendina

  function filtra(rows) {
    const P = Store.db.parametri;
    const oggi = Engine.dayNum(Fmt.oggi());
    const limite = oggi - Engine.num(P.giorniAggiornamentoRecente);
    let r = rows.filter(x => {
      if (F.tecnico && x.tecnico !== F.tecnico) return false;
      if (F.preposto && x.preposto !== F.preposto) return false;
      if (F.cliente && x.cliente !== F.cliente) return false;
      if (F.ramo && x.ramo !== F.ramo) return false;
      if (F.stato === 'finite' ? !x.finito : (F.stato && x.stato !== F.stato)) return false;
      const inizio = x.dataInizioEffettiva || x.dataInizioPrevista;
      if (F.inizioDa && (!inizio || inizio < F.inizioDa)) return false;
      if (F.inizioA && (!inizio || inizio > F.inizioA)) return false;
      if (F.fineDa && (!x.dataFinePrevista || x.dataFinePrevista < F.fineDa)) return false;
      if (F.fineA && (!x.dataFinePrevista || x.dataFinePrevista > F.fineA)) return false;
      if (F.iniziaEntro && !(x.stato === 'Da iniziare' && x.dataInizioPrevista && x.dataInizioPrevista <= F.iniziaEntro)) return false;
      if (F.terminaEntro && !(!x.finito && x.dataFinePrevista && x.dataFinePrevista <= F.terminaEntro)) return false;
      if (F.alert === 'con' && x.alert === 'REGOLARE') return false;
      if (F.alert && F.alert !== 'con' && x.alert !== F.alert) return false;
      if (F.nonAggiornate && !(!x.aggiornatoAl || Engine.dayNum(x.aggiornatoAl) < limite)) return false;
      return true;
    });
    // ricerca solo per codice commessa: "contiene" mentre si digita, codice esatto se scelto dalla tendina
    const q = String(F.testo || '').trim().toLowerCase();
    if (!q) return r;
    return r.filter(x => codiceEsatto ? String(x.codice).toLowerCase() === q : String(x.codice).toLowerCase().includes(q));
  }

  // ------------------------------------------------------------ schede indicatore
  // Le voci con più versioni (iniziale / aggiornato / effettivo) stanno incolonnate: stessa riga, colonne affiancate.
  const euro = v => Fmt.euro(v), ore = v => Fmt.ore(v), pct = v => Fmt.pct(v);
  const rosso = v => (Fmt.isNum(v) && v < 0) ? 'rosso' : '';

  // cella null = valore non disponibile (n.d.); cella false = casella lasciata vuota
  function confronto(titolo, colonne, righe, nota) {
    const testa = '<div class="riga-et"></div>' + colonne.map(c => '<div class="col-tit">' + esc(c) + '</div>').join('');
    const corpo = righe.map(r => '<div class="riga-et"><b>' + esc(r.voce) + '</b>' + (r.nota ? '<div class="sotto piccolo">' + esc(r.nota) + '</div>' : '') + '</div>' +
      r.celle.map(c => c === false ? '<div></div>' : (c ? UI.kpi(c.et || r.voce, c.v, { colore: c.colore || '', calc: c.calc }) : '<div class="kpi vuota"><div class="et">—</div><div class="val muto">n.d.</div></div>')).join('')).join('');
    return '<div class="pannello"><h2>' + esc(titolo) + '</h2>' + (nota ? '<p class="spiegazione">' + nota + '</p>' : '') +
      '<div class="kpi-confronto col-' + colonne.length + '">' + testa + corpo + '</div></div>';
  }

  // ------------------------------------------------------------ conto unico della commessa (scheda Riepilogo)
  // Una sola tabella al posto di "Ore e costi" e "Margini". Le colonne sono le quattro situazioni di
  // interesse; le righe sono legate dai segni delle operazioni, così somma e sottrazioni si leggono a
  // colpo d'occhio. Non c'è la colonna delle didascalie: il significato di ogni numero sta dentro la sua
  // scheda, mentre le righe sono raggruppate sotto la domanda a cui rispondono.
  function contoUnico(k, opt, nota) {
    const S = Engine.parametriSostenibilita(Store.db.parametri);
    const meno = (a, b) => (Fmt.isNum(a) && Fmt.isNum(b)) ? a - b : null;
    // la verifica di sostenibilità dà, per ogni versione, il minimo sostenibile scomposto nelle stesse voci del conto.
    // `base` è il prezzo sostenibile della parte strutturale su cui è calcolata la redditività: serve a riesprimere
    // in percentuale quanta redditività si riesce davvero a coprire.
    const sv = s => (!s || s.ore === null)
      ? { prezzo: null, costi: null, costoOre: null, ore: null, redditivita: null, rientro: null, base: null }
      : { prezzo: s.prezzoMinimo, costi: s.totVoci.costoTotale, costoOre: s.strutturale.costo, ore: s.ore, redditivita: s.strutturale.redditivita, rientro: s.strutturale.rientro, base: s.strutturale.conRedditivita };
    const sIni = sv(opt.sostIni), sAgg = sv(opt.sostAgg), sCons = sv(opt.sostCons);
    const dataAgg = k.budgetAggiornatoAlMax;

    // ogni colonna è un conto completo: risultato e avanzi si ricavano dalle righe che li precedono
    const chiudi = c => {
      c.risultato = meno(meno(c.totale, c.costi), c.costoOre);
      c.avanzo = meno(c.risultato, c.redditivita);
      c.resta = meno(c.avanzo, c.rientro);
      // quanta redditività e quanto rientro si riesce davvero a coprire, espressi nell'unità del parametro
      // impostato in Parametri: la redditività in percentuale, il rientro bancario in euro all'ora.
      // Sono la vecchia copertura (da 0 a 100) riportata sulla scala del valore desiderato.
      c.copRedditivita = (Fmt.isNum(c.risultato) && c.base > 0) ? c.risultato / c.base : null;
      c.copRientro = (Fmt.isNum(c.avanzo) && c.oreSost > 0) ? c.avanzo / c.oreSost : null;
      return c;
    };
    const colonne = [
      chiudi({
        titolo: 'Previsto iniziale',
        etPrezzo: 'Contratto iniziale', prezzo: k.contrattoIniziale,
        integrazioni: null, notaIntegrazioni: 'nessuna: è il punto di partenza',
        perdite: null, notaPerdite: 'nessuna: è il punto di partenza',
        etTotale: 'Prezzo iniziale al cliente', totale: k.contrattoIniziale,
        etCosti: 'Costi diretti previsti iniziali', costi: k.costiBudgetIni,
        etOre: 'Ore previste iniziali', etCostoOre: 'Costo delle ore previste iniziali', costoOre: k.costoOrePrevisteIni, ore: k.oreBudgetIni,
        redditivita: sIni.redditivita, rientro: sIni.rientro, base: sIni.base, oreSost: sIni.ore
      }),
      // il minimo sostenibile è quello della verifica INIZIALE: fa da metro alla colonna che la precede
      chiudi({
        titolo: 'Minimo sostenibile iniziale',
        etPrezzo: 'Prezzo minimo dall\'analisi iniziale', prezzo: sIni.prezzo,
        integrazioni: null, notaIntegrazioni: 'non previste dal modello',
        perdite: null, notaPerdite: 'non previste dal modello',
        etTotale: 'Prezzo minimo sostenibile', totale: sIni.prezzo,
        etCosti: 'Costi specifici al costo', costi: sIni.costi,
        etOre: 'Ore della verifica iniziale', etCostoOre: 'Costo strutturale delle ore', costoOre: sIni.costoOre, ore: sIni.ore,
        redditivita: sIni.redditivita, rientro: sIni.rientro, base: sIni.base, oreSost: sIni.ore
      }),
      chiudi({
        titolo: dataAgg ? 'Alla data del ' + Fmt.data(dataAgg) : 'Alla data (budget mai aggiornato)',
        etPrezzo: 'Contratto iniziale', prezzo: k.contrattoIniziale,
        etIntegrazioni: 'Integrazioni / varianti', integrazioni: k.integrazioni,
        etPerdite: 'Perdite SAL accettate', perdite: k.perditeCum,
        etTotale: 'Valore recuperabile', totale: k.valoreRecuperabile,
        etCosti: 'Costi diretti previsti vigenti', costi: k.costiBudget,
        etOre: 'Ore previste vigenti', etCostoOre: 'Costo delle ore previste vigenti', costoOre: k.costoOrePreviste, ore: k.oreBudget,
        redditivita: sAgg.redditivita, rientro: sAgg.rientro, base: sAgg.base, oreSost: sAgg.ore
      }),
      chiudi({
        titolo: 'Maturato',
        etPrezzo: 'Fatturato lordo cumulato', prezzo: k.fattCum,
        integrazioni: null, notaIntegrazioni: 'già comprese nel fatturato',
        etPerdite: 'Perdite SAL accettate', perdite: k.perditeCum,
        etTotale: 'Totale maturato dal cliente', totale: meno(k.fattCum, k.perditeCum),
        etCosti: 'Costi diretti sostenuti', costi: k.costiSostenuti,
        etOre: 'Ore consumate', etCostoOre: 'Costo delle ore consumate', costoOre: k.costoOreEffettive, ore: k.oreUsate,
        redditivita: sCons.redditivita, rientro: sCons.rientro, base: sCons.base, oreSost: sCons.ore
      })
    ];

    // Le righe stanno dentro il gruppo che le comprende: la domanda è scritta a lato e una graffa abbraccia
    // le sue righe. `op` è il segno che lega la riga alla precedente; `forte` evidenzia i risultati parziali,
    // `segno` e `sfondo` li colorano.
    const gruppi = [
      { titolo: 'Qual è il prezzo per il cliente?', nota: 'quanto la commessa porta a casa, prima di qualunque costo', righe: [
        { op: '', campo: 'prezzo', et: c => c.etPrezzo },
        { op: '+', campo: 'integrazioni', et: c => c.etIntegrazioni || 'Integrazioni / varianti', nota: c => c.notaIntegrazioni },
        { op: '−', campo: 'perdite', et: c => c.etPerdite || 'Perdite SAL accettate', nota: c => c.notaPerdite },
        { op: '=', campo: 'totale', et: c => c.etTotale, forte: true }
      ] },
      { titolo: 'Quanto costa realizzarla?', nota: 'costi diretti e manodopera, quest\'ultima in euro e in ore', righe: [
        { op: '−', campo: 'costi', et: c => c.etCosti },
        // le ore hanno una casella propria: sono il dato da cui nasce il costo della riga successiva, non un passaggio del conto
        { op: '', campo: 'ore', et: c => c.etOre, fmt: ore, info: true },
        { op: '−', campo: 'costoOre', et: c => c.etCostoOre },
        { op: '=', campo: 'risultato', et: 'Risultato dopo i costi', forte: true, segno: true }
      ] },
      { titolo: 'Copre la redditività e il rientro? Quanto resta?', nota: 'redditività e rientro bancario richiesti dalla verifica di sostenibilità, sulle ore della colonna', righe: [
        { op: '−', campo: 'redditivita', et: 'Redditività richiesta' },
        // quanto se ne copre davvero, "coperto su desiderato" in un solo valore, nell'unità del parametro
        // impostato in Parametri: l'unità di misura si scrive una volta sola, in coda.
        { op: '', campo: 'copRedditivita', et: 'Redditività coperta', info: true,
          fmt: v => pct(v).replace(' %', '') + ' su ' + pct(S.redditivita),
          colore: v => v >= S.redditivita ? 'verde' : 'rosso' },
        { op: '=', campo: 'avanzo', et: 'Avanzo dopo la redditività', segno: true },
        { op: '−', campo: 'rientro', et: 'Rientro bancario richiesto' },
        { op: '', campo: 'copRientro', et: 'Rientro bancario coperto', info: true,
          fmt: v => euro(v).replace(' €', '') + ' su ' + euro(S.rientroOrario) + '/h',
          colore: v => v >= S.rientroOrario ? 'verde' : 'rosso' },
        { op: '=', campo: 'resta', et: 'Quello che resta', forte: true, sfondo: true }
      ] }
    ];

    const vuota = (etichetta, notaCella, info) => '<div class="kpi vuota' + (info ? ' info' : '') + '"><div class="et">' + esc(etichetta) + '</div><div class="val muto">' + Fmt.VUOTO + '</div>' +
      (notaCella ? '<div class="sub">' + esc(notaCella) + '</div>' : '') + '</div>';
    // `info` = casella di corredo (ore, coperture): fondo neutro, per distinguerla dai passaggi del conto
    const cella = (c, r) => {
      const etichetta = typeof r.et === 'function' ? r.et(c) : r.et, v = c[r.campo];
      if (!Fmt.isNum(v)) return vuota(etichetta, typeof r.nota === 'function' ? r.nota(c) : '', r.info);
      let colore = r.colore ? r.colore(v, c)
        : (r.sfondo ? 'sfondo ' + (v < 0 ? 'rosso' : 'verde') : (r.segno ? (v < 0 ? 'rosso' : 'verde') : ''));
      if (r.forte) colore = (colore ? colore + ' ' : '') + 'forte';
      if (r.info) colore = (colore ? colore + ' ' : '') + 'info';
      return UI.kpi(etichetta, (r.fmt || euro)(v), { colore, calc: r.info ? false : undefined, sub: r.sub ? r.sub(c) : '' });
    };
    // La graffa si allunga sulle righe del gruppo: il tracciato si deforma con il riquadro
    // (preserveAspectRatio none) mentre il tratto resta sottile (vector-effect non-scaling-stroke).
    const graffa = posizione => '<svg class="graffa" style="' + posizione + '" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
      '<path d="M9 1 C5.5 1 5 3 5 24 C5 44 4 50 1 50 C4 50 5 56 5 76 C5 97 5.5 99 9 99" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>';

    // Etichetta e graffa sono collocate a mano sulle righe del gruppo; segni e celle si dispongono da soli
    // nelle colonne rimaste libere. La riga 1 è l'intestazione delle colonne.
    let riga = 2;
    const corpo = gruppi.map(g => {
      const posizione = 'grid-row:' + riga + '/span ' + g.righe.length;
      riga += g.righe.length;
      return '<div class="et-gruppo" style="' + posizione + '"><b>' + esc(g.titolo) + '</b><span>' + esc(g.nota) + '</span></div>' + graffa(posizione) +
        g.righe.map(r => '<div class="op">' + r.op + '</div>' + colonne.map(c => cella(c, r)).join('')).join('');
    }).join('');

    return '<div class="pannello"><h2>Il conto della commessa</h2>' +
      '<p class="spiegazione">Lo stesso conto letto in quattro situazioni: si parte dal <b>prezzo per il cliente</b>, si tolgono i <b>costi</b> e si guarda se quello che resta copre la <b>redditività</b> e il <b>rientro bancario</b> richiesti dalla verifica di sostenibilità.' +
      (nota ? ' ' + nota : '') + '</p>' +
      // le bande sono uno strato di sfondo che corre dietro tutte le righe e tiene insieme la colonna.
      // Le prime tre corsie (etichetta del gruppo, graffa, segni) restano trasparenti.
      '<div class="conto-unico-wrap"><div class="conto-unico">' +
      '<div class="bande" aria-hidden="true">' + '<div></div>'.repeat(colonne.length + 3) + '</div>' +
      '<div></div><div></div><div class="op"></div>' +
      colonne.map(c => '<div class="col-tit">' + esc(c.titolo) + '</div>').join('') + corpo + '</div></div></div>';
  }

  // ------------------------------------------------------------ riepilogo dei confronti con la sostenibilità
  // Le caselle che mettono a confronto i prezzi delle varie versioni con il prezzo minimo sostenibile stanno
  // qui, fuori dal conto della commessa: sono un riepilogo, non un passaggio del conto.
  function confrontiSostenibilita(opt, dataAgg) {
    const versioni = [opt.sostIni, opt.sostAgg, opt.sostCons];
    if (!versioni.some(x => x)) return '';
    const cella = (etichetta, valore, colora) => Fmt.isNum(valore) ? { et: etichetta, v: euro(valore), colore: colora ? rosso(valore) : '' } : null;
    const titoli = ['Previsto iniziale', dataAgg ? 'Alla data del ' + Fmt.data(dataAgg) : 'Alla data (budget mai aggiornato)', 'Maturato'];
    return confronto('Confronto con la verifica di sostenibilità', titoli, [
      { voce: 'Prezzo minimo dall\'analisi', nota: 'sotto questo prezzo la commessa non regge', celle: versioni.map(s => cella('Prezzo minimo dall\'analisi', s ? s.prezzoMinimo : null)) },
      { voce: 'Scostamento sul prezzo minimo', nota: 'prezzo della colonna − prezzo minimo: negativo (rosso) = sotto il minimo sostenibile', celle: versioni.map(s => cella('Scostamento sul prezzo minimo', s ? s.scostamento : null, true)) }
    ], 'Riepilogo del confronto fra il prezzo delle tre versioni e il prezzo minimo sostenibile della stessa versione.');
  }

  // opt.singola: indicatori di una sola commessa (scheda commessa), senza il pannello Portafoglio
  function kpiHtml(k, opt) {
    const singola = !!(opt && opt.singola);
    const kp = UI.kpi;
    const P = Store.db.parametri;
    const revisione = !k.nBudgetAggiornati
      ? (singola
        ? 'Budget mai aggiornato: la colonna <b>alla data</b> usa ancora ore e costi previsti iniziali.'
        : 'Nessun aggiornamento di budget: la colonna <b>previsto aggiornato</b> coincide con quella <b>previsto iniziale</b>.')
      : singola
        ? 'Budget rivisto o confermato' + (k.budgetAggiornatoAlMax ? ' al <b>' + Fmt.data(k.budgetAggiornatoAlMax) + '</b>' : '') + '.'
        : 'Budget rivisto o confermato su <b>' + k.nBudgetAggiornati + '</b> commesse' + (k.budgetAggiornatoAlMax ? ', ultimo aggiornamento al <b>' + Fmt.data(k.budgetAggiornatoAlMax) + '</b>' : '') + '.';
    const colAgg = 'Previsto aggiornato';

    const portafoglio = '<div class="pannello"><h2>Portafoglio commesse</h2><div class="kpi-griglia">' +
      kp('Commesse totali', k.n, { calc: false }) +
      kp('Da iniziare', k.daIniziare, { calc: false }) +
      kp('In corso', k.inCorso, { calc: false }) +
      kp('Quasi finite', k.quasiFinite, { calc: false }) +
      kp('Finite', k.finite, { calc: false }) +
      kp('Con criticità', k.critiche, { colore: k.critiche ? 'rosso' : 'verde', calc: false }) +
      kp('Con alert (attenzione + critico)', k.conAlert, { colore: k.conAlert ? 'giallo' : 'verde', calc: false }) +
      '</div></div>';

    const economia = '<div class="pannello"><h2>Valori economici cumulati</h2><div class="kpi-griglia">' +
      kp('Valore contrattuale aggiornato', euro(k.contrattoAggiornato)) +
      kp('Valore recuperabile', euro(k.valoreRecuperabile)) +
      kp('SAL cumulato', euro(k.salCum)) +
      kp('Fatturato lordo cumulato', euro(k.fattCum)) +
      kp('SAL non ancora fatturato', euro(k.salNonFatturato), { colore: k.salNonFatturato > 0 ? 'giallo' : '' }) +
      kp('Residuo lavori', euro(k.residuoLavori)) +
      kp('Ritenute maturate', euro(k.ritenuteCum)) +
      kp('Ritenute da sbloccare', euro(k.ritenuteDaSbloccare), { colore: k.ritenuteDaSbloccare > 0 ? 'giallo' : '' }) +
      kp('Perdite SAL accettate', euro(k.perditeCum), { colore: k.perditeCum > 0 ? 'rosso' : '' }) +
      '</div></div>';


    // Scheda commessa: un solo conto a quattro colonne, più il riepilogo dei confronti con la sostenibilità.
    if (singola) return economia + contoUnico(k, opt || {}, revisione) + confrontiSostenibilita(opt || {}, k.budgetAggiornatoAlMax);

    const costoTotIni = k.costoOrePrevisteIni + k.costiBudgetIni;
    const oreCosti = confronto('Ore e costi', ['Budget previsto iniziale', colAgg, 'Effettivo'], [
      { voce: 'Ore', celle: [{ et: 'Ore previste iniziali', v: ore(k.oreBudgetIni) }, { et: 'Ore previste aggiornate', v: ore(k.oreBudget) }, { et: 'Ore consumate', v: ore(k.oreUsate) }] },
      { voce: 'Ore residue', celle: [{ et: 'Ore residue su iniziale', v: ore(k.oreResidueIni) }, { et: 'Ore residue su aggiornato', v: ore(k.oreResidue) }, null] },
      { voce: 'Costo delle ore', nota: 'ore × costo orario (strutturale corrente ' + euro(P.costoOrario) + '/h)', celle: [{ et: 'Costo ore previste iniziali', v: euro(k.costoOrePrevisteIni) }, { et: 'Costo ore previste aggiornate', v: euro(k.costoOrePreviste) }, { et: 'Costo ore effettive', v: euro(k.costoOreEffettive) }] },
      { voce: 'Costi diretti', celle: [{ et: 'Costi diretti previsti iniziali', v: euro(k.costiBudgetIni) }, { et: 'Costi diretti previsti aggiornati', v: euro(k.costiBudget) }, { et: 'Costi diretti sostenuti', v: euro(k.costiSostenuti), colore: k.costiBudget > 0 && k.costiSostenuti > k.costiBudget ? 'rosso' : '' }] },
      { voce: 'Costo totale', nota: 'costo ore + costi diretti', celle: [{ et: 'Costo totale previsto iniziale', v: euro(costoTotIni) }, { et: 'Costo totale previsto aggiornato', v: euro(k.costoOrePreviste + k.costiBudget) }, { et: 'Costo effettivo cumulato', v: euro(k.costoEffettivo) }] }
    ], revisione);

    // margini previsti: entrambe le colonne previsionali restano sul contratto iniziale, il consuntivo sul fatturato lordo
    const mp = {
      opIni: k.margineOperativoPrevistoIni, opIniPct: k.margineOperativoPrevistoIniPct, finIni: k.margineFinalePrevistoIni,
      opAgg: k.margineOperativoPrevisto, opAggPct: k.margineOperativoPrevistoPct, finAgg: k.margineFinalePrevisto
    };
    const margini = confronto('Margini', ['Previsto iniziale', colAgg, 'Effettivo a consuntivo'], [
      { voce: 'Ricavo di riferimento', nota: 'previsto: contratto iniziale · effettivo: fatturato lordo cumulato', celle: [{ et: 'Contratto iniziale', v: euro(k.contrattoIniziale) }, { et: 'Contratto iniziale', v: euro(k.contrattoIniziale) }, { et: 'Fatturato lordo cumulato', v: euro(k.fattCum) }] },
      { voce: 'Margine operativo (€)', nota: 'ricavo − costi diretti', celle: [{ et: 'Margine operativo previsto iniziale', v: euro(mp.opIni), colore: rosso(mp.opIni) }, { et: 'Margine operativo previsto aggiornato', v: euro(mp.opAgg), colore: rosso(mp.opAgg) }, { et: 'Margine operativo effettivo', v: euro(k.margineOperativoEffettivo), colore: rosso(k.margineOperativoEffettivo) }] },
      { voce: 'Margine operativo (%)', nota: '1 − (costi diretti ÷ ricavo)', celle: [{ et: 'Margine operativo previsto iniziale %', v: pct(mp.opIniPct), colore: rosso(mp.opIniPct) }, { et: 'Margine operativo previsto aggiornato %', v: pct(mp.opAggPct), colore: rosso(mp.opAggPct) }, { et: 'Margine operativo effettivo %', v: pct(k.margineOperativoEffettivoPct), colore: rosso(k.margineOperativoEffettivoPct) }] },
      { voce: 'Margine finale (€)', nota: 'margine operativo − costo delle ore', celle: [{ et: 'Margine finale previsto iniziale', v: euro(mp.finIni), colore: rosso(mp.finIni) }, { et: 'Margine finale previsto aggiornato', v: euro(mp.finAgg), colore: rosso(mp.finAgg) }, { et: 'Margine finale effettivo', v: euro(k.margineFinaleEffettivo), colore: rosso(k.margineFinaleEffettivo) }] }
    ], revisione);

    return portafoglio + economia + oreCosti + margini;
  }
  window.Analisi = { pannelli: kpiHtml };

  UI.registra('analisi', function (cont) {
    const tutte = Engine.calcolaTutte(Store.db);
    const P = Store.db.parametri;
    const uniq = f => Array.from(new Set(tutte.map(r => r[f]).filter(x => x))).sort((a, b) => a.localeCompare(b, 'it'));
    const opz = (lista, sel) => '<option value="">Tutti</option>' + lista.map(v => '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
    const statiOpz = '<option value="">Tutti</option>' + Engine.STATI.map(s => '<option value="' + esc(s) + '"' + (F.stato === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '<option value="finite"' + (F.stato === 'finite' ? ' selected' : '') + '>Tutte le finite</option>';

    cont.innerHTML = UI.testata('Dashboard di analisi', 'Tutti gli indicatori del portafoglio commesse · Esercizio ' + esc(P.annoGestione) + ' · saldi al 31/12/' + esc(P.annoGestione - 1) + ' + movimenti ' + esc(P.annoGestione),
      UI.pulsanteEsporta('ana', 'Esporta commesse filtrate (CSV)') + '<button type="button" id="ana-azzera">Azzera filtri</button>') +
      '<div class="pannello compatto"><div class="filtri" id="ana-filtri">' +
      '<div class="campo largo"><label>Codice commessa</label><div id="ana-ricerca"></div></div>' +
      '<div class="campo"><label>&nbsp;</label><span class="pill" id="ana-conta"></span></div>' +
      '<div class="campo"><label>Tecnico</label><select class="in" name="tecnico">' + opz(uniq('tecnico'), F.tecnico) + '</select></div>' +
      '<div class="campo"><label>Preposto</label><select class="in" name="preposto">' + opz(uniq('preposto'), F.preposto) + '</select></div>' +
      '<div class="campo"><label>Cliente</label><select class="in" name="cliente">' + opz(uniq('cliente'), F.cliente) + '</select></div>' +
      '<div class="campo"><label>Stato commessa</label><select class="in" name="stato">' + statiOpz + '</select></div>' +
      '<div class="campo"><label>Ramo / area</label><select class="in" name="ramo">' + opz(uniq('ramo'), F.ramo) + '</select></div>' +
      '<div class="campo"><label>Alert</label><select class="in" name="alert"><option value="">Tutte</option><option value="con"' + (F.alert === 'con' ? ' selected' : '') + '>Con alert</option><option value="CRITICO"' + (F.alert === 'CRITICO' ? ' selected' : '') + '>Solo critiche</option><option value="ATTENZIONE"' + (F.alert === 'ATTENZIONE' ? ' selected' : '') + '>Solo attenzione</option><option value="REGOLARE"' + (F.alert === 'REGOLARE' ? ' selected' : '') + '>Solo regolari</option></select></div>' +
      '<div class="campo"><label>Data inizio da</label><input type="date" class="in" name="inizioDa" value="' + esc(F.inizioDa) + '"></div>' +
      '<div class="campo"><label>Data inizio a</label><input type="date" class="in" name="inizioA" value="' + esc(F.inizioA) + '"></div>' +
      '<div class="campo"><label>Fine prevista da</label><input type="date" class="in" name="fineDa" value="' + esc(F.fineDa) + '"></div>' +
      '<div class="campo"><label>Fine prevista a</label><input type="date" class="in" name="fineA" value="' + esc(F.fineA) + '"></div>' +
      '<div class="campo"><label>Devono iniziare entro</label><input type="date" class="in" name="iniziaEntro" value="' + esc(F.iniziaEntro) + '"></div>' +
      '<div class="campo"><label>Devono terminare entro</label><input type="date" class="in" name="terminaEntro" value="' + esc(F.terminaEntro) + '"></div>' +
      '<div class="campo"><label>Aggiornamento</label><label style="text-transform:none;font-size:13px;margin-top:6px"><input type="checkbox" name="nonAggiornate"' + (F.nonAggiornate ? ' checked' : '') + '> senza aggiornamento da oltre <b>' + esc(P.giorniAggiornamentoRecente) + ' gg</b></label>' +
      (Store.vedePagina('parametri') ? '<div class="aiuto"><a href="#/parametri" title="Il numero di giorni si imposta in Parametri di controllo">modifica in Parametri</a></div>' : '') + '</div>' +
      '</div></div>' +
      '<div id="ana-kpi"></div>' +
      UI.legenda() +
      '<div id="ana-tab"></div>';

    const colonne = [
      { campo: 'alert', titolo: 'Allerta', fmt: v => UI.badgeAlert(v) },
      { campo: 'codice', titolo: 'Codice', fmt: (v, r) => UI.linkCommessa(r) },
      { campo: 'cliente', titolo: 'Cliente' },
      { campo: 'cantiere', titolo: 'Cantiere', classe: 'desc' },
      { campo: 'tecnico', titolo: 'Tecnico' },
      { campo: 'stato', titolo: 'Stato', fmt: v => UI.badgeStato(v) },
      { campo: 'contrattoAggiornato', titolo: 'Contratto', tipo: 'n', fmt: v => Fmt.euro(v) },
      { campo: 'salCum', titolo: 'SAL', tipo: 'n', fmt: v => Fmt.euro(v) },
      { campo: 'fattCum', titolo: 'Fatturato', tipo: 'n', fmt: v => Fmt.euro(v) },
      { campo: 'salPct', titolo: 'SAL %', tipo: 'n', fmt: v => Fmt.pct(v) },
      { campo: 'tempoPct', titolo: 'Tempo %', tipo: 'n', fmt: v => Fmt.pct(v) },
      { campo: 'orePct', titolo: 'Ore %', tipo: 'n', fmt: v => Fmt.pct(v) },
      { campo: 'dataFinePrevista', titolo: 'Fine prevista', fmt: v => Fmt.data(v) },
      { campo: 'aggiornatoAl', titolo: 'Aggiornato al', fmt: v => Fmt.data(v) },
      { campo: 'motivi', titolo: 'Motivo allerta', ord: false, fmt: (v, r) => UI.motiviHtml(r) }
    ];

    function aggiorna() {
      const rows = filtra(tutte);
      // contatore accanto ai filtri: rende visibile l'effetto della ricerca anche se la tabella è più in basso
      const attivi = Object.keys(F).some(k => F[k] && F[k] !== false);
      const conta = document.getElementById('ana-conta');
      conta.textContent = attivi ? rows.length + ' commesse su ' + tutte.length + ' corrispondono ai filtri' : tutte.length + ' commesse';
      conta.className = 'pill ' + (attivi ? (rows.length ? 'server' : 'file') : '');
      document.getElementById('ana-kpi').innerHTML = kpiHtml(Engine.riepilogo(rows));
      const t = document.getElementById('ana-tab');
      t.innerHTML = UI.tabella('ana', { colonne, righe: rows, chiave: 'id', ordine: { campo: 'codice', dir: 'asc' }, vuoto: 'Nessuna commessa corrisponde ai filtri.', onRiga: id => UI.vai('#/commessa/' + id) });
      UI.legaTabelle(t);
    }
    const filtri = document.getElementById('ana-filtri');
    UI.comboCodice(document.getElementById('ana-ricerca'), tutte, { valore: F.testo, placeholder: 'digita il codice o scegli dalla tendina', onCambio: (testo, esatto) => { codiceEsatto = esatto; } });
    const onCambio = UI.debounce(() => {
      filtri.querySelectorAll('[name]').forEach(el => { F[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
      aggiorna();
    }, 150);
    filtri.addEventListener('input', onCambio);
    filtri.addEventListener('change', onCambio);
    document.getElementById('ana-azzera').onclick = () => { Object.keys(F).forEach(k => { F[k] = k === 'nonAggiornate' ? false : ''; }); codiceEsatto = false; UI.render(); };
    const be = cont.querySelector('[data-esporta="ana"]');
    if (be) be.onclick = () => UI.esportaCsv('analisi_commesse', UI.righeOrdinate('ana'), UI.COLONNE_EXPORT_SCHEDA);
    aggiorna();
  });
})();
