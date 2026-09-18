/* FIDA EDILE – Cronoprogramma della commessa: fasi di lavoro con date previste ed effettive, disegnate come diagramma di Gantt */
(function () {
  'use strict';
  const esc = UI.esc;
  const CAMPI = ['commessaId', 'fase', 'inizioPrevisto', 'inizioEffettivo', 'finePrevista', 'fineEffettiva', 'quantita', 'um', 'prezzoVendita'];
  const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const UM = ['a corpo', 'mq', 'mc', 'ml', 'kg', 't', 'n.', 'lt', 'h'];
  const ISO = /^\d{4}-\d{2}-\d{2}$/;

  // Giorno progressivo (UTC) di una data ISO: le differenze sono giorni esatti, senza effetti dell'ora legale.
  const giorno = iso => ISO.test(iso || '') ? Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5 : null;
  const daGiorno = n => new Date(n * 864e5);
  // durata in giorni di calendario, estremi compresi
  const durata = (a, b) => { const x = giorno(a), y = giorno(b); return x !== null && y !== null ? y - x + 1 : null; };
  const gg = v => v === null ? '—' : (v > 0 ? '+' : '') + v + ' gg';
  // valore di vendita del materiale della fase: quantità × prezzo unitario (null se manca uno dei due)
  const importo = f => Fmt.isNum(f.quantita) && Fmt.isNum(f.prezzoVendita) ? Math.round(f.quantita * f.prezzoVendita * 100) / 100 : null;

  // Stato della fase rispetto a oggi. cod: verde (conclusa nei tempi), rosso (in ritardo), giallo (avvio in ritardo), blu (in corso), neutro (da avviare)
  function stato(f, oggi) {
    const ip = giorno(f.inizioPrevisto), fp = giorno(f.finePrevista);
    if (f.fineEffettiva) {
      const rit = fp === null ? 0 : giorno(f.fineEffettiva) - fp;
      return rit > 0 ? { cod: 'rosso', testo: 'Conclusa in ritardo (+' + rit + ' gg)' } : { cod: 'verde', testo: rit < 0 ? 'Conclusa in anticipo (' + rit + ' gg)' : 'Conclusa nei tempi' };
    }
    if (f.inizioEffettivo) return fp !== null && oggi > fp ? { cod: 'rosso', testo: 'In corso, oltre la fine prevista (+' + (oggi - fp) + ' gg)' } : { cod: 'blu', testo: 'In corso' };
    if (fp !== null && oggi > fp) return { cod: 'rosso', testo: 'Non avviata, fine prevista superata' };
    if (ip !== null && oggi > ip) return { cod: 'giallo', testo: 'Da avviare, inizio previsto superato (+' + (oggi - ip) + ' gg)' };
    return { cod: 'neutro', testo: 'Da avviare' };
  }
  const BADGE = { verde: 'REGOLARE', rosso: 'CRITICO', giallo: 'ATTENZIONE', blu: 'stato', neutro: 'neutro' };
  const badgeStato = s => '<span class="badge ' + BADGE[s.cod] + '">' + esc(s.testo) + '</span>';

  function valida(f) {
    const errori = [], avvisi = [];
    if (!f.fase) errori.push('Indicare la fase di lavoro.');
    if (!f.inizioPrevisto) errori.push('Indicare l\'inizio previsto.');
    if (!f.finePrevista) errori.push('Indicare la fine prevista.');
    if (f.inizioPrevisto && f.finePrevista && f.finePrevista < f.inizioPrevisto) errori.push('La fine prevista è precedente all\'inizio previsto.');
    if (f.fineEffettiva && !f.inizioEffettivo) errori.push('Con la fine effettiva va indicato anche l\'inizio effettivo.');
    if (f.inizioEffettivo && f.fineEffettiva && f.fineEffettiva < f.inizioEffettivo) errori.push('La fine effettiva è precedente all\'inizio effettivo.');
    if (f.prezzoVendita !== null && f.prezzoVendita < 0) errori.push('Il prezzo di vendita non può essere negativo.');
    if (f.quantita !== null && f.quantita < 0) errori.push('La quantità non può essere negativa.');
    const oggi = Fmt.oggi();
    if (f.inizioEffettivo > oggi) avvisi.push('L\'inizio effettivo è una data futura.');
    if (f.fineEffettiva > oggi) avvisi.push('La fine effettiva è una data futura.');
    if ((f.prezzoVendita !== null || f.quantita !== null) && !f.um) avvisi.push('Sono indicati quantità o prezzo ma non l\'unità di misura.');
    if ((f.prezzoVendita === null) !== (f.quantita === null)) avvisi.push('Senza ' + (f.quantita === null ? 'la quantità' : 'il prezzo di vendita') + ' l\'importo del materiale non è calcolabile.');
    const c = Store.commessa(f.commessaId);
    if (c && c.dataInizioPrevista && f.inizioPrevisto && f.inizioPrevisto < c.dataInizioPrevista) avvisi.push('L\'inizio previsto della fase precede l\'inizio previsto della commessa (' + Fmt.data(c.dataInizioPrevista) + ').');
    if (c && c.dataFinePrevista && f.finePrevista > c.dataFinePrevista) avvisi.push('La fine prevista della fase supera la fine prevista della commessa (' + Fmt.data(c.dataFinePrevista) + ').');
    return { errori, avvisi };
  }

  // ------------------------------------------------------------ diagramma
  // La scala si adatta all'arco temporale: giorni (fino a 45), settimane (fino a 8 mesi), mesi oltre.
  function grafico(righe, oggi) {
    const date = [];
    righe.forEach(f => {
      ['inizioPrevisto', 'inizioEffettivo', 'finePrevista', 'fineEffettiva'].forEach(k => { const g = giorno(f[k]); if (g !== null) date.push(g); });
      if (f.inizioEffettivo && !f.fineEffettiva) date.push(oggi);
    });
    if (!date.length) return '';
    let da = Math.min.apply(null, date), a = Math.max.apply(null, date);
    const arco = a - da + 1;
    const scala = arco <= 45 ? 'giorni' : (arco <= 240 ? 'settimane' : 'mesi');
    if (scala === 'giorni') { da -= 1; a += 1; }
    else if (scala === 'settimane') { da -= (daGiorno(da).getUTCDay() + 6) % 7; a += 6 - (daGiorno(a).getUTCDay() + 6) % 7; }
    else { const d = daGiorno(da), e = daGiorno(a); da = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 864e5; a = Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 1) / 864e5 - 1; }
    const giorni = a - da + 1;
    const pxGiorno = scala === 'giorni' ? 28 : (scala === 'settimane' ? 7 : (giorni <= 900 ? 2.4 : 1.2));
    const larghezzaMin = Math.round(giorni * pxGiorno);
    const pos = g => ((g - da) / giorni * 100).toFixed(3) + '%';
    const lung = n => (n / giorni * 100).toFixed(3) + '%';

    // intestazione: mesi e, sotto, giorni o settimane; le stesse divisioni diventano linee di sfondo delle righe
    let mesi = '', tacche = '', sfondo = '';
    const d0 = daGiorno(da);
    for (let y = d0.getUTCFullYear(), m = d0.getUTCMonth(); ; m++) {
      const inizio = Date.UTC(y, m, 1) / 864e5;
      if (inizio > a) break;
      const fine = Date.UTC(y, m + 1, 1) / 864e5 - 1;
      const i = Math.max(da, inizio), n = Math.min(a, fine) - i + 1;
      const mm = daGiorno(inizio);
      const px = n * pxGiorno;
      mesi += '<div class="g-mese" style="left:' + pos(i) + ';width:' + lung(n) + '">' + (px >= 56 ? MESI[mm.getUTCMonth()] + ' ' + mm.getUTCFullYear() : (px >= 22 ? MESI[mm.getUTCMonth()] : '')) + '</div>';
      if (inizio > da) sfondo += '<div class="g-linea mese" style="left:' + pos(inizio) + '"></div>';
    }
    if (scala === 'giorni') {
      for (let g = da; g <= a; g++) {
        const dd = daGiorno(g), festivo = dd.getUTCDay() === 0 || dd.getUTCDay() === 6;
        tacche += '<div class="g-tacca' + (festivo ? ' festivo' : '') + '" style="left:' + pos(g) + ';width:' + lung(1) + '">' + dd.getUTCDate() + '</div>';
        if (festivo) sfondo += '<div class="g-festivo" style="left:' + pos(g) + ';width:' + lung(1) + '"></div>';
      }
    } else if (scala === 'settimane') {
      for (let g = da; g <= a; g += 7) {
        const dd = daGiorno(g);
        tacche += '<div class="g-tacca" style="left:' + pos(g) + ';width:' + lung(7) + '" title="Settimana dal ' + dd.getUTCDate() + ' ' + MESI[dd.getUTCMonth()] + '">' + String(dd.getUTCDate()).padStart(2, '0') + '/' + String(dd.getUTCMonth() + 1).padStart(2, '0') + '</div>';
        if (g > da) sfondo += '<div class="g-linea" style="left:' + pos(g) + '"></div>';
      }
    }
    if (oggi >= da && oggi <= a) sfondo += '<div class="g-oggi" style="left:' + pos(oggi + 0.5) + '" title="Oggi ' + Fmt.data(Fmt.oggi()) + '"></div>';

    const barra = (ini, fine, cls, titolo) => {
      if (ini === null || fine === null || fine < ini) return '';
      return '<div class="g-barra ' + cls + '" style="left:' + pos(ini) + ';width:' + lung(fine - ini + 1) + '" title="' + esc(titolo) + '"></div>';
    };
    const cliccabile = Store.puo('fase.modifica') ? ' cliccabile' : '';
    const righeHtml = righe.map(f => {
      const s = f.st;
      const ie = giorno(f.inizioEffettivo);
      const fe = f.fineEffettiva ? giorno(f.fineEffettiva) : (ie !== null ? Math.max(ie, oggi) : null);
      const titoloPrev = f.fase + '\nPrevisto: ' + Fmt.data(f.inizioPrevisto) + ' → ' + Fmt.data(f.finePrevista) + ' (' + (f.durataPrev || '—') + ' gg)';
      const titoloEff = f.fase + '\nEffettivo: ' + Fmt.data(f.inizioEffettivo) + ' → ' + (f.fineEffettiva ? Fmt.data(f.fineEffettiva) : 'in corso') + '\n' + s.testo;
      return '<div class="g-lab g-riga' + cliccabile + '" data-fase="' + esc(f.id) + '"><b title="' + esc(f.fase) + '"><span class="semaforo g-' + s.cod + '"></span>' + esc(f.fase) + '</b>' +
        '<div class="sotto">' + Fmt.data(f.inizioPrevisto) + ' → ' + Fmt.data(f.finePrevista) + (f.durataPrev ? ' · ' + f.durataPrev + ' gg' : '') + '</div></div>' +
        '<div class="g-area g-riga' + cliccabile + '" data-fase="' + esc(f.id) + '">' + sfondo +
        barra(giorno(f.inizioPrevisto), giorno(f.finePrevista), 'prev', titoloPrev) +
        barra(ie, fe, 'eff g-' + s.cod + (f.fineEffettiva ? '' : ' aperta'), titoloEff) + '</div>';
    }).join('');

    const altezzaTesta = scala === 'mesi' ? 22 : 42;
    return '<div class="gantt-wrap"><div class="gantt" style="grid-template-columns:260px minmax(' + larghezzaMin + 'px,1fr)">' +
      '<div class="g-lab g-testa" style="height:' + altezzaTesta + 'px">Fase di lavoro</div>' +
      '<div class="g-area g-testa" style="height:' + altezzaTesta + 'px">' + mesi + tacche + (oggi >= da && oggi <= a ? '<div class="g-oggi" style="left:' + pos(oggi + 0.5) + '"></div>' : '') + '</div>' +
      righeHtml + '</div></div>' +
      '<div class="legenda gantt-legenda"><span><i class="g-prev"></i>previsto</span><span><i class="g-verde"></i>effettivo, concluso nei tempi o in anticipo</span><span><i class="g-rosso"></i>effettivo, concluso in ritardo</span>' +
      '<span><i class="g-blu aperta"></i>effettivo, in corso (fino a oggi)</span><span><i class="g-rosso aperta"></i>effettivo, in corso oltre la fine prevista</span>' +
      '<span><span class="semaforo g-giallo"></span>da avviare, inizio previsto superato</span><span><i class="g-oggi-sw"></i>oggi</span><span class="muto">Scala: ' + scala + ' · clic su una fase per modificarla</span></div>';
  }

  const Gantt = {
    righe(commessaId) {
      const oggi = giorno(Fmt.oggi());
      return Store.db.fasi.filter(f => f.commessaId === commessaId)
        .sort((x, y) => String(x.inizioPrevisto).localeCompare(String(y.inizioPrevisto)) || String(x.finePrevista).localeCompare(String(y.finePrevista)) || String(x.fase).localeCompare(String(y.fase), 'it'))
        .map((f, i) => {
          const fp = giorno(f.finePrevista), fe = giorno(f.fineEffettiva);
          return Object.assign({}, f, {
            n: i + 1,
            durataPrev: durata(f.inizioPrevisto, f.finePrevista),
            durataEff: durata(f.inizioEffettivo, f.fineEffettiva),
            scostInizio: f.inizioEffettivo && f.inizioPrevisto ? giorno(f.inizioEffettivo) - giorno(f.inizioPrevisto) : null,
            scostFine: fe !== null && fp !== null ? fe - fp : null,
            importo: importo(f),
            st: stato(f, oggi)
          });
        });
    },

    // Contenuto della scheda Gantt dentro la scheda commessa
    scheda(corpo, c, testaHtml, ricarica) {
      const righe = Gantt.righe(c.id);
      const oggi = giorno(Fmt.oggi());
      const conta = cod => righe.filter(r => r.st.cod === cod).length;
      const min = k => righe.reduce((m, r) => r[k] && (!m || r[k] < m) ? r[k] : m, '');
      const max = k => righe.reduce((m, r) => r[k] > m ? r[k] : m, '');
      const concluse = righe.filter(r => r.fineEffettiva).length, inCorso = righe.filter(r => r.inizioEffettivo && !r.fineEffettiva).length;
      const tuttoConcluso = righe.length && concluse === righe.length;
      const totImporto = righe.reduce((t, r) => t + (r.importo || 0), 0);
      const senzaImporto = righe.filter(r => r.importo === null).length;
      const kpi = '<div class="kpi-griglia kpi-gantt">' +
        UI.kpi('Fasi', String(righe.length), { sub: concluse + ' concluse · ' + inCorso + ' in corso · ' + (righe.length - concluse - inCorso) + ' da avviare' }) +
        UI.kpi('In ritardo', String(conta('rosso')), { colore: conta('rosso') ? 'rosso' : 'verde', sub: conta('giallo') ? conta('giallo') + ' con avvio in ritardo' : '' }) +
        UI.kpi('Periodo previsto', righe.length ? Fmt.data(min('inizioPrevisto')) + ' → ' + Fmt.data(max('finePrevista')) : '—', { sub: righe.length ? durata(min('inizioPrevisto'), max('finePrevista')) + ' gg di calendario' : '' }) +
        UI.kpi('Periodo effettivo', min('inizioEffettivo') ? Fmt.data(min('inizioEffettivo')) + ' → ' + (tuttoConcluso ? Fmt.data(max('fineEffettiva')) : 'in corso') : '—',
          { sub: min('inizioEffettivo') ? (tuttoConcluso ? durata(min('inizioEffettivo'), max('fineEffettiva')) : oggi - giorno(min('inizioEffettivo')) + 1) + ' gg di calendario' : '' }) +
        UI.kpi('Materiale: valore di vendita', Fmt.euro(totImporto), { sub: senzaImporto ? senzaImporto + ' fasi senza quantità o prezzo' : 'quantità × prezzo di vendita' }) +
        '</div>';
      const puoMod = Store.puo('fase.modifica'), puoDel = Store.puo('fase.elimina');
      const colonne = [
        { campo: 'n', titolo: '#', tipo: 'n', classe: 'muto' },
        { campo: 'fase', titolo: 'Fase di lavoro', classe: 'desc in' },
        { campo: 'inizioPrevisto', titolo: 'Inizio previsto', fmt: v => Fmt.data(v), classe: 'nowrap in' },
        { campo: 'finePrevista', titolo: 'Fine prevista', fmt: v => Fmt.data(v), classe: 'nowrap in' },
        { campo: 'inizioEffettivo', titolo: 'Inizio effettivo', fmt: v => Fmt.data(v), classe: 'nowrap in' },
        { campo: 'fineEffettiva', titolo: 'Fine effettiva', fmt: v => Fmt.data(v), classe: 'nowrap in' },
        { campo: 'durataPrev', titolo: 'Durata prevista', tipo: 'n', classe: 'calc', fmt: v => v === null ? '—' : v + ' gg' },
        { campo: 'durataEff', titolo: 'Durata effettiva', tipo: 'n', classe: 'calc', fmt: v => v === null ? '—' : v + ' gg' },
        { campo: 'scostFine', titolo: 'Scostamento fine', tipo: 'n', classe: 'calc', fmt: v => v > 0 ? '<span style="color:var(--rosso)">' + gg(v) + '</span>' : gg(v) },
        { campo: 'quantita', titolo: 'Quantità', tipo: 'n', classe: 'in', fmt: v => Fmt.numero(v) },
        { campo: 'um', titolo: 'U.M.', classe: 'in', fmt: v => v ? esc(v) : '<span class="muto">—</span>' },
        { campo: 'prezzoVendita', titolo: 'Prezzo vendita unitario', tipo: 'n', classe: 'in', fmt: (v, r) => Fmt.euro(v) + (Fmt.isNum(v) && r.um ? ' <span class="muto">/ ' + esc(r.um) + '</span>' : '') },
        { campo: 'importo', titolo: 'Importo materiale', tipo: 'n', classe: 'calc', fmt: v => Fmt.euro(v) },
        { campo: 'stato', titolo: 'Stato', valOrd: r => r.st.testo, fmt: (v, r) => badgeStato(r.st) },
        { campo: 'azioni', titolo: '', ord: false, classe: 'azioni-riga', fmt: (v, r) => (puoMod ? '<button type="button" data-azione="modifica" data-id="' + esc(r.id) + '">Modifica</button>' : '') + (puoDel ? '<button type="button" class="pericolo" data-azione="elimina" data-id="' + esc(r.id) + '">Elimina</button>' : '') }
      ];
      corpo.innerHTML = (testaHtml || '') + kpi +
        '<div class="pannello"><h2>Diagramma di Gantt</h2>' + (righe.length ? grafico(righe, oggi) : '<div class="vuoto">Nessuna fase di lavoro inserita' + (Store.puo('fase.crea') ? ': usare «+ Nuova fase».' : '.') + '</div>') + '</div>' +
        '<h2>Fasi di lavoro</h2>' + UI.legenda() +
        UI.tabella('cfasi', { colonne, righe, chiave: 'id', vuoto: 'Nessuna fase di lavoro per questa commessa.', totali: { fase: 'Totale', importo: '<b>' + Fmt.euro(totImporto) + '</b>' }, onAzione: (az, id) => az === 'modifica' ? Gantt.apriForm(c.id, id, ricarica) : Gantt.elimina(id, ricarica) });
      UI.legaTabelle(corpo);
      if (puoMod) corpo.querySelectorAll('.g-riga[data-fase]').forEach(el => el.onclick = () => Gantt.apriForm(c.id, el.dataset.fase, ricarica));
      // con un diagramma più largo dello schermo si parte mostrando la data di oggi
      const wrap = corpo.querySelector('.gantt-wrap'), linea = corpo.querySelector('.g-area.g-testa .g-oggi');
      if (wrap && linea && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = Math.max(0, linea.offsetLeft + 260 - wrap.clientWidth / 3);
    },

    apriForm(commessaId, id, onSalvato) {
      const esistente = id ? Store.db.fasi.find(x => x.id === id) : null;
      if (!Store.puo(esistente ? 'fase.modifica' : 'fase.crea')) return UI.permessoNegato();
      const c = Store.commessa(commessaId);
      const f = esistente ? JSON.parse(JSON.stringify(esistente)) : Object.assign(Schema.nuovaFase(), { commessaId });
      const corpo = '<form id="form-fase" onsubmit="return false">' +
        '<fieldset><legend>Fase</legend><div class="form-griglia">' +
        UI.campo({ nome: 'fase', etichetta: 'Fase di lavoro', req: true, classe: 'largo', lista: 'dl-fasi', placeholder: 'es. Demolizioni, Impianto elettrico, Tinteggiature…' }, f.fase) +
        '</div></fieldset>' +
        '<fieldset><legend>Date</legend><div class="form-griglia">' +
        UI.campo({ nome: 'inizioPrevisto', etichetta: 'Inizio previsto', tipo: 'date', req: true, pulisci: true }, f.inizioPrevisto) +
        UI.campo({ nome: 'finePrevista', etichetta: 'Fine prevista', tipo: 'date', req: true, pulisci: true }, f.finePrevista) +
        UI.campo({ nome: 'inizioEffettivo', etichetta: 'Inizio effettivo', tipo: 'date', pulisci: true, aiuto: 'Vuoto se la fase non è ancora partita (✕ per cancellare).' }, f.inizioEffettivo) +
        UI.campo({ nome: 'fineEffettiva', etichetta: 'Fine effettiva', tipo: 'date', pulisci: true, aiuto: 'Vuota se la fase è ancora in corso (✕ per cancellare).' }, f.fineEffettiva) +
        '</div></fieldset>' +
        '<fieldset><legend>Materiale usato nella fase</legend><div class="form-griglia">' +
        UI.campo({ nome: 'quantita', etichetta: 'Quantità', tipo: 'number', step: 'any' }, f.quantita) +
        UI.campo({ nome: 'um', etichetta: 'Unità di misura', lista: 'dl-um', placeholder: 'mq, mc, ml, kg, a corpo…' }, f.um) +
        UI.campo({ nome: 'prezzoVendita', etichetta: 'Prezzo di vendita (€ per unità di misura)', tipo: 'euro' }, f.prezzoVendita) +
        UI.campo({ nome: 'importoCalc', etichetta: 'Importo materiale (quantità × prezzo)', tipo: 'sola', html: Fmt.euro(importo(f)) }) +
        '</div></fieldset>' +
        UI.datalist('dl-fasi', Store.db.fasi.map(x => x.fase)) + UI.datalist('dl-um', UM.concat(Store.db.fasi.map(x => x.um))) + '</form>';
      UI.modale({
        titolo: (esistente ? 'Modifica fase' : 'Nuova fase') + (c ? ' · ' + c.codice : ''), corpo,
        pulsanti: [{
          testo: 'Salva', classe: 'primario', async azione(mm) {
            const nuovo = Object.assign({}, f, UI.leggiForm(mm.el.querySelector('#form-fase')), { commessaId });
            await UI.salvaConControlli(mm, {
              valida: () => valida(nuovo),
              salva: async () => {
                await Store.salva(db => {
                  // il riferimento "codice | fase" fa comparire la voce nella storia modifiche della commessa
                  const rif = (c ? c.codice : '?') + ' | ' + nuovo.fase;
                  if (esistente) {
                    const cur = db.fasi.find(x => x.id === esistente.id);
                    if (!cur) throw new Error('La fase non esiste più: forse è stata eliminata da un altro utente.');
                    const mod = Store.diff(cur, nuovo, CAMPI);
                    CAMPI.forEach(k => { cur[k] = nuovo[k]; });
                    if (mod.length) Store.log(db, 'fase', cur.id, rif, 'MODIFICA FASE', mod);
                  } else {
                    nuovo.creatoIl = new Date().toISOString(); nuovo.creatoDa = Store.utente.nome;
                    db.fasi.push(nuovo);
                    Store.log(db, 'fase', nuovo.id, rif, 'NUOVA FASE', Store.diff(null, nuovo, CAMPI));
                  }
                });
                UI.toast('Fase salvata.');
                if (onSalvato) onSalvato();
              }
            });
          }
        }],
        onMount(mm) {
          // importo ricalcolato mentre si digitano quantità e prezzo
          const form = mm.el.querySelector('#form-fase'), out = mm.el.querySelector('#f-importoCalc');
          form.addEventListener('input', () => { out.innerHTML = Fmt.euro(importo(UI.leggiForm(form))); });
        }
      });
    },

    async elimina(id, onSalvato) {
      if (!Store.puo('fase.elimina')) return UI.permessoNegato();
      const f = Store.db.fasi.find(x => x.id === id); if (!f) return;
      const c = Store.commessa(f.commessaId);
      const ok = await UI.conferma({ titolo: 'Elimina fase', pericolo: true, testoConferma: 'Elimina fase', html: 'La fase <b>' + esc(f.fase) + '</b> verrà eliminata dal cronoprogramma della commessa. L\'operazione resta tracciata nel registro.' });
      if (!ok) return;
      await Store.salva(db => {
        db.fasi = db.fasi.filter(x => x.id !== id);
        Store.log(db, 'fase', id, (c ? c.codice : '?') + ' | ' + f.fase, 'ELIMINAZIONE FASE', Store.diff(f, {}, CAMPI));
      });
      UI.toast('Fase eliminata.');
      if (onSalvato) onSalvato();
    }
  };
  window.Gantt = Gantt;
})();
