# Transcriure els vídeos del cercador de frases des de la Mac mini

Des dels servidors de GitHub, YouTube no deixa baixar els vídeos («Sign in to confirm you're not a bot») si no hi ha
galetes al secret `YTDLP_COOKIES`, i les galetes caduquen. Des de la Mac mini, que és una connexió de casa, no cal:
s'hi transcriuen els vídeos del canal que falten i es pugen a `master`. El wiki es publica sol.

Es fa **un cop** per posar al dia tots els vídeos d'abans. Després, cada partida nova surt també a YouTube i es pot
tornar a fer igual (són les mateixes ordres: només fa els que falten). Vegeu la secció «Frases» del `CLAUDE.md`.

## Prompt per al Claude Code de la Mac mini

Copia això sencer a Claude Code a la Mac mini:

> Segueix les instruccions de `deploy/macmini/FRASES.md` del repositori https://github.com/Divas-Tragonas/wiki
> (descarrega-te-les amb `curl -fsSL https://raw.githubusercontent.com/Divas-Tragonas/wiki/master/deploy/macmini/FRASES.md`
> si encara no tens el clon de treball). Fes tots els passos de la secció «Passos», en ordre, sense saltar-te les
> comprovacions. Necessitaràs la clau d'AssemblyAI: demana-me-la i no l'escriguis mai en cap fitxer del repositori
> ni la posis en cap commit. Si un pas falla i no és un dels casos de «Si alguna cosa falla», atura't i explica'm
> què ha passat. Al final, digues-me quins vídeos s'han transcrit, quins no i per què, i l'enllaç del commit.

## Passos

Treballa com un usuari normal (no `root` ni `missions`). **No facis servir el clon que actualitza l'autofetch** (el
de l'API): un commit allà faria que l'autofetch i `update.sh` es trobessin canvis locals. Fes servir un clon a part,
`~/wiki-frases`.

1. **Programes** (Ubuntu): cal Python 3 amb `venv`, ffmpeg, git i Node (ja hi és per a l'API; yt-dlp el fa servir
   per resoldre els reptes de YouTube).
   ```bash
   sudo apt-get update && sudo apt-get install -y python3-venv ffmpeg git
   node --version   # ha de sortir una versió (22.x)
   ```

2. **Clon de treball** (si ja existeix, posa'l al dia):
   ```bash
   if [ -d ~/wiki-frases ]; then git -C ~/wiki-frases pull --ff-only origin master; \
   else git clone https://github.com/Divas-Tragonas/wiki.git ~/wiki-frases; fi
   cd ~/wiki-frases
   python3 -m venv ~/.venv-frases
   ~/.venv-frases/bin/pip install --upgrade -r scripts/nova-sessio/requirements.txt
   ```

3. **Clau d'AssemblyAI**: demana-la a la persona (és a assemblyai.com → API Keys; la mateixa del secret
   `ASSEMBLYAI_API_KEY` del repositori). Només a la variable d'entorn de la sessió, mai en un fitxer del repositori:
   ```bash
   read -rsp "Clau d'AssemblyAI: " ASSEMBLYAI_API_KEY && export ASSEMBLYAI_API_KEY && echo
   ```

4. **Què falta** (no gasta res):
   ```bash
   ~/.venv-frases/bin/python scripts/frases/frases.py pendents
   ```
   Ha de sortir la llista dels vídeos del canal que encara no són a `frases/` (uns 10 la primera vegada). Si surt
   buida, no hi ha res a fer: digues-ho i acaba.

5. **Prova barata** amb els 2 primers minuts d'un vídeo (uns cèntims), per veure que YouTube deixa baixar i que la
   clau funciona. Fes servir l'enllaç (`url`) del primer vídeo de la llista del pas 4:
   ```bash
   ~/.venv-frases/bin/python scripts/frases/frases.py transcriu --url "<url del pas 4>" --minuts 2 --carpeta /tmp/prova-frases
   head -c 600 /tmp/prova-frases/*.json; rm -rf /tmp/prova-frases
   ```
   Ha d'acabar amb «✓ … frases» i el fitxer ha de tenir frases amb text en català que tingui sentit.

6. **Tots els que falten** (una o dues hores; 3 vídeos alhora). Com que tarda, engega-ho de manera que no s'aturi si
   es tanca la sessió, i ves mirant el registre:
   ```bash
   cd ~/wiki-frases
   nohup ~/.venv-frases/bin/python scripts/frases/frases.py transcriu --pendents > ~/frases.log 2>&1 &
   tail -f ~/frases.log   # surt una línia «✓ <id>: … frases» per cada vídeo acabat; al final, «N de M vídeo(s) transcrits»
   ```
   Si algun vídeo falla, els altres continuen i es desen igualment.

7. **Comprova** que el wiki es construeix amb les frases noves (si falla, diu quin fitxer):
   ```bash
   cd ~/wiki-frases && npm ci --no-audit --no-fund && npm test -w @mina/frases && npm run build
   ```

8. **Puja-ho a `master`**:
   ```bash
   cd ~/wiki-frases
   git add frases
   git -c user.name="Mac mini" -c user.email="macmini@users.noreply.github.com" \
     commit -m "Frases: $(git diff --cached --name-only | wc -l) vídeo(s) transcrit(s) des de la Mac mini"
   git pull --rebase origin master && git push origin HEAD:master
   ```
   Per pujar cal estar identificat a GitHub. Si `git push` demana usuari o diu que no té permís, fes servir la CLI de
   GitHub (`sudo apt-get install -y gh`), `gh auth login` (GitHub.com → HTTPS → «Login with a web browser»): dona un
   codi que la persona ha d'entrar a https://github.com/login/device amb un compte que pugui escriure al repositori.
   Després `gh auth setup-git` i torna a fer el `git push`.

9. **Publicació**: el push engega sol el workflow «Deploy to GitHub Pages». En un parell de minuts, a
   https://divas-tragonas.github.io/wiki/frases/ hi han de sortir tots els vídeos (el resum de sota del cercador diu
   quants n'hi ha).

## Si alguna cosa falla

- **«Sign in to confirm your age»**: el vídeo està marcat per a majors d'edat (passa amb els dos de «GERMANS») i cal
  galetes d'un compte de YouTube major d'edat. Des d'un ordinador amb navegador: inicia sessió a YouTube en una finestra
  privada, exporta les galetes en format Netscape (extensió «Get cookies.txt LOCALLY»), tanca la finestra sense tancar
  la sessió i copia el fitxer a la Mac mini (p. ex. `~/youtube-cookies.txt`, mode 600). Després torna a fer el pas 6
  amb `YTDLP_COOKIES_FILE=~/youtube-cookies.txt` davant de l'ordre (només farà els que encara falten). Si ara no hi ha
  galetes, continua sense aquests vídeos: puja els altres i digues quins han quedat.
- **«Sign in to confirm you're not a bot»** també des de la Mac mini: el mateix remei de les galetes.
- **Error d'AssemblyAI** (clau incorrecta o sense saldo): no continuïs; digues-ho.
- **No queda espai al disc**: cada vídeo ocupa uns centenars de MB mentre es transcriu (a `/tmp`, i s'esborra en
  acabar). Prova amb `--parallel 1`.
- **El build falla per un fitxer de `frases/`**: no l'arreglis a mà; esborra aquell fitxer, torna a fer el pas 6 (el
  tornarà a transcriure) i digues-ho.
