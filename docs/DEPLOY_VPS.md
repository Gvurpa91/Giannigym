# Mettere GianniGym online su un VPS

Alla fine di questa guida hai l'app raggiungibile a `https://gym.tuodominio.it`, con login
tramite passkey (Face ID, Touch ID, impronta) e dati sincronizzati tra telefono e computer.
Tempo richiesto: circa mezz'ora, più l'attesa del DNS.

Cosa serve:

- **Un VPS Linux** sempre acceso. Basta 1 vCPU, 2 GB di RAM, 20 GB di disco. Ubuntu 24.04 è
  la scelta più semplice. Fornitori comuni: Hetzner, Contabo, OVH, DigitalOcean, Netcup. I
  prezzi partono da pochi euro al mese; controllali sul sito del fornitore.
- **Un nome a dominio** che puoi configurare, oppure un sottodominio gratuito (DuckDNS,
  FreeDNS). Le passkey sono legate al nome esatto: sceglilo prima di creare i profili, perché
  cambiarlo dopo invalida tutti i login.
- Un computer da cui collegarti in SSH al VPS.

> Tutto quello che segue va eseguito **sul VPS**, dopo esserti collegato con
> `ssh root@IP_DEL_VPS`.

## 0. Se usi Oracle Cloud "Always Free" (0 €)

Oracle regala a tempo indefinito una macchina ARM (shape Ampere A1). Nel 2026 il limite gratuito
è di 2 OCPU e 12 GB di RAM in totale: una istanza da **1 OCPU e 6 GB** è più che sufficiente.
Differenze rispetto a un VPS normale, da tenere presenti mentre segui la guida:

- **Registrazione**: https://www.oracle.com/cloud/free/. Chiede una carta ma non addebita
  nulla finché resti nei limiti gratuiti. La "home region" (scegli **Milan** o **Frankfurt**) non
  si cambia più dopo.
- **Creazione**: Compute → Instances → Create instance. Image **Ubuntu 24.04** (aarch64),
  shape **Ampere → VM.Standard.A1.Flex** con 1 OCPU e 6 GB, IP pubblico assegnato. In "Add SSH
  keys" scegli **Generate a key pair** e scarica la chiave privata: è l'unico modo per entrare.
  Se compare "Out of host capacity", riprova più tardi o cambia availability domain.
- **Accesso**: l'utente è `ubuntu`, non `root`, con la chiave scaricata:
  `ssh -i ~/Downloads/ssh-key-XXXX.key ubuntu@IP` (su Windows funziona uguale in PowerShell;
  se la chiave viene rifiutata per permessi troppo aperti, su Mac/Linux `chmod 600` sul file).
  Tutti i comandi della guida vanno preceduti da `sudo`, oppure entra una volta con `sudo -i`.
- **Firewall, due livelli.** Oracle blocca tutto tranne SSH sia nella rete virtuale sia dentro
  la macchina, e `ufw` non basta:
  1. Nel pannello: Networking → Virtual cloud networks → la tua VCN → Security Lists →
     Default Security List → **Add Ingress Rules**. Aggiungi tre regole con Source
     `0.0.0.0/0`: TCP porta 80, TCP porta 443, UDP porta 443.
  2. Dentro la macchina, al posto dei comandi `ufw` della sezione 2:
     ```bash
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```
- **Inattività**: Oracle si riserva di recuperare le istanze gratuite inattive. Usare l'app
  regolarmente basta; in ogni caso tieni il backup della cartella `data` (sezione 7): con quello
  ricrei tutto altrove in dieci minuti, mantenendo lo stesso dominio e quindi le stesse passkey.

## 1. DNS

Nel pannello del tuo dominio crea un record **A** che punti `gym.tuodominio.it` all'indirizzo
IPv4 del VPS (e un record **AAAA** se il VPS ha anche IPv6). Fallo subito, così mentre installi
il resto il DNS si propaga. Verifica da qualsiasi computer:

```bash
nslookup gym.tuodominio.it
```

Deve rispondere con l'IP del VPS.

## 2. Docker

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
docker compose version      # deve stampare una versione 2.x o superiore
```

Apri le porte necessarie se il VPS ha un firewall (Ubuntu usa `ufw`; molti fornitori hanno
anche un firewall nel pannello web, da aprire allo stesso modo; su Oracle vedi la sezione 0):

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw enable
```

## 3. Scarica GianniGym

```bash
git clone https://github.com/Gvurpa91/Giannigym /opt/giannigym
cd /opt/giannigym
cp .env.example .env
nano .env
```

Nel file `.env` imposta queste righe (sostituisci il dominio con il tuo; le altre righe
puoi lasciarle come sono):

```ini
RP_ID=gym.tuodominio.it
ORIGIN=https://gym.tuodominio.it
WEB_PORT=8080
WEB_BIND=127.0.0.1
DOMAIN=gym.tuodominio.it
RP_NAME=GianniGym
```

`WEB_BIND=127.0.0.1` fa sì che la porta 8080 senza HTTPS sia raggiungibile solo dall'interno
del server: dall'esterno si passa unicamente da Caddy, sulla 443.

## 4. Avvia

```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build
```

La prima volta impiega qualche minuto: compila il frontend, scarica le immagini degli
esercizi (circa 140 MB) e Caddy richiede il certificato a Let's Encrypt. Controlla:

```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml ps
docker compose -f docker-compose.yml -f docker-compose.caddy.yml logs caddy | tail -20
curl -s https://gym.tuodominio.it/api/health
```

L'ultimo comando deve rispondere `{"ok":true,...}`. Se Caddy segnala errori sul certificato,
quasi sempre il DNS non è ancora propagato o le porte 80 e 443 sono chiuse: sistema e riavvia
con `docker compose ... restart caddy`.

## 5. Primo profilo e installazione sul telefono

1. Apri `https://gym.tuodominio.it` da Safari sull'iPhone.
2. Tocca **Crea profilo**, scegli un nome e conferma con Face ID. Quella è la tua passkey.
3. Condividi → **Aggiungi alla schermata Home**: da lì in poi si apre come un'app.
4. Sul computer apri lo stesso indirizzo e accedi con la stessa passkey (tramite iCloud
   Keychain compare da sola, oppure scansioni il QR con il telefono). Vedrai gli stessi
   allenamenti.

Come funziona la sincronizzazione: ogni modifica parte verso il server dopo circa un secondo
e mezzo e viene scaricata all'apertura dell'app su un altro dispositivo. Se sei offline resta
in attesa e parte alla riconnessione. Vince l'ultimo salvataggio.

## 6. Chiudi le iscrizioni e diventa amministratore (consigliato)

Finché non lo fai, chiunque trovi l'indirizzo può crearsi un profilo. Dopo aver creato il tuo:

```bash
grep -o '"id":"[^"]*"' /opt/giannigym/data/db.json | head
```

Copia il tuo id, poi in `.env` aggiungi:

```ini
ADMIN_UIDS=il_tuo_id
INVITE_ONLY=1
```

e riavvia:

```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d
```

Da quel momento in Impostazioni compare la **dashboard admin**, da cui generi i codici invito
per far entrare chi vuoi tu. I profili già creati continuano a funzionare.

## 7. Backup

Tutto sta nella cartella `/opt/giannigym/data`: profili, chiavi pubbliche delle passkey,
allenamenti di ciascun utente, chiave di sessione. Ci sono tre livelli di protezione.

1. **Copia notturna sul server.** `scripts/backup.sh` crea un archivio compresso di `data`,
   ne verifica la leggibilità e tiene gli ultimi 14 in `/opt/giannigym/backups`, con un link
   `latest.tgz` al più recente. Lo pianifica ogni notte `scripts/server-setup.sh` (sezione 8);
   a mano:
   ```bash
   giannigym-backup
   ```
   Protegge da un aggiornamento andato male o da un file rovinato, **non** dalla perdita
   dell'intero server.
2. **Copia fuori dal server**, ogni tanto, dal tuo computer:
   ```bash
   scp -i <chiave> opc@<IP>:/opt/giannigym/backups/latest.tgz ~/Desktop/
   ```
   (Il file è leggibile solo da root: se `scp` risponde "Permission denied", sul server esegui
   prima `sudo cp /opt/giannigym/backups/latest.tgz /home/opc/ && sudo chown opc /home/opc/latest.tgz`
   e copia `/home/opc/latest.tgz`, poi cancellalo.)
3. **Backup dall'app.** Ogni utente può esportare i propri dati da Impostazioni → Esporta backup.
   Su iPhone si apre il foglio di condivisione: scegli "Salva in File" o iCloud. Se non esporti
   da 30 giorni, la Home lo ricorda con una scheda.

Per ripristinare un archivio: ferma l'app, sostituisci `data`, riavvia.
```bash
cd /opt/giannigym && sudo docker compose -f docker-compose.yml -f docker-compose.caddy.yml down
sudo mv data data.old && sudo tar -xzf backups/latest.tgz
sudo docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d
```

## 8. Aggiornare

**Una volta sola**, dopo aver scaricato una versione che contiene `scripts/server-setup.sh`:

```bash
cd /opt/giannigym && git pull
sudo sh scripts/server-setup.sh
```

Lo script installa due comandi, pianifica il backup notturno alle 03:17 (recuperato al riavvio
se il server era spento) e attiva gli aggiornamenti di sicurezza automatici del sistema
operativo: `dnf-automatic` su Oracle Linux, `unattended-upgrades` su Ubuntu. Si può rilanciare
senza problemi.

**Da quel momento**, per aggiornare GianniGym basta:

```bash
giannigym-update
```

Senza `sudo` davanti: il comando chiede da solo i permessi. Su Oracle Linux `sudo giannigym-update`
risponde "command not found", perché lì `sudo` non cerca nella cartella `/usr/local/bin`.

Il comando fa nell'ordine:
1. un backup di `data/`;
2. scarica il codice nuovo;
3. ricostruisce e riavvia l'app, con Caddy se nel `.env` c'è `DOMAIN`;
4. aspetta che l'API risponda;
5. cancella le immagini Docker vecchie per non riempire il disco.

Se non c'è niente di nuovo si ferma subito. `giannigym-update --force` ricostruisce comunque.
`giannigym-backup` fa solo il backup.

Gli aggiornamenti del kernel diventano attivi solo al riavvio: ogni tanto esegui `sudo reboot`.
L'app ripartirà da sola.

I dati in `data/` e i certificati nel volume di Caddy non vengono toccati.

## Problemi frequenti

| Sintomo | Causa probabile | Rimedio |
|---|---|---|
| Il browser dice "connessione non sicura" | Caddy non ha ancora il certificato | DNS non propagato o porte 80/443 chiuse: controlla `logs caddy` |
| Il pulsante passkey non compare o fallisce | `RP_ID`/`ORIGIN` diversi dall'indirizzo nel browser | Devono coincidere esattamente con il dominio in barra, con `https://` in `ORIGIN` |
| Dal telefono vedi solo la modalità ospite | Stai aprendo `http://IP:8080` | Usa sempre `https://gym.tuodominio.it` |
| Le animazioni degli esercizi mancano | Download dei media fallito al primo avvio | `docker compose ... up media` e poi riavvia `web` |
| Hai cambiato dominio e nessuno riesce a entrare | Le passkey erano legate al vecchio nome | Si ricreano i profili: per questo il dominio va scelto prima |

Per il resto (notifiche, Coach AI opzionale, più utenti) vale la guida generale in
[SELF_HOSTING.md](SELF_HOSTING.md).
