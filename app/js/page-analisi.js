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

  // opt.singola: indicatori di una sola commessa (scheda commessa), senza il pannello Portafoglio
  function kpiHtml(k, opt) {
    const singola = !!(opt && opt.singola);
    const kp = UI.kpi;
    const P = Store.db.parametri;
    const revisione = !k.nBudgetAggiornati
      ? 'Nessun aggiornamento di budget: la colonna <b>previsto aggiornato</b> coincide con quella <b>previsto iniziale</b>.'
      : singola
        ? 'Budget rivisto o confermato' + (k.budgetAggiornatoAlMax ? ' al <b>' + Fmt.data(k.budgetAggiornatoAlMax) + '</b>' : '') + '.'
        : 'Budget rivisto o confermato su <b>' + k.nBudgetAggiornati + '</b> commesse' + (k.budgetAggiornatoAlMax ? ', ultimo aggiornamento al <b>' + Fmt.data(k.budgetAggiornatoAlMax) + '</b>' : '') + '.';
    // nella scheda commessa la colonna riporta la "Data aggiornamento budget"
    const colAgg = !singola ? 'Previsto aggiornato'
      : (k.budgetAggiornatoAlMax ? 'Budget previsionale a finire alla data del ' + Fmt.data(k.budgetAggiornatoAlMax) : 'Budget previsionale a finire (nessun aggiornamento)');

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

    const costoTotIni = k.costoOrePrevisteIni + k.costiBudgetIni;
    const diffCostoAgg = costoTotIni - (k.costoOrePreviste + k.costiBudget), diffCostoEff = costoTotIni - k.costoEffettivo;
    const oreCosti = confronto('Ore e costi', ['Budget previsto iniziale', colAgg, singola ? 'Maturato Consuntivo' : 'Effettivo'], [
      { voce: 'Ore', celle: [{ et: 'Ore previste iniziali', v: ore(k.oreBudgetIni) }, { et: 'Ore previste aggiornate', v: ore(k.oreBudget) }, { et: 'Ore consumate', v: ore(k.oreUsate) }] },
      { voce: 'Ore residue', celle: [{ et: 'Ore residue su iniziale', v: ore(k.oreResidueIni) }, { et: 'Ore residue su aggiornato', v: ore(k.oreResidue) }, null] },
      { voce: 'Costo delle ore', nota: 'ore × costo orario (strutturale corrente ' + euro(P.costoOrario) + '/h)', celle: [{ et: 'Costo ore previste iniziali', v: euro(k.costoOrePrevisteIni) }, { et: 'Costo ore previste aggiornate', v: euro(k.costoOrePreviste) }, { et: 'Costo ore effettive', v: euro(k.costoOreEffettive) }] },
      { voce: 'Costi diretti', celle: [{ et: 'Costi diretti previsti iniziali', v: euro(k.costiBudgetIni) }, { et: 'Costi diretti previsti aggiornati', v: euro(k.costiBudget) }, { et: 'Costi diretti sostenuti', v: euro(k.costiSostenuti), colore: k.costiBudget > 0 && k.costiSostenuti > k.costiBudget ? 'rosso' : '' }] },
      { voce: 'Costo totale', nota: 'costo ore + costi diretti', celle: [{ et: 'Costo totale previsto iniziale', v: euro(k.costoOrePrevisteIni + k.costiBudgetIni) }, { et: 'Costo totale previsto aggiornato', v: euro(k.costoOrePreviste + k.costiBudget) }, { et: singola ? 'Costo effettivo maturato' : 'Costo effettivo cumulato', v: euro(k.costoEffettivo) }] }
    ].concat(singola ? [
      // differenze rispetto al costo totale previsto iniziale: positivo = costo inferiore al previsto iniziale
      { voce: 'Differenza sul costo totale previsto iniziale', celle: [false,
        { et: 'Differenza tra costi previsti e previsionali' + (k.budgetAggiornatoAlMax ? ' alla data del ' + Fmt.data(k.budgetAggiornatoAlMax) : ''), v: euro(diffCostoAgg), colore: rosso(diffCostoAgg) },
        { et: 'Differenza tra costo totale previsto iniziale e il maturato', v: euro(diffCostoEff), colore: rosso(diffCostoEff) }] }
    ] : []), revisione);

    // margini previsti: la colonna iniziale resta sul contratto iniziale; nella scheda commessa la colonna
    // a finire si calcola sul valore recuperabile (nelle dashboard sul contratto iniziale). Il consuntivo resta sul fatturato lordo.
    const baseAgg = singola ? k.valoreRecuperabile : k.contrattoIniziale;
    const mp = {
      opIni: k.margineOperativoPrevistoIni, opIniPct: k.margineOperativoPrevistoIniPct, finIni: k.margineFinalePrevistoIni,
      opAgg: singola ? baseAgg - k.costiBudget : k.margineOperativoPrevisto,
      opAggPct: singola ? (baseAgg > 0 ? 1 - k.costiBudget / baseAgg : null) : k.margineOperativoPrevistoPct,
      finAgg: singola ? baseAgg - k.costiBudget - k.costoOrePreviste : k.margineFinalePrevisto
    };
    // valori della verifica di sostenibilità (scheda commessa): iniziale, aggiornata (a finire) e maturato consuntivo, uno per colonna
    const sv = x => x ? { prezzoMinimo: x.prezzoMinimo, scostamento: x.scostamento, diff: x.differenzaPrezzoMinimoCosti,
      redditivita: x.ore === null ? null : x.strutturale.redditivita, rientro: x.ore === null ? null : x.strutturale.rientro } : {};
    const sIni = sv(opt && opt.sostIni), sAgg = sv(opt && opt.sostAgg), sCons = sv(opt && opt.sostCons);
    const cellaE = (et, val, colora) => Fmt.isNum(val) ? { et, v: euro(val), colore: colora ? rosso(val) : '' } : null;
    const margini = confronto('Margini', ['Previsto iniziale', colAgg, singola ? 'Maturato Consuntivo' : 'Effettivo a consuntivo'], [
      { voce: singola ? 'Valore di riferimento' : 'Ricavo di riferimento', nota: singola ? 'iniziale: contratto iniziale · a finire: valore recuperabile · consuntivo: fatturato lordo cumulato' : 'previsto: contratto iniziale · effettivo: fatturato lordo cumulato', celle: [{ et: 'Contratto iniziale', v: euro(k.contrattoIniziale) }, { et: singola ? 'Valore recuperabile della commessa' : 'Contratto iniziale', v: euro(baseAgg) }, { et: 'Fatturato lordo cumulato', v: euro(k.fattCum) }] },
      // prezzo minimo dalla verifica di sostenibilità della commessa (null = non calcolabile → n.d.)
      ...(singola ? [{ voce: 'Prezzo minimo dall\'analisi di sostenibilità', celle: [cellaE('Prezzo minimo dall\'analisi di sostenibilità', sIni.prezzoMinimo), cellaE('Prezzo minimo dall\'analisi di sostenibilità', sAgg.prezzoMinimo), cellaE('Prezzo minimo dall\'analisi di sostenibilità', sCons.prezzoMinimo)] },
        // prezzo del computo della verifica − prezzo minimo: positivo = sopra il minimo; negativo (rosso) = sotto il minimo sostenibile
        { voce: 'Scostamento contratto − prezzo minimo', celle: [cellaE('Scostamento contratto iniziale − prezzo minimo', sIni.scostamento, true), cellaE('Scostamento contratto aggiornato − prezzo minimo', sAgg.scostamento, true), cellaE('Scostamento fatturato lordo − prezzo minimo', sCons.scostamento, true)] }] : []),
      { voce: 'Margine operativo (€)', nota: singola ? 'contratto iniziale (a finire: valore recuperabile) − costi diretti' : 'ricavo − costi diretti', celle: [{ et: 'Margine operativo previsto iniziale', v: euro(mp.opIni), colore: rosso(mp.opIni) }, { et: 'Margine operativo previsto aggiornato', v: euro(mp.opAgg), colore: rosso(mp.opAgg) }, { et: 'Margine operativo effettivo', v: euro(k.margineOperativoEffettivo), colore: rosso(k.margineOperativoEffettivo) }] },
      { voce: 'Margine operativo (%)', nota: singola ? '1 − (costi diretti ÷ contratto iniziale; a finire: valore recuperabile)' : '1 − (costi diretti ÷ ricavo)', celle: [{ et: 'Margine operativo previsto iniziale %', v: pct(mp.opIniPct), colore: rosso(mp.opIniPct) }, { et: 'Margine operativo previsto aggiornato %', v: pct(mp.opAggPct), colore: rosso(mp.opAggPct) }, { et: 'Margine operativo effettivo %', v: pct(k.margineOperativoEffettivoPct), colore: rosso(k.margineOperativoEffettivoPct) }] },
      { voce: 'Margine finale (€)', nota: 'margine operativo − costo delle ore', celle: [{ et: 'Margine finale previsto iniziale', v: euro(mp.finIni), colore: rosso(mp.finIni) }, { et: 'Margine finale previsto aggiornato', v: euro(mp.finAgg), colore: rosso(mp.finAgg) }, { et: 'Margine finale effettivo', v: euro(k.margineFinaleEffettivo), colore: rosso(k.margineFinaleEffettivo) }] },
      // dalla verifica di sostenibilità: prezzo minimo − costo strutturale attribuito con costi diretti
      ...(singola ? [{ voce: 'Margine finale previsto da sostenibilità', celle: [cellaE('Margine finale previsto da sostenibilità', sIni.diff, true), cellaE('Margine finale previsto da sostenibilità', sAgg.diff, true), cellaE('Margine finale da sostenibilità a consuntivo', sCons.diff, true)] },
        // quanta parte della redditività della sostenibilità è coperta dal margine finale previsto della stessa colonna:
        // percentuali limitate tra 0 % e 100 % (100 % = interamente coperto; sotto 100 % in rosso)
        ...(function () {
          const quota = (valore, base) => Fmt.isNum(base) && base > 0 ? Math.max(0, Math.min(1, valore / base)) : null;
          const cella = (et, c) => c === null ? null : { et, v: pct(c), colore: 'sfondo ' + (c < 1 ? 'rosso' : 'verde') };
          const copRedditivita = (fin, s) => quota(fin, s.redditivita);
          // avanzo del margine dopo la redditività, confrontato con il rientro bancario in euro (ore previste della sostenibilità × rientro orario)
          const copRientro = (fin, s) => Fmt.isNum(s.redditivita) ? quota(fin - s.redditivita, s.rientro) : null;
          const riga = (voce, nota, f) => ({ voce, nota, celle: [cella(voce, f(mp.finIni, sIni)), cella(voce, f(mp.finAgg, sAgg)), cella(voce, f(k.margineFinaleEffettivo, sCons))] });
          return [
            riga('Copertura effettiva della redditività', 'margine finale previsto ÷ redditività della sostenibilità', copRedditivita),
            riga('Copertura effettiva del rientro bancario', '(margine finale previsto − redditività) ÷ rientro bancario della sostenibilità', copRientro)
          ];
        })()] : [])
    ], revisione);

    return (singola ? '' : portafoglio) + economia + oreCosti + margini;
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
