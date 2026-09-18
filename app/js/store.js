/*
 * FIDA EDILE – Persistenza, tracciabilità e permessi.
 *
 * Due modalità, rilevate automaticamente:
 *  - "server": l'app è servita da server.js → i dati stanno in data/database.json (condivisibile in rete locale);
 *  - "file":   l'app è aperta direttamente (doppio clic su index.html) → i dati stanno nel browser (localStorage),
 *              con backup/ripristino JSON manuale.
 * Ogni modifica passa da Store.salva(mutatore) che esegue lettura → modifica → scrittura e
 * registra le variazioni nel registro (audit) con autore, data, ora, valore precedente e nuovo.
 */
(function (root) {
  'use strict';
  const CHIAVE_LOCALE = 'fidaedile.gestionecantieri.db';
  // Password richiesta per collegarsi come Direzione o come Amministratore. Gli altri utenti non hanno password.
  const PASSWORD_DIREZIONE = 'FidaEdile2026!';
  const RUOLI_CON_PASSWORD = ['direzione', 'admin'];
  // Interruttore: con false la password è sospesa (Direzione senza password e app che si apre direttamente come Direzione).
  // Rimettere true per riattivare la password e l'apertura come Operativo.
  const PASSWORD_ATTIVA = false;

  const PERMESSI = {
    admin: null,     // tutto
    direzione: null, // tutto
    operativo: ['commessa.crea', 'commessa.modifica', 'movimento.crea', 'movimento.modifica', 'movimento.annulla',
      'costo.crea', 'costo.modifica', 'costo.annulla', 'sostenibilita.modifica',
      'fase.crea', 'fase.modifica', 'fase.elimina',
      'preventivo.crea', 'preventivo.modifica', 'preventivo.annulla', 'preventivo.converti',
      'aggiornatoAl', 'esporta'],
    consultazione: ['esporta']
  };

  const Store = {
    modo: 'file',
    db: null,
    utente: null,
    ascoltatori: [],

    // ------------------------------------------------------------ avvio
    async init() {
      if (/^https?:$/.test(location.protocol)) {
        try {
          const r = await fetch('api/db', { cache: 'no-store' });
          if (r.ok) { this.modo = 'server'; this.db = Schema.migra((await r.json()).db); }
        } catch (e) { /* nessun server: modalità file */ }
      }
      if (!this.db) {
        this.modo = 'file';
        let raw = null;
        try { raw = localStorage.getItem(CHIAVE_LOCALE); } catch (e) { raw = null; }
        this.db = Schema.migra(raw ? JSON.parse(raw) : null);
        if (!raw) this._scriviLocale();
      }
      // Con la password attiva l'app si apre come Operativo e Direzione si sceglie dalla tendina con password;
      // con la password sospesa si apre direttamente come Direzione.
      const attivi = this.db.utenti.filter(x => x.attivo !== false);
      const u = PASSWORD_ATTIVA
        ? (attivi.find(x => x.ruolo === 'operativo') || attivi.find(x => RUOLI_CON_PASSWORD.indexOf(x.ruolo) < 0) || attivi[0])
        : (attivi.find(x => x.ruolo === 'direzione') || attivi[0]);
      this.utente = u ? { id: u.id, nome: u.nome, ruolo: u.ruolo } : { id: 'u_operativo', nome: 'Operativo', ruolo: 'operativo' };
      return this;
    },

    onChange(fn) { this.ascoltatori.push(fn); },
    _notifica() { this.ascoltatori.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); },

    // ------------------------------------------------------------ utenti e permessi
    // Cambio utente dalla tendina: solo Direzione richiede la password. Restituisce null se ok, altrimenti il messaggio di errore.
    richiedePassword(utenteId) {
      const u = this.db.utenti.find(x => x.id === utenteId);
      return PASSWORD_ATTIVA && !!(u && RUOLI_CON_PASSWORD.indexOf(u.ruolo) >= 0);
    },
    login(utenteId, password) {
      const u = this.db.utenti.find(x => x.id === utenteId && x.attivo !== false);
      if (!u) return 'Utente non trovato.';
      if (PASSWORD_ATTIVA && RUOLI_CON_PASSWORD.indexOf(u.ruolo) >= 0 && String(password || '') !== PASSWORD_DIREZIONE) return 'Password non corretta.';
      this.utente = { id: u.id, nome: u.nome, ruolo: u.ruolo };
      return null;
    },
    // Pagine riservate, con l'elenco dei ruoli ammessi. Le pagine non elencate sono visibili a tutti.
    // La Dashboard di analisi e le pagine di Sistema sono di sola competenza dell'amministratore.
    PAGINE_RISERVATE: {
      analisi: ['admin'],
      parametri: ['admin'],
      registro: ['admin'],
      dashboard: ['admin', 'direzione'],
      cantieri: ['admin', 'direzione'],
      // l'importazione crea e modifica commesse: chi è in sola consultazione non la vede
      importa: ['admin', 'direzione', 'operativo']
    },
    vedePagina(pagina) {
      const ammessi = this.PAGINE_RISERVATE[pagina];
      return !ammessi || ammessi.indexOf(this.ruolo()) >= 0;
    },
    paginaIniziale() {
      const r = this.ruolo();
      if (r === 'admin') return 'analisi';
      return r === 'direzione' ? 'dashboard' : 'commesse';
    },
    puo(azione) {
      if (!this.utente) return false;
      const lista = PERMESSI[this.utente.ruolo];
      if (lista === null) return true;
      return (lista || []).indexOf(azione) >= 0;
    },
    ruolo() { return this.utente ? this.utente.ruolo : 'consultazione'; },

    // Porta a oggi la data "Aggiornato al" della commessa quando se ne toccano i dati operativi
    // (anagrafica, movimenti, costi diretti). Il budget è escluso: ha una sua data di aggiornamento.
    // Serve alla Direzione per capire se il cantiere aggiorna davvero i dati.
    toccaCommessa(db, commessaId, mod) {
      const c = db.commesse.find(x => x.id === commessaId);
      if (!c) return;
      const oggi = Fmt.oggi();
      const prima = c.aggiornatoAl || '';
      if (prima >= oggi) return; // già a oggi (o data futura decisa a mano): non si tocca
      c.aggiornatoAl = oggi;
      const voce = { campo: 'aggiornatoAl', prima, dopo: oggi };
      if (mod) mod.push(voce);
      else this.log(db, 'commessa', c.id, c.codice, 'AGGIORNAMENTO AUTOMATICO', [voce]);
    },

    // ------------------------------------------------------------ lettura
    commessa(id) { return this.db.commesse.find(c => c.id === id) || null; },
    preventivo(id) { return this.db.preventivi.find(p => p.id === id) || null; },
    etichetta(id) { const c = this.commessa(id); return c ? Engine.etichetta(c) : '(commessa non trovata)'; },
    // Solo le commesse operative: le definite dalla chiusura esercizio non accettano nuovi movimenti o costi.
    commesseAttive() { return Engine.operative(this.db.commesse).slice().sort((a, b) => String(a.codice).localeCompare(String(b.codice), 'it')); },

    // ------------------------------------------------------------ scrittura
    // mutatore(db) modifica il database e può restituire un valore; usare Store.log(db, ...) per il registro.
    async salva(mutatore) {
      if (this.modo === 'server') {
        let ultimoErrore = null;
        for (let tentativo = 0; tentativo < 3; tentativo++) {
          const r = await fetch('api/db', { cache: 'no-store' });
          if (!r.ok) throw new Error('Impossibile leggere il database dal server.');
          const fresco = Schema.migra((await r.json()).db);
          // la revisione di partenza va letta PRIMA del mutatore: il ripristino da backup sostituisce
          // l'intero database, rev compresa, e con la rev del file il server rifiuterebbe sempre la scrittura
          const revBase = fresco.rev;
          const esito = mutatore(fresco);
          const w = await fetch('api/db', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rev: revBase, db: fresco }) });
          if (w.status === 409) { ultimoErrore = 'Il database è stato modificato da un altro utente: nuovo tentativo.'; continue; }
          if (!w.ok) {
            // il server sa perché non ha potuto scrivere (permessi, disco pieno): va detto all'utente
            let motivo = '';
            try { motivo = (await w.json()).errore || ''; } catch (e) { motivo = ''; }
            throw new Error('Salvataggio non riuscito (' + w.status + ')' + (motivo ? ': ' + motivo : '.'));
          }
          const risp = await w.json();
          fresco.rev = risp.rev;
          this.db = fresco;
          this._notifica();
          return esito;
        }
        throw new Error(ultimoErrore || 'Salvataggio non riuscito.');
      }
      const esito = mutatore(this.db);
      this.db.rev = (this.db.rev || 0) + 1;
      this._scriviLocale();
      this._notifica();
      return esito;
    },
    _scriviLocale() {
      try { localStorage.setItem(CHIAVE_LOCALE, JSON.stringify(this.db)); }
      catch (e) { alert('Impossibile salvare i dati nel browser: ' + e.message + '\nEsportare subito una copia di sicurezza.'); }
    },
    async ricarica() {
      if (this.modo === 'server') {
        const r = await fetch('api/db', { cache: 'no-store' });
        if (r.ok) { this.db = Schema.migra((await r.json()).db); this._notifica(); }
      }
    },

    // ------------------------------------------------------------ registro modifiche
    log(db, entita, entitaId, riferimento, azione, modifiche) {
      db.audit.push({
        id: Schema.genId('a'),
        ts: new Date().toISOString(),
        utente: this.utente ? this.utente.nome : '?',
        ruolo: this.utente ? this.utente.ruolo : '?',
        entita, entitaId: entitaId || '', riferimento: riferimento || '', azione,
        modifiche: modifiche || []
      });
    },
    // Confronta due oggetti sui campi indicati e restituisce le variazioni
    diff(prima, dopo, campi) {
      const out = [];
      (campi || Object.keys(dopo)).forEach(k => {
        const a = prima ? prima[k] : undefined, b = dopo[k];
        const na = (a === undefined || a === null) ? '' : a, nb = (b === undefined || b === null) ? '' : b;
        if (typeof na === 'object' || typeof nb === 'object') {
          if (JSON.stringify(na) !== JSON.stringify(nb)) out.push({ campo: k, prima: JSON.stringify(na), dopo: JSON.stringify(nb) });
        } else if (String(na) !== String(nb)) out.push({ campo: k, prima: na, dopo: nb });
      });
      return out;
    },

    // ------------------------------------------------------------ backup / ripristino
    esportaJson() { return JSON.stringify(this.db, null, 1); },
    async importaJson(testo) {
      const obj = JSON.parse(testo);
      if (!obj || typeof obj !== 'object' || !Array.isArray(obj.commesse)) throw new Error('Il file non è un backup valido di questa applicazione.');
      const nuovo = Schema.migra(obj);
      return this.salva(db => {
        const utente = this.utente;
        Object.keys(db).forEach(k => { delete db[k]; });
        Object.assign(db, nuovo);
        db.utenti = db.utenti && db.utenti.length ? db.utenti : Schema.nuovoDb().utenti;
        if (!db.utenti.some(u => u.id === utente.id)) db.utenti.push({ id: utente.id, nome: utente.nome, ruolo: utente.ruolo, attivo: true });
        this.log(db, 'dati', '', '', 'RIPRISTINO DA BACKUP', [{ campo: 'commesse', prima: '', dopo: db.commesse.length }, { campo: 'movimenti', prima: '', dopo: db.movimenti.length }, { campo: 'costi', prima: '', dopo: db.costi.length }]);
      });
    }
  };

  root.Store = Store;
})(window);
