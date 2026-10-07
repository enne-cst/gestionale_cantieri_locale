# Correzioni alla Rev. 5 — versione riordinata

Fonte: `CORREZIONI ALLA REV. 5 26-9-26.docx`. Il contenuto è lo stesso dell'originale, solo raggruppato per area e numerato.
Le righe marcate **[DA CHIARIRE]** sono punti che nell'originale sono ambigui o lasciati come domanda; le righe marcate *(mia lettura)* sono interpretazioni mie da confermare.

---

## A. Sistema degli alert

### A1. Tre livelli di alert

| Livello | Colore | Quando |
|---|---|---|
| CRITICO | Rosso | Solo i casi elencati in A2 |
| ATTENZIONE | Ambra | "Tutti gli altri?" **[DA CHIARIRE: nell'originale è una domanda]** |
| INCOMPLETO | Bluette | Dati mancanti |

### A2. Alert che devono essere CRITICI (rosso)

1. Commessa finita in perdita
2. Commessa in perdita a finire
3. Errore di acquisizione: prezzo venduto / prezzo minimo sostenibile oltre x%
4. SAL da emettere perché in ritardo rispetto al quantitativo di ore segnate nei movimenti
5. Integrazioni inserite senza riferimento documentale ("integrazione contrattuale n. … del …")
6. Ore segnate oltre x% rispetto a quelle previste
7. Costi diretti segnati oltre x% rispetto a quelli previsti
8. Perdite accettate oltre x% sul prezzo di vendita

**[DA CHIARIRE]** Le soglie "x%" dei punti 3, 6, 7, 8 non sono indicate.

### A3. Alert oggi classificati male, da riclassificare

Rilevati nel Riepilogo della commessa 24.0002 FERRARI.

| # | Alert | Oggi | Deve diventare |
|---|---|---|---|
| A3.1 | Fatturato oltre il valore recuperabile | Critico | Non critico **[DA CHIARIRE: livello non indicato; ATTENZIONE?]** |
| A3.2 | Perdita SAL accettata (€ 5.000,00) | Critico | ATTENZIONE |
| A3.3 | Ritenute da sbloccare | — | ATTENZIONE |
| A3.4 | Commessa finita ma "data di fine effettiva" non compilata | Critico | Non critico **[DA CHIARIRE: vedi sotto]** |
| A3.5 | Dati previsionali incompleti ("Data di inizio effettivo", "Data di fine prevista" non compilate) | Critico | INCOMPLETO |
| A3.6 | "Avanzamento più lento del tempo" / "Cantiere finito con residuo lavori" | Critico | Non critico se la commessa è appena stata inserita e ha solo i dati di anagrafica |

Note:

- A3.2 e A2.8 insieme: *(mia lettura)* la perdita SAL accettata è ATTENZIONE finché resta sotto x% del prezzo di vendita, CRITICA oltre.
- A3.4: l'originale chiede "ma poi come fa a sapere che la commessa è finita?". Va capito con quale criterio il programma considera finita la commessa quando la data manca.

### A4. Comportamenti anomali degli alert

1. **Commessa appena inserita già in alert critico.** Dopo aver inserito una commessa in anagrafica, entrando per verificarne la sostenibilità (prima ancora di compilare i dati storici) si trova già un alert critico. Non deve succedere.
2. **"Cantiere finito con residuo lavori" sulla commessa "test marcella".** L'alert compare e non se ne capisce il motivo: da verificare.

### A5. Proposta: ore dal Gantt di commessa

Prendere le ore previste dal Gantt di commessa, così da avere le ore per ogni fase di lavoro (prevedendo anche il numero di uomini). Permetterebbe di capire se il cantiere rispetta i tempi e in quale fase è stato commesso l'errore.

**[DA CHIARIRE]** Nell'originale è un "NB" posto come domanda: è da fare in questa revisione o è un'idea per il futuro?

---

## B. Riepilogo commessa: grafico e numeri

1. **Perdite SAL accettate in rosso.** Il valore deve essere visualizzato in rosso. *(mia lettura: riguarda il colore del valore, mentre il livello dell'alert resta ATTENZIONE come da A3.2.)*
2. **Diagramma più compresso.**
3. **Parte tratteggiata (previsione) solo se la commessa non è finita.** Se la commessa è finita il grafico si ferma all'effettivo.
4. **Scritte sopra il grafico coerenti con lo stato.** Esempio: se la commessa è finita non deve comparire un "utile a commessa finita" previsionale.
5. **Tabella numeri del grafico da controllare.** Nella commessa "test marcella" il totale è 36.000 anziché 40.000; stesso problema per le ore e per il totale.

---

## C. Costi diretti

1. Le voci di costo dell'APP dentro "costi diretti" devono poter essere create dall'azienda: righe vuote da compilare liberamente, perché dipendono da come l'azienda costruisce il costo orario.

---

## D. Anagrafica commesse

1. **L'eliminazione delle commesse sembra non funzionare.** Da verificare.

---

## E. Dashboard direzionale

Impostazione: da un lato gli obiettivi fissati a inizio anno, dall'altro a che punto si è.

1. **Redditività**: richiesta (in % e in cifra) a confronto con effettiva (in % e in cifra).
2. **Rientro bancario**, tre valori:
   - desiderato, in cifra ROSSA
   - effettivo, in cifra VERDE
   - quello che avrebbe dovuto essere sulle commesse eseguite e finite, in cifra GRIGIA
3. **Semaforo di portafoglio**: cerchio verde / ambra / rosso in base agli alert (critico = rosso, attenzione = ambra, in linea = verde).
4. **Perdita o utile effettivo delle commesse finite**, con filtro cliccabile per vedere solo quelle commesse.
5. **Perdita o utile a finire delle commesse in corso**, con filtro cliccabile per vedere solo quelle commesse.

---

## F. Dashboard di analisi: "Autopsia delle commesse"

Sezione dedicata e nascosta.

1. **Verifica delle cause di perdita.** Evidenziare gli errori commessi più spesso che hanno portato a commesse in perdita o sotto i parametri richiesti, per imparare dagli errori.
2. **Report dell'analisi.** Esempi di cause:
   - tempi sottostimati sul contratto sottoscritto rispetto alla sostenibilità
   - costi dimenticati in preventivazione
3. **Alert predittivo sulle nuove commesse.** Esempio: "ATTENZIONE: in questa nuova commessa sono presenti 3 condizioni che in passato hanno generato errori ricorrenti."
4. **Scelta proposta all'utente**: "Vuoi mantenere l'offerta o simulare la sostenibilità con l'esperienza storica?"
5. **Evidenziare in grassetto** il valore della sostenibilità che in passato ha prodotto perdite.

**[DA CHIARIRE]** Nell'originale la frase del punto 4 termina con "ESPERIENZA STORICA FIDA": non è chiaro cosa significhi "FIDA".
**[DA CHIARIRE]** "Nascosta": visibile solo a certi utenti, o raggiungibile da un menu secondario?

---

## Riepilogo dei punti da chiarire

1. A1: gli alert ATTENZIONE sono davvero "tutti gli altri"?
2. A2: valori delle soglie x% (punti 3, 6, 7, 8).
3. A3.1: livello di "Fatturato oltre il valore recuperabile".
4. A3.2 / A2.8 / B1: conferma della lettura sulla perdita SAL accettata (attenzione sotto soglia, critica sopra, valore comunque in rosso).
5. A3.4: come si stabilisce che una commessa è finita se manca la data di fine effettiva, e a che livello va l'alert.
6. A5: ore dal Gantt, ora o in futuro?
7. F: significato di "FIDA" e di "sezione nascosta".

## Risposte dei punti da chiarire

1. A1: si, ignora il punto di domanda
2. A2: Queste quantità devono essere impostabili dall'azienda
3. A3.1: livello di "Fatturato oltre il valore recuperabile" è un allert di attenzione, non critico
4. A3.2 / A2.8 / B1: non mi è assolutamente chiaro quale sia il pezzo mancante
5. A3.4: c'è un flag che dice che è finita impostabile da utente e il senso è che se è flaggata come finita ma non ha data di fine c'è qualcosa che non va, l'allert va a livello attenzione.
6. A5: fallo
7. F: per ora ignora la dashboard di analisi, per la dashboard direzionale invece rimuovi il contenuto e sostituiscilo competamente con quello che è descritto in questo documento

## Ordine di lavoro proposto

1. **Bug** (D1, A4.1, A4.2, B5): eliminazione commesse, alert critico su commessa nuova, alert e totali errati su "test marcella".
2. **Riclassificazione alert** (A1, A2, A3): tre livelli e spostamento degli alert.
3. **Grafico del Riepilogo** (B1–B4).
4. **Voci di costo libere** (C1).
5. **Dashboard direzionale** (E).
6. **Autopsia delle commesse** (F) ed eventuale Gantt (A5): funzionalità nuove, le più corpose.
