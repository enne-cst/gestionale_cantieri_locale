# FIDA EDILE – Gestione Cantieri

Applicazione gestionale locale che sostituisce il file **DATABASE CONTRATTI FIDA EDILE – REV.14** mantenendone
tutte le logiche (anagrafica, saldi iniziali, budget, movimenti, costi diretti, controllo cantieri, parametri, alert)
e il modello **Verifica di sostenibilità economica della commessa**.

Nessuna libreria esterna: solo HTML, CSS e JavaScript. Funziona su Windows, macOS e Linux con qualsiasi browser moderno
(Chrome, Edge, Firefox, Safari).

## Avvio rapido

### Windows
Doppio clic su **`avvia.bat`**.

### macOS
Serve **Node.js** (gratuito, https://nodejs.org, versione LTS): senza, i dati non possono finire in un file.
Poi, dal Terminale — funziona sempre, anche senza permessi di esecuzione:

```
cd <trascina qui la cartella dell'app>
node server.js
```

e si apre `http://localhost:8765`. In alternativa doppio clic su **`avvia.command`**: se non succede nulla il file
ha perso il permesso di esecuzione (capita **sempre** quando la cartella arriva da Windows, da una chiavetta,
da AirDrop o da uno zip) e si sistema una volta sola con `chmod +x`. Istruzioni passo passo in **`LEGGIMI-MAC.txt`**.

### Dove finiscono i dati
L'app lavora in due modi e lo dichiara sempre nell'etichetta in basso a sinistra della barra laterale:

| Come si apre | Etichetta | Dove sono i dati |
|---|---|---|
| con **Node.js** installato (`avvia.bat`, `avvia.command`, `node server.js`) | 🟢 dati su server locale | **`data/database.json`** nella cartella dell'app, con una copia giornaliera in `data/backup/` |
| doppio clic su `app/index.html`, oppure Node.js assente | 🟡 dati in questo browser | dentro il browser di quel computer, **nessun file** |

Un browser che apre un file `file://` non può scrivere sul disco: è una regola di sicurezza del browser, non un limite
dell'applicazione. **Per avere l'archivio come file serve Node.js.** In modalità file l'unico modo per spostare o
conservare i dati è *Parametri → Dati → Scarica copia di sicurezza*.

Il percorso esatto dell'archivio viene scritto all'avvio nella finestra del server, sotto la voce `Dati:`.

### Uso da più PC in rete locale
Sul PC che fa da "server": `node server.js --rete` (oppure `avvia.bat --rete`). Gli altri PC aprono nel browser
l'indirizzo mostrato a video (es. `http://192.168.1.10:8765`). Tutti lavorano sullo stesso archivio.
Porta diversa: `node server.js --porta 9000`.

## Primo utilizzo
L'app si apre come **Operativo** (senza password). Nella barra laterale una tendina permette di scegliere l'utente;
per collegarsi come **Direzione** o come **Amministratore** è richiesta la password (`FidaEdile2026!`, definita in
`app/js/store.js`). Le pagine della sezione Direzione (Dashboard e Controllo cantieri) sono visibili a Direzione e
Amministratore; la **Dashboard di analisi** e le due pagine della sezione Sistema (Parametri di controllo e Registro
modifiche) sono riservate all'Amministratore. I livelli di utilizzo sono modificabili da *Parametri → Utenti*:

| Utente          | Ruolo         | Può fare |
|-----------------|---------------|----------|
| Amministratore  | admin         | tutto, e in esclusiva: Dashboard di analisi, Parametri di controllo (chiusura esercizio, utenti, dati), Registro modifiche |
| Direzione       | direzione     | Dashboard, Controllo cantieri, saldi iniziali, budget, note direzionali; non vede la Dashboard di analisi né le pagine di Sistema |
| Operativo       | operativo     | anagrafica, movimenti, costi diretti, preventivi e conversione, verifica di sostenibilità, data "aggiornato al" |
| Consultazione   | consultazione | sola visualizzazione ed esportazioni |

Se l'archivio è vuoto, da *Parametri → Dati* si possono caricare i **dati dimostrativi** (le 3 commesse del file Excel,
i casi di test A, B, C previsti dalle indicazioni e 4 preventivi che coprono i quattro esiti della verifica di sostenibilità).

## Struttura
```
avvia.bat / avvia.command   avvio con doppio clic
server.js                   server locale (solo moduli integrati di Node.js)
app/index.html              applicazione
app/js/engine.js            motore di calcolo (formule Rev.14)
app/js/schema.js            struttura del database
app/js/store.js             salvataggio, registro modifiche, permessi
app/js/xlsx.js              lettura e scrittura dei file Excel (.xlsx), senza librerie
app/js/importa-commesse.js  modello Excel delle commesse e controlli di importazione
app/js/page-*.js            pagine
app/js/page-sostenibilita.js verifica di sostenibilità economica delle commesse
app/js/page-preventivi.js   preventivi (ipotesi di commessa) e conversione in commessa
app/js/page-importa.js      importazione delle commesse da un foglio Excel
data/database.json          archivio (modalità server)
test/verifica.js            verifica di equivalenza con l'Excel:  node test/verifica.js
reference/                  file Excel e indicazioni originali
```

## Logica di gestione (in sintesi)
- **Una sola fonte per ogni dato**: la commessa nasce in Anagrafica ed è richiamata ovunque come `CODICE | CLIENTE | CANTIERE`.
- **Cumulativo commessa = saldo iniziale (31/12 anno precedente) + movimenti dell'esercizio.** La dashboard Movimenti
  considera solo i movimenti dell'anno (per data movimento, obbligatoria).
- **Commessa pregressa** = data di inizio effettiva precedente al 1° gennaio dell'anno di gestione (come nel file Rev.14).
- **Costo effettivo cumulato** = ore effettive × costo strutturale corrente (Parametri) + costi diretti.
- **Alert** REGOLARE / ATTENZIONE / CRITICO con motivi, secondo le stesse regole del foglio CANTIERI.
- **Verifica di sostenibilità economica**: il *prezzo del computo* viene confrontato con il *prezzo minimo
  sostenibile*, formato dalla **parte strutturale** (ore previste × costo strutturale, maggiorate del rischio,
  portate a redditività e aumentate della quota di rientro bancario) e dal **prezzo di vendita dei costi specifici**
  (caricati del ricarico e portati a redditività). Esito **CONGRUA / NON CONGRUA / NON CONGRUO** (ricarico sotto la
  soglia della Direzione) **/ DA COMPLETARE**.
  Per una **commessa** la verifica è automatica e non duplica nulla: il prezzo del computo è il contratto aggiornato
  dell'Anagrafica, le ore e i costi specifici sono le ore previste e i costi diretti previsti vigenti del Budget.
  L'unico dato inserito a mano è il **ricarico** sui costi specifici (vuoto = soglia minima della Direzione).
  L'esito **non** modifica il semaforo REGOLARE / ATTENZIONE / CRITICO: compare fra le note informative della commessa.
- **Preventivi** (ipotesi di commessa): un'offerta che ancora non è commessa vive in un archivio separato, non entra
  in Anagrafica né nei cumulativi e ha **soltanto** la verifica di sostenibilità, con tutti i dati inseriti a mano
  (prezzo proposto, ore previste, voci di costo specifico con i rispettivi ricarichi). Il numero è proposto
  progressivo per anno (P-2026-001) e resta modificabile. Quando l'offerta viene accettata si **converte in commessa**:
  nasce la commessa in Anagrafica con contratto = prezzo proposto, ore previste e costi diretti previsti = quelli del
  preventivo (ricarico medio compreso), e il preventivo resta in archivio come storico di sola lettura, collegato alla
  commessa. Il dettaglio voce per voce dei costi resta consultabile nel preventivo.
- **Chiusura esercizio** (Direzione): i cumulativi di fine anno diventano i saldi iniziali del nuovo anno; lo storico resta.
- Movimenti, costi e saldi non si cancellano: si **annullano** con motivo e restano tracciati. Ogni modifica finisce nel
  **Registro modifiche** (autore, data, ora, valore precedente, valore nuovo).

## Importazione delle commesse da Excel
Pagina **Gestione → Importa da Excel** (visibile ad Amministratore, Direzione e Operativo; la sola consultazione
può scaricare il modello ma non importare). Il modello si scarica anche da *Parametri → Dati*.

Il file `.xlsx` è generato e riletto dall'applicazione **senza librerie esterne**: un `.xlsx` è un archivio ZIP di
documenti XML, scritto qui senza compressione e riletto con `DecompressionStream`, funzione standard dei browser
recenti. Serve quindi un browser aggiornato (Chrome/Edge 80+, Firefox 113+, Safari 16.4+).

Il modello ha tre fogli:

| Foglio | Contenuto |
|---|---|
| `ISTRUZIONI` | guida alla compilazione e significato di ogni colonna (non viene letto) |
| `COMMESSE` | **una riga per commessa**, una colonna per campo |
| `ELENCHI` | valori ammessi (stati, cause, SI/NO) e suggerimenti di rami, tecnici e preposti |

- Il foglio `COMMESSE` contiene **tutti e soli i campi che di una commessa si inseriscono a mano**, una volta sola
  ciascuno: anagrafica, budget (iniziale e aggiornato), ricarico e dichiarazione della verifica di sostenibilità,
  note e data "aggiornato al". Non compaiono i valori calcolati dal programma (contratto aggiornato, costo ore,
  margine teorico, allerte, prezzo minimo sostenibile), né le fasi del cronoprogramma, i movimenti, i costi diretti
  e i saldi iniziali, che hanno archivi propri.
- **Il codice commessa è la chiave**: se non esiste in Anagrafica la commessa viene creata, se esiste viene
  aggiornata. In aggiornamento **le celle lasciate vuote non cancellano nulla**.
- I titoli della riga 1 servono a riconoscere le colonne; l'ordine può cambiare e le colonne non necessarie si
  possono eliminare. Le colonne non riconosciute vengono elencate e ignorate.
- Prima di scrivere qualcosa viene mostrata l'**anteprima riga per riga** con esito (nuova / aggiorna / invariata /
  scartata), i campi che cambiano, gli errori bloccanti e gli avvisi. I controlli sono gli stessi delle maschere
  dell'applicazione. **Le righe valide vengono importate, quelle con errori vengono scartate ed elencate**: si
  corregge il file e lo si ricarica, senza rischio di duplicati perché il codice viene riconosciuto.
- Ogni creazione e ogni modifica finisce nel **Registro modifiche** con autore, data, ora e valori precedenti.
- Il pulsante *"Scarica il modello con le N commesse in archivio"* produce lo stesso file già compilato: serve per
  correggere e **aggiornare in blocco** quello che è già dentro.

## Verifica dei calcoli
```
node test/verifica.js
```
Confronta i risultati del motore con i valori calcolati da Excel per le commesse C042, C011 e TEST10
(cumulativi, percentuali, scostamenti, alert e motivi, dashboard di periodo, costo mensile, dashboard budget)
e verifica i casi A, B, C e i controlli di coerenza. Include inoltre l'equivalenza con il modello di **verifica di
sostenibilità economica** (formazione del prezzo strutturale, pesi, prezzo di vendita dei costi specifici, i quattro
esiti su commesse e preventivi) e la **conversione preventivo → commessa**, verificando che la commessa generata
produca lo stesso prezzo minimo e lo stesso esito del preventivo di origine.
#   g e s t i o n a l e _ c a n t i e r i  
 