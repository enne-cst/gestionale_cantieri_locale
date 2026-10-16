# Video promozionale – Gestione Cantieri

Video di 55 secondi, 1920 × 1080 a 30 fotogrammi al secondo, con musica di sottofondo: apertura, il problema,
la dashboard, sei funzionalità con schermate reali dell'applicazione, vantaggi e chiusura con marchio e slogan.
Montato con [Remotion](https://www.remotion.dev) (video scritti in React).

## Rigenerare

```
cd video
npm install        # solo la prima volta
npm run genera     # schermate dall'app + esportazione in out/gestione-cantieri.mp4
```

Oppure un passo alla volta:

| Comando | Che cosa fa |
|---|---|
| `npm run prepara` | cattura le schermate con Playwright (`public/img/`) e copia logo, font e contenuti |
| `npm run musica` | genera la colonna sonora `public/musica.wav`: una sintesi fatta da `musica.js`, senza campioni esterni, quindi originale e libera da diritti |
| `npm run anteprima` | apre Remotion Studio nel browser: si scorre il video e si vedono le modifiche dal vivo |
| `npm run video` | esporta l'MP4 riusando le schermate già presenti |

Serve Node.js 18 o successivo, Chrome o Edge per le schermate e la connessione a internet alla prima
esportazione (Remotion scarica il proprio browser per il rendering).

## Che cosa modificare

| File | Contenuto |
|---|---|
| `../brochure/contenuti.json` | nome, slogan e sottotitolo: sono gli stessi della brochure. Dopo averli cambiati rilanciare `npm run prepara` |
| `src/Promo.jsx` | ordine e durata delle scene, testi delle sei funzionalità |
| `src/Scene.jsx` | aspetto e animazioni di ogni scena |
| `src/tema.js` | colori e font |
| `musica.js` | accordi (`GIRO`), melodia (`TEMA`) e strumenti della musica; il volume nel video è in `src/Promo.jsx`. La musica è costruita sulle scene: se cambi le durate in `Promo.jsx`, rivedi anche le sezioni descritte in testa a `musica.js` |
| `prepara.js` | quali schermate catturare e come ritagliarle |

Le schermate nascono dall'archivio dimostrativo `../brochure/dati-demo/database.json`, avviato su una porta di
servizio in una cartella temporanea: l'archivio di lavoro `data/database.json` non viene letto né scritto.

## Licenza di Remotion

Remotion è gratuito per i privati e per le aziende fino a 3 dipendenti; le aziende più grandi devono
acquistare una licenza aziendale. Verificare le condizioni aggiornate su https://www.remotion.dev/license
prima di usare il video a scopo commerciale.
