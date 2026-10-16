# Brochure – Gestione Cantieri

Brochure A4 di 4 pagine per PMI: copertina, sei funzionalità con schermate reali dell'applicazione,
vantaggi e chiusura con marchio e slogan.

## Rigenerare

```
cd brochure
npm install          # solo la prima volta
node genera.js       # schermate + PDF
node genera.js --solo-pdf   # solo PDF, riusando le schermate in img/ (dopo aver cambiato testi o stile)
```

Serve Node.js 18 o successivo e Chrome o Edge installati (Playwright usa il browser di sistema, non ne scarica uno).

Risultato:

| File | Formato | Uso |
|---|---|---|
| `brochure-stampa.pdf` | 216 × 303 mm = A4 + 3 mm di abbondanza per lato | tipografia |
| `brochure-video.pdf` | 210 × 297 mm, A4 al vivo | email, sito, stampante d'ufficio |

## Che cosa modificare

| File | Contenuto |
|---|---|
| `contenuti.json` | nome, slogan e sottotitolo del prodotto |
| `brochure.html` | testi delle funzionalità e dei vantaggi |
| `brochure.css` | colori (variabili in `:root`), font, impaginazione |
| `dati-demo/database.json` | archivio dimostrativo da cui nascono le schermate |
| `genera.js` | quali schermate catturare e come ritagliarle |

## Come funziona

1. `genera.js` avvia l'applicazione sulla porta 8793 con una **copia** di `dati-demo/database.json` in una cartella
   temporanea: l'archivio di lavoro `data/database.json` non viene letto né scritto, quindi nella brochure non
   finiscono dati reali.
2. Playwright apre l'app e salva in `img/` la schermata di copertina e le sei delle funzionalità.
3. `brochure.html` viene completato con i valori di `contenuti.json` ed esportato in PDF due volte, con e senza abbondanza.

## Note per la stampa

- I fondi colorati arrivano fino al bordo del foglio da 216 × 303 mm; testi e immagini che non devono essere
  tagliati stanno ad almeno 14 mm dalla linea di taglio.
- Il PDF **non** contiene crocini di taglio e i colori sono in RGB: quasi tutte le tipografie online lo accettano
  così e convertono in CMYK; se la tua chiede CMYK o PDF/X, la conversione va fatta con il loro profilo.
- Font: Barlow e Barlow Condensed (licenza OFL), installati da npm e incorporati nel PDF.
- Come foglio piegato (A3 a metà) l'ordine delle pagine è: 1 copertina, 2–3 interno, 4 retro.
