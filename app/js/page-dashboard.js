/* FIDA EDILE – Dashboard direzionale
 * Da un lato gli obiettivi dell'anno, dall'altro a che punto si è: stato del portafoglio (torta dagli
 * alert), redditività richiesta ed effettiva, rientro bancario desiderato ed effettivo, risultato delle
 * commesse finite e previsione di quelle in corso. I numeri vengono da Engine.direzionale.
 * La Dashboard di analisi (page-analisi.js), con tutti gli indicatori di dettaglio, resta una pagina a sé. */
(function () {
  'use strict';
  const esc = UI.esc;
  // Vista dell'elenco in fondo alla pagina: la scelgono la torta, i riquadri cliccabili e i pulsanti sopra la tabella.
  const VISTE = [
    ['tutte', 'Tutte', () => true],
    ['finite', 'Finite', r => r.finito],
    ['inCorso', 'In corso', r => !r.finito],
    ['CRITICO', 'Critiche', r => r.alert === 'CRITICO'],
    ['ATTENZIONE', 'In attenzione', r => r.alert === 'ATTENZIONE'],
    ['INCOMPLETO', 'Incomplete', r => r.alert === 'INCOMPLETO'],
    ['REGOLARE', 'In linea', r => r.alert === 'REGOLARE']
  ];
  let vista = 'tutte';
  // La ciambella si disegna con un'animazione quando si arriva sulla pagina, non quando la pagina si
  // ridisegna per un filtro: chi clicca una fetta non deve rivedere il giro ogni volta.
  let senzaAnimazione = false;
  // Il rientro bancario si legge sul solo esercizio oppure sull'intera vita delle commesse: lo sceglie
  // l'interruttore del riquadro. Cambiandolo si rianimano solo i numeri di quel riquadro.
  let periodoRientro = 'anno', animaRientro = false;

  const euro = v => Fmt.euro(v), pct = v => Fmt.pct(v);
  // cifre grandi senza centesimi: a colpo d'occhio contano le migliaia
  const euro0 = v => Fmt.isNum(v) ? Fmt.numero(Math.round(v), 0) + ' €' : Fmt.VUOTO;
  const segno = v => (Fmt.isNum(v) && v < 0) ? 'rosso-t' : 'verde-t';
  // Un numero che all'arrivo sulla pagina sale da zero al suo valore. Il testo scritto qui è già quello
  // finale: se l'animazione non parte (filtro, movimento ridotto) la pagina è comunque corretta.
  const FORMATI = { intero: v => Fmt.numero(Math.round(v), 0), euro0, pct: v => Fmt.pct(v) };
  const conta = (v, tipo) => Fmt.isNum(v) ? '<span data-conta="' + v + '" data-tipo="' + tipo + '">' + FORMATI[tipo](v) + '</span>' : Fmt.VUOTO;
  function animaContatori(radice) {
    const els = Array.from(radice.querySelectorAll('[data-conta]'));
    if (!els.length || !window.requestAnimationFrame) return;
    const DURATA = 1100, inizio = performance.now();
    let finito = false;
    const chiudi = () => { finito = true; els.forEach(el => { el.textContent = FORMATI[el.dataset.tipo](+el.dataset.conta); }); };
    const passo = ora => {
      if (finito) return;
      const t = Math.min(1, (ora - inizio) / DURATA), k = 1 - Math.pow(1 - t, 3);   // parte veloce e rallenta arrivando
      if (t >= 1) return chiudi();
      els.forEach(el => { el.textContent = FORMATI[el.dataset.tipo](+el.dataset.conta * k); });
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
    // il browser rallenta o sospende i fotogrammi quando la scheda non è in vista: allo scadere del tempo
    // i numeri vanno comunque al valore vero, non devono restare a metà
    setTimeout(chiudi, DURATA + 150);
  }
  const quota = (v, max) => (max > 0 ? Math.max(0, Math.min(1, v / max)) * 100 : 0).toFixed(1) + '%';

  // ------------------------------------------------------------ stato delle commesse: la ciambella
  // Nessun giudizio complessivo sul portafoglio: si vede solo quante commesse stanno in ciascun livello.
  const LIVELLI = [['CRITICO', 'Critiche'], ['ATTENZIONE', 'In attenzione'], ['INCOMPLETO', 'Incomplete'], ['REGOLARE', 'In linea']];

  // Ciambella in SVG, in tre dimensioni: un settore per livello, a partire dall'alto in senso orario; nel
  // buco il totale delle commesse. La ciambella è disegnata piatta e poi schiacciata in verticale (K), come
  // vista dall'alto in prospettiva; lo spessore sono copie dello stesso settore, più scure, impilate verso
  // il basso. Prima si disegnano tutti i fianchi e poi tutte le facce superiori, così ciò che sta davanti
  // copre ciò che sta dietro. Il settore della vista scelta si stacca dal centro. I numeri non vengono
  // schiacciati: stanno in uno strato a parte. Al primo disegno una maschera ad anello scopre la ciambella
  // girando in senso orario.
  function torta(d, conteggi, anima) {
    const C = 110, R = 100, r = 54, M = (R + r) / 2, tot = d.n;
    const K = 0.58, SPESSORE = 20, CY = 72, ALTEZZA = 164;        // schiacciamento, spessore e centro a schermo
    const schiaccia = 'translate(0 ' + (CY - C * K).toFixed(2) + ') scale(1 ' + K + ')';
    const centro = '<text class="tot" x="' + C + '" y="' + (CY + 9) + '" text-anchor="middle">' + conta(tot, 'intero').replace(/span/g, 'tspan') + '</text>' +
      '<text class="tot-et" x="' + C + '" y="' + (CY + 23) + '" text-anchor="middle">' + (tot === 1 ? 'commessa' : 'commesse') + '</text>';
    const apri = (extra, etichetta) => '<svg class="dir-torta' + extra + '" viewBox="0 0 220 ' + ALTEZZA + '" role="img" aria-label="' + etichetta + '">';
    if (!tot) return apri('', 'Nessuna commessa') + '<g transform="' + schiaccia + '"><circle cx="' + C + '" cy="' + C + '" r="' + M + '" class="vuota" stroke-width="' + (R - r) + '"/></g>' + centro + '</svg>';
    const punto = (ang, raggio) => (C + raggio * Math.sin(ang)).toFixed(2) + ' ' + (C - raggio * Math.cos(ang)).toFixed(2);
    // settore di corona fra due angoli: arco esterno in senso orario, arco interno al ritorno
    const settore = (a1, a2) => {
      const lungo = (a2 - a1) > Math.PI ? 1 : 0;
      return 'M' + punto(a1, R) + ' A' + R + ' ' + R + ' 0 ' + lungo + ' 1 ' + punto(a2, R) + ' L' + punto(a2, r) + ' A' + r + ' ' + r + ' 0 ' + lungo + ' 0 ' + punto(a1, r) + ' Z';
    };
    let da = 0;
    const fianchi = [], facce = [], numeri = [];
    LIVELLI.filter(l => conteggi[l[0]] > 0).forEach(l => {
      const n = conteggi[l[0]], fraz = n / tot, a = da + fraz * 2 * Math.PI, intera = fraz > 0.9999, meta = intera ? Math.PI : (da + a) / 2;
      const scelta = vista === l[0];
      const dx = scelta ? 8 * Math.sin(meta) : 0, dy = scelta ? -8 * Math.cos(meta) : 0;
      const sposta = scelta ? ' transform="translate(' + dx.toFixed(2) + ' ' + dy.toFixed(2) + ')"' : '';
      // un settore che è tutta la ciambella non si chiude con un arco solo: si disegna in due metà
      const forma = intera ? settore(0, Math.PI) + ' ' + settore(Math.PI, 2 * Math.PI) : settore(da, a);
      const classi = l[0] + (scelta ? ' scelta' : '') + (intera ? ' intera' : '');
      // spessore: lo stesso settore ripetuto verso il basso, un'unità di schermo per volta
      let strati = '';
      for (let k = SPESSORE; k >= 1; k--) strati += '<path d="' + forma + '" transform="translate(0 ' + (k / K).toFixed(2) + ')"/>';
      fianchi.push('<g class="fianco ' + classi + '" data-vista="' + l[0] + '"' + sposta + ' aria-hidden="true">' + strati + '</g>');
      facce.push('<g class="fetta ' + classi + '" data-vista="' + l[0] + '"' + sposta + ' tabindex="0" role="button" aria-label="' + esc(l[1] + ': ' + n + ' commesse') + '">' +
        '<title>' + esc(l[1] + ': ' + n + ' su ' + tot + ' (' + Fmt.pct(fraz, 0) + ')\nClic per vedere solo queste commesse') + '</title><path d="' + forma + '"/></g>');
      // il numero sta sulla faccia superiore, alle coordinate di schermo del centro del settore
      if (fraz >= 0.08) numeri.push('<text class="num ' + l[0] + '" x="' + (C + (M * Math.sin(meta) + dx)).toFixed(1) + '" y="' + (CY + K * (-M * Math.cos(meta) + dy) + 6).toFixed(1) + '" text-anchor="middle">' + conta(n, 'intero').replace(/span/g, 'tspan') + '</text>');
      da = a;
    });
    // la maschera è un anello più largo della ciambella (copre lo spessore e il settore staccato): il suo
    // tratto parte dall'alto e si allunga fino a chiudere il giro
    return apri(anima ? ' anima' : '', 'Commesse per livello di alert') +
      '<defs><mask id="dir-giro" maskUnits="userSpaceOnUse" x="-20" y="-20" width="260" height="300"><circle class="giro" cx="' + C + '" cy="' + C + '" r="' + M + '" fill="none" stroke="#fff" stroke-width="' + (R - r + 2 * (SPESSORE / K + 12)).toFixed(0) + '" pathLength="100" transform="rotate(-90 ' + C + ' ' + C + ')"/></mask></defs>' +
      '<g transform="' + schiaccia + '"><g mask="url(#dir-giro)">' + fianchi.join('') + facce.join('') + '</g></g>' + numeri.join('') + centro + '</svg>';
  }

  function fascia(d, P, anima) {
    const conteggi = { CRITICO: d.critiche, ATTENZIONE: d.attenzione, INCOMPLETO: d.incomplete, REGOLARE: d.regolari };
    return '<section class="dir-fascia">' +
      '<div class="dir-fascia-testo"><h1>Stato delle commesse</h1>' +
      '<p class="perche">' + (d.n ? d.n + (d.n === 1 ? ' commessa operativa' : ' commesse operative') + ' nell\'esercizio ' + esc(P.annoGestione) + ', per livello di alert.' : 'Nessuna commessa operativa.') + '</p></div>' +
      '<div class="dir-fascia-torta">' + torta(d, conteggi, anima) + '</div>' +
      '<div class="dir-legenda">' + LIVELLI.map(l => {
        const n = conteggi[l[0]];
        return '<button type="button" class="' + (vista === l[0] ? 'attivo' : '') + '" data-vista="' + l[0] + '" title="Mostra solo le commesse ' + esc(l[1].toLowerCase()) + '">' +
          '<span class="p ' + l[0] + '"></span><span class="nome">' + esc(l[1]) + '</span><b>' + conta(n, 'intero') + '</b><span class="q">' + (d.n ? Fmt.pct(n / d.n, 0) : Fmt.VUOTO) + '</span></button>';
      }).join('') + '</div>' +
      '<p class="regola">Clicca un settore o una voce per vedere solo quelle commesse nell\'elenco in fondo.</p></section>';
  }

  // ------------------------------------------------------------ redditività: obiettivo ↔ effettiva
  function cardRedditivita(d) {
    const r = d.redditivita;
    const haEff = r.effettivaPct !== null;
    const ok = haEff && r.effettivaPct >= r.richiestaPct;
    // scala del metro: l'obiettivo sta a due terzi, così c'è posto anche per chi lo supera
    const scala = Math.max(r.richiestaPct * 1.5, haEff ? r.effettivaPct * 1.1 : 0, 0.01);
    return '<section class="dir-card"><h2>Redditività</h2>' +
      '<div class="dir-due">' +
      '<div class="lato"><div class="et">Richiesta</div><div class="grande">' + conta(r.richiestaPct, 'pct') + '</div>' +
      '<div class="sub">obiettivo impostato nei Parametri</div></div>' +
      '<div class="lato"><div class="et">Effettiva</div><div class="grande ' + (haEff ? (ok ? 'verde-t' : 'rosso-t') : 'grigio-t') + '">' + (haEff ? conta(r.effettivaPct, 'pct') : Fmt.VUOTO) + '</div>' +
      '<div class="sub">' + (haEff ? 'su ' + r.nEseguite + (r.nEseguite === 1 ? ' commessa eseguita' : ' commesse eseguite') : 'nessuna ora ancora consumata') + '</div></div>' +
      '</div>' +
      '<div class="dir-metro" title="Redditività effettiva ' + (haEff ? pct(r.effettivaPct) : 'n.d.') + ', richiesta ' + pct(r.richiestaPct) + '">' +
      '<div class="pista">' + (haEff ? '<i class="' + (ok ? 'verde' : 'rosso') + '" style="width:' + quota(r.effettivaPct, scala) + '"></i>' : '') + '</div>' +
      '<div class="tacca" style="left:' + quota(r.richiestaPct, scala) + '"><span>obiettivo ' + pct(r.richiestaPct) + '</span></div></div>' +
      '<p class="dir-nota">La percentuale effettiva è l\'utile maturato diviso il prezzo sostenibile della parte strutturale delle ore consumate, come nel conto della commessa.</p></section>';
  }

  // ------------------------------------------------------------ fatturato dell'esercizio: tre cifre e il mese per mese
  // Quanto si è fatturato nell'anno contro quanto si poteva fatturare nell'anno. Di ogni commessa conta il
  // solo contributo dell'esercizio: quello che era già fatturato negli anni precedenti resta fuori.
  // Sotto le cifre, una colonna per mese dell'esercizio con il suo importo sopra.
  const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  // importo compatto per l'etichetta sopra la colonna: 412.300 → "412k €", 1.250.000 → "1,25M €".
  // Sotto le diecimila euro si tiene un decimale, così un mese piccolo non diventa "0k €".
  const compatto = v => (Math.abs(v) >= 1e6 ? Fmt.numero(Math.round(v / 1e4) / 100) + 'M' : (Math.abs(v) >= 10000 ? Fmt.numero(Math.round(v / 1000), 0) : Fmt.numero(Math.round(v / 100) / 10)) + 'k') + ' €';
  function colonneMesi(mesi, anno) {
    const max = mesi.reduce((m, x) => Math.max(m, x.fatturato), 0);
    if (!(max > 0)) return '<p class="dir-nessuna">Nessuna fattura registrata nel ' + esc(anno) + '.</p>';
    return '<div class="dir-mesi" role="img" aria-label="Fatturato del ' + anno + ' mese per mese">' + mesi.map((x, i) =>
      '<div class="mese' + (x.fatturato > 0 ? '' : ' senza') + '" title="' + esc(x.nome + ' ' + anno + ': ' + euro(x.fatturato)) + '">' +
      '<div class="colonna"><i style="height:' + (x.fatturato / max * 100).toFixed(1) + '%">' + (x.fatturato > 0 ? '<span>' + esc(compatto(x.fatturato)) + '</span>' : '') + '</i></div>' +
      '<div class="nome">' + MESI_BREVI[i] + '</div></div>').join('') + '</div>';
  }
  function cardFatturazione(d, P, mesi) {
    const f = d.fatturazione, anno = P.annoGestione;
    const voce = (etichetta, valore, sub) => '<div class="voce"><div class="et">' + etichetta + '</div><div class="val">' + conta(valore, 'euro0') + '</div><div class="sub">' + sub + '</div></div>';
    return '<section class="dir-card dir-fatturato"><h2>Fatturato del ' + esc(anno) + '</h2><div class="dir-tre senza-barre">' +
      voce('Fatturato nel ' + anno, f.fatturato, f.quota === null ? 'nessun importo fatturabile' : '<span class="richiesto">' + pct(f.quota) + ' del fatturabile</span>fatturato lordo dei movimenti dell\'anno') +
      voce('Fatturabile nel ' + anno, f.fatturabile, 'contratto aggiornato meno perdite SAL accettate, meno quanto già fatturato negli anni precedenti') +
      voce('Ancora da fatturare', f.daFatturare, '<span class="richiesto">' + euro0(f.salDaFatturare) + ' fatturabili subito</span>SAL già maturato e non ancora fatturato') +
      '</div>' + colonneMesi(mesi, anno) +
      (f.nSenzaContratto ? '<p class="dir-nota">' + f.nSenzaContratto + (f.nSenzaContratto === 1 ? ' commessa è senza contratto e non entra' : ' commesse sono senza contratto e non entrano') + ' nel fatturabile.</p>' : '') + '</section>';
  }

  // ------------------------------------------------------------ rientro bancario: desiderato, effettivo, realizzato dalle finite
  // r = i tre valori del periodo scelto: il solo esercizio (movimenti e costi dell'anno, senza i saldi
  // iniziali) oppure l'intera vita delle commesse (saldi iniziali compresi).
  function cardRientro(r, P) {
    const anno = periodoRientro === 'anno';
    const max = Math.max(r.desiderato, Math.abs(r.effettivo), Math.abs(r.effettivoFinite), 1);
    // I colori sono quelli chiesti dalla Direzione, fissi per voce: desiderato rosso, effettivo verde,
    // realizzato dalle finite grigio. Non dipendono dal segno né dal risultato: quello lo dice il testo sotto.
    const inLinea = r.effettivo >= 0 && r.effettivo >= r.dovutoEseguito;
    const quando = anno ? 'nel ' + P.annoGestione : 'in tutta la vita delle commesse';
    const voce = (classe, etichetta, valore, sub) => '<div class="voce ' + classe + '" title="' + esc(etichetta + ': ' + euro(valore)) + '"><div class="et">' + etichetta + '</div><div class="val">' + conta(valore, 'euro0') + '</div>' +
      '<div class="pista"><i style="width:' + quota(Math.max(0, valore), max) + '"></i></div><div class="sub">' + sub + '</div></div>';
    const scelta = (id, testo, titolo) => '<button type="button" class="' + (periodoRientro === id ? 'attivo' : '') + '" data-periodo="' + id + '" aria-pressed="' + (periodoRientro === id) + '" title="' + esc(titolo) + '">' + esc(testo) + '</button>';
    return '<section class="dir-card' + (animaRientro ? ' anima' : '') + '" id="dir-rientro"><div class="dir-card-testa"><h2>Rientro bancario</h2>' +
      '<div class="dir-periodo" role="group" aria-label="Periodo del rientro bancario">' +
      scelta('anno', 'Esercizio ' + P.annoGestione, 'Solo movimenti e costi del ' + P.annoGestione + ', senza i saldi iniziali') +
      scelta('vita', 'Intera vita', 'Dall\'inizio di ogni commessa, saldi iniziali compresi') + '</div></div>' +
      '<div class="dir-tre">' +
      voce('rosso', 'Desiderato', r.desiderato, r.desideratoImpostato ? 'obiettivo dell\'anno, dai Parametri'
        : (anno ? 'ore ancora da fare a inizio ' + P.annoGestione : 'ore previste dell\'intero budget') + ' per ' + euro(r.orario) + '/h') +
      voce('verde', 'Effettivo', r.effettivo, r.effettivo < 0 ? 'negativo: l\'utile maturato ' + quando + ' non copre nemmeno la redditività richiesta'
        : (inLinea ? 'copre i ' : 'sotto i ') + euro0(r.dovutoEseguito) + ' dovuti sul lavoro eseguito ' + quando) +
      // sulle finite si mostra prima ciò che è rientrato davvero, sotto ciò che era richiesto
      (r.nFinite
        ? voce('grigio', 'Realizzato dalle finite', r.effettivoFinite, '<span class="richiesto">Richiesti ' + euro0(r.dovutoFinite) + '</span>ore consumate ' + (anno ? 'nel ' + P.annoGestione + ' ' : '') + 'dalle ' + r.nFinite + ' commesse finite per ' + euro(r.orario) + '/h')
        : voce('grigio', 'Realizzato dalle finite', 0, 'nessuna commessa finita con ore consumate' + (anno ? ' nel ' + P.annoGestione : ''))) +
      '</div><p class="dir-nota">' + (anno
        ? 'Solo l\'esercizio ' + P.annoGestione + ': movimenti e costi dell\'anno, senza i saldi iniziali delle commesse cominciate prima.'
        : 'Intera vita delle commesse operative: dall\'inizio di ciascuna, saldi iniziali compresi.') +
      ' Il rientro è l\'utile maturato meno la redditività richiesta; quello richiesto è ore consumate per ' + euro(r.orario) + '/h.' +
      (Store.vedePagina('parametri') ? ' Il rientro per ora si imposta nei <a href="#/parametri">Parametri</a>.' : '') + '</p></section>';
  }

  // ------------------------------------------------------------ risultato delle commesse finite / in corso
  function cardUtile(titolo, u, righe, campo, vistaId, etUtile, etPerdita, senzaDati) {
    const dati = righe.filter(r => r[campo] !== null && r[campo] !== undefined);
    // si mostrano le più pesanti in valore assoluto: sono quelle che fanno il totale
    const mostrate = dati.slice().sort((a, b) => Math.abs(b[campo]) - Math.abs(a[campo])).slice(0, 8).sort((a, b) => b[campo] - a[campo]);
    // lo zero sta dove serve: a sinistra se sono tutte in utile, a destra se tutte in perdita, altrimenti
    // in proporzione, così nessuna metà del riquadro resta vuota
    const maxPos = mostrate.reduce((m, r) => Math.max(m, r[campo]), 0), maxNeg = mostrate.reduce((m, r) => Math.max(m, -r[campo]), 0);
    const ampiezza = maxPos + maxNeg, zero = ampiezza > 0 ? maxNeg / ampiezza * 100 : 0;
    const barre = mostrate.map(r => {
      const v = r[campo], larg = ampiezza > 0 ? Math.abs(v) / ampiezza * 100 : 0;
      return '<a href="#/commessa/' + esc(r.id) + '" title="' + esc(r.etichetta + '\n' + (v < 0 ? etPerdita : etUtile) + ' ' + euro(v)) + '"><span class="cod">' + esc(r.codice) + '</span>' +
        '<span class="asse"><span class="zero" style="left:' + zero.toFixed(1) + '%"></span><i class="' + (v < 0 ? 'neg' : 'pos') + '" style="' + (v < 0 ? 'right:' + (100 - zero).toFixed(1) : 'left:' + zero.toFixed(1)) + '%;width:' + larg.toFixed(1) + '%"></i></span>' +
        '<span class="v ' + segno(v) + '">' + conta(v, 'euro0') + '</span></a>';
    }).join('');
    const tot = u.nCalcolabili ? u.totale : null;
    return '<section class="dir-card"><h2>' + esc(titolo) + '</h2>' +
      '<div class="dir-esito"><div><div class="et">' + (tot === null ? 'Non calcolabile' : (tot < 0 ? etPerdita : etUtile)) + '</div>' +
      '<div class="grande ' + (tot === null ? 'grigio-t' : segno(tot)) + '">' + (tot === null ? Fmt.VUOTO : conta(tot, 'euro0')) + '</div></div>' +
      '<div class="conta">' + u.n + (u.n === 1 ? ' commessa' : ' commesse') + (u.nCalcolabili ? '<br><span class="verde-t"><b>' + u.inUtile + '</b> in utile</span>, <span class="rosso-t"><b>' + u.inPerdita + '</b> in perdita</span>' : '') +
      (u.n > u.nCalcolabili && senzaDati ? '<br>' + (u.n - u.nCalcolabili) + ' ' + senzaDati : '') + '</div></div>' +
      (barre ? '<div class="dir-barre">' + barre + '</div>' + (dati.length > mostrate.length ? '<p class="dir-nota">Le ' + mostrate.length + ' commesse che pesano di più, su ' + dati.length + '.</p>' : '') : '<p class="dir-nessuna">Nessuna commessa in questo gruppo.</p>') +
      '<div class="azione"><button type="button" class="' + (vista === vistaId ? 'attivo' : '') + '" data-vista="' + vistaId + '">' + (vista === vistaId ? 'Elenco filtrato su queste commesse' : 'Vedi solo queste commesse') + '</button></div></section>';
  }

  UI.registra('dashboard', function (cont) {
    const P = Store.db.parametri;
    const tutte = Engine.calcolaTutte(Store.db);
    const d = Engine.direzionale(tutte, P);
    // rientro bancario del periodo scelto: sull'intera vita le righe sono quelle della pagina; sul solo
    // esercizio le stesse commesse vanno ricalcolate senza i saldi iniziali
    const rientro = periodoRientro === 'vita' ? Engine.direzionale(tutte, P, { vita: true }).rientro
      : Engine.direzionale(Engine.calcolaTutte(Store.db, { senzaSaldi: true }), P).rientro;
    // redditività effettiva della singola commessa, per l'elenco
    tutte.forEach(r => {
      const b = Engine.num(r.sostenibilitaConsuntivo.strutturale.conRedditivita);
      r.redditivitaEffettiva = (r.oreUsate > 0 && b > 0) ? r.utileMaturato / b : null;
    });

    const anima = !senzaAnimazione && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    cont.innerHTML = '<div class="dir' + (anima ? ' anima' : '') + '">' +
      UI.testata('Dashboard direzionale', 'Gli obiettivi dell\'anno e a che punto siamo. Saldi al 31/12/' + esc(P.annoGestione - 1) + ' più i movimenti del ' + esc(P.annoGestione) + '.',
        UI.pulsanteEsporta('dash', 'Esporta elenco (CSV)') + '<button type="button" onclick="window.print()">Stampa</button>') +
      '<div class="dir-cima">' + fascia(d, P, anima) + cardFatturazione(d, P, Engine.fatturatoMensile(Store.db, tutte.map(r => r.id))) + '</div>' +
      '<div class="dir-griglia">' + cardRedditivita(d) + cardRientro(rientro, P) + '</div>' +
      '<div class="dir-griglia">' +
      cardUtile('Commesse finite', d.finite, tutte.filter(r => r.finito), 'utileMaturato', 'finite', 'Utile effettivo', 'Perdita effettiva', '') +
      cardUtile('Commesse in corso', d.inCorso, tutte.filter(r => !r.finito), 'utileAFinire', 'inCorso', 'Utile a finire', 'Perdita a finire', 'senza budget, non calcolabili') +
      '</div>' +
      '<section class="dir-elenco"><h2 id="dash-elenco">Commesse</h2>' +
      '<div class="dir-filtri">' + VISTE.map(v => '<button type="button" class="' + (vista === v[0] ? 'attivo' : '') + '" data-vista="' + v[0] + '">' + esc(v[1]) + ' <b>' + tutte.filter(v[2]).length + '</b></button>').join('') +
      '<span class="conta" id="dash-conta"></span></div>' +
      '<div id="dash-tab"></div></section></div>';

    senzaAnimazione = false;   // vale per questo solo disegno: tornando sulla pagina l'animazione riparte
    if (anima) animaContatori(cont);
    else if (animaRientro) animaContatori(document.getElementById('dir-rientro'));
    animaRientro = false;
    // cambio di periodo del rientro: si ridisegna la pagina ferma e si rianima solo quel riquadro
    cont.querySelectorAll('[data-periodo]').forEach(b => b.onclick = () => {
      if (periodoRientro === b.dataset.periodo) return;
      periodoRientro = b.dataset.periodo;
      const y = window.scrollY;
      senzaAnimazione = true;
      animaRientro = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      UI.render();
      window.scrollTo(0, y);   // UI.render riporta in cima: chi ha cliccato l'interruttore resta dov'era
    });
    const colUtile = v => Fmt.isNum(v) ? '<span class="' + segno(v) + '"><b>' + euro(v) + '</b></span>' : '<span class="muto">—</span>';
    const colonne = [
      { campo: 'alert', titolo: 'Allerta', valOrd: r => Engine.LIVELLI_ALERT.indexOf(r.alert), fmt: v => UI.badgeAlert(v) },
      { campo: 'codice', titolo: 'Codice', fmt: (v, r) => UI.linkCommessa(r) },
      { campo: 'cliente', titolo: 'Cliente' },
      { campo: 'cantiere', titolo: 'Cantiere', classe: 'desc' },
      { campo: 'stato', titolo: 'Stato', fmt: v => UI.badgeStato(v) },
      { campo: 'contrattoAggiornato', titolo: 'Contratto', tipo: 'n', fmt: v => euro(v) },
      { campo: 'utileMaturato', titolo: 'Utile maturato', tipo: 'n', fmt: colUtile },
      { campo: 'utileAFinire', titolo: 'Utile a finire', tipo: 'n', fmt: (v, r) => r.finito ? '<span class="muto" title="Commessa finita: vale l\'utile maturato">finita</span>' : colUtile(v) },
      { campo: 'redditivitaEffettiva', titolo: 'Redditività effettiva', tipo: 'n', fmt: v => Fmt.isNum(v) ? '<span class="' + (v >= P.redditivita ? 'verde-t' : 'rosso-t') + '">' + pct(v) + '</span>' : '<span class="muto">—</span>' },
      { campo: 'motivi', titolo: 'Motivo allerta', ord: false, fmt: (v, r) => UI.motiviHtml(r) }
    ];
    const def = VISTE.find(v => v[0] === vista) || VISTE[0];
    const righe = tutte.filter(def[2]);
    document.getElementById('dash-conta').textContent = vista === 'tutte' ? tutte.length + ' commesse' : righe.length + ' su ' + tutte.length;
    const t = document.getElementById('dash-tab');
    t.innerHTML = UI.tabella('dash', { colonne, righe, chiave: 'id', ordine: { campo: 'alert', dir: 'asc' }, vuoto: 'Nessuna commessa in questa vista.', onRiga: id => UI.vai('#/commessa/' + id) });
    UI.legaTabelle(t);

    // torta, legenda, riquadri e pulsanti filtrano l'elenco: un secondo clic sulla stessa vista torna a "tutte"
    const scegli = b => {
      const scelta = b.dataset.vista;
      vista = (vista === scelta && scelta !== 'tutte') ? 'tutte' : scelta;
      const daFuori = !b.closest('.dir-filtri');
      senzaAnimazione = true;
      UI.render();
      if (daFuori) { const el = document.getElementById('dash-elenco'); if (el) el.scrollIntoView({ block: 'start' }); }
    };
    cont.querySelectorAll('[data-vista]').forEach(b => {
      b.onclick = () => scegli(b);
      // le fette della torta non sono pulsanti veri: da tastiera rispondono a Invio e Spazio
      if (b.classList.contains('fetta')) b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scegli(b); } };
    });
    const be = cont.querySelector('[data-esporta="dash"]');
    if (be) be.onclick = () => UI.esportaCsv('dashboard_commesse', UI.righeOrdinate('dash'), UI.COLONNE_EXPORT_SCHEDA);
  });
})();
