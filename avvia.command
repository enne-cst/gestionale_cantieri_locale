#!/bin/bash
# FIDA EDILE - Gestione Cantieri: avvio su macOS.
#
# Se al doppio clic non succede nulla o compare "permessi insufficienti", il file ha perso il
# permesso di esecuzione (succede sempre quando viene copiato da Windows, da una chiavetta o da uno zip).
# Si sistema UNA SOLA VOLTA cosi': apri Terminale, scrivi  chmod +x  seguito da uno spazio, trascina
# questo file nella finestra del Terminale e premi Invio. Vedi anche LEGGIMI-MAC.txt.
cd "$(dirname "$0")" || exit 1

# La finestra non deve mai chiudersi da sola: i messaggi devono restare leggibili.
attendi() {
  echo ""
  echo "  Premi Invio per chiudere questa finestra."
  read -r _
}

# Node.js installato con Homebrew, dal sito nodejs.org o con nvm: Finder non lo mette nel PATH.
export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin:/opt/local/bin:/usr/bin:/bin"
if [ -d "$HOME/.nvm/versions/node" ]; then
  for d in "$HOME"/.nvm/versions/node/*/bin; do PATH="$d:$PATH"; done
  export PATH
fi

# Porta: 8765, oppure quella indicata con --porta
PORTA=8765
precedente=""
for argomento in "$@"; do
  if [ "$precedente" = "--porta" ]; then PORTA="$argomento"; fi
  precedente="$argomento"
done

echo ""
echo "  FIDA EDILE - Gestione Cantieri"
echo "  ------------------------------"
echo "  Cartella:  $(pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js NON risulta installato su questo Mac."
  echo ""
  echo "  Senza Node.js i dati NON possono essere salvati nella cartella dell'app:"
  echo "  restano dentro il browser di questo Mac (modalita' file) e non sono"
  echo "  condivisibili con gli altri computer."
  echo ""
  echo "  Per avere l'archivio nel file data/database.json installa Node.js"
  echo "  (gratuito, versione LTS) da https://nodejs.org e riapri questo file."
  echo ""
  echo "  Intanto apro l'app in modalita' file."
  open "$(pwd)/app/index.html"
  attendi
  exit 0
fi

echo "  Node.js:   $(node -v)  ($(command -v node))"
echo "  Archivio:  $(pwd)/data/database.json"

# La cartella deve essere scrivibile: su dischi di sola lettura, su alcune cartelle di rete o
# se macOS non ha concesso a Terminale l'accesso a Scrivania/Documenti/iCloud il salvataggio fallirebbe.
if ! mkdir -p data 2>/dev/null || ! touch data/.prova-scrittura 2>/dev/null; then
  echo ""
  echo "  IMPOSSIBILE SCRIVERE nella cartella 'data'."
  echo ""
  echo "  - se macOS ha chiesto il permesso di accedere ai file, concedilo e riprova"
  echo "    (Impostazioni di Sistema -> Privacy e sicurezza -> File e cartelle -> Terminale);"
  echo "  - se la cartella e' su un disco di sola lettura o su una chiavetta, copiala"
  echo "    prima nella cartella Inizio del Mac;"
  echo "  - se e' su iCloud Drive, spostala in una cartella locale."
  attendi
  exit 1
fi
rm -f data/.prova-scrittura

echo ""
echo "  Server locale in avvio: lascia aperta questa finestra (Ctrl+C per chiudere)."
echo "  Se il browser mostra 'impossibile connettersi', attendi un secondo e ricarica la pagina."
( sleep 1; open "http://localhost:$PORTA" ) &
node server.js "$@"
attendi
