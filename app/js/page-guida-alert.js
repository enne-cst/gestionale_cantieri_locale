/* Gestione Cantieri – Guida agli alert (solo amministratore): come si attiva e come funziona ogni alert,
   con la numerazione della matrice alert del 15/10/2026 e le soglie in vigore nei Parametri */
(function () {
  'use strict';
  const esc = UI.esc;
  const LIVELLI = [
    ['CRITICO', 'Alert critici', 'Problemi gravi di andamento, con le soglie impostabili nei Parametri.'],
    ['ATTENZIONE', 'Alert di attenzione', 'Problemi di andamento sotto la soglia critica, o da tenere d\'occhio.'],
    ['INCOMPLETO', 'Dati incompleti', 'Mancano dati: non è un giudizio sull\'andamento, ma senza questi dati altri alert non si calcolano.']
  ];
  let filtro = '';

  // {p:nome} → percentuale dei Parametri, {e:nome} → euro; il valore si evidenzia perché si capisca che è modificabile
  function conParametri(testo, P) {
    return esc(testo).replace(/\{([pe]):(\w+)\}/g, (x, tipo, nome) =>
      '<b class="guida-par" title="Parametro modificabile in Parametri di controllo">' + esc(tipo === 'p' ? Fmt.pct(P[nome]) : Fmt.euro(P[nome])) + '</b>');
  }

  UI.registra('guida-alert', function (cont) {
    const P = Store.db.parametri;
    // quali commesse hanno ora ciascun alert: aiuta a ritrovare un caso concreto da guardare
    const perTitolo = {};
    Engine.calcolaTutte(Store.db).forEach(r => r.motivi.forEach(m => (perTitolo[m] || (perTitolo[m] = [])).push(r)));
    const bloccanti = AlertCatalogo.ALERT.filter(a => Engine.ALERT_BLOCCANTI.indexOf(a.titolo) >= 0).map(a => a.n).join(', ');
    const ord = s => { const m = /^(\d+)(.*)$/.exec(s); return m ? +m[1] * 10 + (m[2].trim() ? 1 : 0) : 999; };

    const riga = a => {
      const comm = perTitolo[a.titolo] || [];
      return '<tr data-cerca="' + esc((a.n + ' ' + a.titolo + ' ' + a.quando + ' ' + a.come + ' ' + a.dove).toLowerCase()) + '">' +
        '<td class="n guida-num"><b>' + esc(a.n) + '</b></td>' +
        '<td class="guida-titolo"><span class="badge ' + a.livello + '">' + esc(a.titolo) + '</span>' +
        (a.collegati ? '<div class="piccolo muto">collegato a ' + esc(a.collegati) + '</div>' : '') +
        (Engine.ALERT_BLOCCANTI.indexOf(a.titolo) >= 0 ? '<div class="guida-modifica">Falsa i calcoli: la commessa è classificata Incompleta anche se ha alert critici o di attenzione.</div>' : '') +
        (a.modifica ? '<div class="guida-modifica">Modificato 16/10/2026: ' + esc(a.modifica) + '</div>' : '') + '</td>' +
        '<td>' + conParametri(a.quando, P) + '</td>' +
        '<td>' + conParametri(a.come, P) + '</td>' +
        '<td>' + esc(a.dove) + '</td>' +
        '<td class="n">' + (comm.length ? '<span title="' + esc(comm.map(r => r.codice + ' · ' + r.cliente).join('\n')) + '">' + comm.length + '</span>' : '<span class="muto">0</span>') + '</td></tr>';
    };

    cont.innerHTML = UI.testata('Guida agli alert', 'Come si attiva e come funziona ogni alert. Numerazione della <b>' + esc(AlertCatalogo.DOCUMENTO) + '</b>; le soglie in grassetto sono quelle in vigore nei Parametri.',
      (Store.puo('parametri') ? '<a class="btn" href="#/parametri">Parametri di controllo</a>' : '') + '<button type="button" onclick="window.print()">Stampa</button>', 'Sistema') +
      '<div class="pannello guida-regole"><h2>Regole generali</h2><ul>' +
      '<li>Ogni alert ha un <b>livello</b>: critico, attenzione o dati incompleti. La commessa prende il livello del suo alert più grave; ogni alert resta del colore del proprio livello.</li>' +
      '<li><b>Classificazione della commessa</b> (grafico, filtri, badge): <b>Incompleta</b> vince su tutto quando manca un dato che falsa i calcoli (alert ' + esc(bloccanti) + '): con quei dati mancanti gli alert critici e di attenzione potrebbero non essere veritieri. Poi Critica, poi In attenzione. I dati incompleti che non toccano i numeri (22 e 27) classificano Incompleta solo una commessa senza altri alert. Il colore del portafoglio in cima alla dashboard conta solo la classe.</li>' +
      '<li>Nelle liste e nella scheda commessa si legge solo il <b>titolo</b>. <b>Passando sopra</b> al titolo si vede il dettaglio con i numeri della commessa; gli alert sulle fasi del Gantt elencano tutte le fasi interessate.</li>' +
      '<li>Gli alert con il simbolo ✎ sono cliccabili: aprono la maschera sul campo da correggere.</li>' +
      '<li>Le date e i rapporti sul tempo si misurano alla data <b>«Aggiornato al»</b> della commessa: senza questa data gli alert sul tempo non si calcolano (25).</li>' +
      '<li>Le commesse <b>definite</b> (chiuse in via definitiva) non producono più alert.</li>' +
      '<li>L\'ultima colonna conta le commesse che hanno l\'alert adesso: passandoci sopra si leggono i codici.</li>' +
      '</ul></div>' +
      '<div class="pannello compatto"><div class="filtri"><div class="campo largo"><label for="guida-cerca">Cerca</label><input type="search" class="in" id="guida-cerca" value="' + esc(filtro) + '" placeholder="numero, titolo o parola (es. ritardo, fase, SAL)"></div>' +
      '<div class="campo"><label>&nbsp;</label><span class="pill" id="guida-conta"></span></div></div></div>' +
      LIVELLI.map(l => {
        const voci = AlertCatalogo.ALERT.filter(a => a.livello === l[0]).sort((x, y) => ord(x.n) - ord(y.n));
        return '<section class="guida-gruppo"><h2><span class="badge ' + l[0] + '">' + esc(l[1]) + '</span> <span class="sotto">' + esc(l[2]) + '</span></h2>' +
          '<div class="tabella-wrap"><table class="tab guida-tab"><thead><tr><th class="n">N.</th><th>Alert</th><th>Quando si attiva</th><th>Come funziona</th><th>Dove si corregge</th><th class="n" title="Commesse che hanno l\'alert adesso">Ora</th></tr></thead>' +
          '<tbody>' + voci.map(riga).join('') + '</tbody></table></div></section>';
      }).join('');

    const campo = document.getElementById('guida-cerca');
    const applica = () => {
      filtro = campo.value;
      const q = filtro.trim().toLowerCase();
      let n = 0;
      cont.querySelectorAll('.guida-tab tbody tr').forEach(tr => { const si = !q || tr.dataset.cerca.indexOf(q) >= 0 || tr.querySelector('.guida-num').textContent.trim() === q; tr.hidden = !si; if (si) n++; });
      cont.querySelectorAll('.guida-gruppo').forEach(s => { s.hidden = !s.querySelector('tbody tr:not([hidden])'); });
      document.getElementById('guida-conta').textContent = n + ' alert su ' + AlertCatalogo.ALERT.length;
    };
    campo.oninput = applica;
    applica();
  });
})();
