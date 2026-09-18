/* FIDA EDILE – Importazione delle commesse da un foglio Excel (modello, anteprima, conferma) */
(function () {
  'use strict';
  const esc = UI.esc;
  const IC = () => window.ImportaCommesse;
  const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  // Stato della pagina: l'ultimo file letto (per rifare i conti al momento del salvataggio),
  // l'esame delle righe e l'esito dell'ultima importazione conclusa.
  const S = { cartella: null, nomeFile: '', esame: null, errore: '', soloProblemi: false, fatto: null };

  const BADGE = {
    NUOVA: '<span class="badge REGOLARE">nuova</span>',
    AGGIORNA: '<span class="badge stato">aggiorna</span>',
    INVARIATA: '<span class="badge neutro">invariata</span>',
    SCARTATA: '<span class="badge CRITICO">scartata</span>'
  };

  const Importa = {
    // Scarica il modello vuoto oppure già compilato con le commesse in archivio (per aggiornarle in blocco).
    scaricaModello(conDati) {
      if (!Store.puo('esporta')) return UI.permessoNegato();
      try {
        const commesse = conDati ? Store.db.commesse.filter(c => !c.annullato) : null;
        const dati = Xlsx.crea(IC().fogliModello(Store.db, commesse));
        const nome = conDati ? 'commesse_da_aggiornare' : 'modello_commesse';
        Fmt.scarica(Fmt.nomeFileData(nome, 'xlsx'), dati, TIPO_XLSX);
        UI.toast(conDati ? 'Modello scaricato con ' + commesse.length + ' commesse.' : 'Modello vuoto scaricato.');
      } catch (e) {
        console.error(e);
        UI.toast('Impossibile creare il modello: ' + (e.message || e), 'errore');
      }
    },

    // Legge il file scelto e prepara l'anteprima, senza toccare l'archivio.
    async analizza(file) {
      S.cartella = null; S.esame = null; S.errore = ''; S.fatto = null;
      S.nomeFile = file ? file.name : '';
      try {
        if (!/\.xlsx$/i.test(S.nomeFile)) {
          throw new Error('Il file deve essere in formato .xlsx. Se arriva da un vecchio Excel (.xls) o è un .csv, aprirlo in Excel e salvarlo come "Cartella di lavoro di Excel (*.xlsx)".');
        }
        const cartella = await Xlsx.leggi(await file.arrayBuffer());
        S.cartella = cartella;
        S.esame = IC().prepara(cartella, Store.db);
      } catch (e) {
        console.error(e);
        S.errore = e.message || String(e);
      }
      UI.render();
    },

    // Applica l'importazione. I conti si rifanno da capo sull'archivio appena riletto, così anche
    // se nel frattempo qualcun altro ha modificato le commesse il risultato resta corretto.
    async esegui() {
      if (!Store.puo('commessa.crea') && !Store.puo('commessa.modifica')) return UI.permessoNegato();
      const cartella = S.cartella;
      if (!cartella) return;
      const CAMPI = IC().COLONNE.map(c => c.campo);
      const CAMPI_REGISTRO = CAMPI.concat(['dataFinePrevistaOriginale']);
      const esito = await Store.salva(db => {
        const r = IC().prepara(cartella, db);
        let create = 0, aggiornate = 0;
        const aggiungi = (lista, val) => { if (val && lista.indexOf(val) < 0) lista.push(val); };
        r.esiti.forEach(e => {
          if (e.esito === 'SCARTATA' || e.esito === 'INVARIATA') return;
          if (e.commessaId) {
            const cur = db.commesse.find(x => x.id === e.commessaId);
            if (!cur) return;
            const mod = IC().differenze(cur, e.commessa, CAMPI_REGISTRO);
            if (!mod.length) return;
            CAMPI_REGISTRO.forEach(k => IC().imposta(cur, k, IC().valoreDi(e.commessa, k)));
            Store.log(db, 'commessa', cur.id, cur.codice, 'AGGIORNAMENTO DA IMPORTAZIONE EXCEL', mod);
            aggiornate++;
          } else {
            db.commesse.push(e.commessa);
            Store.log(db, 'commessa', e.commessa.id, e.commessa.codice, 'CREAZIONE DA IMPORTAZIONE EXCEL', IC().differenze(null, e.commessa, CAMPI_REGISTRO));
            create++;
          }
          aggiungi(db.liste.rami, e.commessa.ramo);
          aggiungi(db.liste.tecnici, e.commessa.tecnico);
          aggiungi(db.liste.preposti, e.commessa.preposto);
        });
        Store.log(db, 'dati', '', S.nomeFile, 'IMPORTAZIONE COMMESSE DA EXCEL', [
          { campo: 'file', prima: '', dopo: S.nomeFile },
          { campo: 'commesse create', prima: '', dopo: create },
          { campo: 'commesse aggiornate', prima: '', dopo: aggiornate },
          { campo: 'righe scartate', prima: '', dopo: r.nScartate }
        ]);
        return { create, aggiornate, invariate: r.nInvariate, scartate: r.nScartate, scarti: r.esiti.filter(x => x.esito === 'SCARTATA') };
      });
      S.cartella = null; S.esame = null; S.fatto = esito;
      UI.toast('Importazione completata: ' + esito.create + ' create, ' + esito.aggiornate + ' aggiornate' +
        (esito.scartate ? ', ' + esito.scartate + ' scartate' : '') + '.');
      UI.render();
    }
  };
  window.Importa = Importa;

  // ---------------------------------------------------------------- pagina
  UI.registra('importa', function (cont) {
    const puoImportare = Store.puo('commessa.crea') || Store.puo('commessa.modifica');
    const nCommesse = Store.db.commesse.filter(c => !c.annullato).length;
    const e = S.esame;

    cont.innerHTML = UI.testata('Importa commesse da Excel',
      'Un foglio Excel con una riga per commessa. Il <b>codice commessa</b> decide cosa succede: se non esiste viene creata una nuova commessa, se esiste viene aggiornata. Prima di scrivere qualsiasi cosa viene mostrata l\'anteprima riga per riga.',
      '<a class="btn" href="#/commesse">← Anagrafica commesse</a>') +

      '<div class="pannello"><h2>1 · Scarica il modello</h2>' +
      '<p class="sotto">Il modello contiene tutti e soli i campi di una commessa che si inseriscono a mano: anagrafica, budget, verifica di sostenibilità, note e data di aggiornamento. ' +
      'I valori calcolati dal programma (contratto aggiornato, allerte, prezzo minimo sostenibile) non vanno indicati. Restano fuori le fasi del cronoprogramma, i movimenti, i costi diretti e i saldi iniziali, che hanno archivi propri.</p>' +
      '<div class="btn-gruppo"><button type="button" class="primario" id="imp-modello">⤓ Scarica il modello vuoto (.xlsx)</button>' +
      (nCommesse ? '<button type="button" id="imp-modello-dati">⤓ Scarica il modello con le ' + nCommesse + ' commesse in archivio</button>' : '') + '</div>' +
      '<p class="sotto" style="margin-top:8px">Il file ha tre fogli: <b>ISTRUZIONI</b> (guida e significato di ogni colonna), <b>COMMESSE</b> (da compilare) ed <b>ELENCHI</b> (valori ammessi e suggerimenti). ' +
      'Le colonne con l\'intestazione arancione sono obbligatorie per creare una nuova commessa. ' +
      (nCommesse ? 'La seconda versione esce già compilata con l\'archivio attuale: si correggono le celle che servono e si ricarica il file per aggiornare in blocco.' : '') + '</p></div>' +

      '<div class="pannello"><h2>2 · Carica il file compilato</h2>' +
      (puoImportare
        ? '<div class="btn-gruppo"><button type="button" class="primario" id="imp-scegli">Scegli il file .xlsx…</button>' +
          '<input type="file" id="imp-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>' +
          (S.nomeFile ? '<span class="pill">' + esc(S.nomeFile) + '</span>' : '') + '</div>' +
          '<p class="sotto" style="margin-top:8px">Si può anche trascinare il file su questo riquadro. Nulla viene salvato finché non si conferma l\'importazione.</p>'
        : '<div class="msg avviso">Il ruolo <b>' + esc(Store.ruolo()) + '</b> può scaricare il modello ma non importare commesse.</div>') +
      '</div>' +

      (S.errore ? '<div class="msg errore"><b>Il file non può essere letto:</b><br>' + esc(S.errore) + '</div>' : '') +
      (S.fatto ? risultato(S.fatto) : '') +
      (e ? anteprima(e) : '') +
      '<div id="imp-tab"></div>' +
      (e && e.esiti.length ? '<div class="pannello"><div class="btn-gruppo">' +
        '<button type="button" class="primario" id="imp-esegui"' + (e.nNuove + e.nAggiornate ? '' : ' disabled') + '>' +
        'Importa ' + (e.nNuove + e.nAggiornate) + ' righe (' + e.nNuove + ' nuove, ' + e.nAggiornate + ' da aggiornare)</button>' +
        '<button type="button" id="imp-annulla">Annulla</button></div>' +
        '<p class="sotto" style="margin-top:8px">Le righe scartate e quelle invariate non vengono toccate. Ogni creazione e ogni modifica finisce nel <a href="#/registro">Registro modifiche</a> con autore, data e valori precedenti.</p></div>' : '');

    // ---- riquadro di riepilogo dell'anteprima
    function anteprima(r) {
      const avvisiColonne =
        (r.colonneMancantiObbligatorie.length
          ? '<div class="msg avviso"><b>Colonne obbligatorie non presenti nel file:</b> ' +
            r.colonneMancantiObbligatorie.map(c => esc(c.titolo)).join(' · ') +
            '. Le righe che devono creare una nuova commessa saranno scartate; gli aggiornamenti di commesse esistenti restano possibili.</div>'
          : '') +
        (r.colonneIgnorate.length
          ? '<div class="msg info"><b>Colonne non riconosciute e ignorate:</b> ' + r.colonneIgnorate.map(esc).join(' · ') +
            '. Se una di queste doveva essere importata, controllare che il titolo sia identico a quello del modello.</div>'
          : '');
      return '<h2>3 · Anteprima</h2>' + avvisiColonne +
        '<div class="kpi-griglia">' +
        UI.kpi('Righe con dati', r.esiti.length, { calc: false }) +
        UI.kpi('Nuove commesse', r.nNuove, { colore: r.nNuove ? 'verde' : '', calc: false }) +
        UI.kpi('Da aggiornare', r.nAggiornate, { calc: false }) +
        UI.kpi('Invariate', r.nInvariate, { calc: false }) +
        UI.kpi('Scartate', r.nScartate, { colore: r.nScartate ? 'rosso' : '', calc: false, sub: r.nScartate ? 'con errori bloccanti' : '' }) +
        UI.kpi('Con avvisi', r.nAvvisi, { colore: r.nAvvisi ? 'giallo' : '', calc: false, sub: 'da verificare, non bloccanti' }) +
        '</div>' +
        '<div class="pannello compatto"><div class="filtri" id="imp-filtri">' +
        '<div class="campo"><label>Righe</label><label style="text-transform:none;font-size:13px;margin-top:6px">' +
        '<input type="checkbox" name="soloProblemi"' + (S.soloProblemi ? ' checked' : '') + '> mostra solo le righe con errori o avvisi</label></div>' +
        '<div class="campo"><label>&nbsp;</label><span class="pill">titoli letti dalla riga ' + r.rigaTestata + ' · ' + r.colonneTrovate.length + ' colonne riconosciute</span></div>' +
        '</div></div>';
    }

    // ---- riquadro dell'importazione appena conclusa
    function risultato(f) {
      return '<div class="msg ok"><b>Importazione completata.</b> ' + f.create + ' commesse create, ' + f.aggiornate + ' aggiornate' +
        (f.invariate ? ', ' + f.invariate + ' già allineate' : '') + (f.scartate ? ', ' + f.scartate + ' scartate' : '') + '.</div>' +
        (f.scarti && f.scarti.length
          ? '<div class="pannello"><h2>Righe scartate</h2><p class="sotto">Non sono state importate. Correggere il file e ricaricarlo: le commesse già importate verranno riconosciute dal codice e aggiornate, non duplicate.</p>' +
            '<div class="tabella-wrap"><table class="tab"><thead><tr><th class="n">Riga</th><th>Codice</th><th>Motivo</th></tr></thead><tbody>' +
            f.scarti.map(x => '<tr><td class="n">' + x.riga + '</td><td><span class="cod">' + esc(x.codice) + '</span></td><td>' +
              x.errori.map(m => '<div>' + esc(m) + '</div>').join('') + '</td></tr>').join('') +
            '</tbody></table></div></div>'
          : '');
    }

    // ---- tabella delle righe
    function disegnaTabella() {
      if (!e) return;
      let righe = e.esiti;
      if (S.soloProblemi) righe = righe.filter(x => x.errori.length || x.avvisi.length);
      const colonne = [
        { campo: 'riga', titolo: 'Riga', tipo: 'n' },
        { campo: 'esito', titolo: 'Esito', fmt: v => BADGE[v] || esc(v) },
        { campo: 'codice', titolo: 'Codice', fmt: v => '<span class="cod">' + esc(v) + '</span>' },
        { campo: 'cliente', titolo: 'Cliente' },
        { campo: 'cantiere', titolo: 'Descrizione / Cantiere', classe: 'desc' },
        {
          campo: 'modifiche', titolo: 'Cosa cambia', ord: false, classe: 'desc',
          fmt: (v, r) => r.esito === 'NUOVA' ? '<span class="muto">nuova commessa</span>'
            : (!v.length ? '<span class="muto">—</span>'
              : '<div class="motivi">' + v.map(m => '<span title="' + esc(String(m.prima) + ' → ' + String(m.dopo)) + '">' +
                esc(etichettaCampo(m.campo)) + '</span>').join('') + '</div>')
        },
        {
          campo: 'errori', titolo: 'Errori e avvisi', ord: false, classe: 'desc',
          fmt: (v, r) => (v.length ? '<div class="motivi CRITICO">' + v.map(x => '<span>' + esc(x) + '</span>').join('') + '</div>' : '') +
            (r.avvisi.length ? '<div class="motivi ATTENZIONE">' + r.avvisi.map(x => '<span>' + esc(x) + '</span>').join('') + '</div>' : '') +
            (!v.length && !r.avvisi.length ? '<span class="muto">—</span>' : '')
        }
      ];
      const t = document.getElementById('imp-tab');
      t.innerHTML = UI.tabella('imp', {
        colonne, righe, chiave: 'riga', ordine: { campo: 'riga', dir: 'asc' },
        vuoto: S.soloProblemi ? 'Nessuna riga con errori o avvisi.' : 'Il foglio non contiene righe compilate.',
        classeRiga: x => x.esito === 'SCARTATA' ? 'riga-non-congrua' : (x.esito === 'INVARIATA' ? 'muto' : '')
      });
      UI.legaTabelle(t);
    }
    function etichettaCampo(campo) {
      const col = IC().COLONNE.find(c => c.campo === campo);
      if (col) return col.titolo.replace(/\s*\([^)]*\)\s*$/, '');
      return Schema.ETICHETTE[campo] || campo;
    }

    // ---- collegamenti
    const b = id => document.getElementById(id);
    b('imp-modello').onclick = () => Importa.scaricaModello(false);
    if (b('imp-modello-dati')) b('imp-modello-dati').onclick = () => Importa.scaricaModello(true);
    if (b('imp-scegli')) {
      b('imp-scegli').onclick = () => b('imp-file').click();
      b('imp-file').onchange = ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) Importa.analizza(f); };
      const zona = b('imp-scegli').closest('.pannello');
      ['dragover', 'dragenter'].forEach(n => zona.addEventListener(n, ev => { ev.preventDefault(); zona.style.outline = '2px dashed var(--primario2)'; }));
      ['dragleave', 'drop'].forEach(n => zona.addEventListener(n, ev => { ev.preventDefault(); zona.style.outline = ''; }));
      zona.addEventListener('drop', ev => { const f = ev.dataTransfer.files[0]; if (f) Importa.analizza(f); });
    }
    if (b('imp-esegui')) b('imp-esegui').onclick = async () => {
      const ok = await UI.conferma({
        titolo: 'Conferma importazione',
        testoConferma: 'Importa',
        html: 'Verranno create <b>' + e.nNuove + '</b> commesse e aggiornate <b>' + e.nAggiornate + '</b> commesse già in archivio.' +
          (e.nScartate ? '<br>Le <b>' + e.nScartate + '</b> righe scartate non verranno importate.' : '') +
          (e.nAvvisi ? '<br>Ci sono <b>' + e.nAvvisi + '</b> righe con avvisi: verranno importate comunque.' : '') +
          '<br><br>L\'operazione è tracciata nel Registro modifiche.'
      });
      if (ok) await Importa.esegui();
    };
    if (b('imp-annulla')) b('imp-annulla').onclick = () => { S.cartella = null; S.esame = null; S.nomeFile = ''; UI.render(); };
    const fil = b('imp-filtri');
    if (fil) fil.addEventListener('change', () => {
      fil.querySelectorAll('[name]').forEach(el => { S[el.name] = el.checked; });
      disegnaTabella();
    });
    disegnaTabella();
  });
})();
