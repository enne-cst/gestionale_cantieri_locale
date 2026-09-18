/*
 * FIDA EDILE – Verifica di sostenibilità economica.
 *
 * Riproduce il modello "VERIFICA DI SOSTENIBILITÀ ECONOMICA DELLA COMMESSA" (fogli "Analisi semplificata"
 * e "Dettaglio strutturale"): il prezzo del computo viene confrontato con il prezzo minimo sostenibile,
 * formato dalla parte strutturale (ore × costo strutturale, con rischio, redditività e rientro bancario)
 * e dal prezzo di vendita dei costi specifici (ogni voce con il suo ricarico).
 *
 * Per una COMMESSA la verifica è automatica: il prezzo del computo è il contratto aggiornato dell'Anagrafica,
 * le ore e i costi specifici sono le ore previste e i costi diretti previsti vigenti del Budget. L'unico dato
 * inserito a mano è il ricarico da applicare ai costi specifici.
 * Per un PREVENTIVO (ipotesi di commessa) non esiste ancora nulla in archivio e tutto è inserito a mano:
 * se ne occupa page-preventivi.js, che riusa i pannelli di questa pagina.
 */
(function () {
  'use strict';
  const esc = UI.esc;
  const F = { testo: '', esito: '', soloAperte: true, soloCompilate: false };
  const E = v => Fmt.euro(v), O = v => Fmt.ore(v), Pc = (v, dec) => Fmt.pct(v, dec);

  function kv(righe) {
    return '<table class="kv">' + righe.map(r => '<tr><th>' + esc(r[0]) + '</th><td class="' + (r[2] || '') + '">' + r[1] + '</td></tr>').join('') + '</table>';
  }

  const Sostenibilita = {

    coloreEsito(esito) {
      return esito === 'CONGRUA' ? 'verde' : (esito === 'DA COMPLETARE' ? 'giallo' : 'rosso');
    },

    // ------------------------------------------------------------ maschera della commessa (solo il ricarico)
    apriForm(commessaId, onSalvato) {
      if (!Store.puo('sostenibilita.modifica')) return UI.permessoNegato();
      const c = Store.commessa(commessaId); if (!c) return;
      const S = Engine.parametriSostenibilita(Store.db.parametri);
      const v0 = Engine.calcolaSostenibilita(c, Store.db);
      const vI = Engine.calcolaSostenibilita(c, Store.db, 'iniziale');
      // il maturato consuntivo parte dai cumulativi della commessa (fatturato lordo, ore consumate, costi diretti sostenuti)
      const rc = Engine.calcolaCommessa(c, Store.db);
      const datiCons = { fatturato: rc.fattCum, ore: rc.oreUsate, costi: rc.costiSostenuti };
      const vC = rc.sostenibilitaConsuntivo;
      const s = c.sostenibilita || {};

      const manca = t => '<span style="color:var(--rosso)">' + esc(t) + '</span>';
      // "iniziale X · aggiornato Y · consuntivo Z" per i dati che esistono in più versioni
      const due = (a, b, fmt, testoManca, cons) => ['iniziale', 'aggiornato', 'consuntivo'].slice(0, cons === undefined ? 2 : 3)
        .map((t, i) => { const x = [a, b, cons][i]; return t + ' ' + (x === null ? manca(testoManca) : '<b>' + fmt(x) + '</b>'); }).join(' · ');
      const corpo = '<form id="form-sost" onsubmit="return false">' +
        '<div class="msg info">Commessa <b>' + esc(Engine.etichetta(c)) + '</b>. La verifica è automatica: prezzo, ore e costi specifici ' +
        'arrivano da <b>Anagrafica</b> e <b>Budget</b> e non si digitano qui. L\'unico valore da indicare è il <b>ricarico</b> sui costi specifici.</div>' +
        '<fieldset><legend>Dati che arrivano dalle altre schede</legend><div class="form-griglia">' +
        UI.campo({ nome: 'xPrezzo', etichetta: 'Prezzo del computo (€)', tipo: 'sola', html: due(vI.prezzoComputo, v0.prezzoComputo, E, 'non indicato', vC.prezzoComputo), aiuto: 'Iniziale: contratto iniziale · aggiornato: contratto iniziale + integrazioni (Anagrafica) · consuntivo: fatturato lordo cumulato.' }) +
        UI.campo({ nome: 'xOre', etichetta: 'Ore totali previste', tipo: 'sola', html: due(vI.ore, v0.ore, O, 'non indicate', vC.ore), aiuto: 'Ore previste del Budget: iniziali e vigenti' + (v0.oreDaBudgetAggiornato ? ' (valore aggiornato)' : ' (nessun aggiornamento: coincidono con le iniziali)') + ' · consuntivo: ore consumate.' }) +
        UI.campo({ nome: 'xCosti', etichetta: 'Costi specifici (€)', tipo: 'sola', html: due(vI.costiDirettiPrevisti, v0.costiDirettiPrevisti, E, 'non indicati', vC.costiDirettiPrevisti), aiuto: 'Costi diretti previsti del Budget: iniziali e vigenti' + (v0.costiDaBudgetAggiornato ? ' (valore aggiornato)' : ' (nessun aggiornamento: coincidono con gli iniziali)') + ' · consuntivo: costi diretti sostenuti cumulati.' }) +
        UI.campo({ nome: 'xCosto', etichetta: 'Costo strutturale (€/h)', tipo: 'sola', html: E(S.costoOrario), aiuto: 'Parametro aziendale protetto (Parametri).' }) +
        '</div></fieldset>' +
        '<fieldset><legend>Ricarico sui costi specifici</legend><div class="form-griglia">' +
        UI.campo({ nome: 'ricarico', etichetta: 'Ricarico (%)', tipo: 'pct', step: '0.5', aiuto: 'Soglia minima stabilita dalla Direzione: ' + Pc(S.sogliaRicarico) + '. Un valore inferiore rende la verifica NON CONGRUO. Lasciare vuoto per applicare la soglia minima.' }, s.ricarico) +
        UI.campo({ nome: 'xPrezzoVendita', etichetta: 'Prezzo di vendita dei costi specifici', tipo: 'sola', html: due(vI.prezzoMinimoSpecifici, v0.prezzoMinimoSpecifici, E, '—', vC.prezzoMinimoSpecifici), aiuto: '(costi + maggiorazione) portato a redditività ' + Pc(S.redditivita) + '.' }) +
        '</div></fieldset>' +
        '<fieldset><legend>Esito della verifica</legend><div id="sost-esito"></div></fieldset>' +
        '<fieldset><legend>Dichiarazione e note</legend><div class="form-griglia">' +
        UI.campo({ nome: 'datiVerificati', etichetta: 'Dati del computo', tipo: 'checkbox', testoCheck: 'verificati e completi', aiuto: 'Finché non è spuntato l\'esito resta DA COMPLETARE.' }, !!s.datiVerificati) +
        UI.campo({ nome: 'data', etichetta: 'Data della verifica', tipo: 'date', aiuto: 'Si compila da sola alla prima modifica.' }, s.data) +
        UI.campo({ nome: 'note', etichetta: 'Note della verifica', tipo: 'textarea', classe: 'largo' }, s.note) +
        '</div></fieldset></form>';

      UI.modale({
        titolo: 'Verifica di sostenibilità · commessa ' + c.codice, corpo,
        pulsanti: [{
          testo: 'Salva', classe: 'primario', async azione(m) {
            const val = UI.leggiForm(m.el.querySelector('#form-sost'));
            const nuovo = { ricarico: val.ricarico, datiVerificati: !!val.datiVerificati, data: val.data || '', note: val.note || '' };
            await UI.salvaConControlli(m, {
              valida: () => Engine.validaSostenibilita(nuovo, Store.db),
              salva: async () => {
                await Store.salva(db => {
                  const cur = db.commesse.find(x => x.id === commessaId);
                  const mod = Store.diff(cur.sostenibilita || {}, nuovo, ['ricarico', 'datiVerificati', 'data', 'note']);
                  cur.sostenibilita = nuovo;
                  if (mod.length) Store.log(db, 'sostenibilita', cur.id, cur.codice, 'VERIFICA DI SOSTENIBILITÀ', mod);
                });
                UI.toast('Verifica di sostenibilità salvata.');
                if (onSalvato) onSalvato();
              }
            });
          }
        }],
        onMount(m) {
          const f = m.el.querySelector('#form-sost');
          const campoData = f.querySelector('#f-data');
          const box = m.el.querySelector('#sost-esito');
          const mostra = () => {
            const val = UI.leggiForm(f);
            const finto = Object.assign({}, c, { sostenibilita: { ricarico: val.ricarico, datiVerificati: !!val.datiVerificati, data: val.data, note: '' } });
            const r = Engine.calcolaSostenibilita(finto, Store.db);
            const rI = Engine.calcolaSostenibilita(finto, Store.db, 'iniziale');
            const rC = Engine.calcolaSostenibilita(finto, Store.db, 'consuntivo', datiCons);
            f.querySelector('#f-xPrezzoVendita').innerHTML = due(rI.prezzoMinimoSpecifici, r.prezzoMinimoSpecifici, E, '—', rC.prezzoMinimoSpecifici);
            box.innerHTML = '<h3>Iniziale</h3>' + Sostenibilita.riquadroEsito(rI) + '<h3>Aggiornato</h3>' + Sostenibilita.riquadroEsito(r) + '<h3>Maturato consuntivo</h3>' + Sostenibilita.riquadroEsito(rC);
          };
          f.addEventListener('input', () => { if (!campoData.value) campoData.value = Fmt.oggi(); mostra(); });
          f.addEventListener('change', () => { if (!campoData.value) campoData.value = Fmt.oggi(); mostra(); });
          mostra();
        }
      });
    },

    // riquadro compatto con i tre valori e l'esito (usato nelle maschere)
    riquadroEsito(v) {
      return '<div class="confronto"><div class="voce"><div class="et">Prezzo del computo</div><div class="val">' + E(v.prezzoComputo) + '</div></div>' +
        '<div class="voce"><div class="et">Prezzo minimo dall\'analisi</div><div class="val">' + E(v.prezzoMinimo) + '</div>' +
        '<div class="esito">strutturale ' + E(v.prezzoMinimoStrutturale) + ' + specifici ' + E(v.prezzoMinimoSpecifici) + '</div></div>' +
        '<div class="voce ' + Sostenibilita.coloreEsito(v.esito) + '"><div class="et">Scostamento</div><div class="val">' + E(v.scostamento) + '</div>' +
        '<div class="esito">' + UI.badgeEsito(v.esito) + '</div></div></div>' +
        '<ul class="sotto" style="margin:8px 0 0 18px">' + v.motivi.concat(v.avvisi).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    },

    // ------------------------------------------------------------ pannelli completi (commessa e preventivo)
    // opt: { etichettaPrezzo, testoNonCompilata, iniziale, titoloAggiornato }
    // Con opt.iniziale (commessa) i valori sono affiancati: colonna Iniziale (opt.iniziale) e colonna Aggiornato (v).
    pannelli(v, opt) {
      opt = opt || {};
      const S = v.parametri;
      const det = Engine.dettaglioStrutturale(Store.db, v.ore);
      // versioni affiancate (commessa): Iniziale (opt.iniziale), Aggiornato (v), Maturato consuntivo (opt.consuntivo)
      const doppia = !!(opt.iniziale || opt.consuntivo);
      const elenco = [[opt.iniziale, 'Iniziale', 'col-ini'], [v, opt.titoloAggiornato || 'Aggiornato', 'col-agg'], [opt.consuntivo, 'Maturato consuntivo', 'col-cons']].filter(x => x[0]);
      const vers = elenco.map(x => x[0]), titoli = elenco.map(x => x[1]);
      // tabella voce / valore: ogni riga è [etichetta, funzione(versione) → html, classe]; con più versioni una colonna ciascuna
      const kvV = righe => doppia
        ? '<table class="kv kv3"><tr><th></th>' + elenco.map(x => '<th class="' + x[2] + '">' + esc(x[1]) + '</th>').join('') + '</tr>' +
          righe.map(x => '<tr><th>' + esc(x[0]) + '</th>' + vers.map(w => '<td class="' + (x[2] || '') + '">' + x[1](w) + '</td>').join('') + '</tr>').join('') + '</table>'
        : kv(righe.map(x => [x[0], x[1](v), x[2]]));

      const testa = '<div class="pannello">' + vers.map((w, i) => '<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap' + (i ? ';margin-top:10px' : '') + '">' +
        (doppia ? '<b style="min-width:110px">' + esc(titoli[i]) + '</b>' : '') +
        '<span style="font-size:20px">' + UI.badgeEsito(w.esito) + '</span>' +
        '<div class="motivi">' + w.motivi.concat(w.avvisi).map(x => '<span>' + esc(x) + '</span>').join('') + '</div></div>').join('') +
        '<p class="sotto" style="margin-top:6px">' + (v.compilata
          ? 'Verifica del ' + Fmt.data(v.data) + (v.datiVerificati ? ' · dati del computo dichiarati verificati e completi' : ' · dati del computo non ancora dichiarati completi')
          : esc(opt.testoNonCompilata || 'Verifica non ancora confermata: i valori qui sotto sono il calcolo automatico sui dati attuali.')) + '</p></div>';

      const confronto = '<div class="pannello"><h2>Prezzo del computo e prezzo minimo sostenibile</h2>' +
        '<p class="spiegazione">Il <b>prezzo minimo dall\'analisi</b> è il prezzo sotto il quale la commessa non regge: parte strutturale (ore × costo strutturale, con rischio, redditività e rientro bancario) più prezzo di vendita dei costi specifici. <b>Scostamento = prezzo del computo − prezzo minimo</b>: se è negativo la commessa non è sostenibile.</p>' +
        vers.map((w, i) => (doppia ? '<h3>' + esc(titoli[i]) + '</h3>' : '') +
        '<div class="confronto"><div class="voce"><div class="et">Prezzo del computo</div><div class="val">' + E(w.prezzoComputo) + '</div><div class="esito">' + esc(opt.etichettaPrezzo || (w.versione === 'iniziale' ? 'contratto iniziale (Anagrafica)' : (w.versione === 'consuntivo' ? 'fatturato lordo cumulato' : 'contratto aggiornato (Anagrafica)'))) + '</div></div>' +
        '<div class="voce"><div class="et">Prezzo minimo dall\'analisi</div><div class="val">' + E(w.prezzoMinimo) + '</div><div class="esito">strutturale ' + E(w.prezzoMinimoStrutturale) + ' + specifici ' + E(w.prezzoMinimoSpecifici) + '</div></div>' +
        '<div class="voce ' + Sostenibilita.coloreEsito(w.esito) + '"><div class="et">Scostamento</div><div class="val">' + E(w.scostamento) + '</div><div class="esito">' + (w.marginePct === null ? '&nbsp;' : Pc(w.marginePct) + ' del prezzo del computo') + '</div></div></div>').join('') + '</div>';

      // commessa: una riga per versione (iniziale / aggiornata), ciascuna con i costi diretti previsti del Budget che usa
      const righeAuto = vers.map((w, i) => ({ w, i })).filter(o => o.w.costiDirettiPrevisti !== null);
      const voci = '<div class="pannello"><h2>Costi specifici</h2>' + (v.automatica
        ? (!righeAuto.length
          ? '<div class="vuoto">Costi diretti previsti non indicati nel Budget: i costi specifici non sono determinati.</div>'
          : '<p class="spiegazione">' + (doppia
            ? 'I costi specifici della commessa sono i <b>costi diretti previsti del Budget</b>: iniziali per la colonna iniziale, vigenti' + (v.costiDaBudgetAggiornato ? ' (valore aggiornato)' : ' (nessun aggiornamento: coincidono con gli iniziali)') + ' per quella aggiornata' + (opt.consuntivo ? ', costi diretti sostenuti cumulati per il maturato consuntivo' : '')
            : 'I costi specifici della commessa sono i <b>costi diretti previsti vigenti del Budget</b>' + (v.costiDaBudgetAggiornato ? ' (valore aggiornato)' : ' (valore iniziale)')) + ': non si reinseriscono qui. Si indica solo il ricarico.</p>' +
          '<div class="tabella-wrap"><table class="tab"><thead><tr><th>Voce</th><th class="n">Costo</th><th class="n">Ricarico</th><th class="n">Maggiorazione €</th><th class="n">Prezzo di vendita</th></tr></thead><tbody>' +
          righeAuto.map(o => o.w.voci.map(x => '<tr><td>' + esc(x.voce) + (doppia ? ' · ' + esc(titoli[o.i].toLowerCase()) : '') + ' <span class="badge neutro">' + (o.w.versione === 'consuntivo' ? 'dai Costi diretti' : 'dal Budget') + '</span></td><td class="n calc">' + E(x.costoTotale) + '</td>' +
            '<td class="n in' + (x.sottoSoglia ? ' sotto-soglia' : '') + '">' + Pc(x.ricarico) + (x.sottoSoglia ? ' ⚠' : '') + '</td>' +
            '<td class="n calc">' + E(x.maggiorazione) + '</td><td class="n calc">' + E(x.prezzoVendita) + '</td></tr>').join('')).join('') +
          '</tbody></table></div>')
        : (v.voci.length
          ? '<div class="tabella-wrap"><table class="tab"><thead><tr><th class="n">#</th><th>Voce di costo specifico</th><th>Macro-categoria</th><th class="n">Quantità</th><th>U.M.</th><th class="n">Costo unitario</th><th class="n">Costo totale</th><th class="n">Ricarico</th><th class="n">Maggiorazione €</th><th class="n">Prezzo di vendita</th></tr></thead><tbody>' +
          v.voci.map(x => '<tr><td class="n muto">' + x.n + '</td><td>' + esc(x.voce) + '</td><td>' + (x.macroCategoria ? '<span class="badge neutro">' + esc(x.macroCategoria) + '</span>' : '<span class="muto">—</span>') + '</td>' +
            '<td class="n in">' + (Fmt.isNum(x.quantita) ? Fmt.numero(x.quantita, 2) : Fmt.VUOTO) + '</td><td>' + esc(x.um || '') + '</td><td class="n in">' + E(x.costoUnitario) + '</td>' +
            '<td class="n calc">' + E(x.costoTotale) + '</td><td class="n in' + (x.sottoSoglia ? ' sotto-soglia' : '') + '">' + Pc(x.ricarico) + (x.sottoSoglia ? ' ⚠' : '') + '</td>' +
            '<td class="n calc">' + E(x.maggiorazione) + '</td><td class="n calc">' + E(x.prezzoVendita) + '</td></tr>').join('') +
          '<tr class="totale"><td></td><td>Totale costi specifici</td><td></td><td></td><td></td><td></td><td class="n">' + E(v.totVoci.costoTotale) + '</td><td class="n">' + Pc(v.totVoci.ricaricoMedio) + '</td><td class="n">' + E(v.totVoci.maggiorazione) + '</td><td class="n">' + E(v.totVoci.prezzoVendita) + '</td></tr>' +
          '</tbody></table></div>'
          : '<div class="vuoto">Nessuna voce di costo specifico: la verifica considera la sola parte strutturale.</div>')) + '</div>';

      const formazione = '<div class="griglia-2"><div class="pannello"><h2>Formazione del prezzo minimo</h2>' + kvV([
        ['Ore totali previste', w => O(w.ore), 'in'],
        ['Costo strutturale attribuito alla commessa senza costi diretti', w => E(w.strutturale.costo), 'calc'],
        ['Costo strutturale attribuito alla commessa con costi diretti', w => E(w.costoStrutturaleConDiretti), 'calc'],
        ['Rischio / imprevisti sulla parte strutturale (' + Pc(S.rischio) + ')', w => E(w.strutturale.rischio), 'calc'],
        ['Costo strutturale prudenziale', w => E(w.strutturale.prudenziale), 'calc'],
        ['Redditività (' + Pc(S.redditivita) + ')', w => E(w.strutturale.redditivita), 'calc'],
        ['Prezzo con redditività del ' + Pc(S.redditivita), w => E(w.strutturale.conRedditivita), 'calc'],
        ['Quota di rientro bancario (' + E(S.rientroOrario) + '/h)', w => E(w.strutturale.rientro), 'calc'],
        ['Prezzo sostenibile della parte strutturale', w => '<b>' + E(w.prezzoMinimoStrutturale) + '</b>', 'calc'],
        ['Prezzo di vendita dei costi specifici', w => E(w.prezzoMinimoSpecifici), 'calc'],
        ['PREZZO MINIMO DALL\'ANALISI', w => '<b>' + E(w.prezzoMinimo) + '</b>', 'calc'],
        ['Prezzo del computo', w => E(w.prezzoComputo), 'in'],
        ['Scostamento', w => '<b>' + E(w.scostamento) + '</b>', 'calc'],
        ['Differenza tra prezzo minimo e totale costi', w => E(w.differenzaPrezzoMinimoCosti), 'calc']
      ]) + '</div><div class="pannello"><h2>Parametri aziendali protetti</h2>' + kv([
        ['Costo strutturale', E(S.costoOrario) + '/h', 'calc'],
        ['Rischio strutturale', Pc(S.rischio), 'calc'],
        ['Redditività', Pc(S.redditivita), 'calc'],
        ['Rientro bancario', E(S.rientroOrario) + '/h', 'calc'],
        ['Soglia minima di ricarico (Direzione)', Pc(S.sogliaRicarico), 'calc'],
        ['Ricarico effettivo minimo', Pc(S.ricaricoEffettivoMinimo), 'calc']
      ]) + '<p class="sotto">Il <b>ricarico effettivo minimo</b> è quello che, dopo essere stato portato a redditività, lascia davvero il margine minimo voluto dalla Direzione: (1 + ' + Pc(S.sogliaRicarico) + ') ÷ (1 − ' + Pc(S.redditivita) + ') − 1. Si modificano da <a href="#/parametri">Parametri</a>.</p></div></div>';

      const dettaglio = '<details class="pannello dettaglio-strutturale"><summary><b>Dettaglio del costo strutturale attribuito</b> — ripartizione delle ' + O(v.ore) + (doppia ? ' previste aggiornate' : '') + ' su ' + det.righe.length + ' voci</summary>' +
        '<p class="sotto">Approfondimento dei pesi del BEP strutturale: la quota €/ora di ogni voce è il costo strutturale ' + E(S.costoOrario) + '/h moltiplicato per il suo peso. Il totale coincide con il costo strutturale attribuito.</p>' +
        '<div class="tabella-wrap"><table class="tab"><thead><tr><th>Gruppo</th><th>Voce di costo</th><th class="n">Peso</th><th class="n">Quota €/ora</th><th class="n">Ore</th><th class="n">Quota commessa</th></tr></thead><tbody>' +
        det.righe.map(x => '<tr><td class="piccolo">' + esc(x.gruppo) + '</td><td>' + esc(x.voce) + '</td><td class="n">' + Pc(x.peso, 2) + '</td><td class="n calc">' + E(x.quotaOraria) + '</td><td class="n">' + O(x.ore) + '</td><td class="n calc">' + E(x.quota) + '</td></tr>').join('') +
        '<tr class="totale"><td></td><td>BEP strutturale attribuito</td><td class="n">' + Pc(det.tot.peso, 2) + '</td><td class="n">' + E(det.tot.quotaOraria) + '</td><td class="n">' + O(det.tot.ore) + '</td><td class="n">' + E(det.tot.quota) + '</td></tr>' +
        '</tbody></table></div>' + (det.pesiCoerenti ? '' : '<div class="msg avviso">La somma dei pesi non è 100 %: correggerla da Parametri.</div>') + '</details>';

      const note = '<div class="pannello"><h2>Note della verifica</h2><p>' + (v.note ? esc(v.note).replace(/\n/g, '<br>') : '<span class="muto">Nessuna nota.</span>') + '</p></div>';

      return testa + confronto + voci + formazione + dettaglio + note;
    },

    // ------------------------------------------------------------ righe e colonne della pagina complessiva
    righe(rows) {
      return rows.map(r => {
        const v = r.sostenibilita;
        return Object.assign({}, r, {
          esito: v.esito, esitoIniziale: r.sostenibilitaIniziale ? r.sostenibilitaIniziale.esito : '',
          esitoConsuntivo: r.sostenibilitaConsuntivo ? r.sostenibilitaConsuntivo.esito : '', compilata: v.compilata, datiVerificati: v.datiVerificati, dataVerifica: v.data,
          orePreviste: v.ore, prezzoComputo: v.prezzoComputo,
          costiSpecifici: v.costiDirettiPrevisti, ricarico: v.ricarico,
          prezzoSpecifici: v.prezzoMinimoSpecifici, prezzoStrutturale: v.prezzoMinimoStrutturale,
          prezzoMinimo: v.prezzoMinimo, scostamento: v.scostamento, marginePct: v.marginePct,
          noteVerifica: v.note, motiviVerifica: v.motivi.join('; ')
        });
      });
    },
    colonne() {
      return [
        { campo: 'codice', titolo: 'Codice', fmt: (v, r) => UI.linkCommessa(r) },
        { campo: 'cliente', titolo: 'Cliente' },
        { campo: 'cantiere', titolo: 'Cantiere', classe: 'desc' },
        { campo: 'stato', titolo: 'Stato', fmt: v => UI.badgeStato(v) },
        { campo: 'esitoIniziale', titolo: 'Esito iniziale', fmt: v => UI.badgeEsito(v) },
        { campo: 'esito', titolo: 'Esito aggiornato', fmt: v => UI.badgeEsito(v) },
        { campo: 'esitoConsuntivo', titolo: 'Esito consuntivo', fmt: v => UI.badgeEsito(v) },
        { campo: 'prezzoComputo', titolo: 'Prezzo del computo', tipo: 'n', classe: 'in', fmt: v => E(v) },
        { campo: 'orePreviste', titolo: 'Ore previste', tipo: 'n', classe: 'in', fmt: v => O(v) },
        { campo: 'costiSpecifici', titolo: 'Costi specifici (Budget)', tipo: 'n', classe: 'in', fmt: v => E(v) },
        { campo: 'ricarico', titolo: 'Ricarico', tipo: 'n', classe: 'in', fmt: (v, r) => Pc(v) + (r.sostenibilita.nSottoSoglia ? ' <span style="color:var(--rosso)" title="Ricarico sotto la soglia della Direzione">⚠</span>' : '') },
        { campo: 'prezzoSpecifici', titolo: 'Prezzo vendita specifici', tipo: 'n', classe: 'calc', fmt: v => E(v) },
        { campo: 'prezzoStrutturale', titolo: 'Parte strutturale', tipo: 'n', classe: 'calc', fmt: v => E(v) },
        { campo: 'prezzoMinimo', titolo: 'Prezzo minimo', tipo: 'n', classe: 'calc', fmt: v => '<b>' + E(v) + '</b>' },
        { campo: 'scostamento', titolo: 'Scostamento', tipo: 'n', classe: 'calc', fmt: v => Fmt.isNum(v) ? '<span style="color:var(--' + (v < 0 ? 'rosso' : 'verde') + ')">' + E(v) + '</span>' : Fmt.VUOTO },
        { campo: 'marginePct', titolo: '% sul computo', tipo: 'n', classe: 'calc', fmt: v => Pc(v) },
        { campo: 'dataVerifica', titolo: 'Verificata il', fmt: v => v ? Fmt.data(v) : '<span class="muto">—</span>' },
        { campo: 'azioni', titolo: '', ord: false, classe: 'azioni-riga', fmt: (v, r) => Store.puo('sostenibilita.modifica') ? '<button type="button" data-azione="sost" data-id="' + esc(r.id) + '">' + (r.compilata ? 'Modifica' : 'Conferma') + '</button>' : '' }
      ];
    },
    COLONNE_EXPORT: [
      { titolo: 'Codice', campo: 'codice' }, { titolo: 'Cliente', campo: 'cliente' }, { titolo: 'Cantiere', campo: 'cantiere' }, { titolo: 'Stato', campo: 'stato' },
      { titolo: 'Esito verifica iniziale', campo: 'esitoIniziale' }, { titolo: 'Esito verifica aggiornata', campo: 'esito' }, { titolo: 'Esito verifica a consuntivo', campo: 'esitoConsuntivo' }, { titolo: 'Motivo esito', campo: 'motiviVerifica' },
      { titolo: 'Prezzo del computo', campo: 'prezzoComputo' }, { titolo: 'Ore previste', campo: 'orePreviste' },
      { titolo: 'Costi specifici (Budget)', campo: 'costiSpecifici' },
      { titolo: 'Ricarico %', valore: r => r.ricarico === null ? '' : Math.round(r.ricarico * 10000) / 100 },
      { titolo: 'Prezzo di vendita costi specifici', campo: 'prezzoSpecifici' }, { titolo: 'Parte strutturale', campo: 'prezzoStrutturale' },
      { titolo: 'Prezzo minimo dall\'analisi', campo: 'prezzoMinimo' }, { titolo: 'Scostamento', campo: 'scostamento' },
      { titolo: 'Scostamento % sul computo', valore: r => r.marginePct === null ? '' : Math.round(r.marginePct * 10000) / 100 },
      { titolo: 'Dati del computo verificati', valore: r => r.datiVerificati ? 'SI' : '' },
      { titolo: 'Data della verifica', valore: r => Fmt.data(r.dataVerifica) }, { titolo: 'Note della verifica', campo: 'noteVerifica' }
    ]
  };
  window.Sostenibilita = Sostenibilita;

  // ------------------------------------------------------------ pagina complessiva (commesse)
  UI.registra('sostenibilita', function (cont) {
    const S = Engine.parametriSostenibilita(Store.db.parametri);
    const tutte = Sostenibilita.righe(Engine.calcolaTutte(Store.db));

    cont.innerHTML = UI.testata('Verifica di sostenibilità economica',
      'Prezzo del computo confrontato con il prezzo minimo sostenibile. Per le commesse la verifica è automatica: prezzo dal contratto dell\'Anagrafica, ore e costi specifici dal Budget, parametri aziendali dai Parametri. Si indica solo il ricarico. Le ipotesi non ancora commessa stanno in <a href="#/preventivi">Preventivi</a>.',
      UI.pulsanteEsporta('sost')) +
      '<div id="sost-kpi"></div>' +
      '<div class="pannello compatto"><div class="filtri" id="sost-filtri">' +
      '<div class="campo largo"><label>Ricerca</label><input type="search" class="in" name="testo" value="' + esc(F.testo) + '" placeholder="codice, cliente, cantiere, tecnico"></div>' +
      '<div class="campo"><label>Esito</label><select class="in" name="esito"><option value="">Tutti</option>' +
      Engine.ESITI_SOSTENIBILITA.map(e => '<option' + (F.esito === e ? ' selected' : '') + '>' + esc(e) + '</option>').join('') + '</select></div>' +
      '<div class="campo"><label>Commesse</label><label style="text-transform:none;font-size:13px;margin-top:6px"><input type="checkbox" name="soloAperte"' + (F.soloAperte ? ' checked' : '') + '> solo non finite</label></div>' +
      '<div class="campo"><label>Verifiche</label><label style="text-transform:none;font-size:13px;margin-top:6px"><input type="checkbox" name="soloCompilate"' + (F.soloCompilate ? ' checked' : '') + '> solo confermate</label></div>' +
      '</div><p class="sotto">Parametri aziendali in uso: costo strutturale ' + E(S.costoOrario) + '/h · rischio ' + Pc(S.rischio) + ' · redditività ' + Pc(S.redditivita) + ' · rientro bancario ' + E(S.rientroOrario) + '/h · ricarico minimo ' + Pc(S.sogliaRicarico) + '.</p></div>' +
      UI.legenda() + '<div id="sost-tab"></div>';

    function aggiorna() {
      let r = tutte.slice();
      if (F.soloAperte) r = r.filter(x => !x.finito);
      if (F.soloCompilate) r = r.filter(x => x.compilata);
      if (F.esito) r = r.filter(x => x.esito === F.esito);
      r = UI.ricerca(r, F.testo, ['codice', 'cliente', 'cantiere', 'tecnico']);
      const conta = e => r.filter(x => x.esito === e).length;
      const somma = f => r.reduce((t, x) => t + Engine.num(x[f]), 0);
      const scost = somma('prezzoComputo') - somma('prezzoMinimo');
      document.getElementById('sost-kpi').innerHTML = '<div class="kpi-griglia">' +
        UI.kpi('Commesse nella selezione', r.length, { calc: false }) +
        UI.kpi('Congrue', conta('CONGRUA'), { colore: 'verde' }) +
        UI.kpi('Non congrue', conta('NON CONGRUA') + conta('NON CONGRUO'), { colore: 'rosso' }) +
        UI.kpi('Da completare', conta('DA COMPLETARE'), { colore: 'giallo' }) +
        UI.kpi('Prezzo dei computi', E(somma('prezzoComputo'))) +
        UI.kpi('Prezzo minimo dall\'analisi', E(somma('prezzoMinimo'))) +
        UI.kpi('Scostamento complessivo', E(scost), { colore: scost < 0 ? 'rosso' : 'verde' }) +
        '</div>';
      const t = document.getElementById('sost-tab');
      t.innerHTML = UI.tabella('sost', {
        colonne: Sostenibilita.colonne(), righe: r, chiave: 'id', ordine: { campo: 'codice', dir: 'asc' },
        classeRiga: x => (x.esito === 'NON CONGRUA' || x.esito === 'NON CONGRUO') ? 'riga-non-congrua' : '',
        vuoto: 'Nessuna commessa per i criteri selezionati.',
        onRiga: id => UI.vai('#/commessa/' + id + '/sostenibilita'),
        onAzione: (az, id) => { if (az === 'sost') Sostenibilita.apriForm(id, () => UI.render()); },
        totali: {
          codice: 'Totale', prezzoComputo: E(somma('prezzoComputo')), orePreviste: O(somma('orePreviste')),
          costiSpecifici: E(somma('costiSpecifici')), prezzoSpecifici: E(somma('prezzoSpecifici')),
          prezzoStrutturale: E(somma('prezzoStrutturale')), prezzoMinimo: E(somma('prezzoMinimo')),
          scostamento: E(scost)
        }
      });
      UI.legaTabelle(t);
    }
    const fil = document.getElementById('sost-filtri');
    const onCambio = UI.debounce(() => { fil.querySelectorAll('[name]').forEach(el => { F[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); aggiorna(); }, 150);
    fil.addEventListener('input', onCambio); fil.addEventListener('change', onCambio);
    const be = cont.querySelector('[data-esporta="sost"]');
    if (be) be.onclick = () => UI.esportaCsv('sostenibilita_commesse', UI.righeOrdinate('sost'), Sostenibilita.COLONNE_EXPORT);
    aggiorna();
  });
})();
