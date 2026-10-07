/* FIDA EDILE – Budget commessa (ore e costi diretti previsti) */
(function () {
  'use strict';
  const esc = UI.esc;
  const D = { da: '', a: '' };
  const F = { testo: '', soloAperte: true };

  const Budget = {
    apriForm(commessaId, onSalvato) {
      if (!Store.puo('budget.modifica')) return UI.permessoNegato();
      const c = Store.commessa(commessaId); if (!c) return;
      const b = Engine.budgetDi(c, Store.db.parametri);
      const row = Engine.calcolaCommessa(c, Store.db);
      const P = Store.db.parametri;
      const corpo = '<form id="form-budget" onsubmit="return false">' +
        '<div class="msg info">Commessa <b>' + esc(Engine.etichetta(c)) + '</b> · contratto aggiornato ' + Fmt.euro(row.contrattoAggiornato) + ' (dall\'Anagrafica)</div>' +
        '<fieldset><legend>Budget iniziale (storico)</legend><div class="form-griglia">' +
        UI.campo({ nome: 'orePreviste', etichetta: 'Ore previste iniziali', tipo: 'ore', step: '0.5', aiuto: 'Prima stesura del budget: resta come storico e non va più modificata.' }, b.orePrevisteIniziali) +
        UI.campo({ nome: 'costiDirettiPrevisti', etichetta: 'Costi diretti previsti iniziali (€)', tipo: 'euro', aiuto: 'Prima stesura del budget: resta come storico.' }, b.costiDirettiPrevistiIniziali) +
        '</div></fieldset>' +
        '<fieldset><legend>Budget aggiornato</legend><div class="form-griglia">' +
        UI.campo({ nome: 'orePrevisteAgg', etichetta: 'Ore previste aggiornate', tipo: 'ore', step: '0.5', aiuto: 'Lasciare vuoto se non è cambiato nulla: vale il valore iniziale.' }, b.orePrevisteAgg) +
        UI.campo({ nome: 'costiDirettiPrevistiAgg', etichetta: 'Costi diretti previsti aggiornati (€)', tipo: 'euro', aiuto: 'Lasciare vuoto se non è cambiato nulla: vale il valore iniziale.' }, b.costiDirettiPrevistiAgg) +
        UI.campo({ nome: 'dataAggiornamento', etichetta: 'Data aggiornamento budget', tipo: 'date', aiuto: 'Data a cui si riferisce la revisione. Si compila da sola quando cambi un valore aggiornato.' }, b.dataAggiornamento) +
        '<div class="campo"><label>Conferma senza modifiche</label><button type="button" id="btn-oggi">Il budget va bene: conferma a oggi</button>' +
        '<div class="aiuto">Porta la data a oggi lasciando i valori come sono: serve a dire che il budget è stato rivisto e confermato.</div></div>' +
        '</div></fieldset>' +
        '<fieldset><legend>Valori calcolati (iniziale → aggiornato)</legend><div class="form-griglia">' +
        UI.campo({ nome: 'costoOre', etichetta: 'Costo ore (€)', tipo: 'sola', html: Fmt.euro(b.costoOreIniziale) + ' → <b>' + Fmt.euro(b.costoOre) + '</b>' }) +
        UI.campo({ nome: 'costoTotale', etichetta: 'Costo totale previsto (€)', tipo: 'sola', html: Fmt.euro(b.costoTotalePrevistoIniziale) + ' → <b>' + Fmt.euro(b.costoTotalePrevisto) + '</b>' }) +
        UI.campo({ nome: 'margine', etichetta: 'Margine teorico', tipo: 'sola', html: Fmt.pct(b.margineTeoricoIniziale) + ' → <b>' + Fmt.pct(b.margineTeorico) + '</b>' }) +
        '</div></fieldset>' +
        '<fieldset><legend>Note</legend>' + UI.campo({ nome: 'note', etichetta: 'Note budget', tipo: 'textarea', classe: 'largo' }, b.note) + '</fieldset></form>';
      UI.modale({
        titolo: 'Budget commessa ' + c.codice, corpo,
        pulsanti: [{
          testo: 'Salva', classe: 'primario', async azione(m) {
            const v = UI.leggiForm(m.el.querySelector('#form-budget'));
            const nuovo = {
              orePreviste: v.orePreviste, costiDirettiPrevisti: v.costiDirettiPrevisti,
              orePrevisteAgg: v.orePrevisteAgg, costiDirettiPrevistiAgg: v.costiDirettiPrevistiAgg,
              dataAggiornamento: v.dataAggiornamento || '', note: v.note || ''
            };
            const errori = [], avvisi = [];
            const CAMPI = ['orePreviste', 'costiDirettiPrevisti', 'orePrevisteAgg', 'costiDirettiPrevistiAgg'];
            CAMPI.forEach(f => { if (nuovo[f] !== null && nuovo[f] < 0) errori.push('Valore negativo nel campo ' + (Schema.ETICHETTE[f] || f) + '.'); });
            const haAgg = nuovo.orePrevisteAgg !== null || nuovo.costiDirettiPrevistiAgg !== null;
            if (haAgg && !nuovo.dataAggiornamento) errori.push('Indicare la DATA AGGIORNAMENTO BUDGET quando si inserisce un valore aggiornato.');
            // data senza valori aggiornati = conferma del budget iniziale a quella data: è un uso normale, non un avviso
            if (nuovo.orePreviste === null) avvisi.push('Ore previste iniziali non indicate: il controllo ore/SAL e il ritardo produttivo non saranno calcolati.');
            await UI.salvaConControlli(m, {
              valida: () => ({ errori, avvisi }),
              salva: async () => {
                await Store.salva(db => {
                  const cur = db.commesse.find(x => x.id === commessaId);
                  const mod = Store.diff(cur.budget || {}, nuovo, ['orePreviste', 'costiDirettiPrevisti', 'orePrevisteAgg', 'costiDirettiPrevistiAgg', 'dataAggiornamento', 'note']);
                  cur.budget = Object.assign({}, cur.budget || {}, nuovo);
                  if (mod.length) Store.log(db, 'budget', cur.id, cur.codice, 'MODIFICA BUDGET', mod);
                });
                UI.toast('Budget salvato.');
                if (onSalvato) onSalvato();
              }
            });
          }
        }],
        onMount(m) {
          const form = m.el.querySelector('#form-budget');
          const agg = () => {
            const v = UI.leggiForm(form);
            const bb = Engine.budgetDi(Object.assign({}, c, { budget: v }), P);
            form.querySelector('#f-costoOre').innerHTML = Fmt.euro(bb.costoOreIniziale) + ' → <b>' + Fmt.euro(bb.costoOre) + '</b>';
            form.querySelector('#f-costoTotale').innerHTML = Fmt.euro(bb.costoTotalePrevistoIniziale) + ' → <b>' + Fmt.euro(bb.costoTotalePrevisto) + '</b>';
            form.querySelector('#f-margine').innerHTML = Fmt.pct(bb.margineTeoricoIniziale) + ' → <b>' + Fmt.pct(bb.margineTeorico) + '</b>';
          };
          const campoData = form.querySelector('#f-dataAggiornamento');
          // toccando un valore aggiornato la data si compila da sola con oggi (se non è già stata indicata)
          form.addEventListener('input', e => {
            if (e.target && /^f-(orePrevisteAgg|costiDirettiPrevistiAgg)$/.test(e.target.id) && !campoData.value && e.target.value !== '') campoData.value = Fmt.oggi();
            agg();
          });
          // conferma del budget senza toccare i valori: aggiorna solo la data
          form.querySelector('#btn-oggi').onclick = () => {
            campoData.value = Fmt.oggi();
            campoData.focus();
            UI.toast('Data aggiornamento budget portata a oggi: premi Salva per confermare.');
          };
        }
      });
    }
  };
  window.Budget = Budget;

  UI.registra('budget', function (cont) {
    const P = Store.db.parametri;
    if (!D.da) { D.da = P.annoGestione + '-01-01'; D.a = P.annoGestione + '-12-31'; }
    const rows = Engine.calcolaTutte(Store.db);
    cont.innerHTML = UI.testata('Budget commessa', 'Budget tecnico per commessa. Codice, cliente e cantiere provengono esclusivamente dall\'Anagrafica; l\'utente inserisce solo ore previste e costi diretti previsti; le ore sono valorizzate al costo strutturale corrente dei Parametri.', UI.pulsanteEsporta('budget')) +
      '<div class="pannello"><h2>Commesse aperte per periodo di fine prevista</h2><div class="filtri" id="bud-dash">' +
      '<div class="campo"><label>Periodo da</label><input type="date" class="in" name="da" value="' + esc(D.da) + '"></div>' +
      '<div class="campo"><label>Periodo a</label><input type="date" class="in" name="a" value="' + esc(D.a) + '"></div></div>' +
      '<div id="bud-kpi"></div><p class="sotto">La dashboard considera le commesse ancora aperte (senza data fine effettiva e non finite) con DATA DI FINE PREVISTA compresa nel periodo selezionato.</p></div>' +
      '<div class="pannello compatto"><div class="filtri" id="bud-filtri">' +
      '<div class="campo largo"><label>Ricerca</label><input type="search" class="in" name="testo" value="' + esc(F.testo) + '" placeholder="codice, cliente, cantiere, tecnico"></div>' +
      '<div class="campo"><label>Stato</label><label style="text-transform:none;font-size:13px;margin-top:6px"><input type="checkbox" name="soloAperte"' + (F.soloAperte ? ' checked' : '') + '> solo commesse non finite</label></div>' +
      '</div></div>' + UI.legenda() + '<div id="bud-tab"></div>';
    const colonne = [
      { campo: 'codice', titolo: 'Codice', fmt: (v, r) => UI.linkCommessa(r) },
      { campo: 'cliente', titolo: 'Cliente' },
      { campo: 'cantiere', titolo: 'Cantiere', classe: 'desc' },
      { campo: 'stato', titolo: 'Stato', fmt: v => UI.badgeStato(v) },
      { campo: 'contrattoAggiornato', titolo: 'Contratto agg.', tipo: 'n', fmt: v => Fmt.euro(v) },
      { campo: 'orePrevisteIni', titolo: 'Ore previste iniziali', tipo: 'n', classe: 'in', fmt: v => Fmt.ore(v) },
      { campo: 'orePreviste', titolo: 'Ore previste aggiornate', tipo: 'n', classe: 'in', fmt: (v, r) => Fmt.ore(v) + (r.budget.orePrevisteAgg !== null ? '' : ' <span class="muto piccolo">(iniziale)</span>') },
      { campo: 'dataAggiornamento', titolo: 'Agg. al', fmt: v => v ? Fmt.data(v) : '<span class="muto">—</span>' },
      { campo: 'costoOrario', titolo: 'Costo orario', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v) },
      { campo: 'costoOreIni', titolo: 'Costo ore iniziale', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v) },
      { campo: 'costoOre', titolo: 'Costo ore aggiornato', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v) },
      { campo: 'costiDirettiPrevistiIni', titolo: 'Costi diretti previsti iniziali', tipo: 'n', classe: 'in', fmt: v => Fmt.euro(v) },
      { campo: 'costiDirettiPrevisti', titolo: 'Costi diretti previsti aggiornati', tipo: 'n', classe: 'in', fmt: (v, r) => Fmt.euro(v) + (r.budget.costiDirettiPrevistiAgg !== null ? '' : ' <span class="muto piccolo">(iniziale)</span>') },
      { campo: 'costoTotaleIni', titolo: 'Costo totale previsto iniziale', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v) },
      { campo: 'costoTotale', titolo: 'Costo totale previsto aggiornato', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v) },
      { campo: 'margineIni', titolo: 'Margine teorico iniziale', tipo: 'n', classe: 'calc', fmt: v => Fmt.pct(v) },
      { campo: 'margine', titolo: 'Margine teorico aggiornato', tipo: 'n', classe: 'calc', fmt: v => Fmt.pct(v) },
      { campo: 'oreUsate', titolo: 'Ore usate', tipo: 'n', classe: 'calc', fmt: v => Fmt.ore(v) },
      { campo: 'oreResidueIni', titolo: 'Ore residue su iniziale', tipo: 'n', classe: 'calc', fmt: v => Fmt.ore(v) },
      { campo: 'oreResidue', titolo: 'Ore residue su aggiornato', tipo: 'n', classe: 'calc', fmt: v => Fmt.ore(v) },
      { campo: 'orePctIni', titolo: '% ore su iniziale', tipo: 'n', classe: 'calc', fmt: v => Fmt.pct(v) },
      { campo: 'orePct', titolo: '% ore su aggiornato', tipo: 'n', classe: 'calc', fmt: v => Fmt.pct(v) },
      { campo: 'costiSostenuti', titolo: 'Costi sostenuti', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v) },
      { campo: 'costiResiduoIni', titolo: 'Residuo / sforamento su iniziale', tipo: 'n', classe: 'calc', fmt: (v, r) => r.costiSforamentoIni > 0 ? '<span style="color:var(--rosso)">sforamento ' + Fmt.euro(r.costiSforamentoIni) + '</span>' : 'residuo ' + Fmt.euro(v) },
      { campo: 'costiResiduo', titolo: 'Residuo / sforamento su aggiornato', tipo: 'n', classe: 'calc', fmt: (v, r) => r.costiSforamento > 0 ? '<span style="color:var(--rosso)">sforamento ' + Fmt.euro(r.costiSforamento) + '</span>' : 'residuo ' + Fmt.euro(v) },
      { campo: 'noteBudget', titolo: 'Note', classe: 'desc piccolo', valOrd: r => r.budget.note },
      { campo: 'azioni', titolo: '', ord: false, classe: 'azioni-riga', fmt: (v, r) => Store.puo('budget.modifica') ? '<button type="button" data-azione="budget" data-id="' + esc(r.id) + '">Modifica</button>' : '' }
    ];
    function aggiornaDash() {
      const b = Engine.dashboardBudget(Store.db, D.da, D.a);
      document.getElementById('bud-kpi').innerHTML = b ? '<div class="kpi-griglia">' + UI.kpi('Commesse aperte nel periodo', b.n, { calc: false }) +
        UI.kpi('Ore previste iniziali', Fmt.ore(b.orePrevisteIniziali)) + UI.kpi('Ore previste aggiornate', Fmt.ore(b.orePreviste)) +
        UI.kpi('Costo totale previsto iniziale', Fmt.euro(b.costoTotalePrevistoIniziale)) + UI.kpi('Costo totale previsto aggiornato', Fmt.euro(b.costoTotalePrevisto)) + '</div>' : '<div class="msg avviso">Periodo non valido.</div>';
    }
    function aggiornaTab() {
      let r = rows.map(x => Object.assign({}, x, {
        orePreviste: x.budget.orePreviste, orePrevisteIni: x.budget.orePrevisteIniziali,
        costoOrario: x.budget.costoOrario, costoOre: x.budget.costoOre, costoOreIni: x.budget.costoOreIniziale,
        costiDirettiPrevisti: x.budget.costiDirettiPrevisti, costiDirettiPrevistiIni: x.budget.costiDirettiPrevistiIniziali,
        costoTotale: x.budget.costoTotalePrevisto, costoTotaleIni: x.budget.costoTotalePrevistoIniziale,
        margine: x.budget.margineTeorico, margineIni: x.budget.margineTeoricoIniziale,
        dataAggiornamento: x.budget.dataAggiornamento, noteBudget: x.budget.note
      }));
      if (F.soloAperte) r = r.filter(x => !x.finito);
      r = UI.ricerca(r, F.testo, ['codice', 'cliente', 'cantiere', 'tecnico']);
      const t = document.getElementById('bud-tab');
      t.innerHTML = UI.tabella('budget', { colonne, righe: r, chiave: 'id', ordine: { campo: 'codice', dir: 'asc' }, onRiga: id => UI.vai('#/commessa/' + id + '/budget'), onAzione: (az, id) => { if (az === 'budget') Budget.apriForm(id); },
        totali: (function () {
          const t = f => r.reduce((s, x) => s + Engine.num(x[f]), 0);
          return {
            codice: 'Totale',
            orePrevisteIni: Fmt.ore(t('orePrevisteIni')), orePreviste: Fmt.ore(t('orePreviste')),
            costoOreIni: Fmt.euro(t('costoOreIni')), costoOre: Fmt.euro(t('costoOre')),
            costiDirettiPrevistiIni: Fmt.euro(t('costiDirettiPrevistiIni')), costiDirettiPrevisti: Fmt.euro(t('costiDirettiPrevisti')),
            costoTotaleIni: Fmt.euro(t('costoTotaleIni')), costoTotale: Fmt.euro(t('costoTotale')),
            oreUsate: Fmt.ore(t('oreUsate')), costiSostenuti: Fmt.euro(t('costiSostenuti'))
          };
        })() });
      UI.legaTabelle(t);
    }
    const dash = document.getElementById('bud-dash');
    dash.addEventListener('change', () => { dash.querySelectorAll('[name]').forEach(el => { D[el.name] = el.value; }); aggiornaDash(); });
    const fil = document.getElementById('bud-filtri');
    const onCambio = UI.debounce(() => { fil.querySelectorAll('[name]').forEach(el => { F[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); aggiornaTab(); }, 150);
    fil.addEventListener('input', onCambio); fil.addEventListener('change', onCambio);
    const be = cont.querySelector('[data-esporta="budget"]'); if (be) be.onclick = () => UI.esportaCsv('budget_commesse', UI.righeOrdinate('budget'), [
      { titolo: 'Codice', campo: 'codice' }, { titolo: 'Cliente', campo: 'cliente' }, { titolo: 'Cantiere', campo: 'cantiere' }, { titolo: 'Stato', campo: 'stato' }, { titolo: 'Contratto aggiornato', campo: 'contrattoAggiornato' },
      { titolo: 'Ore previste iniziali', campo: 'orePrevisteIni' }, { titolo: 'Ore previste aggiornate', campo: 'orePreviste' }, { titolo: 'Data aggiornamento budget', valore: r => Fmt.data(r.dataAggiornamento) },
      { titolo: 'Costo orario', campo: 'costoOrario' }, { titolo: 'Costo ore iniziale', campo: 'costoOreIni' }, { titolo: 'Costo ore aggiornato', campo: 'costoOre' },
      { titolo: 'Costi diretti previsti iniziali', campo: 'costiDirettiPrevistiIni' }, { titolo: 'Costi diretti previsti aggiornati', campo: 'costiDirettiPrevisti' },
      { titolo: 'Costo totale previsto iniziale', campo: 'costoTotaleIni' }, { titolo: 'Costo totale previsto aggiornato', campo: 'costoTotale' },
      { titolo: 'Margine teorico iniziale %', valore: r => r.margineIni === null ? '' : Math.round(r.margineIni * 10000) / 100 },
      { titolo: 'Margine teorico aggiornato %', valore: r => r.margine === null ? '' : Math.round(r.margine * 10000) / 100 },
      { titolo: 'Ore usate', campo: 'oreUsate' }, { titolo: 'Ore residue su iniziale', campo: 'oreResidueIni' }, { titolo: 'Ore residue su aggiornato', campo: 'oreResidue' },
      { titolo: 'Costi sostenuti', campo: 'costiSostenuti' }, { titolo: 'Costi residuo su iniziale', campo: 'costiResiduoIni' }, { titolo: 'Costi residuo su aggiornato', campo: 'costiResiduo' },
      { titolo: 'Sforamento su iniziale', campo: 'costiSforamentoIni' }, { titolo: 'Sforamento su aggiornato', campo: 'costiSforamento' }, { titolo: 'Note', campo: 'noteBudget' }
    ]);
    aggiornaDash(); aggiornaTab();
  });
})();
