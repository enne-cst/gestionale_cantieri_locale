/* FIDA EDILE – Controllo economico e produttivo cantieri (foglio CANTIERI) */
(function () {
  'use strict';
  const esc = UI.esc;
  const D = { commessaId: '' };
  const F = { testo: '', alert: '', soloAperte: false };

  const Cantieri = {
    // Note / Azione e AGGIORNATO AL (data manuale per singola commessa)
    apriNote(commessaId, onSalvato) {
      const c = Store.commessa(commessaId); if (!c) return;
      const puoNote = Store.puo('noteAzione'), puoData = Store.puo('aggiornatoAl');
      if (!puoNote && !puoData) return UI.permessoNegato();
      const corpo = '<form id="form-note" onsubmit="return false"><div class="msg info">' + esc(Engine.etichetta(c)) + '</div><div class="form-griglia">' +
        UI.campo({ nome: 'aggiornatoAl', etichetta: 'Aggiornato al', tipo: 'date', disabled: !puoData, aiuto: 'Si porta da sola a oggi quando si toccano anagrafica, movimenti o costi diretti della commessa (il budget non la tocca: ha una sua data). Qui si può correggere a mano. Alimenta avanzamento temporale, ritardo e alert.' }, c.aggiornatoAl) +
        UI.campo({ nome: 'noteAzione', etichetta: 'Note / Azione', tipo: 'textarea', classe: 'largo', disabled: !puoNote, aiuto: 'Campo libero per la Direzione: es. chiamare cliente, verificare SAL, recuperare ritenuta, incontro tecnico.' }, c.noteAzione) +
        '</div></form>';
      UI.modale({
        titolo: 'Note / Azione e aggiornamento – ' + c.codice, corpo, stretta: true,
        pulsanti: [{
          testo: 'Salva', classe: 'primario', async azione(m) {
            const v = UI.leggiForm(m.el.querySelector('#form-note'));
            if (v.aggiornatoAl && !Engine.isoOk(v.aggiornatoAl)) { m.msg('<div class="msg errore">Data non valida.</div>'); return; }
            await Store.salva(db => {
              const cur = db.commesse.find(x => x.id === commessaId);
              const mod = [];
              if (puoData && String(cur.aggiornatoAl || '') !== String(v.aggiornatoAl || '')) { mod.push({ campo: 'aggiornatoAl', prima: cur.aggiornatoAl || '', dopo: v.aggiornatoAl || '' }); cur.aggiornatoAl = v.aggiornatoAl || ''; }
              if (puoNote && String(cur.noteAzione || '') !== String(v.noteAzione || '')) { mod.push({ campo: 'noteAzione', prima: cur.noteAzione || '', dopo: v.noteAzione || '' }); cur.noteAzione = v.noteAzione || ''; }
              if (mod.length) Store.log(db, 'controllo', cur.id, cur.codice, 'NOTE / AGGIORNATO AL', mod);
            });
            m.chiudi(); UI.toast('Salvato.');
            if (onSalvato) onSalvato();
          }
        }]
      });
    },
    // Rappresentazioni sintetiche come nel foglio CANTIERI
    tempoHtml(r) {
      if (r.salPct === null || r.tempoPct === null) return '<span class="muto">—</span>';
      const col = r.scostTempo < -Store.db.parametri.scartoTempoCritico ? 'rosso' : (r.scostTempo < -Store.db.parametri.scartoTempoAttenzione ? 'giallo' : 'verde');
      return '<span class="nowrap">SAL ' + Fmt.pct(r.salPct) + ' / tempo ' + Fmt.pct(r.tempoPct) + '</span><div class="piccolo" style="color:var(--' + col + ')">scostamento ' + Fmt.pct(r.scostTempo) + '</div>';
    },
    oreHtml(r) {
      if (!r.hasOreBudget) return '<span class="muto">budget ore non definito</span>' + (r.oreUsate ? '<div class="piccolo">usate ' + Fmt.ore(r.oreUsate) + '</div>' : '');
      const col = r.orePct >= 1 ? 'rosso' : (r.orePct > 0.85 ? 'giallo' : '');
      return '<span class="nowrap">' + Fmt.ore(r.oreBudget) + ' / ' + Fmt.ore(r.oreUsate) + ' / ' + Fmt.ore(r.oreResidue) + '</span>' + UI.barra(r.orePct, col);
    },
    oreSalHtml(r) {
      if (r.orePct === null || r.salPct === null) return '<span class="muto">—</span>';
      const col = r.scostOre > Store.db.parametri.scartoOreCritico ? 'rosso' : (r.scostOre > Store.db.parametri.scartoOreAttenzione ? 'giallo' : 'verde');
      return '<span class="nowrap">ore ' + Fmt.pct(r.orePct) + ' / SAL ' + Fmt.pct(r.salPct) + '</span><div class="piccolo" style="color:var(--' + col + ')">scostamento ' + Fmt.pct(r.scostOre) + '</div>';
    },
    costiHtml(r) {
      if (!r.hasCostiBudget && !r.costiSostenuti) return '<span class="muto">—</span>';
      return '<span class="nowrap">budget ' + Fmt.euro(r.costiBudget) + '</span><div class="piccolo">sostenuti ' + Fmt.euro(r.costiSostenuti) + '</div>' +
        (r.costiSforamento > 0 ? '<div class="piccolo" style="color:var(--rosso)">sforamento ' + Fmt.euro(r.costiSforamento) + '</div>' : '<div class="piccolo" style="color:var(--verde)">residuo ' + Fmt.euro(r.costiResiduo) + '</div>');
    }
  };
  window.Cantieri = Cantieri;

  UI.registra('cantieri', function (cont) {
    const P = Store.db.parametri;
    const rows = Engine.calcolaTutte(Store.db);
    const opz = [{ v: '', t: 'TUTTE' }].concat(rows.map(r => ({ v: r.id, t: r.etichetta })));
    cont.innerHTML = UI.testata('Controllo economico e produttivo cantieri ' + esc(P.annoGestione), 'Situazione reale di ogni commessa: saldi al 31/12/' + esc(P.annoGestione - 1) + ' + movimenti ' + esc(P.annoGestione) + '. AGGIORNATO AL è una data manuale per singola commessa.',
      UI.pulsanteEsporta('cant', 'Esporta controllo (CSV)') + '<button type="button" onclick="window.print()">Stampa</button>') +
      '<div class="pannello"><div class="filtri"><div class="campo largo"><label>Seleziona commessa</label><select class="in" id="cant-sel">' + opz.map(o => '<option value="' + esc(o.v) + '"' + (o.v === D.commessaId ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('') + '</select></div></div>' +
      '<div id="cant-kpi"></div></div>' +
      '<div class="griglia-2"><div class="pannello" id="cant-mese"></div><div class="pannello" id="cant-alert"></div></div>' +
      '<div class="pannello compatto"><div class="filtri" id="cant-filtri">' +
      '<div class="campo largo"><label>Ricerca</label><input type="search" class="in" name="testo" value="' + esc(F.testo) + '" placeholder="codice, cliente, cantiere, tecnico, preposto"></div>' +
      '<div class="campo"><label>Allerta</label><select class="in" name="alert"><option value="">Tutte</option><option value="CRITICO"' + (F.alert === 'CRITICO' ? ' selected' : '') + '>Critico</option><option value="ATTENZIONE"' + (F.alert === 'ATTENZIONE' ? ' selected' : '') + '>Attenzione</option><option value="INCOMPLETO"' + (F.alert === 'INCOMPLETO' ? ' selected' : '') + '>Incompleto</option><option value="REGOLARE"' + (F.alert === 'REGOLARE' ? ' selected' : '') + '>Regolare</option></select></div>' +
      '<div class="campo"><label>Stato</label><label style="text-transform:none;font-size:13px;margin-top:6px"><input type="checkbox" name="soloAperte"' + (F.soloAperte ? ' checked' : '') + '> solo non finite</label></div></div></div>' +
      UI.legenda() + '<div id="cant-tab"></div>';

    const colonne = [
      { campo: 'alert', titolo: 'Allerta', fmt: v => UI.badgeAlert(v) },
      { campo: 'motivi', titolo: 'Motivo dell\'allerta', ord: false, classe: 'desc', fmt: (v, r) => UI.motiviHtml(r) },
      { campo: 'codice', titolo: 'Codice', fmt: (v, r) => UI.linkCommessa(r) },
      { campo: 'cliente', titolo: 'Cliente' },
      { campo: 'cantiere', titolo: 'Descrizione', classe: 'desc' },
      { campo: 'tecnico', titolo: 'Tecnico' },
      { campo: 'preposto', titolo: 'Preposto' },
      { campo: 'stato', titolo: 'Stato', fmt: v => UI.badgeStato(v) },
      { campo: 'contrattoAggiornato', titolo: 'Contratto agg.', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v) },
      { campo: 'salCum', titolo: 'SAL maturato', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v) },
      { campo: 'fattCum', titolo: 'Fatturato lordo', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v) },
      { campo: 'salNonFatturato', titolo: 'SAL non fatturato', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v) },
      { campo: 'residuoLavori', titolo: 'Residuo lavori', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v) },
      { campo: 'ritenuteDaSbloccare', titolo: 'Ritenute da sbloccare', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v) },
      { campo: 'scostTempo', titolo: 'SAL % / tempo % / scostamento', classe: 'calc', fmt: (v, r) => Cantieri.tempoHtml(r) },
      { campo: 'giorniRitardo', titolo: 'Ritardo produttivo', tipo: 'n', classe: 'calc', fmt: v => Fmt.giorni(v) },
      { campo: 'orePct', titolo: 'Ore previste / usate / residue', classe: 'calc', fmt: (v, r) => Cantieri.oreHtml(r) },
      { campo: 'scostOre', titolo: '% ore / % SAL / scostamento', classe: 'calc', fmt: (v, r) => Cantieri.oreSalHtml(r) },
      { campo: 'costiSforamento', titolo: 'Costi diretti', classe: 'calc', fmt: (v, r) => Cantieri.costiHtml(r) },
      { campo: 'costoEffettivo', titolo: 'Costo effettivo cumulato', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v) },
      { campo: 'perditeCum', titolo: 'Perdite SAL', tipo: 'n', classe: 'calc', fmt: v => v > 0 ? '<span class="perdita">' + Fmt.euro(v) + '</span>' : Fmt.euro(v, { zeroVuoto: true }) },
      { campo: 'valoreRecuperabile', titolo: 'Valore recuperabile', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v) },
      { campo: 'noteAzione', titolo: 'Note / Azione', classe: 'desc in', fmt: (v, r) => esc(v || '') + ((Store.puo('noteAzione') || Store.puo('aggiornatoAl')) ? ' <button type="button" class="piccolo" data-azione="note" data-id="' + esc(r.id) + '">✎</button>' : '') },
      { campo: 'aggiornatoAl', titolo: 'Aggiornato al', classe: 'in nowrap', fmt: v => v ? Fmt.data(v) : '<span style="color:var(--rosso)">mancante</span>' }
    ];

    function aggiornaKpi() {
      const sel = D.commessaId ? rows.filter(r => r.id === D.commessaId) : rows;
      const k = Engine.riepilogo(sel);
      const uno = sel.length === 1 ? sel[0] : null;
      const kp = UI.kpi;
      document.getElementById('cant-kpi').innerHTML = '<div class="kpi-griglia">' +
        kp('Contratto aggiornato', Fmt.euro(k.contrattoAggiornato)) + kp('Perdite SAL accettate', Fmt.euro(k.perditeCum), { colore: k.perditeCum > 0 ? 'rosso' : '' }) + kp('Valore recuperabile', Fmt.euro(k.valoreRecuperabile)) +
        kp('SAL maturato', Fmt.euro(k.salCum)) + kp('Fatturato lordo', Fmt.euro(k.fattCum)) + kp('SAL non fatturato', Fmt.euro(k.salNonFatturato), { colore: k.salNonFatturato > 0 ? 'giallo' : '' }) + kp('Residuo lavori effettivo', Fmt.euro(k.residuoLavori)) +
        '</div><div class="kpi-griglia">' +
        kp('Residuo da fatturare', Fmt.euro(k.residuoDaFatturare)) + kp('Fatturato oltre recuperabile', Fmt.euro(k.fatturatoOltreRecuperabile), { colore: k.fatturatoOltreRecuperabile > 0 ? 'giallo' : '' }) + kp('Ritenute da sbloccare', Fmt.euro(k.ritenuteDaSbloccare), { colore: k.ritenuteDaSbloccare > 0 ? 'giallo' : '' }) +
        kp('Costo effettivo cumulato', Fmt.euro(k.costoEffettivo)) +
        (uno ? kp('Stato / allerta', UI.badgeAlert(uno.alert) + ' <span class="piccolo">' + esc(uno.stato) + '</span>', { calc: false }) : kp('Portafoglio complessivo', k.n + ' commesse', { calc: false })) +
        kp('Aggiornato al', Fmt.data(uno ? uno.aggiornatoAl : k.aggiornatoAlMax), { sub: uno ? '' : 'data più recente' }) +
        kp('Cantieri critici', k.critiche, { colore: k.critiche ? 'rosso' : 'verde', calc: false }) + kp('Cantieri in attenzione', k.attenzione, { colore: k.attenzione ? 'giallo' : 'verde', calc: false }) + kp('Cantieri incompleti', k.incomplete, { colore: k.incomplete ? 'bluette' : '', calc: false }) + '</div>';
      const cm = Engine.costoMensile(Store.db, D.commessaId || null);
      document.getElementById('cant-mese').innerHTML = '<h2>Costo mensile ' + esc(P.annoGestione) + (uno ? ' – ' + esc(uno.codice) : ' – tutte le commesse') + '</h2><p class="sotto">Ore del mese × ' + Fmt.euro(P.costoOrario) + '/h + costi diretti del mese (solo esercizio corrente).</p>' +
        '<div class="tabella-wrap"><table class="tab"><thead><tr><th>Mese</th><th class="n">Ore</th><th class="n">Costi diretti</th><th class="n">Costo mese</th><th class="n">Costo cumulato</th></tr></thead><tbody>' +
        cm.map(r => '<tr><td>' + r.nome + '</td><td class="n">' + Fmt.ore(r.ore, { zeroVuoto: true }) + '</td><td class="n">' + Fmt.euro(r.costiDiretti, { zeroVuoto: true }) + '</td><td class="n calc">' + Fmt.euro(r.costoMese, { zeroVuoto: true }) + '</td><td class="n calc">' + Fmt.euro(r.cumulato) + '</td></tr>').join('') + '</tbody></table></div>';
      const conAlert = sel.filter(r => r.alert !== 'REGOLARE').sort((a, b) => Engine.LIVELLI_ALERT.indexOf(a.alert) - Engine.LIVELLI_ALERT.indexOf(b.alert));
      document.getElementById('cant-alert').innerHTML = '<h2>Commesse che richiedono attenzione</h2>' + (conAlert.length ? '<div class="tabella-wrap"><table class="tab"><tbody>' +
        conAlert.map(r => '<tr><td>' + UI.badgeAlert(r.alert) + '</td><td>' + UI.linkCommessa(r) + '<div class="piccolo muto">' + esc(r.cliente) + '</div></td><td>' + UI.motiviHtml(r) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="vuoto">Nessuna commessa con alert nella selezione.</div>');
    }
    function aggiornaTab() {
      let r = rows;
      if (F.alert) r = r.filter(x => x.alert === F.alert);
      if (F.soloAperte) r = r.filter(x => !x.finito);
      r = UI.ricerca(r, F.testo, ['codice', 'cliente', 'cantiere', 'tecnico', 'preposto']);
      const t = document.getElementById('cant-tab');
      t.innerHTML = UI.tabella('cant', { colonne, righe: r, chiave: 'id', ordine: { campo: 'codice', dir: 'asc' }, vuoto: 'Nessuna commessa.', onRiga: id => UI.vai('#/commessa/' + id + '/controllo'), onAzione: (az, id) => { if (az === 'note') Cantieri.apriNote(id); } });
      UI.legaTabelle(t);
    }
    document.getElementById('cant-sel').onchange = e => { D.commessaId = e.target.value; aggiornaKpi(); };
    const fil = document.getElementById('cant-filtri');
    const onCambio = UI.debounce(() => { fil.querySelectorAll('[name]').forEach(el => { F[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); aggiornaTab(); }, 150);
    fil.addEventListener('input', onCambio); fil.addEventListener('change', onCambio);
    const be = cont.querySelector('[data-esporta="cant"]'); if (be) be.onclick = () => UI.esportaCsv('controllo_cantieri_' + P.annoGestione, UI.righeOrdinate('cant'), UI.COLONNE_EXPORT_SCHEDA);
    aggiornaKpi(); aggiornaTab();
  });
})();
