/* FIDA EDILE – Dettaglio commessa: pagina unica a schede */
(function () {
  'use strict';
  const esc = UI.esc;
  const TABS = [['riepilogo', 'Riepilogo'], ['anagrafica', 'Anagrafica'], ['budget', 'Budget'], ['gantt', 'Gantt'], ['sostenibilita', 'Sostenibilità'], ['movimenti', 'Movimenti'], ['costi', 'Costi diretti'], ['saldi', 'Saldi storici'], ['controllo', 'Controllo'], ['note', 'Note / Azioni']];

  function kv(righe) {
    return '<table class="kv">' + righe.map(r => '<tr><th>' + esc(r[0]) + '</th><td class="' + (r[2] || '') + '">' + r[1] + '</td></tr>').join('') + '</table>';
  }
  const E = v => Fmt.euro(v), O = v => Fmt.ore(v), Pc = (v, dec) => Fmt.pct(v, dec), Dt = v => Fmt.data(v), T = v => esc(Fmt.testo(v));

  // Pulsanti di modifica: ognuno sta nella scheda (o nel pannello) a cui si riferisce, non tutti raggruppati in testata.
  const AZIONI = {
    anag: { testo: '✎ Modifica anagrafica', permesso: () => Store.puo('commessa.modifica') },
    bud: { testo: '✎ Modifica budget', permesso: () => Store.puo('budget.modifica') },
    sost: { testo: '✎ Modifica verifica', permesso: () => Store.puo('sostenibilita.modifica') },
    mov: { testo: '+ Nuovo movimento', classe: 'primario', permesso: () => Store.puo('movimento.crea') },
    costo: { testo: '+ Nuovo costo diretto', classe: 'primario', permesso: () => Store.puo('costo.crea') },
    fase: { testo: '+ Nuova fase', classe: 'primario', permesso: () => Store.puo('fase.crea') },
    note: { testo: '✎ Note / Aggiornato al', permesso: () => Store.puo('noteAzione') || Store.puo('aggiornatoAl') }
  };
  function az(chiave, testo, classe) {
    const a = AZIONI[chiave];
    if (!a.permesso()) return '';
    return '<button type="button" class="' + (classe !== undefined ? classe : (a.classe || '')) + '" data-az="' + chiave + '">' + esc(testo || a.testo) + '</button>';
  }
  // barra delle azioni di una scheda (in alto a destra dentro la scheda)
  function barraScheda() { const h = Array.prototype.slice.call(arguments).join(''); return h ? '<div class="azioni-scheda">' + h + '</div>' : ''; }
  // titolo di un pannello con il suo pulsante di modifica a destra
  // Giudizio in parole sugli scostamenti, coerente con le soglie di Parametri: ore consumate oltre il
  // prodotto = cantiere in ritardo, sotto = in anticipo. Mezzo decimo di punto di tolleranza intorno allo
  // zero, così quello che si legge 0,0 % non viene chiamato né anticipo né ritardo.
  function esitoOre(r, col, P) {
    if (!col) return 'Non calcolabile: ' + (r.orePct === null ? 'manca il budget ore' : 'manca il valore recuperabile');
    if (col === 'rosso') return 'Cantiere in ritardo, critico (oltre ' + Pc(P.scartoOreCritico) + ')';
    if (col === 'giallo') return 'Cantiere in ritardo, attenzione (oltre ' + Pc(P.scartoOreAttenzione) + ')';
    if (r.scostOre > 0.0005) return 'Cantiere in leggero ritardo (entro la soglia)';
    if (r.scostOre < -0.0005) return 'Cantiere in anticipo';
    return 'Cantiere al pari';
  }
  function testaPannello(titolo, azHtml) { return '<div class="pannello-testa"><h2>' + esc(titolo) + '</h2>' + (azHtml || '') + '</div>'; }

  function riepilogo(r, c) {
    const P = Store.db.parametri;
    const colOre = r.scostOre === null ? '' : (r.scostOre > P.scartoOreCritico ? 'rosso' : (r.scostOre > P.scartoOreAttenzione ? 'giallo' : 'verde'));
    return '<div class="pannello"><div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><span style="font-size:20px">' + UI.badgeAlert(r.alert) + '</span>' + UI.motiviHtml(r) + '</div>' +
      (r.note.length ? '<div class="sotto" style="margin-top:6px">Note informative: ' + r.note.map(esc).join(' · ') + '</div>' : '') + '</div>' +
      // stessi pannelli della Dashboard di analisi, calcolati sulla sola commessa aperta
      Analisi.pannelli(Engine.riepilogo([r]), { singola: true, sostIni: r.sostenibilitaIniziale, sostAgg: r.sostenibilita, sostCons: r.sostenibilitaConsuntivo }) +
      '<div class="griglia-2">' +
      '<div class="pannello"><h2>Ore − SAL maturato (quarta colonna)</h2>' +
      '<p class="spiegazione">Confronta le ore di manodopera consumate (Ore %) con quanto è stato prodotto (SAL %). <b>Scostamento = Ore % − SAL %</b>: positivo = consumate più ore di quanto prodotto (inefficienza); zero o negativo = ore in linea con l\'avanzamento.</p>' +
      '<div class="confronto"><div class="voce"><div class="et">Ore consumate %</div><div class="val">' + Pc(r.orePct) + '</div>' + UI.barra(r.orePct, r.orePct >= 1 ? 'rosso' : '') + '</div><div class="voce"><div class="et">SAL %</div><div class="val">' + Pc(r.salPct) + '</div>' + UI.barra(r.salPct) + '</div>' +
      '<div class="voce ' + colOre + '"><div class="et">Ore − SAL</div><div class="val">' + Pc(r.scostOre) + '</div><div class="esito">' + esitoOre(r, colOre, P) + '</div></div></div>' +
      '<p class="sotto">Ore budget ' + O(r.oreBudget) + ' · usate (cumulate) ' + O(r.oreUsate) + ' · residue ' + O(r.oreResidue) + '</p></div>' +
      '<div class="pannello"><h2>Costi diretti</h2><div class="confronto"><div class="voce"><div class="et">Budget</div><div class="val">' + E(r.costiBudget) + '</div></div><div class="voce"><div class="et">Sostenuti (cumulati)</div><div class="val">' + E(r.costiSostenuti) + '</div>' + UI.barra(r.costiBudget > 0 ? r.costiSostenuti / r.costiBudget : 0, r.costiSforamento > 0 ? 'rosso' : '') + '</div><div class="voce"><div class="et">' + (r.costiSforamento > 0 ? 'Sforamento' : 'Residuo') + '</div><div class="val" style="color:var(--' + (r.costiSforamento > 0 ? 'rosso' : 'verde') + ')">' + E(r.costiSforamento > 0 ? r.costiSforamento : r.costiResiduo) + '</div></div></div>' +
      '<p class="sotto">Costo effettivo cumulato = ore consumate ' + O(r.oreUsate) + ' × ' + E(P.costoOrario) + '/h + costi diretti sostenuti ' + E(r.costiSostenuti) + '</p></div></div>' +
      '<div class="pannello">' + testaPannello('Note / Azione', az('note', '✎ Modifica', 'piccolo')) + '<p>' + (c.noteAzione ? esc(c.noteAzione).replace(/\n/g, '<br>') : '<span class="muto">Nessuna annotazione.</span>') + '</p></div>' +
      // l'andamento dell'utile chiude il Riepilogo: e' il quadro d'insieme della commessa, non una scheda a se
      utileMaturato(r, c);
  }

  // ------------------------------------------------------------ utile maturato (in fondo al Riepilogo)
  // Grafico scritto a mano in SVG, come il Gantt: una linea sola (l'utile maturato), la riga dello zero
  // e il punto di arrivo previsto. Il tratteggio che porta al punto finale è una proiezione, non un dato
  // maturato, e per questo è l'unico tratto non continuo del disegno.
  function graficoUtile(punti, target) {
    // Le date stanno tutte su una riga sola. Perché non si tocchino, la tela si allarga finché anche le
    // due date più ravvicinate distano almeno 78 unità: se servisse una tela smisurata ci si ferma a 3600
    // e le poche date che ancora si sovrappongono vengono saltate. Oltre il pannello il grafico scorre.
    const H = 360, ml = 104, mr = 34, mt = 20, mb = 46;
    const giorni = punti.map(p => Engine.dayNum(p.data)).concat((target && target.data) ? [Engine.dayNum(target.data)] : []).sort((a, b) => a - b);
    const arco = Math.max(1, giorni[giorni.length - 1] - giorni[0]);
    let minimo = arco;
    giorni.forEach((g, i) => { if (i && g - giorni[i - 1] > 0) minimo = Math.min(minimo, g - giorni[i - 1]); });
    const W = Math.max(1200, Math.min(3600, ml + mr + 78 * arco / minimo));
    const x0 = ml, x1 = W - mr, y0 = mt, y1 = H - mb;
    const gg = d => Engine.dayNum(d);
    const ultimo = punti[punti.length - 1];
    const dMin = gg(punti[0].data);
    const dMax = Math.max(gg(ultimo.data), (target && target.data) ? gg(target.data) : 0);
    const spanX = Math.max(1, dMax - dMin);
    let vMin = 0, vMax = 0;
    punti.concat(target ? [target] : []).forEach(p => { vMin = Math.min(vMin, p.utile); vMax = Math.max(vMax, p.utile); });
    if (vMin === vMax) { vMin -= 1000; vMax += 1000; }
    const margine = (vMax - vMin) * 0.12;
    vMin -= margine; vMax += margine;
    const px = d => x0 + (gg(d) - dMin) / spanX * (x1 - x0);
    const py = v => y1 - (v - vMin) / (vMax - vMin) * (y1 - y0);
    // tacche "tonde": 1, 2, 5 × potenza di dieci, quattro intervalli circa
    const grezzo = (vMax - vMin) / 4, esp = Math.pow(10, Math.floor(Math.log10(grezzo))), m = grezzo / esp;
    const passo = (m >= 5 ? 10 : m >= 2 ? 5 : m >= 1 ? 2 : 1) * esp;
    const tacche = [];
    for (let v = Math.ceil(vMin / passo) * passo; v <= vMax; v += passo) tacche.push(v);
    const testo = (x, y, t, classe, ancora) => '<text x="' + x + '" y="' + y + '" class="' + classe + '" text-anchor="' + (ancora || 'start') + '">' + esc(t) + '</text>';
    const griglia = tacche.map(v => '<line x1="' + x0 + '" y1="' + py(v).toFixed(1) + '" x2="' + x1 + '" y2="' + py(v).toFixed(1) + '" class="g-griglia"/>' +
      testo(x0 - 8, py(v) + 4, Fmt.numero(v, 0) + ' €', 'g-tacca', 'end')).join('');
    const zero = '<line x1="' + x0 + '" y1="' + py(0).toFixed(1) + '" x2="' + x1 + '" y2="' + py(0).toFixed(1) + '" class="g-zero"/>';
    // la linea cambia colore quando attraversa lo zero: verde finché l'utile è sopra, rossa sotto.
    // Il tratto che attraversa lo zero viene spezzato nel punto esatto in cui lo taglia, non al punto dopo.
    const tratto = (xa, va, xb, vb) => '<path d="M' + xa.toFixed(1) + ' ' + py(va).toFixed(1) + ' L' + xb.toFixed(1) + ' ' + py(vb).toFixed(1) +
      '" class="g-linea ' + ((va >= 0 && vb >= 0) ? 'pos' : 'neg') + '"/>';
    const linea = punti.slice(1).map((b, i) => {
      const a = punti[i], xa = px(a.data), xb = px(b.data);
      if ((a.utile >= 0) === (b.utile >= 0)) return tratto(xa, a.utile, xb, b.utile);
      const q = a.utile / (a.utile - b.utile);            // frazione del tratto in cui l'utile vale zero
      const xm = xa + (xb - xa) * q;
      return tratto(xa, a.utile, xm, 0) + tratto(xm, 0, xb, b.utile);
    }).join('');
    // il punto si prende anche senza centrarlo: sotto ogni pallino c'è un bersaglio trasparente più largo
    const pallini = punti.map(p => '<g class="g-punto ' + (p.utile >= 0 ? 'pos' : 'neg') + '"><circle cx="' + px(p.data).toFixed(1) + '" cy="' + py(p.utile).toFixed(1) + '" r="4"/>' +
      '<circle cx="' + px(p.data).toFixed(1) + '" cy="' + py(p.utile).toFixed(1) + '" r="13" class="g-presa"><title>' +
      esc(Dt(p.data) + (p.saldo ? ' (saldo iniziale)' : '') + '\nUtile maturato ' + E(p.utile) + '\nFatturato ' + E(p.fatt) + ' · perdite SAL ' + E(p.perdite) + '\nCosti diretti ' + E(p.costi) + ' · ore ' + O(p.ore) + ' (' + E(p.costoOre) + ')') + '</title></circle></g>').join('');
    // etichetta dell'ultimo valore maturato: se sta troppo vicino al punto finale scende sotto la linea
    const xUlt = px(ultimo.data), xFin = target && target.data ? px(target.data) : x1;
    // La cifra attuale si scosta dalla linea: si guarda da che parte arriva la curva e da che parte riparte
    // la proiezione, e la si mette nel quadrante libero. Cima → sopra, avvallamento → sotto, tratto in
    // discesa → sopra, in salita → sotto. Di lato sta a destra se c'è spazio prima del punto finale.
    const yUlt = py(ultimo.utile);
    const yPrec = punti.length > 1 ? py(punti[punti.length - 2].utile) : yUlt;
    const yProx = target ? py(target.utile) : yPrec;
    const cima = yPrec >= yUlt && yProx >= yUlt, avvallamento = yPrec <= yUlt && yProx <= yUlt;
    const dy = cima ? -16 : (avvallamento ? 26 : (yProx > yUlt ? -16 : 26));
    const aDestra = (xFin - xUlt) > 200 || (!target && (x1 - xUlt) > 130);
    const etUlt = testo(xUlt + (aDestra ? 12 : -12), yUlt + dy, E(ultimo.utile), 'g-valore ' + (ultimo.utile < 0 ? 'neg' : 'pos'), aDestra ? 'start' : 'end');
    let fine = '';
    if (target) {
      const xt = target.data ? px(target.data) : x1, yt = py(target.utile);
      fine = '<path d="M' + xUlt.toFixed(1) + ' ' + py(ultimo.utile).toFixed(1) + ' L' + xt.toFixed(1) + ' ' + yt.toFixed(1) + '" class="g-proiezione"/>' +
        '<g class="g-punto fine"><circle cx="' + xt.toFixed(1) + '" cy="' + yt.toFixed(1) + '" r="5.5"/>' +
        '<circle cx="' + xt.toFixed(1) + '" cy="' + yt.toFixed(1) + '" r="13" class="g-presa"><title>' +
        esc('Utile a commessa finita ' + E(target.utile) + (target.data ? '\nData di fine ' + Dt(target.data) : '\nData di fine non indicata')) + '</title></circle></g>' +
        testo(xt, yt - 17, E(target.utile), 'g-valore fine ' + (target.utile < 0 ? 'neg' : 'pos'), 'end');
    }
    const dataFin = target && target.data ? target.data : null;
    // sotto l'asse, in una riga sola, la data di ogni pallino più quella del punto finale
    const date = punti.map(p => p.data).concat(dataFin ? [dataFin] : []);
    // filo tratteggiato che scende da ogni pallino fino all'asse: lega il punto alla sua data
    const guide = punti.concat(target && target.data ? [target] : []).map(p =>
      '<line x1="' + px(p.data).toFixed(1) + '" y1="' + py(p.utile).toFixed(1) + '" x2="' + px(p.data).toFixed(1) + '" y2="' + y1 + '" class="g-guida"/>').join('');
    let ultimaX = -1e9;
    const etichetteX = date.map((d, i) => {
      const x = px(d);
      if (x - ultimaX < 78) return '';
      ultimaX = x;
      return testo(x, y1 + 22, Dt(d), 'g-tacca', i === 0 ? 'start' : (i === date.length - 1 ? 'end' : 'middle'));
    }).join('');
    return '<div class="grafico-utile"><svg viewBox="0 0 ' + W + ' ' + H + '" style="min-width:' + Math.round(W * 0.9) + 'px" role="img" aria-label="Andamento dell\'utile maturato">' +
      griglia + zero + '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '" class="g-griglia"/>' + guide +
      fine + linea + pallini + etUlt + etichetteX + '</svg></div>';
  }

  function utileMaturato(r, c) {
    const P = Store.db.parametri;
    const serie = Engine.serieUtile(c, Store.db, null, { senzaSaldi });
    const punti = serie.punti;
    const ultimo = punti[punti.length - 1];
    // punto di arrivo: l'utile della situazione aggiornata al (terza colonna del conto della commessa),
    // cioè valore recuperabile − costi diretti previsti vigenti − costo delle ore previste vigenti
    const haBudget = r.hasOreBudget && r.hasCostiBudget;
    const utileFine = haBudget ? r.valoreRecuperabile - r.costiBudget - r.costoOrePreviste : null;
    const dataFine = c.dataFineEffettiva || c.dataFinePrevista || '';
    const target = utileFine === null ? null : { data: Engine.dayNum(dataFine) > Engine.dayNum(ultimo.data) ? dataFine : '', utile: utileFine };
    const manca = utileFine === null ? null : utileFine - ultimo.utile;
    const col = v => v < 0 ? 'rosso' : 'verde';
    return '<div class="pannello"><h2>Utile maturato</h2>' +
      '<p class="spiegazione">L\'utile maturato è quello della colonna <b>Maturato</b> del conto della commessa: <b>fatturato lordo − perdite SAL accettate − costi diretti sostenuti − ore consumate × costo orario</b> (' + E(P.costoOrario) + '/h). ' +
      'Si aggiorna da sé a ogni movimento, costo diretto o ora registrata. Il punto in fondo è l\'<b>utile a commessa finita</b> secondo la situazione aggiornata al: valore recuperabile − costi diretti previsti vigenti − costo delle ore previste vigenti.</p>' +
      '<div class="kpi-griglia">' +
      UI.kpi('Utile maturato a oggi', E(ultimo.utile), { colore: col(ultimo.utile) }) +
      UI.kpi('Utile a commessa finita', utileFine === null ? Fmt.VUOTO : E(utileFine), { colore: utileFine === null ? '' : col(utileFine) }) +
      UI.kpi(manca !== null && manca < 0 ? 'Ancora da perdere' : 'Ancora da maturare', manca === null ? Fmt.VUOTO : E(manca)) +
      UI.kpi('Ore consumate', O(ultimo.ore), { calc: false }) +
      UI.kpi('Date con movimenti', serie.nEventi, { calc: false }) +
      '</div>' +
      (haBudget ? '' : '<div class="msg avviso">Budget incompleto (' + (r.hasOreBudget ? '' : 'ore previste') + (r.hasOreBudget || r.hasCostiBudget ? '' : ' e ') + (r.hasCostiBudget ? '' : 'costi diretti previsti') + ' non indicati): il punto di utile a commessa finita non è calcolabile.</div>') +
      graficoUtile(punti, target) +
      (target && !target.data ? '<p class="sotto">La data di fine non è successiva all\'ultimo movimento: il punto di arrivo è disegnato a fine grafico.</p>' : '') +
      '</div>' +
      '<div class="pannello"><h2>I numeri del grafico</h2>' +
      '<div class="tabella-wrap"><table class="tab"><thead><tr><th>Data</th><th class="n">Fatturato lordo</th><th class="n">Perdite SAL</th><th class="n">Costi diretti</th><th class="n">Ore</th><th class="n">Costo delle ore</th><th class="n">Utile maturato</th></tr></thead><tbody>' +
      punti.map(p => '<tr><td class="nowrap">' + Dt(p.data) + (p.saldo ? ' <span class="badge neutro">saldo iniziale</span>' : '') + '</td>' +
        '<td class="n calc">' + E(p.fatt) + '</td><td class="n calc">' + E(p.perdite) + '</td><td class="n calc">' + E(p.costi) + '</td>' +
        '<td class="n calc">' + O(p.ore) + '</td><td class="n calc">' + E(p.costoOre) + '</td>' +
        '<td class="n calc" style="color:var(--' + col(p.utile) + ')"><b>' + E(p.utile) + '</b></td></tr>').join('') +
      (utileFine === null ? '' : '<tr class="totale"><td class="nowrap">' + (dataFine ? Dt(dataFine) : 'a commessa finita') + '</td><td class="n">' + E(r.valoreRecuperabile) + '</td><td></td><td class="n">' + E(r.costiBudget) + '</td><td class="n">' + O(r.oreBudget) + '</td><td class="n">' + E(r.costoOrePreviste) + '</td><td class="n">' + E(utileFine) + '</td></tr>') +
      '</tbody></table></div>' +
      '<p class="sotto">I valori sono cumulati alla data della riga. L\'ultima riga è il punto di arrivo previsto: non è maturato, viene dal contratto e dal budget vigenti.</p></div>';
  }

  function anagrafica(r, c) {
    return '<div class="griglia-2"><div class="pannello"><h2>Identificazione</h2>' + kv([
      ['Data di inserimento', Dt(c.dataInserimento), 'in'], ['Codice commessa', '<b>' + esc(c.codice) + '</b>', 'in'], ['Cliente', T(c.cliente), 'in'], ['Descrizione / Cantiere', T(c.cantiere), 'in'],
      ['Indirizzo / Località', T(c.indirizzo), 'in'], ['Ramo di attività', T(c.ramo), 'in'], ['Tecnico', T(c.tecnico), 'in'], ['Preposto', T(c.preposto), 'in'], ['Ritenute previste', T(c.ritenutePreviste), 'in'], ['Note', T(c.note), 'in']
    ]) + '</div><div class="pannello"><h2>Date, stato e contratto</h2>' + kv([
      ['Stato cantiere', UI.badgeStato(c.stato), 'in'], ['Data di inizio previsto', Dt(c.dataInizioPrevista), 'in'], ['Data di inizio effettivo', Dt(c.dataInizioEffettiva), 'in'],
      ['Data di fine prevista', Dt(c.dataFinePrevista), 'in'], ['Data di fine prevista originaria', Dt(c.dataFinePrevistaOriginale), 'calc'], ['Causa aggiornamento data fine', T(c.causaAggiornamentoDataFine), 'in'], ['Data di fine effettiva', Dt(c.dataFineEffettiva), 'in'],
      ['Commessa pregressa', r.pregressa ? 'Sì (iniziata prima del 01/01/' + Store.db.parametri.annoGestione + ')' : 'No', 'calc'],
      ['Contratto iniziale', E(r.contrattoIniziale), 'in'], ['Integrazioni / varianti', E(r.integrazioni), 'in'], ['Contratto aggiornato', '<b>' + E(r.contrattoAggiornato) + '</b>', 'calc']
    ]) + '</div></div>';
  }

  function budget(r) {
    const b = r.budget;
    const dataAgg = !b.dataAggiornamento ? 'nessun aggiornamento: vale il budget iniziale'
      : (b.haValoriAggiornati ? 'rivisto al ' + Dt(b.dataAggiornamento) : 'budget iniziale confermato al ' + Dt(b.dataAggiornamento) + ', valori invariati');
    // tabella a tre colonne: voce, valore iniziale (storico), valore aggiornato
    const kv3 = righe => '<table class="kv kv3"><tr><th></th><th class="col-ini">Iniziale</th><th class="col-agg">Aggiornato</th></tr>' +
      righe.map(x => '<tr><th>' + esc(x[0]) + '</th><td class="' + (x[3] || '') + '">' + x[1] + '</td><td class="' + (x[3] || '') + '">' + x[2] + '</td></tr>').join('') + '</table>';
    return '<div class="msg info">Il budget è sdoppiato: i valori <b>iniziali</b> restano come storico, i valori <b>aggiornati</b> sono la revisione corrente · ' + esc(dataAgg) + '<br>I <b>costi diretti previsti vigenti</b> sono anche i costi specifici della <a href="#/commessa/' + esc(r.id) + '/sostenibilita">verifica di sostenibilità</a>.</div>' +
      '<div class="griglia-2"><div class="pannello"><h2>Valori pianificati</h2>' + kv3([
        ['Ore previste', O(b.orePrevisteIniziali), O(b.orePreviste), 'in'],
        ['Costi diretti previsti', E(b.costiDirettiPrevistiIniziali), E(b.costiDirettiPrevisti), 'in'],
        ['Costo ore', E(b.costoOreIniziale), E(b.costoOre), 'calc'],
        ['Costo totale previsto', '<b>' + E(b.costoTotalePrevistoIniziale) + '</b>', '<b>' + E(b.costoTotalePrevisto) + '</b>', 'calc'],
        ['Margine teorico', Pc(b.margineTeoricoIniziale), Pc(b.margineTeorico), 'calc']
      ]) + kv([
        ['Costo orario applicato (costo strutturale, Parametri)', E(b.costoOrario) + '/h', 'calc'],
        ['Data aggiornamento budget', Dt(b.dataAggiornamento), 'in'],
        ['Note budget', T(b.note), 'in']
      ]) + '</div><div class="pannello"><h2>Confronto con il consuntivo</h2>' + kv([
        ['Ore effettive cumulative', O(r.oreUsate), 'calc'], ['Costi diretti effettivi cumulati', E(r.costiSostenuti), 'calc'], ['Costo effettivo cumulato', E(r.costoEffettivo), 'calc']
      ]) + kv3([
        ['Ore residue', O(r.oreResidueIni), O(r.oreResidue), 'calc'],
        ['Percentuale ore consumate', Pc(r.orePctIni), Pc(r.orePct), 'calc'],
        ['Costi diretti residui', E(r.costiResiduoIni), E(r.costiResiduo), 'calc'],
        ['Sforamento costi diretti', r.costiSforamentoIni > 0 ? '<span style="color:var(--rosso)">' + E(r.costiSforamentoIni) + '</span>' : E(0), r.costiSforamento > 0 ? '<span style="color:var(--rosso)">' + E(r.costiSforamento) + '</span>' : E(0), 'calc'],
        ['Costo effettivo vs totale previsto', b.costoTotalePrevistoIniziale > 0 ? Pc(r.costoEffettivo / b.costoTotalePrevistoIniziale) : '—', b.costoTotalePrevisto > 0 ? Pc(r.costoEffettivo / b.costoTotalePrevisto) : '—', 'calc']
      ]) + '</div></div>';
  }

  function controllo(r, c) {
    const P = Store.db.parametri;
    return '<div class="pannello"><div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><span style="font-size:20px">' + UI.badgeAlert(r.alert) + '</span>' + UI.motiviHtml(r) + '</div><p class="sotto">La severità riflette il problema più grave rilevato. Soglie: tempo ' + Pc(P.scartoTempoAttenzione) + ' / ' + Pc(P.scartoTempoCritico) + ' · ore ' + Pc(P.scartoOreAttenzione) + ' / ' + Pc(P.scartoOreCritico) + ' · SAL non fatturato ' + Pc(P.sogliaSalNonFatturato) + ' del recuperabile.</p></div>' +
      '<div class="griglia-3">' +
      '<div class="pannello"><h2>Valori economici cumulativi</h2>' + kv([
        ['Contratto originario', E(r.contrattoIniziale), 'calc'], ['Variazioni', E(r.integrazioni), 'calc'], ['Contratto aggiornato', E(r.contrattoAggiornato), 'calc'], ['SAL cumulato', E(r.salCum), 'calc'], ['Fatturato lordo cumulato', E(r.fattCum), 'calc'],
        ['SAL non fatturato (cumulato)', E(r.salNonFatturato), 'calc'], ['Residuo lavori', E(r.residuoLavori), 'calc'], ['Residuo da fatturare', E(r.residuoDaFatturare), 'calc'], ['Fatturato oltre recuperabile', E(r.fatturatoOltreRecuperabile), 'calc'],
        ['Ritenute maturate cumulate', E(r.ritenuteCum), 'calc'], ['Ritenute svincolate cumulate', E(r.svincoliCum), 'calc'], ['Ritenute da sbloccare (cumulate)', E(r.ritenuteDaSbloccare), 'calc'], ['Fatturato netto cumulato', E(r.fattNettoCum), 'calc'],
        ['Perdite SAL accettate cumulate', E(r.perditeCum), 'calc'], ['Valore recuperabile', E(r.valoreRecuperabile), 'calc']
      ]) + '</div>' +
      '<div class="pannello"><h2>Tempo e ore</h2>' + kv([
        ['Aggiornato al', Dt(c.aggiornatoAl), 'in'], ['Percentuale SAL', Pc(r.salPct), 'calc'], ['Avanzamento temporale', Pc(r.tempoPct), 'calc'], ['Scostamento SAL − tempo', Pc(r.scostTempo), 'calc'], ['Giorni di ritardo produttivo', Fmt.giorni(r.giorniRitardo), 'calc'],
        ['Ore previste iniziali', O(r.oreBudgetIni), 'calc'], ['Ore previste aggiornate', O(r.oreBudget), 'calc'], ['Ore effettive cumulative', O(r.oreUsate), 'calc'],
        ['Ore residue su iniziale', O(r.oreResidueIni), 'calc'], ['Ore residue su aggiornato', O(r.oreResidue), 'calc'],
        ['Percentuale ore consumate su iniziale', Pc(r.orePctIni), 'calc'], ['Percentuale ore consumate su aggiornato', Pc(r.orePct), 'calc'],
        ['Scostamento ore − SAL su iniziale', Pc(r.scostOreIni), 'calc'], ['Scostamento ore − SAL su aggiornato', Pc(r.scostOre), 'calc']
      ]) + '</div>' +
      '<div class="pannello"><h2>Costi</h2>' + kv([
        ['Budget costi diretti iniziale', E(r.costiBudgetIni), 'calc'], ['Budget costi diretti aggiornato', E(r.costiBudget), 'calc'], ['Costi diretti effettivi cumulati', E(r.costiSostenuti), 'calc'],
        ['Costi residui su iniziale', E(r.costiResiduoIni), 'calc'], ['Costi residui su aggiornato', E(r.costiResiduo), 'calc'],
        ['Sforamento su iniziale', E(r.costiSforamentoIni), 'calc'], ['Sforamento su aggiornato', E(r.costiSforamento), 'calc'],
        ['Costo strutturale corrente', E(P.costoOrario) + '/h', 'calc'], ['Costo effettivo cumulato', '<b>' + E(r.costoEffettivo) + '</b>', 'calc']
      ]) + '<h3>Composizione del cumulativo</h3>' + kv([
        ['Saldo iniziale SAL', E(r.saldo.sal), 'calc'], ['SAL esercizio ' + P.annoGestione, E(r.periodo.sal), 'calc'], ['Saldo iniziale ore', O(r.saldo.ore), 'calc'], ['Ore esercizio ' + P.annoGestione, O(r.periodo.ore), 'calc'],
        ['Saldo iniziale costi', E(r.saldo.costiDiretti), 'calc'], ['Costi esercizio ' + P.annoGestione, E(r.periodo.costiDiretti), 'calc']
      ]) + '</div></div>';
  }

  // Interruttore dei saldi storici: spento, la scheda considera solo movimenti e costi dell'esercizio
  // in corso, come se la commessa partisse da zero il 1° gennaio. Vale per tutte le schede calcolate,
  // così i numeri restano coerenti passando da una all'altra, e si azzera cambiando commessa.
  let senzaSaldi = false, senzaSaldiPer = null;

  UI.registra('commessa', function (cont, params) {
    const id = params[0], tab = TABS.some(t => t[0] === params[1]) ? params[1] : 'riepilogo';
    const c = Store.commessa(id);
    if (!c) { cont.innerHTML = UI.barraRitorno('<b>Scheda commessa</b>') + '<div class="msg errore">Commessa non trovata.</div>'; return; }
    if (senzaSaldiPer !== id) { senzaSaldi = false; senzaSaldiPer = id; }
    const r = Engine.calcolaCommessa(c, Store.db, null, { senzaSaldi });
    const P = Store.db.parametri;
    const ricarica = () => UI.render();
    // In testata restano solo le azioni generali sulla commessa; le modifiche stanno nelle singole schede.
    const azioni =
      UI.pulsanteEsporta('scheda', 'Esporta scheda (CSV)') + '<button type="button" onclick="window.print()">Stampa</button>' +
      (Store.puo('commessa.elimina') ? '<button type="button" class="pericolo" id="b-del">Elimina / annulla</button>' : '');
    cont.innerHTML = '<div class="scheda-commessa">' + UI.barraRitorno('<b>Scheda commessa ' + esc(c.codice) + '</b>') +
      UI.testata(c.codice + ' · ' + c.cliente, esc(c.cantiere) + ' &nbsp;·&nbsp; ' + UI.badgeStato(c.stato) + ' &nbsp;·&nbsp; ' + UI.badgeAlert(r.alert) + (c.tecnico ? ' &nbsp;·&nbsp; tecnico ' + esc(c.tecnico) : '') + (c.preposto ? ' · preposto ' + esc(c.preposto) : '') + (c.annullato ? ' &nbsp;<span class="badge neutro">COMMESSA ANNULLATA</span>' : '') + (r.definita ? ' &nbsp;<span class="badge neutro">COMMESSA DEFINITA</span>' : ''), azioni, 'Scheda commessa') +
      '<div class="tabs-riga">' +
      '<div class="tabs">' + TABS.map(t => '<a href="#/commessa/' + esc(id) + '/' + t[0] + '" class="' + (tab === t[0] ? 'attivo' : '') + '">' + t[1] + (t[0] === 'movimenti' ? ' (' + r.nMovimenti + ')' : (t[0] === 'costi' ? ' (' + r.nCosti + ')' : (t[0] === 'gantt' ? ' (' + Store.db.fasi.filter(f => f.commessaId === id).length + ')' : ''))) + '</a>').join('') + '</div>' +
      // L'interruttore è sempre visibile, anche quando non c'è nulla da escludere: se comparisse solo
      // ogni tanto non si saprebbe che esiste. Senza saldo iniziale resta spento e inerte, col motivo scritto.
      '<label class="interruttore' + (r.hasSaldo ? '' : ' inerte') + '" title="' + esc(r.hasSaldo
        ? 'Spento, la scheda considera solo l\'esercizio ' + P.annoGestione + ': il saldo iniziale al ' + Fmt.data(Engine.dataSaldo(P.annoGestione)) + ' non viene conteggiato.'
        : 'Questa commessa non ha un saldo iniziale al ' + Fmt.data(Engine.dataSaldo(P.annoGestione)) + ': non c\'è storico da escludere dal computo.') + '">' +
      '<input type="checkbox" id="sw-saldi"' + (senzaSaldi ? '' : ' checked') + (r.hasSaldo ? '' : ' disabled') + '><span class="leva"></span>' +
      '<span class="testo">Saldi storici <b>' + (r.hasSaldo ? (senzaSaldi ? 'esclusi' : 'inclusi') : 'assenti') + '</b></span></label>' +
      '</div><div id="tab-corpo"></div></div>';
    const corpo = document.getElementById('tab-corpo');
    const legenda = UI.legenda();
    // Saldi storici esclusi: si dice a chiare lettere che cosa resta fuori dal computo, voce per voce.
    if (r.saldoEscluso) {
      const s = r.saldoEscluso;
      corpo.insertAdjacentHTML('beforebegin', '<div class="msg avviso"><b>Saldi storici esclusi dal computo</b>: la scheda mostra il solo esercizio ' + esc(P.annoGestione) +
        ', come se la commessa partisse da zero. Non è conteggiato il saldo iniziale al ' + Dt(Engine.dataSaldo(P.annoGestione)) + ':<br>' +
        'SAL ' + E(s.sal) + ' · fatturato ' + E(s.fatturatoLordo) + ' · ritenute ' + E(s.ritenute) + ' · svincoli ' + E(s.svincoli) +
        ' · perdite ' + E(s.perditeSal) + ' · ore ' + O(s.ore) + ' · costi diretti ' + E(s.costiDiretti) + '</div>');
    }
    // Commessa definita: i cumulativi dell'esercizio in corso sono a zero perché non riceve più saldi
    // iniziali. I valori finali congelati dalla chiusura restano qui, insieme allo storico di movimenti e costi.
    if (r.definita) {
      const d = r.chiusuraDefinitiva;
      corpo.insertAdjacentHTML('beforebegin', '<div class="msg avviso"><b>Commessa definita con la chiusura dell\'esercizio ' + esc(d.anno) + '</b>' + (d.data ? ' (' + Dt(d.data.slice(0, 10)) + (d.utente ? ', ' + esc(d.utente) : '') + ')' : '') + '. ' +
        'Non riceve saldi iniziali e non rientra in cumulativi, dashboard e allerte: i valori dell\'esercizio ' + esc(P.annoGestione) + ' risultano perciò a zero. Valori finali al 31/12/' + esc(d.anno) + ':<br>' +
        'SAL ' + Fmt.euro(d.sal) + ' · fatturato ' + Fmt.euro(d.fatturatoLordo) + ' · ritenute ' + Fmt.euro(d.ritenute) + ' · svincoli ' + Fmt.euro(d.svincoli) + ' · perdite ' + Fmt.euro(d.perditeSal) + ' · ore ' + Fmt.ore(d.ore) + ' · costi diretti ' + Fmt.euro(d.costiDiretti) + '</div>');
    }

    if (tab === 'riepilogo') corpo.innerHTML = riepilogo(r, c);
    else if (tab === 'anagrafica') corpo.innerHTML = barraScheda(az('anag')) + legenda + anagrafica(r, c);
    else if (tab === 'budget') corpo.innerHTML = barraScheda(az('bud')) + legenda + budget(r);
    else if (tab === 'gantt') Gantt.scheda(corpo, c, barraScheda(az('fase')), ricarica);
    else if (tab === 'sostenibilita') {
      // se la commessa è nata da un preventivo, il dettaglio voce per voce dei costi specifici è rimasto lì
      const prev = Store.db.preventivi.find(x => x.commessaId === c.id);
      corpo.innerHTML = barraScheda(az('sost')) + legenda +
        (prev ? '<div class="msg info">Commessa nata dal preventivo <a href="#/preventivo/' + esc(prev.id) + '"><b>' + esc(prev.numero) + '</b></a> del ' + Dt(prev.data) + ': il dettaglio voce per voce dei costi specifici resta consultabile lì.</div>' : '') +
        Sostenibilita.pannelli(r.sostenibilita, { iniziale: r.sostenibilitaIniziale, consuntivo: r.sostenibilitaConsuntivo, titoloAggiornato: r.budget.dataAggiornamento ? 'Aggiornato al ' + Dt(r.budget.dataAggiornamento) : 'Aggiornato' });
    }
    else if (tab === 'controllo') corpo.innerHTML = barraScheda(az('note')) + legenda + controllo(r, c);
    else if (tab === 'note') {
      corpo.innerHTML = barraScheda(az('note', '✎ Modifica note / aggiornato al')) + '<div class="griglia-2"><div class="pannello"><h2>Note / Azione</h2><p>' + (c.noteAzione ? esc(c.noteAzione).replace(/\n/g, '<br>') : '<span class="muto">Nessuna annotazione.</span>') + '</p><p class="sotto">Campo libero della Direzione, senza formule.</p></div>' +
        '<div class="pannello"><h2>Aggiornato al</h2><p style="font-size:18px"><b>' + Dt(c.aggiornatoAl) + '</b></p><p class="sotto">Data manuale per questa commessa: alimenta avanzamento temporale, ritardo, alert temporali e confronto SAL/tempo. Non viene dedotta dai movimenti.</p></div></div>' +
        '<div class="pannello"><h2>Storia delle modifiche di questa commessa</h2>' + (function () {
          const voci = Store.db.audit.filter(a => a.entitaId === id || (a.riferimento && a.riferimento.indexOf(c.codice + ' |') === 0)).sort((a, b) => b.ts < a.ts ? -1 : 1).slice(0, 50);
          return voci.length ? '<div class="tabella-wrap"><table class="tab"><thead><tr><th>Data e ora</th><th>Utente</th><th>Entità</th><th>Azione</th><th>Variazioni</th></tr></thead><tbody>' + voci.map(a => '<tr><td class="nowrap">' + Fmt.dataOra(a.ts) + '</td><td>' + esc(a.utente) + '</td><td><span class="badge neutro">' + esc(a.entita) + '</span></td><td>' + esc(a.azione) + '</td><td class="piccolo">' + (a.modifiche || []).slice(0, 8).map(m => '<div><b>' + esc(Schema.ETICHETTE[m.campo] || m.campo) + '</b>: ' + esc(String(m.prima ?? '')) + ' → ' + esc(String(m.dopo ?? '')) + '</div>').join('') + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="vuoto">Nessuna modifica registrata.</div>';
        })() + '</div>';
    }
    else if (tab === 'movimenti') {
      const righe = Movimenti.righe(m => m.commessaId === id);
      const perAnno = righe.filter(x => x.anno === P.annoGestione && !x.annullato);
      const sum = f => perAnno.reduce((t, x) => t + Engine.num(x[f]), 0);
      corpo.innerHTML = barraScheda(az('mov')) + '<div class="kpi-griglia">' + UI.kpi('SAL ' + P.annoGestione, E(sum('sal'))) + UI.kpi('Fatturato lordo ' + P.annoGestione, E(sum('fatturatoLordo'))) + UI.kpi('Ritenute ' + P.annoGestione, E(sum('ritenuta'))) + UI.kpi('Svincoli ' + P.annoGestione, E(sum('svincolo'))) + UI.kpi('Ore ' + P.annoGestione, O(sum('ore'))) + UI.kpi('Perdite SAL ' + P.annoGestione, E(sum('perditaSal'))) + '</div>' + legenda +
        UI.tabella('cmov', { colonne: Movimenti.colonne(false), righe, chiave: 'id', ordine: { campo: 'data', dir: 'desc' }, classeRiga: x => x.annullato ? 'annullato' : (x.anno !== P.annoGestione ? 'storico' : ''), vuoto: 'Nessun movimento registrato per questa commessa.', onAzione: Movimenti.azione,
          totali: { data: 'Totale ' + P.annoGestione, sal: E(sum('sal')), fatturatoLordo: E(sum('fatturatoLordo')), ritenuta: E(sum('ritenuta')), svincolo: E(sum('svincolo')), fatturatoNetto: E(perAnno.reduce((t, x) => t + x.fatturatoNetto, 0)), ore: O(sum('ore')), perditaSal: E(sum('perditaSal')) } }) +
        (righe.some(x => x.anno !== P.annoGestione) ? '<p class="sotto">I movimenti di anni precedenti sono conservati come storico e non concorrono ai cumulativi (già compresi nei saldi iniziali).</p>' : '');
      UI.legaTabelle(corpo);
    }
    else if (tab === 'costi') {
      const righe = Costi.righe(k => k.commessaId === id);
      const perAnno = righe.filter(x => x.anno === P.annoGestione && !x.annullato);
      const tot = perAnno.reduce((t, x) => t + Engine.num(x.importo), 0);
      corpo.innerHTML = barraScheda(az('costo')) + '<div class="kpi-griglia">' + UI.kpi('Costi diretti ' + P.annoGestione, E(tot)) + UI.kpi('Saldo iniziale costi', E(r.saldo.costiDiretti)) + UI.kpi('Costi diretti cumulati', E(r.costiSostenuti)) + UI.kpi('Budget costi diretti', E(r.costiBudget)) + UI.kpi(r.costiSforamento > 0 ? 'Sforamento' : 'Residuo', E(r.costiSforamento > 0 ? r.costiSforamento : r.costiResiduo), { colore: r.costiSforamento > 0 ? 'rosso' : '' }) + '</div>' + legenda +
        UI.tabella('ccosti', { colonne: Costi.colonne(false), righe, chiave: 'id', ordine: { campo: 'data', dir: 'desc' }, classeRiga: x => x.annullato ? 'annullato' : '', vuoto: 'Nessun costo diretto registrato per questa commessa.', onAzione: Costi.azione, totali: { data: 'Totale ' + P.annoGestione, importo: E(tot) } });
      UI.legaTabelle(corpo);
    }
    else if (tab === 'saldi') {
      const righe = Saldi.righe(P.annoGestione).filter(s => s.commessaId === id);
      const storici = Store.db.saldi.filter(s => s.commessaId === id && s.anno !== P.annoGestione);
      corpo.innerHTML = (r.pregressa ? '<div class="msg info">Commessa pregressa: i valori maturati al ' + Dt(Engine.dataSaldo(P.annoGestione)) + ' partecipano ai cumulativi ma non alla dashboard Movimenti ' + P.annoGestione + '.</div>' :
        '<div class="msg info">Commessa non pregressa (data di inizio effettiva ' + Dt(c.dataInizioEffettiva) + '): non sono previsti saldi iniziali per l\'esercizio ' + P.annoGestione + '.</div>') +
        ((Store.puo('saldo.crea') && r.pregressa && !righe.some(s => !s.annullato)) ? '<p><button type="button" class="primario" id="b-saldo">+ Inserisci saldo al ' + Dt(Engine.dataSaldo(P.annoGestione)) + '</button></p>' : '') + legenda +
        UI.tabella('csaldi', { colonne: Saldi.colonne(false), righe, chiave: 'id', classeRiga: x => x.annullato ? 'annullato' : '', vuoto: 'Nessun saldo iniziale per l\'esercizio ' + P.annoGestione + '.', onAzione: Saldi.azione }) +
        (storici.length ? '<h2>Saldi di esercizi precedenti</h2>' + UI.tabella('csaldi2', { colonne: [{ campo: 'anno', titolo: 'Esercizio' }].concat(Saldi.colonne(false).slice(0, -1)), righe: storici.map(s => Object.assign({}, s, { dataSaldo: Engine.dataSaldo(s.anno) })), chiave: 'id', classeRiga: x => x.annullato ? 'annullato' : '' }) : '');
      UI.legaTabelle(corpo);
      const bs = document.getElementById('b-saldo'); if (bs) bs.onclick = () => Saldi.apriForm(null, { commessaId: id, onSalvato: ricarica });
    }

    const b = x => document.getElementById(x);
    const apri = {
      anag: () => Commesse.apriForm(id, ricarica),
      bud: () => Budget.apriForm(id, ricarica),
      sost: () => Sostenibilita.apriForm(id, ricarica),
      mov: () => Movimenti.apriForm(null, { commessaId: id, onSalvato: ricarica }),
      costo: () => Costi.apriForm(null, { commessaId: id, onSalvato: ricarica }),
      fase: () => Gantt.apriForm(id, null, ricarica),
      note: () => Cantieri.apriNote(id, ricarica)
    };
    cont.querySelectorAll('[data-az]').forEach(el => el.onclick = () => apri[el.dataset.az]());
    if (b('sw-saldi')) b('sw-saldi').onchange = e => { senzaSaldi = !e.target.checked; ricarica(); };
    if (b('b-del')) b('b-del').onclick = () => Commesse.elimina(id);
    const be = cont.querySelector('[data-esporta="scheda"]');
    if (be) be.onclick = () => {
      const righe = UI.COLONNE_EXPORT_SCHEDA.map(col => ({ voce: col.titolo, valore: typeof col.valore === 'function' ? col.valore(r) : r[col.campo] }));
      UI.esportaCsv('scheda_' + c.codice, righe, [{ titolo: 'Voce', campo: 'voce' }, { titolo: 'Valore', campo: 'valore' }]);
    };
  });
})();
