/*
 * FIDA EDILE – Nucleo dell'interfaccia: layout, navigazione, finestre, maschere, tabelle.
 */
(function (root) {
  'use strict';
  const esc = Fmt.esc;
  const pagine = {};
  const ordinamenti = {};
  const tabelle = {};

  const MENU = [
    { gruppo: 'Direzione' },
    { id: 'dashboard', testo: 'Dashboard', icona: '▦' },
    { id: 'cantieri', testo: 'Controllo cantieri', icona: '◎' },
    { gruppo: 'Offerte' },
    { id: 'preventivi', testo: 'Preventivi', icona: '✎' },
    { gruppo: 'Gestione' },
    { id: 'commesse', testo: 'Anagrafica commesse', icona: '☰' },
    { id: 'importa', testo: 'Importa da Excel', icona: '⤓' },
    { id: 'movimenti', testo: 'Movimenti', icona: '⇄' },
    { id: 'costi', testo: 'Costi diretti', icona: '€' },
    { id: 'budget', testo: 'Budget commessa', icona: '◫' },
    { id: 'sostenibilita', testo: 'Sostenibilità economica', icona: '⚖' },
    { id: 'saldi', testo: 'Saldi iniziali', icona: '⏮' },
    { gruppo: 'Sistema' },
    { id: 'analisi', testo: 'Dashboard di analisi', icona: '◪' },
    { id: 'parametri', testo: 'Parametri di controllo', icona: '⚙' },
    { id: 'registro', testo: 'Registro modifiche', icona: '≡' }
  ];

  const UI = {
    esc,
    registra(nome, fn) { pagine[nome] = fn; },
    vai(hash) { location.hash = hash; },
    rotta() {
      const h = (location.hash || '').replace(/^#\/?/, '');
      const parti = h.split('/').map(decodeURIComponent);
      let pagina = parti[0] || Store.paginaIniziale();
      // le pagine della sezione Direzione non sono raggiungibili (nemmeno via indirizzo) se non si è collegati come Direzione
      if (!pagine[pagina] || !Store.vedePagina(pagina)) {
        pagina = Store.paginaIniziale();
        if (parti[0]) history.replaceState(null, '', '#/' + pagina); // allinea l'indirizzo alla pagina mostrata
      }
      return { pagina, params: parti.slice(1) };
    },

    // ------------------------------------------------------------ layout
    render() {
      const app = document.getElementById('app');
      const r = UI.rotta();
      const attivo = r.pagina;
      // La scheda commessa è una pagina a sé: nel menu compare come sotto-voce dell'anagrafica, con ritorno alla pagina di provenienza.
      const schedaCommessa = r.pagina === 'commessa' ? Store.commessa(r.params[0]) : null;
      const schedaPreventivo = r.pagina === 'preventivo' ? Store.preventivo(r.params[0]) : null;
      if (r.pagina !== 'commessa' && r.pagina !== 'preventivo') UI._provenienza = { id: r.pagina, hash: '#/' + r.pagina };
      // Il menu mostra solo le pagine consentite al ruolo; l'intestazione di un gruppo resta
      // soltanto se almeno una delle sue voci è visibile.
      const voci = MENU.filter(m => m.gruppo || Store.vedePagina(m.id));
      const nav = voci.filter((m, i) => !m.gruppo || (voci[i + 1] && !voci[i + 1].gruppo)).map(m => m.gruppo ? '<div class="titolo-gruppo">' + esc(m.gruppo) + '</div>' :
        '<a href="#/' + m.id + '" class="' + (attivo === m.id ? 'attivo' : '') + '"><span>' + m.icona + '</span>' + esc(m.testo) + '</a>' +
        (m.id === 'commesse' && schedaCommessa ? '<a href="#/commessa/' + esc(schedaCommessa.id) + '" class="sotto-voce attivo" title="' + esc(Engine.etichetta(schedaCommessa)) + '"><span>↳</span>Scheda ' + esc(schedaCommessa.codice) + '</a>' : '') +
        (m.id === 'preventivi' && schedaPreventivo ? '<a href="#/preventivo/' + esc(schedaPreventivo.id) + '" class="sotto-voce attivo" title="' + esc(schedaPreventivo.cliente || '') + '"><span>↳</span>' + esc(schedaPreventivo.numero) + '</a>' : '')).join('');
      app.innerHTML =
        '<aside class="laterale">' +
        '<div class="marchio"><b>FIDA EDILE</b><span>Gestione Cantieri · Rev.14</span></div>' +
        '<nav class="nav">' + nav + '</nav>' +
        '<div class="utente-box"><label for="sel-utente">Utente</label><select id="sel-utente">' +
        Store.db.utenti.filter(u => u.attivo !== false).map(u => '<option value="' + esc(u.id) + '"' + (u.id === Store.utente.id ? ' selected' : '') + '>' + esc(u.nome) + ' (' + esc(u.ruolo) + ')</option>').join('') + '</select>' +
        '<div style="margin-top:6px">Esercizio <b>' + esc(Store.db.parametri.annoGestione) + '</b></div>' +
        '<span class="pill ' + Store.modo + '">' + (Store.modo === 'server' ? 'dati su server locale' : 'dati in questo browser') + '</span></div>' +
        '</aside><main class="contenuto" id="contenuto"></main>';
      document.getElementById('sel-utente').onchange = e => UI.cambiaUtente(e.target.value);
      const cont = document.getElementById('contenuto');
      const fn = pagine[r.pagina];
      try { fn(cont, r.params); }
      catch (e) { console.error(e); cont.innerHTML = '<div class="msg errore">Errore nella pagina: ' + esc(e.message) + '</div>'; }
      window.scrollTo(0, 0);
    },

    // Cambio utente dalla tendina: Direzione chiede la password, gli altri entrano subito.
    cambiaUtente(id) {
      if (id === Store.utente.id) return;
      if (!Store.richiedePassword(id)) {
        const err = Store.login(id);
        if (err) UI.toast(err, 'errore');
        UI.vai('#/' + Store.paginaIniziale()); UI.render(); return;
      }
      const sel = document.getElementById('sel-utente');
      const m = UI.modale({
        titolo: 'Accesso Direzione', stretta: true,
        corpo: '<form id="form-login" onsubmit="return false"><p>Per collegarsi come <b>Direzione</b> è richiesta la password.</p>' +
          UI.campo({ nome: 'password', etichetta: 'Password', tipo: 'password', req: true }, '') + '</form>',
        pulsanti: [{
          testo: 'Accedi', classe: 'primario', azione(mm) {
            const err = Store.login(id, mm.el.querySelector('#f-password').value);
            if (err) { mm.msg('<div class="msg errore">' + esc(err) + '</div>'); mm.el.querySelector('#f-password').select(); return; }
            mm._ok = true; mm.chiudi();
            UI.vai('#/' + Store.paginaIniziale()); UI.render();
          }
        }],
        onChiudi() { if (!m._ok && sel) sel.value = Store.utente.id; }
      });
      m.el.querySelector('#form-login').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); m.pulsante(0).click(); } };
    },

    testata(titolo, sottotitolo, azioniHtml, sopra) {
      return '<div class="testata"><div>' + (sopra ? '<div class="kicker">' + esc(sopra) + '</div>' : '') + '<h1>' + esc(titolo) + '</h1>' + (sottotitolo ? '<div class="sotto">' + sottotitolo + '</div>' : '') + '</div>' +
        '<div class="azioni">' + (azioniHtml || '') + '</div></div>';
    },
    // Barra "torna indietro" per le pagine di dettaglio: riporta alla pagina da cui si è arrivati (o all'anagrafica).
    barraRitorno(briciolaHtml) {
      const p = UI._provenienza && MENU.find(m => m.id === UI._provenienza.id) ? UI._provenienza : { id: 'commesse', hash: '#/commesse' };
      const voce = MENU.find(m => m.id === p.id);
      return '<div class="ritorno"><a href="' + esc(p.hash) + '" class="btn-ritorno">← Torna a ' + esc(voce.testo) + '</a>' +
        '<span class="briciole">' + esc(voce.testo) + '<i>›</i>' + (briciolaHtml || '') + '</span></div>';
    },
    legenda() {
      return '<div class="legenda"><span><i class="in"></i>dato inserito dall\'utente</span><span><i class="calc"></i>dato calcolato dal sistema</span>' +
        '<span><span class="semaforo REGOLARE"></span>regolare</span><span><span class="semaforo ATTENZIONE"></span>attenzione</span><span><span class="semaforo CRITICO"></span>critico</span></div>';
    },

    // ------------------------------------------------------------ messaggi
    toast(msg, tipo) {
      const t = document.createElement('div');
      t.className = 'toast ' + (tipo || '');
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), tipo === 'errore' ? 6000 : 3200);
    },
    messaggi(errori, avvisi, extra) {
      let h = '';
      if (errori && errori.length) h += '<div class="msg errore"><b>Impossibile salvare:</b><ul>' + errori.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul></div>';
      if (avvisi && avvisi.length) h += '<div class="msg avviso"><b>Verificare:</b><ul>' + avvisi.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>' + (extra || '') + '</div>';
      return h;
    },

    // ------------------------------------------------------------ finestre modali
    modale(opt) {
      const sfondo = document.createElement('div');
      sfondo.className = 'modale-sfondo';
      const pulsanti = (opt.pulsanti || []).map((p, i) => '<button type="button" class="' + (p.classe || '') + '" data-i="' + i + '">' + esc(p.testo) + '</button>').join('');
      sfondo.innerHTML = '<div class="modale ' + (opt.stretta ? 'stretta' : (opt.larga ? 'larga' : '')) + '"><header><h2>' + esc(opt.titolo || '') + '</h2><button type="button" class="piccolo" data-chiudi>✕</button></header>' +
        '<div class="corpo"><div class="modale-msg"></div>' + (opt.corpo || '') + '</div>' +
        '<footer>' + (opt.piede || '') + '<button type="button" data-chiudi>' + esc(opt.testoChiudi || 'Annulla') + '</button>' + pulsanti + '</footer></div>';
      document.body.appendChild(sfondo);
      const m = {
        el: sfondo.querySelector('.modale'),
        chiudi() { sfondo.remove(); document.removeEventListener('keydown', onKey); if (opt.onChiudi) opt.onChiudi(); },
        msg(html) { sfondo.querySelector('.modale-msg').innerHTML = html || ''; if (html) sfondo.querySelector('.corpo').scrollTop = 0; },
        pulsante(i) { return sfondo.querySelector('footer button[data-i="' + i + '"]'); }
      };
      const onKey = e => { if (e.key === 'Escape') m.chiudi(); };
      document.addEventListener('keydown', onKey);
      sfondo.querySelectorAll('[data-chiudi]').forEach(b => b.onclick = () => m.chiudi());
      sfondo.querySelectorAll('footer button[data-i]').forEach(b => b.onclick = async () => {
        const p = opt.pulsanti[+b.dataset.i];
        b.disabled = true;
        try { await p.azione(m); } catch (e) { console.error(e); m.msg('<div class="msg errore">' + esc(e.message || e) + '</div>'); }
        finally { b.disabled = false; }
      });
      if (opt.onMount) opt.onMount(m);
      const primo = sfondo.querySelector('.corpo input:not([readonly]), .corpo select, .corpo textarea');
      if (primo) setTimeout(() => primo.focus(), 30);
      return m;
    },
    conferma(opt) {
      return new Promise(resolve => {
        const m = UI.modale({
          titolo: opt.titolo || 'Conferma', stretta: true,
          corpo: '<p>' + (opt.html || esc(opt.testo || '')) + '</p>' +
            (opt.richiediTesto ? '<div class="campo"><label>Per confermare digita: <b>' + esc(opt.richiediTesto) + '</b></label><input type="text" class="in" id="conf-testo" autocomplete="off"></div>' : '') +
            (opt.motivo ? '<div class="campo"><label>' + esc(opt.motivo) + '</label><input type="text" class="in" id="conf-motivo" autocomplete="off"></div>' : ''),
          pulsanti: [{
            testo: opt.testoConferma || 'Conferma', classe: opt.pericolo ? 'pericolo' : 'primario', azione(mm) {
              if (opt.richiediTesto) {
                const v = mm.el.querySelector('#conf-testo').value.trim();
                if (v !== opt.richiediTesto) { mm.msg('<div class="msg errore">Il testo digitato non corrisponde.</div>'); return; }
              }
              let motivo = '';
              if (opt.motivo) {
                motivo = mm.el.querySelector('#conf-motivo').value.trim();
                if (opt.motivoObbligatorio && !motivo) { mm.msg('<div class="msg errore">Indicare il motivo.</div>'); return; }
              }
              resolve(opt.motivo ? { ok: true, motivo } : true); mm.chiudi();
            }
          }],
          onChiudi() { resolve(false); }
        });
        void m;
      });
    },

    // Flusso di salvataggio con controlli: errori bloccano; avvisi richiedono una seconda conferma.
    async salvaConControlli(m, opt) {
      const v = opt.valida();
      if (v.errori.length) { m.msg(UI.messaggi(v.errori, v.avvisi)); m._confermato = false; return; }
      if (v.avvisi.length && !m._confermato) {
        m.msg(UI.messaggi([], v.avvisi, '<p style="margin:6px 0 0"><b>Premi di nuovo "' + esc(opt.testoConferma || 'Salva') + '" per confermare e salvare comunque.</b></p>'));
        m._confermato = true; return;
      }
      await opt.salva();
      m.chiudi();
    },

    // ------------------------------------------------------------ maschere
    // spec: { nome, etichetta, tipo, opzioni, req, calc, aiuto, lista, classe, disabled, step, placeholder, sola }
    campo(s, v) {
      const val = (v === null || v === undefined) ? '' : v;
      const cls = 'campo ' + (s.classe || '');
      let inner = '';
      const attr = ' name="' + esc(s.nome) + '" id="f-' + esc(s.nome) + '"' + (s.disabled ? ' disabled' : '') + (s.placeholder ? ' placeholder="' + esc(s.placeholder) + '"' : '') + ' data-tipo="' + esc(s.tipo || 'text') + '"';
      const inCls = s.calc ? 'calc' : 'in';
      switch (s.tipo) {
        case 'select':
          inner = '<select class="' + inCls + '"' + attr + '>' + (s.vuoto !== false ? '<option value="">' + esc(s.vuotoTesto || '—') + '</option>' : '') +
            (s.opzioni || []).map(o => { const ov = typeof o === 'object' ? o.v : o, ot = typeof o === 'object' ? o.t : o; return '<option value="' + esc(ov) + '"' + (String(ov) === String(val) ? ' selected' : '') + '>' + esc(ot) + '</option>'; }).join('') + '</select>';
          break;
        case 'textarea':
          inner = '<textarea class="' + inCls + '"' + attr + '>' + esc(val) + '</textarea>'; break;
        case 'checkbox':
          inner = '<label style="text-transform:none;font-size:13px"><input type="checkbox"' + attr + (val ? ' checked' : '') + '> ' + esc(s.testoCheck || '') + '</label>'; break;
        case 'date':
          inner = '<input type="date" class="' + inCls + '"' + attr + ' value="' + esc(val) + '">';
          // pulisci: pulsante per svuotare una data inserita per errore (il campo data del browser non ha un modo evidente per farlo)
          if (s.pulisci && !s.disabled) inner = '<div class="campo-data">' + inner + '<button type="button" class="piccolo" title="Cancella la data" onclick="var i=this.previousElementSibling;i.value=\'\';i.dispatchEvent(new Event(\'change\',{bubbles:true}))">✕</button></div>';
          break;
        case 'euro': case 'ore': case 'number':
          inner = '<input type="number" step="' + (s.step || '0.01') + '" class="' + inCls + '"' + attr + ' value="' + esc(val) + '">'; break;
        case 'pct':
          inner = '<input type="number" step="0.1" class="' + inCls + '"' + attr + ' value="' + (val === '' ? '' : esc(Math.round(val * 10000) / 100)) + '">'; break;
        case 'password':
          inner = '<input type="password" class="' + inCls + '"' + attr + ' value="' + esc(val) + '" autocomplete="new-password">'; break;
        case 'sola':
          inner = '<span class="valore-calc" id="f-' + esc(s.nome) + '">' + (s.html || esc(val)) + '</span>'; break;
        default:
          inner = '<input type="text" class="' + inCls + '"' + attr + ' value="' + esc(val) + '"' + (s.lista ? ' list="' + esc(s.lista) + '" autocomplete="off"' : '') + '>';
      }
      return '<div class="' + cls + '"><label class="' + (s.req ? 'req' : '') + '" for="f-' + esc(s.nome) + '">' + esc(s.etichetta) + '</label>' + inner + (s.aiuto ? '<div class="aiuto">' + esc(s.aiuto) + '</div>' : '') + '</div>';
    },
    leggiForm(form) {
      const out = {};
      form.querySelectorAll('[name]').forEach(el => {
        const t = el.dataset.tipo || el.type;
        if (t === 'checkbox') out[el.name] = !!el.checked;
        else if (t === 'euro' || t === 'ore' || t === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
        else if (t === 'pct') out[el.name] = el.value === '' ? null : Number(el.value) / 100;
        else out[el.name] = String(el.value).trim();
      });
      return out;
    },
    datalist(id, valori) {
      const v = Array.from(new Set((valori || []).filter(x => x))).sort((a, b) => String(a).localeCompare(String(b), 'it'));
      return '<datalist id="' + esc(id) + '">' + v.map(x => '<option value="' + esc(x) + '">').join('') + '</datalist>';
    },

    // ------------------------------------------------------------ righe modificabili (voci di costo, pesi)
    // Tabella con una riga per oggetto: gli input scrivono direttamente negli oggetti e le colonne
    // calcolate si riaggiornano senza ridisegnare i campi (così non si perde il cursore mentre si digita).
    // colonne: [{ nome, titolo, tipo: 'text'|'number'|'euro'|'pct'|'select'|'calc', opzioni, step, lista, calc(r), classe, placeholder }]
    // opt: { colonne, righe, nuova(), min, testoAggiungi, totali(righe) -> { nome: html }, onCambio(righe) }
    righeEditabili(container, opt) {
      const righe = (opt.righe || []).map(r => Object.assign({}, r));
      const num = c => ['number', 'euro', 'pct', 'calc'].indexOf(c.tipo) >= 0;
      function cella(c, r, i) {
        const attr = ' data-i="' + i + '" data-n="' + esc(c.nome) + '"' + (c.placeholder ? ' placeholder="' + esc(c.placeholder) + '"' : '');
        const v = r[c.nome];
        const val = (v === null || v === undefined) ? '' : v;
        switch (c.tipo) {
          case 'calc': return '<span class="valore-calc" data-calc="' + esc(c.nome) + '" data-i="' + i + '">' + (c.calc ? c.calc(r) : esc(val)) + '</span>';
          case 'select': return '<select class="in"' + attr + '>' + (c.vuoto === false ? '' : '<option value="">—</option>') +
            (c.opzioni || []).map(o => { const ov = typeof o === 'object' ? o.v : o, ot = typeof o === 'object' ? o.t : o; return '<option value="' + esc(ov) + '"' + (String(ov) === String(val) ? ' selected' : '') + '>' + esc(ot) + '</option>'; }).join('') + '</select>';
          case 'pct': {
            // "decimali" = cifre decimali di percentuale da conservare nel campo (2 se non indicato):
            // servono a non arrotondare in silenzio un valore che l'utente non ha toccato.
            const d = c.decimali === undefined ? 2 : c.decimali;
            const k = Math.pow(10, d);
            return '<input type="number" step="' + (c.step || '0.5') + '" class="in"' + attr + ' value="' + (val === '' ? '' : esc(Math.round(val * 100 * k) / k)) + '">';
          }
          case 'number': case 'euro': return '<input type="number" step="' + (c.step || '0.01') + '" class="in"' + attr + ' value="' + esc(val) + '">';
          default: return '<input type="text" class="in"' + attr + ' value="' + esc(val) + '"' + (c.lista ? ' list="' + esc(c.lista) + '" autocomplete="off"' : '') + '>';
        }
      }
      function corpo() {
        if (!righe.length) return '<tr><td colspan="' + (opt.colonne.length + 2) + '" class="vuoto">' + esc(opt.vuoto || 'Nessuna riga: usare il pulsante qui sotto.') + '</td></tr>';
        return righe.map((r, i) => '<tr><td class="n muto">' + (i + 1) + '</td>' +
          opt.colonne.map(c => '<td class="' + (num(c) ? 'n ' : '') + (c.classe || '') + '">' + cella(c, r, i) + '</td>').join('') +
          '<td class="azioni-riga">' + (righe.length > (opt.min || 0) ? '<button type="button" class="pericolo piccolo" data-togli="' + i + '" title="Elimina la riga">✕</button>' : '') + '</td></tr>').join('');
      }
      function piede() {
        if (!opt.totali || !righe.length) return '';
        const t = opt.totali(righe) || {};
        return '<tr class="totale"><td></td>' + opt.colonne.map(c => '<td class="' + (num(c) ? 'n' : '') + '">' + (t[c.nome] !== undefined ? t[c.nome] : '') + '</td>').join('') + '<td></td></tr>';
      }
      function disegna() {
        container.innerHTML = '<div class="tabella-wrap righe-edit"><table class="tab"><thead><tr><th class="n">#</th>' +
          opt.colonne.map(c => '<th class="' + (num(c) ? 'n' : '') + '" style="' + (c.larghezza ? 'min-width:' + c.larghezza : '') + '">' + esc(c.titolo) + '</th>').join('') +
          '<th></th></tr></thead><tbody>' + corpo() + piede() + '</tbody></table></div>' +
          '<div class="righe-edit-azioni"><button type="button" data-aggiungi>' + esc(opt.testoAggiungi || '+ Aggiungi riga') + '</button>' +
          (opt.aiuto ? '<span class="aiuto">' + esc(opt.aiuto) + '</span>' : '') + '</div>';
        lega();
      }
      function ricalcola() {
        container.querySelectorAll('[data-calc]').forEach(el => {
          const c = opt.colonne.find(x => x.nome === el.dataset.calc);
          if (c && c.calc) el.innerHTML = c.calc(righe[+el.dataset.i]);
        });
        const tf = container.querySelector('tr.totale');
        if (tf && opt.totali) {
          const t = opt.totali(righe) || {};
          const celle = tf.querySelectorAll('td');
          opt.colonne.forEach((c, i) => { celle[i + 1].innerHTML = t[c.nome] !== undefined ? t[c.nome] : ''; });
        }
        if (opt.onCambio) opt.onCambio(righe);
      }
      function lega() {
        container.querySelectorAll('[data-n]').forEach(el => {
          const aggiorna = () => {
            const c = opt.colonne.find(x => x.nome === el.dataset.n);
            const r = righe[+el.dataset.i];
            if (!c || !r) return;
            if (c.tipo === 'number' || c.tipo === 'euro') r[c.nome] = el.value === '' ? null : Number(el.value);
            else if (c.tipo === 'pct') r[c.nome] = el.value === '' ? null : Number(el.value) / 100;
            else r[c.nome] = String(el.value).trim();
            ricalcola();
          };
          el.oninput = aggiorna; el.onchange = aggiorna;
        });
        container.querySelectorAll('[data-togli]').forEach(b => b.onclick = () => { righe.splice(+b.dataset.togli, 1); disegna(); if (opt.onCambio) opt.onCambio(righe); });
        const agg = container.querySelector('[data-aggiungi]');
        if (agg) agg.onclick = () => {
          righe.push(opt.nuova ? opt.nuova() : {});
          disegna();
          // il cursore va subito sul primo campo della riga appena aggiunta
          const righeDom = container.querySelectorAll('tbody tr:not(.totale)');
          const primo = righeDom.length && righeDom[righeDom.length - 1].querySelector('input, select');
          if (primo) primo.focus();
          if (opt.onCambio) opt.onCambio(righe);
        };
      }
      disegna();
      return {
        get righe() { return righe; },
        aggiorna: ricalcola, ridisegna: disegna,
        // sostituisce tutte le righe (usato dal ripristino dei valori del modello)
        imposta(nuove) { righe.length = 0; (nuove || []).forEach(r => righe.push(Object.assign({}, r))); disegna(); if (opt.onCambio) opt.onCambio(righe); }
      };
    },

    // ------------------------------------------------------------ tabelle ordinabili
    // colonne: [{ campo, titolo, tipo: 'n'|'t'|'d', fmt(v,r), classe, ord:false, html:true }]
    tabella(id, opt) {
      tabelle[id] = opt;
      return '<div class="tabella-wrap" id="tab-' + esc(id) + '">' + UI._tabellaHtml(id) + '</div>';
    },
    aggiornaTabella(id, opt) {
      if (opt) tabelle[id] = opt;
      const el = document.getElementById('tab-' + id);
      if (el) { el.innerHTML = UI._tabellaHtml(id); UI._legaTabella(id); }
    },
    _tabellaHtml(id) {
      const opt = tabelle[id];
      const ord = ordinamenti[id] || opt.ordine || null;
      let righe = opt.righe.slice();
      if (ord) {
        const col = opt.colonne.find(c => c.campo === ord.campo);
        const get = r => (col && col.valOrd) ? col.valOrd(r) : r[ord.campo];
        righe.sort((a, b) => {
          const x = get(a), y = get(b);
          const nx = (x === null || x === undefined || x === ''), ny = (y === null || y === undefined || y === '');
          if (nx && ny) return 0; if (nx) return 1; if (ny) return -1;
          let c = (typeof x === 'number' && typeof y === 'number') ? x - y : String(x).localeCompare(String(y), 'it', { numeric: true });
          return ord.dir === 'desc' ? -c : c;
        });
      }
      const th = opt.colonne.map(c => '<th class="' + (c.tipo === 'n' ? 'n ' : '') + (c.ord === false ? '' : 'ord ') + (ord && ord.campo === c.campo ? ord.dir : '') + '" data-campo="' + esc(c.campo) + '">' + esc(c.titolo) + '</th>').join('');
      const tr = righe.map((r, i) => {
        const td = opt.colonne.map(c => {
          const v = r[c.campo];
          const s = c.fmt ? c.fmt(v, r) : (v === null || v === undefined ? '' : esc(v));
          return '<td class="' + (c.tipo === 'n' ? 'n ' : '') + (c.classe || '') + '">' + s + '</td>';
        }).join('');
        const cls = (opt.classeRiga ? opt.classeRiga(r) : '') + (opt.onRiga ? ' cliccabile' : '');
        return '<tr class="' + cls + '" data-i="' + i + '" data-chiave="' + esc(opt.chiave ? r[opt.chiave] : i) + '">' + td + '</tr>';
      }).join('');
      const tot = opt.totali ? '<tr class="totale">' + opt.colonne.map(c => '<td class="' + (c.tipo === 'n' ? 'n' : '') + '">' + (opt.totali[c.campo] !== undefined ? opt.totali[c.campo] : '') + '</td>').join('') + '</tr>' : '';
      if (!righe.length) return '<table class="tab"><thead><tr>' + th + '</tr></thead></table><div class="vuoto">' + esc(opt.vuoto || 'Nessun elemento.') + '</div>';
      return '<table class="tab" data-id="' + esc(id) + '"><thead><tr>' + th + '</tr></thead><tbody>' + tr + tot + '</tbody></table>';
    },
    _legaTabella(id) {
      const el = document.getElementById('tab-' + id);
      if (!el) return;
      const opt = tabelle[id];
      el.querySelectorAll('th.ord').forEach(th => th.onclick = () => {
        const cur = ordinamenti[id] || opt.ordine;
        ordinamenti[id] = { campo: th.dataset.campo, dir: (cur && cur.campo === th.dataset.campo && cur.dir === 'asc') ? 'desc' : 'asc' };
        UI.aggiornaTabella(id);
      });
      if (opt.onRiga) el.querySelectorAll('tbody tr[data-chiave]').forEach(tr => tr.onclick = e => {
        if (e.target.closest('button, a, input, select')) return;
        opt.onRiga(tr.dataset.chiave, e);
      });
      if (opt.onAzione) el.querySelectorAll('[data-azione]').forEach(b => b.onclick = e => { e.stopPropagation(); opt.onAzione(b.dataset.azione, b.dataset.id, b); });
    },
    legaTabelle(container) {
      container.querySelectorAll('.tabella-wrap[id^="tab-"]').forEach(w => UI._legaTabella(w.id.slice(4)));
    },
    righeOrdinate(id) {
      // righe nell'ordine visualizzato (per esportazioni coerenti con i filtri)
      const opt = tabelle[id]; if (!opt) return [];
      const el = document.getElementById('tab-' + id); if (!el) return opt.righe;
      const idx = Array.from(el.querySelectorAll('tbody tr[data-i]')).map(tr => +tr.dataset.i);
      const ord = ordinamenti[id] || opt.ordine;
      if (!ord) return opt.righe;
      const copia = opt.righe.slice();
      const col = opt.colonne.find(c => c.campo === ord.campo);
      const get = r => (col && col.valOrd) ? col.valOrd(r) : r[ord.campo];
      copia.sort((a, b) => { const x = get(a), y = get(b); const c = (typeof x === 'number' && typeof y === 'number') ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'it', { numeric: true }); return ord.dir === 'desc' ? -c : c; });
      void idx;
      return copia;
    },

    // ------------------------------------------------------------ elementi ricorrenti
    kpi(et, val, opt) {
      opt = opt || {};
      return '<div class="kpi ' + (opt.calc === false ? '' : 'calc ') + (opt.colore || '') + '"><div class="et" title="' + esc(et) + '">' + esc(et) + '</div><div class="val">' + val + '</div>' + (opt.sub ? '<div class="sub">' + opt.sub + '</div>' : '') + '</div>';
    },
    badgeAlert(a) { return a ? '<span class="badge ' + esc(a) + '">' + esc(a) + '</span>' : ''; },
    // esito della verifica di sostenibilità: CONGRUA / NON CONGRUA / NON CONGRUO / DA COMPLETARE
    badgeEsito(e) { return e ? '<span class="badge esito-' + esc(String(e).toLowerCase().replace(/[^a-z]+/g, '-')) + '">' + esc(e) + '</span>' : ''; },
    badgeStato(s) { return s ? '<span class="badge stato">' + esc(s) + '</span>' : '<span class="muto">—</span>'; },
    motiviHtml(r) {
      if (!r.motivi || !r.motivi.length) return '<span class="muto">—</span>';
      const det = r.motiviDettaglio || r.motivi.map(m => ({ motivo: m, testo: m, campi: [], form: null }));
      return '<div class="motivi ' + esc(r.alert) + '">' + det.map(d => d.form && d.campi.length ?
        '<a href="#" class="apri-campo" data-id="' + esc(r.id) + '" data-form="' + esc(d.form) + '" data-campo="' + esc(d.campi[0]) + '" title="Clicca per andare al campo da correggere">' + esc(d.testo) + ' ✎</a>' :
        '<span>' + esc(d.testo) + '</span>').join('') + '</div>';
    },
    // Apre la maschera giusta per una commessa e porta il cursore sul campo indicato (usato dai motivi di allerta cliccabili).
    apriCampo(commessaId, form, campo) {
      const dopo = () => UI.render();
      if (form === 'note') Cantieri.apriNote(commessaId, dopo);
      else Commesse.apriForm(commessaId, dopo);
      setTimeout(() => {
        const el = document.getElementById('f-' + campo);
        if (!el) return;
        el.scrollIntoView({ block: 'center' });
        el.focus();
        const box = el.closest('.campo');
        if (box) { box.classList.add('evidenziato'); setTimeout(() => box.classList.remove('evidenziato'), 4000); }
      }, 80);
    },
    linkCommessa(r) { return '<a href="#/commessa/' + esc(r.id) + '" class="cod">' + esc(r.codice) + '</a>'; },
    barra(frazione, colore) {
      const p = Math.max(0, Math.min(1, Fmt.isNum(frazione) ? frazione : 0)) * 100;
      return '<div class="barra"><i class="' + (colore || '') + '" style="width:' + p.toFixed(1) + '%"></i></div>';
    },

    // Selettore commessa con ricerca su codice / cliente / cantiere
    comboCommessa(container, opt) {
      opt = opt || {};
      const tutte = Store.commesseAttive();
      let scelta = opt.valore ? tutte.find(c => c.id === opt.valore) : null;
      container.classList.add('combo');
      container.innerHTML = '<input type="text" class="in" placeholder="Cerca per codice, cliente o cantiere…" autocomplete="off"' + (opt.disabled ? ' disabled' : '') + '><div class="lista" hidden></div><div class="scelta"></div>';
      const inp = container.querySelector('input'), lista = container.querySelector('.lista'), sc = container.querySelector('.scelta');
      let filtrate = [], sel = -1;
      function mostraScelta() {
        if (scelta) {
          inp.value = Engine.etichetta(scelta);
          sc.innerHTML = '<span class="chip"><b>Codice</b> ' + esc(scelta.codice) + '</span><span class="chip"><b>Cliente</b> ' + esc(scelta.cliente) + '</span><span class="chip"><b>Cantiere</b> ' + esc(scelta.cantiere) + '</span>' +
            (scelta.tecnico ? '<span class="muto">Tecnico: ' + esc(scelta.tecnico) + '</span>' : '');
        } else sc.innerHTML = '<span class="muto">Nessuna commessa selezionata</span>';
      }
      function apri() {
        const q = inp.value.trim().toLowerCase();
        filtrate = tutte.filter(c => !q || [c.codice, c.cliente, c.cantiere].some(x => String(x || '').toLowerCase().includes(q))).slice(0, 60);
        lista.innerHTML = filtrate.length ? filtrate.map((c, i) => '<div data-i="' + i + '" class="' + (i === sel ? 'sel' : '') + '"><span class="cod">' + esc(c.codice) + '</span> | ' + esc(c.cliente) + ' | ' + esc(c.cantiere) + '</div>').join('') : '<div class="muto">Nessuna commessa trovata</div>';
        lista.hidden = false;
        lista.querySelectorAll('div[data-i]').forEach(d => d.onmousedown = e => { e.preventDefault(); scegli(filtrate[+d.dataset.i]); });
      }
      function scegli(c) { scelta = c; sel = -1; lista.hidden = true; mostraScelta(); if (opt.onChange) opt.onChange(c); }
      inp.onfocus = () => { if (!opt.disabled) { inp.select(); apri(); } };
      inp.oninput = () => { scelta = null; sel = -1; sc.innerHTML = ''; apri(); if (opt.onChange) opt.onChange(null); };
      inp.onblur = () => { setTimeout(() => { lista.hidden = true; mostraScelta(); }, 120); };
      inp.onkeydown = e => {
        if (lista.hidden) return;
        if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, filtrate.length - 1); apri(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); apri(); e.preventDefault(); }
        else if (e.key === 'Enter') { if (sel >= 0 && filtrate[sel]) { scegli(filtrate[sel]); } else if (filtrate.length === 1) scegli(filtrate[0]); e.preventDefault(); }
      };
      mostraScelta();
      return { get valore() { return scelta ? scelta.id : ''; }, get commessa() { return scelta; }, imposta(id) { scelta = tutte.find(c => c.id === id) || null; mostraScelta(); } };
    },

    // Casella di ricerca per codice commessa con tendina di suggerimenti (filtro "contiene").
    // Con il campo vuoto la tendina elenca tutte le commesse. opt: { nome, valore, placeholder, onCambio(testo, esatto) }
    comboCodice(container, commesse, opt) {
      opt = opt || {};
      const tutte = commesse.slice().sort((a, b) => String(a.codice).localeCompare(String(b.codice), 'it', { numeric: true }));
      container.classList.add('combo');
      container.innerHTML = '<input type="text" class="in" name="' + esc(opt.nome || 'testo') + '" value="' + esc(opt.valore || '') + '" placeholder="' + esc(opt.placeholder || 'Codice commessa…') + '" autocomplete="off" spellcheck="false"><div class="lista" hidden></div>';
      const inp = container.querySelector('input'), lista = container.querySelector('.lista');
      let filtrate = [], sel = -1;
      function apri() {
        const q = inp.value.trim().toLowerCase();
        filtrate = tutte.filter(c => !q || String(c.codice || '').toLowerCase().includes(q)).slice(0, 80);
        lista.innerHTML = filtrate.length ? filtrate.map((c, i) => '<div data-i="' + i + '" class="' + (i === sel ? 'sel' : '') + '"><span class="cod">' + esc(c.codice) + '</span> | ' + esc(c.cliente || '') + ' | ' + esc(c.cantiere || '') + (c.alert ? ' ' + UI.badgeAlert(c.alert) : '') + '</div>').join('') +
          (tutte.length > filtrate.length && filtrate.length === 80 ? '<div class="muto">… altre ' + (tutte.length - 80) + ' commesse: restringi la ricerca</div>' : '') : '<div class="muto">Nessuna commessa con questo codice</div>';
        lista.hidden = false;
        lista.querySelectorAll('div[data-i]').forEach(d => d.onmousedown = e => { e.preventDefault(); scegli(filtrate[+d.dataset.i]); });
      }
      function chiudi() { lista.hidden = true; sel = -1; }
      function scegli(c) {
        inp.value = c.codice; chiudi();
        if (opt.onCambio) opt.onCambio(inp.value, true);
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
      inp.onfocus = () => { sel = -1; apri(); };
      inp.onclick = () => { if (lista.hidden) apri(); };
      inp.oninput = () => { sel = -1; apri(); if (opt.onCambio) opt.onCambio(inp.value, false); };
      inp.onblur = () => setTimeout(chiudi, 120);
      inp.onkeydown = e => {
        if (e.key === 'Escape') { chiudi(); return; }
        if (lista.hidden) { if (e.key === 'ArrowDown') { apri(); e.preventDefault(); } return; }
        if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, filtrate.length - 1); apri(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); apri(); e.preventDefault(); }
        else if (e.key === 'Enter') { if (sel >= 0 && filtrate[sel]) scegli(filtrate[sel]); else if (filtrate.length === 1) scegli(filtrate[0]); else chiudi(); e.preventDefault(); }
      };
      return { get valore() { return inp.value; }, input: inp };
    },

    // Esportazione CSV
    esportaCsv(nome, righe, colonne) {
      Fmt.scarica(Fmt.nomeFileData(nome), Fmt.csv(righe, colonne), 'text/csv;charset=utf-8');
      UI.toast('Esportazione completata: ' + righe.length + ' righe.');
    },
    pulsanteEsporta(id, testo) {
      return Store.puo('esporta') ? '<button type="button" data-esporta="' + esc(id) + '">' + esc(testo || 'Esporta CSV') + '</button>' : '';
    },
    ricerca(righe, testo, campi) {
      const q = String(testo || '').trim().toLowerCase();
      if (!q) return righe;
      const parole = q.split(/\s+/);
      return righe.filter(r => parole.every(p => campi.some(c => String(r[c] || '').toLowerCase().includes(p))));
    },
    debounce(fn, ms) { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(null, a), ms || 180); }; },
    permessoNegato() { UI.toast('Operazione non consentita per il ruolo ' + Store.ruolo() + '.', 'errore'); }
  };

  // Colonne di esportazione ricorrenti per le schede commessa
  UI.COLONNE_EXPORT_SCHEDA = [
    { titolo: 'Allerta', campo: 'alert' }, { titolo: 'Motivo allerta', valore: r => r.motivi.join('; ') },
    { titolo: 'Codice', campo: 'codice' }, { titolo: 'Cliente', campo: 'cliente' }, { titolo: 'Cantiere', campo: 'cantiere' },
    { titolo: 'Ramo', campo: 'ramo' }, { titolo: 'Tecnico', campo: 'tecnico' }, { titolo: 'Preposto', campo: 'preposto' }, { titolo: 'Stato', campo: 'stato' },
    { titolo: 'Inizio previsto', valore: r => Fmt.data(r.dataInizioPrevista) }, { titolo: 'Inizio effettivo', valore: r => Fmt.data(r.dataInizioEffettiva) },
    { titolo: 'Fine prevista', valore: r => Fmt.data(r.dataFinePrevista) }, { titolo: 'Fine effettiva', valore: r => Fmt.data(r.dataFineEffettiva) },
    { titolo: 'Contratto iniziale', campo: 'contrattoIniziale' }, { titolo: 'Integrazioni', campo: 'integrazioni' }, { titolo: 'Contratto aggiornato', campo: 'contrattoAggiornato' },
    { titolo: 'SAL maturato', campo: 'salCum' }, { titolo: 'Fatturato lordo', campo: 'fattCum' }, { titolo: 'SAL non fatturato', campo: 'salNonFatturato' },
    { titolo: 'Residuo lavori', campo: 'residuoLavori' }, { titolo: 'Residuo da fatturare', campo: 'residuoDaFatturare' },
    { titolo: 'Ritenute maturate', campo: 'ritenuteCum' }, { titolo: 'Ritenute svincolate', campo: 'svincoliCum' }, { titolo: 'Ritenute da sbloccare', campo: 'ritenuteDaSbloccare' },
    { titolo: 'Perdite SAL accettate', campo: 'perditeCum' }, { titolo: 'Valore recuperabile', campo: 'valoreRecuperabile' }, { titolo: 'Fatturato oltre recuperabile', campo: 'fatturatoOltreRecuperabile' },
    { titolo: 'SAL %', valore: r => r.salPct === null ? '' : Math.round(r.salPct * 10000) / 100 }, { titolo: 'Tempo %', valore: r => r.tempoPct === null ? '' : Math.round(r.tempoPct * 10000) / 100 },
    { titolo: 'Scostamento SAL/tempo %', valore: r => r.scostTempo === null ? '' : Math.round(r.scostTempo * 10000) / 100 }, { titolo: 'Giorni ritardo produttivo', campo: 'giorniRitardo' },
    { titolo: 'Ore budget iniziale', campo: 'oreBudgetIni' }, { titolo: 'Ore budget aggiornato', campo: 'oreBudget' }, { titolo: 'Ore usate', campo: 'oreUsate' },
    { titolo: 'Ore residue su iniziale', campo: 'oreResidueIni' }, { titolo: 'Ore residue su aggiornato', campo: 'oreResidue' },
    { titolo: 'Ore % su iniziale', valore: r => r.orePctIni === null ? '' : Math.round(r.orePctIni * 10000) / 100 },
    { titolo: 'Ore % su aggiornato', valore: r => r.orePct === null ? '' : Math.round(r.orePct * 10000) / 100 },
    { titolo: 'Scostamento ore/SAL % su iniziale', valore: r => r.scostOreIni === null ? '' : Math.round(r.scostOreIni * 10000) / 100 },
    { titolo: 'Scostamento ore/SAL % su aggiornato', valore: r => r.scostOre === null ? '' : Math.round(r.scostOre * 10000) / 100 },
    { titolo: 'Costi diretti budget iniziale', campo: 'costiBudgetIni' }, { titolo: 'Costi diretti budget aggiornato', campo: 'costiBudget' }, { titolo: 'Costi diretti sostenuti', campo: 'costiSostenuti' },
    { titolo: 'Costi residuo su iniziale', campo: 'costiResiduoIni' }, { titolo: 'Costi residuo su aggiornato', campo: 'costiResiduo' },
    { titolo: 'Costi sforamento su iniziale', campo: 'costiSforamentoIni' }, { titolo: 'Costi sforamento su aggiornato', campo: 'costiSforamento' },
    { titolo: 'Data aggiornamento budget', valore: r => Fmt.data(r.budgetAggiornatoAl) },
    { titolo: 'Costo effettivo cumulato', campo: 'costoEffettivo' }, { titolo: 'Aggiornato al', valore: r => Fmt.data(r.aggiornatoAl) }, { titolo: 'Note / Azione', campo: 'noteAzione' },
    { titolo: 'Verifica di sostenibilità: esito', valore: r => r.sostenibilita.esito },
    { titolo: 'Verifica di sostenibilità: motivo', valore: r => r.sostenibilita.motivi.join('; ') },
    { titolo: 'Prezzo del computo', valore: r => r.sostenibilita.prezzoComputo },
    { titolo: 'Costi specifici totali', valore: r => r.sostenibilita.totVoci.costoTotale },
    { titolo: 'Prezzo di vendita costi specifici', valore: r => r.sostenibilita.prezzoMinimoSpecifici },
    { titolo: 'Parte strutturale sostenibile', valore: r => r.sostenibilita.prezzoMinimoStrutturale },
    { titolo: 'Prezzo minimo dall\'analisi', valore: r => r.sostenibilita.prezzoMinimo },
    { titolo: 'Scostamento sostenibilità', valore: r => r.sostenibilita.scostamento },
    { titolo: 'Data della verifica', valore: r => Fmt.data(r.sostenibilita.data) }
  ];

  // I motivi di allerta con un campo da correggere sono link: il clic apre la maschera sul campo (senza aprire la riga della tabella).
  document.addEventListener('click', function (e) {
    const a = e.target.closest('a.apri-campo');
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    UI.apriCampo(a.dataset.id, a.dataset.form, a.dataset.campo);
  }, true);

  root.UI = UI;
})(window);
