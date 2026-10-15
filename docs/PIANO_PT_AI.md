# openGym → Personal Trainer digitale con AI — Analisi e piano (prima consegna)

Stato: **bozza per approvazione**. Nessuna modifica al codice applicativo è stata fatta.
Base analizzata: `emilfunk/opengym` @ `678bf5b` (merge del branch `ai-enablement` di alexpcosta, 2026-08-01),
fork di `DuarteSantos8/openGym`.

Convenzioni usate nel documento:
`[VERIFICATO]` letto nel codice o in documentazione ufficiale · `[INFERITO]` deduzione da dati verificati ·
`[INCERTO]` non ho dati sufficienti, va controllato.

---

## 0. Sintesi per decidere

1. **Il fork ha già circa il 60 % delle funzionalità richieste** ai punti 2 e 4: questionario in 6 passi,
   generazione piano con validatore rigoroso, alternative via "refine" in linguaggio naturale, review
   dello storico con proposte di modifica discrete approvate una per una, snapshot e revert, consent
   per profilo, cap giornalieri, allowlist dei dati inviati al modello. `[VERIFICATO]` È lavoro di buona
   qualità e va **esteso, non riscritto**.
2. **Mancano del tutto**: libreria con video, tecnica, errori, varianti e timeline sincronizzata (punto 1);
   coach durante l'allenamento con Q&A grounded (punto 3, oggi esplicitamente fuori scope nel fork);
   export/cancellazione account server-side; gestione strutturata di dolore, regressi, recupero.
3. **L'architettura attuale non è portabile su Vercel così com'è.** Il backend è un processo Node
   long-running con stato in memoria (challenge WebAuthn, timer di recupero, presenza live, due loop
   `setInterval` per promemoria e review programmate) e storage su file JSON. L'AI gira come
   **sottoprocesso del Claude Agent SDK** autenticato con un *setup-token di Claude Code* (credenziale
   da abbonamento, non API key) e con sandbox utente non privilegiato. Su serverless niente di questo
   funziona. `[VERIFICATO]`
4. **Decisione architetturale richiesta** (§3): **Opzione A** evolvere lo stack self-hosted su un VPS
   aggiungendo Postgres; **Opzione B** migrare a Supabase (Auth + Postgres + RLS) e Vercel (PWA +
   funzioni AI), riscrivendo il backend. La mia raccomandazione è **B con riserve esplicite**: è la
   direzione che hai indicato e il modello multi-utente con RLS è più solido, ma costa una riscrittura
   del backend (~600 righe di server + modulo coach), la perdita delle passkey come login primario
   `[INCERTO]`, e **non è gratis** in uso reale (§8).
5. **Licenze media**: le GIF/immagini del dataset sono **© Gym visual, redistribuite nel dataset "con
   permesso" a 180×180**; il README del dataset dice di ottenere una propria licenza prima di
   riutilizzarle. Servire quei file da un'app ospitata pubblicamente è una redistribuzione. Va risolto
   prima del punto 1 (§6). `[VERIFICATO]`
6. **Baseline test**: frontend 207/207 verdi, build ok, 11 locali sincronizzati. API: 51/56; i 5 rossi
   sono fixture con date fisse (2026-07-20) uscite dalla finestra di 12 settimane. Fix banale, va nella
   PR 0. `[VERIFICATO]`

Le decisioni che servono da te sono elencate in §10.

---

## 1. Architettura attuale

### 1.1 Componenti

| Parte | Tecnologia | Note verificate |
|---|---|---|
| `frontend/` | React 19, Vite 8, React Router 7 (HashRouter), Zustand 5, Vitest | PWA con `manifest.json`, service worker runtime-cache, meta Apple per standalone. Nessun framework CSS; i18n custom 12 lingue (781 chiavi). Build mobile Capacitor opzionale (Android APK; iOS solo via Xcode). |
| `api/` | Node 22, **nessun framework**, `@simplewebauthn/server`, `web-push`, Claude Agent SDK, Codex CLI, zod | ~600 righe in `server.js` + modulo `coach/` (~1.800 righe). Routing a mappa `METHOD /path`. |
| Storage | File JSON in `./data` | `db.json` (utenti, credenziali passkey, sottoscrizioni push, inviti), `state-<uid>.json` (**tutto lo stato utente in un blob**, max 5 MB, ultimo `_ts` vince), `coach/<uid>.json` (job, proposta pendente, storico), `coach.json` (config istanza, credenziale cifrata AES-GCM con chiave derivata dal secret di sessione). |
| Auth | Passkey/WebAuthn, cookie firmato HMAC, versione sessione per logout globale | Niente password, niente email. RP_ID legato all'host. |
| `web/` | nginx | Serve build + media, proxy `/api`. Single origin (necessario per passkey). |
| Media esercizi | 1.324 esercizi, img+gif scaricate al primo avvio da `hasaneyldrm/exercises-dataset` (~140 MB) | Istruzioni testuali in 10 lingue nel bundle. |

### 1.2 Modello dati (nel blob `state`) `[VERIFICATO]`

```
S = { unit, restSec, sound, keepAwake, lang, theme, accent, body, targetW, effort,
      bodyweight[{d,w}], routines[{id,name,emoji,prog,ex[{id,sets,reps|sec|min+speed,weight,prog,inc,repsMin,sg}]}],
      week{0..6 → routineId}, dayPlan{iso → routineId|'rest'}, exWeights{exId → {w,d}},
      workouts[{id,d,start,end,routineId,name,bw,vol,prs[],rating?,note?,entries[{id,target,topW,sets[{w,r|sec|min,speed,done,rir|rpe}]}]}],
      customEx[{id,n,bp,desc}], reminder{on,time,tz}, coach{consent,profile,cadence,lastReview,log[],snapshots[]} , active }
```

Il motore di progressione (`lib/progression.js`: linear, Greyskull, double, time, deload) e la lettura
dello storico (`lib/history.js`) sono funzioni pure con test. Questa è la parte più preziosa da preservare.

### 1.3 Il Coach AI esistente (mappa sui tuoi requisiti)

| Requisito tuo | Stato nel fork | Dove |
|---|---|---|
| 2. Questionario (obiettivo, livello, giorni, durata, attrezzatura, preferenze) | ✅ 6 schermate; manca "preferenze/esercizi non graditi" come dato strutturato (è testo libero) | `views/CoachIntake.jsx` |
| 2. Programma strutturato con serie/rip/recuperi/spiegazioni | ✅ serie, rip, policy progressione, superset, `why` per esercizio e routine. ❌ **recuperi per esercizio** non esistono nel modello (c'è solo `restSec` globale) | `prompts/create.md`, `validate.js` |
| 2. Alternative per attrezzatura mancante / non graditi | ◑ la libreria passata al modello è già filtrata per attrezzatura; le alternative sono solo via refine testuale, non come lista strutturata | `payload.js librarySlice` |
| 2. Validazione con schema rigoroso | ✅ validatore a lista chiusa, risoluzione id contro libreria, un solo round di repair, poi fallimento pulito. **Il validatore è il confine di sicurezza, non il prompt** | `validate.js` |
| 2. Niente prescrizioni mediche | ◑ regola nel prompt (regola 6) ma **nessun controllo meccanico**; nessun disclaimer persistente in UI | `prompts/common.md` |
| 3. Coach durante l'allenamento | ❌ esplicitamente fuori scope ("No live mid-workout chat") | `docs/AI_COACH.md` |
| 4. Analisi storico e aderenza | ✅ stalli, effort RIR/RPE, aderenza, riprogrammazioni, durata vs tempo dichiarato, peso corporeo, copertura muscolare; finestra 12 settimane / 60 sessioni | `payload.js aggregates` |
| 4. Conferma prima di modificare | ✅ proposte inerti fino ad "Apply", snapshot + revert | `lib/coach.js` |
| 4. Dolore, dati mancanti, regressi, recupero | ◑ solo via prompt; nessun flag strutturato "dolore" nel log sessione; nessuna logica di "dati insufficienti → non proporre" | — |
| 5. Chiavi AI solo backend | ✅ (setup-token cifrato, env del job costruito da zero, utente `coach` non privilegiato) | `config.js jobEnv`, `spawn.js` |
| 5. Isolamento dati tra account | ◑ per-file e per-cookie; nessun RLS, nessun test di isolamento | `server.js` |
| 5. Export/cancellazione | ◑ export JSON lato client; "Reset everything" svuota lo stato ma **non cancella l'account né le credenziali** server-side; nessun endpoint `DELETE account` | `views/Settings.jsx` |
| 5. Limiti d'uso AI | ✅ cap giornaliero per profilo e per istanza, single-flight, timeout 5 min | `jobs.js` |
| 5. Gestione errori | ✅ classi d'errore mappate a messaggi utente, dettaglio tecnico solo all'admin | `routes.js`, `coach-api.js` |
| 5. Non memorizzare dati sanitari non necessari | ⚠ il campo "limitations" è testo libero fino a 600 caratteri, sincronizzato e incluso nei backup: è un dato sanitario di fatto | `CoachIntake.jsx` |

### 1.4 Punti deboli strutturali rispetto all'obiettivo

- **Blob unico per utente, last-write-wins**: funziona per un dispositivo alla volta; con più dispositivi
  e con scritture server-side (proposte, coach in allenamento) genera perdite silenziose. Il fork lo sa e
  per questo tiene le proposte in un file separato. `[VERIFICATO]`
- **Stato in memoria** (challenge, presenza, timer, coda job): incompatibile con serverless e con più
  istanze.
- **Credenziale AI = abbonamento Claude Code via setup-token**: adatto a uso personale self-hosted; per
  un servizio ospitato a più utenti serve l'API Anthropic con API key e fatturazione a token. Il modulo
  `claude.js` usa `query()` dell'Agent SDK con `tools: []`, cioè un semplice text-in/JSON-out: la
  sostituzione con una chiamata diretta `messages.create` con structured outputs è lineare. `[VERIFICATO]`
- **Costo del payload**: ogni job di creazione può ricevere l'intera libreria (`library.json`, 126 KB)
  quando l'utente non indica attrezzatura. Stimo 30–45k token di input `[INFERITO]`. Senza prompt
  caching è la voce di costo dominante (§8).
- **Nessun test di isolamento** tra account e nessuna rate-limit HTTP (delegata al reverse proxy per
  scelta).
- **Dati sanitari**: campo libero "limitazioni" sincronizzato e incluso nei payload AI.
- **AGPL v3**: ogni versione modificata esposta come servizio di rete deve pubblicare il sorgente. Vale
  anche per un deploy privato su Vercel se altri utenti vi accedono. `[VERIFICATO]` nel `LICENSE`.

---

## 2. Vincoli iPhone / PWA `[VERIFICATO: documentazione Apple/WebKit nota, non ricontrollata oggi]`

- Installazione da Safari → "Aggiungi a Home". Già supportata (manifest, meta `apple-mobile-web-app-*`,
  icona 180).
- **Web Push su iOS solo per PWA installata** (iOS ≥ 16.4). Oggi le notifiche di fine recupero e il
  promemoria del giorno dipendono dal server: su serverless vanno riprogettate (§3.3).
- **Safari cancella storage script-writable dopo 7 giorni di non uso** per siti non installati; le PWA
  installate sono esenti. La modalità "guest" (solo localStorage) è a rischio: va mostrato un avviso
  esplicito o resa opzionale solo dopo installazione.
- Passkey funzionano su Safari iOS su HTTPS con RP_ID coincidente con l'host: già gestito. Se si passa a
  Supabase Auth, vedi §3.2.
- Video: `<video playsinline>` necessario per non andare a schermo intero; autoplay solo muto. Per
  YouTube embed, l'API IFrame funziona ma non offline e con cookie di terze parti.

---

## 3. Opzioni architetturali

### 3.1 Confronto

| Criterio | **A. Evolvere self-host** (VPS, Docker, Node + Postgres) | **B. Supabase + Vercel** (riscrittura backend) |
|---|---|---|
| Riuso codice backend | Alto: si aggiunge Postgres accanto o al posto dei JSON, si tiene passkey, push, cadence | Basso: `server.js` e `coach/jobs.js` vanno riscritti come funzioni stateless; auth, push, scheduling cambiano |
| Riuso frontend | ~100 % | ~85 %: cambiano `lib/api.js`, `useStore` (sync), login; tutto `lib/*` di dominio resta |
| Auth | Passkey (già fatto) | Supabase Auth: Sign in with Apple / magic link OTP. **Passkey come login primario: `[INCERTO]`**, Supabase le supporta a quanto so solo come MFA; da verificare sulla doc corrente |
| Isolamento dati | Da costruire a mano (query per uid) | **RLS nativo su Postgres**, testabile con due utenti |
| Scheduling (promemoria, review) | `setInterval` nel processo (già fatto) | `pg_cron` su Supabase o Vercel Cron → funzione; stato in tabelle |
| AI | Agent SDK + setup-token (abbonamento), o API key | Solo API key, in funzione server (Vercel Function 300 s max su Hobby) |
| Costo infrastruttura | VPS 5–10 €/mese `[INFERITO, prezzi di mercato]` | Vedi §8: 0 € solo in condizioni molto limitate |
| Uso commerciale | Libero (AGPL) | **Vercel Hobby vieta uso commerciale**; serve Pro |
| Manutenzione | Tua (OS, TLS, backup) | Gestita |
| Rischio operativo | Backup e uptime a tuo carico | Progetto Supabase Free **in pausa dopo 7 giorni di bassa attività** |

### 3.2 Raccomandazione

**Opzione B, con queste condizioni dichiarate**:

1. Supabase in piano **Pro ($25/mese circa, `[VERIFICATO su supabase.com/docs billing: figura riportata
   dalla pagina prezzi; ricontrolla al momento dell'attivazione]`)** appena l'app è usata da qualcuno
   oltre te, o se non vuoi il rischio pausa. In Free il progetto si ferma dopo una settimana di bassa
   attività: per un'app di allenamento usata 3 volte a settimana "qualche richiesta al giorno" basta a
   evitarlo, ma una settimana di vacanza lo mette in pausa e al rientro l'app è giù finché non lo
   riattivi manualmente. `[VERIFICATO: supabase.com/docs/guides/platform/free-project-pausing]`
2. Vercel **Hobby solo per uso personale non commerciale**; Pro se ci sono utenti paganti o se l'app è
   parte di un'attività. `[VERIFICATO: vercel.com/docs/limits/fair-use-guidelines]`
3. **Auth**: Sign in with Apple + magic link come primario; passkey da valutare dopo verifica della doc
   Supabase. Se le passkey sono irrinunciabili → Opzione A.
4. Le chiamate AI stanno in **Vercel Functions** (limite 300 s su Hobby, documentato) e non in Supabase
   Edge Functions, il cui limite di wall-clock non ho verificato `[INCERTO]`. Alternativa valida: tutto
   su Supabase e Vercel solo come CDN statico.

Se preferisci costo zero garantito e massimo riuso, scelgo A e il piano in §9 resta identico salvo PR 1.

### 3.3 Architettura target (Opzione B)

```
iPhone (PWA installata)
   │  HTTPS
   ▼
Vercel ── static build Vite (PWA, SW)
   └── /api/* Functions (Node): ai/plan, ai/review, ai/ask, account/export, account/delete
            │ service-role key (solo qui) + ANTHROPIC_API_KEY (solo qui)
            ▼
Supabase ── Auth (Apple, magic link) ── Postgres + RLS ── Storage (video/poster propri)
            └── pg_cron: promemoria, review programmate, pulizia proposte scadute
Client → Supabase direttamente con anon key + JWT utente per CRUD dati (RLS applica l'isolamento).
```

Principio mantenuto dal fork: **il motore di progressione resta deterministico lato client; l'AI
propone, l'utente conferma, il server valida**. Nessun output AI tocca una tabella senza passare dal
validatore con schema zod (già dipendenza del progetto).

---

## 4. Schema dati proposto (Postgres / Supabase)

Nomi in inglese per coerenza con il codice. Tutte le tabelle utente hanno RLS `user_id = auth.uid()`.
Le tabelle di catalogo sono leggibili da tutti gli autenticati e scrivibili solo da `role = 'editor'`.

```sql
-- ─── Identità ───────────────────────────────────────────────────────────────
create table profiles (
  user_id        uuid primary key references auth.users on delete cascade,
  display_name   text,
  lang           text not null default 'en',
  unit           text not null default 'kg' check (unit in ('kg','lb')),
  prefs          jsonb not null default '{}',      -- theme, accent, restSec, effort, keepAwake…
  ai_consent_version int,                          -- null = nessun consenso
  ai_consent_at  timestamptz,
  role           text not null default 'user' check (role in ('user','editor','admin')),
  created_at     timestamptz not null default now()
);
-- Intake AI: solo campi strutturati. Niente testo libero sanitario (vedi §7).
create table coach_profiles (
  user_id        uuid primary key references profiles on delete cascade,
  goal           text check (goal in ('strength','muscle','general','fatloss','endurance')),
  experience     text check (experience in ('new','returning','regular')),
  days_per_week  int check (days_per_week between 1 and 7),
  preferred_days int[],                            -- 0..6
  session_min    int,
  equipment      text[],                           -- valori della tassonomia esercizi
  disliked_exercise_ids text[],
  liked_exercise_ids    text[],
  constraints    jsonb not null default '[]',      -- lista chiusa: {area:'shoulder', avoid:['overhead']}…
  notes          text,                             -- max 300, non sanitario, non inviato se contiene flag
  updated_at     timestamptz not null default now()
);

-- ─── Catalogo esercizi (contenuto revisionabile) ───────────────────────────
create table exercises (
  id             text primary key,                 -- '0001' dataset, 'cx_…' custom globali
  name           text not null,
  body_part      text not null,
  target_muscle  text,
  secondary_muscles text[],
  equipment      text,
  level          text check (level in ('beginner','intermediate','advanced')),
  source         text not null default 'dataset',  -- dataset | editorial
  is_active      boolean not null default true
);
create table exercise_content (                    -- una riga per versione pubblicata/bozza
  id             bigserial primary key,
  exercise_id    text not null references exercises,
  lang           text not null,
  version        int  not null,
  status         text not null check (status in ('draft','in_review','published','retired')),
  instructions   text[] not null default '{}',     -- passi
  key_points     text[] not null default '{}',     -- punti chiave
  common_errors  jsonb not null default '[]',      -- [{error, fix}]
  variants       jsonb not null default '[]',      -- [{exercise_id, why}]
  safety_notes   text[] not null default '{}',
  author_id      uuid references auth.users,
  reviewer_id    uuid references auth.users,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  unique (exercise_id, lang, version)
);
create table exercise_media (
  id             bigserial primary key,
  exercise_id    text not null references exercises,
  kind           text not null check (kind in ('video','gif','image')),
  provider       text not null check (provider in ('youtube','vimeo','storage','external')),
  url_or_key     text not null,                    -- URL esterno o chiave Storage
  license        text not null,                    -- es. 'CC-BY-4.0', 'own', 'gymvisual-licensed', 'embed-tos'
  attribution    text,
  duration_sec   int,
  status         text not null default 'draft' check (status in ('draft','published','retired')),
  created_at     timestamptz not null default now()
);
create table media_cues (                          -- timeline sincronizzata al video
  id             bigserial primary key,
  media_id       bigint not null references exercise_media on delete cascade,
  t_start_ms     int not null,
  t_end_ms       int,
  kind           text not null check (kind in ('cue','error','phase','breathing')),
  text           text not null,
  lang           text not null
);

-- ─── Programmi ────────────────────────────────────────────────────────────
create table programs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles on delete cascade,
  name           text not null,
  summary        text,
  origin         text not null check (origin in ('manual','ai','import','starter')),
  ai_job_id      uuid,                             -- traccia da quale job nasce
  is_active      boolean not null default false,
  week           jsonb not null default '{}',      -- {"1":"routine_uuid",…}
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create table routines (
  id             uuid primary key default gen_random_uuid(),
  program_id     uuid not null references programs on delete cascade,
  user_id        uuid not null,                    -- denormalizzato per RLS semplice
  name           text not null, emoji text, position int not null,
  progression    text check (progression in ('off','linear','greyskull','double','time')),
  rationale      text                              -- "why" dell'AI o nota utente
);
create table routine_exercises (
  id             uuid primary key default gen_random_uuid(),
  routine_id     uuid not null references routines on delete cascade,
  user_id        uuid not null,
  exercise_id    text not null references exercises,
  position       int not null,
  mode           text not null check (mode in ('reps','time','cardio')),
  sets int, reps int, reps_min int, sec int, minutes int, speed numeric,
  weight numeric, increment numeric, progression text,
  rest_sec       int,                              -- NUOVO: recupero per esercizio
  superset_group text,
  rationale      text,
  alternatives   jsonb not null default '[]'       -- NUOVO: [{exercise_id, reason:'no-equipment'|'dislike'}]
);
create table program_snapshots (                   -- per revert delle modifiche AI
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, program_id uuid not null references programs on delete cascade,
  reason text, payload jsonb not null, created_at timestamptz not null default now()
);

-- ─── Allenamenti ──────────────────────────────────────────────────────────
create table workouts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles on delete cascade,
  routine_id     uuid references routines on delete set null,
  name           text, day date not null,
  started_at     timestamptz not null, ended_at timestamptz,
  body_weight    numeric,
  rating         text check (rating in ('easy','ok','brutal')),
  note           text,
  pain_flag      boolean not null default false,   -- NUOVO: segnalazione dolore (solo booleano + area)
  pain_area      text,                             -- lista chiusa, nessun testo libero
  created_at     timestamptz not null default now()
);
create table workout_sets (
  id             bigserial primary key,
  workout_id     uuid not null references workouts on delete cascade,
  user_id        uuid not null,
  exercise_id    text not null references exercises,
  entry_position int not null, set_index int not null,
  weight numeric, reps int, sec int, minutes int, speed numeric,
  rir numeric, rpe numeric,
  done           boolean not null default false,
  target         jsonb                             -- prescrizione del motore per quella sessione
);
create table body_weights (user_id uuid not null, day date not null, weight numeric not null, primary key (user_id, day));

-- ─── AI ────────────────────────────────────────────────────────────────────
create table ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  kind text not null check (kind in ('create','refine','review','ask')),
  status text not null check (status in ('queued','running','ready','nochange','failed','applied','dismissed','expired')),
  model text, input_tokens int, output_tokens int, cache_read_tokens int, cost_usd numeric,
  error_class text,
  proposal jsonb,                                  -- output validato
  plan_hash text, expires_at timestamptz,
  created_at timestamptz not null default now(), finished_at timestamptz
);
create table ai_usage_daily (user_id uuid, day date, jobs int not null default 0, cost_usd numeric not null default 0, primary key (user_id, day));
create table ai_feedback (job_id uuid references ai_jobs, user_id uuid, accepted text[], rejected text[], created_at timestamptz default now());
```

**RLS (schema, non ancora applicato)**

```sql
alter table workouts enable row level security;
create policy "own rows" on workouts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- idem per profiles, coach_profiles, programs, routines, routine_exercises, program_snapshots,
-- workout_sets, body_weights, ai_jobs, ai_usage_daily, ai_feedback.
alter table exercise_content enable row level security;
create policy "read published" on exercise_content for select using (status = 'published' or exists (select 1 from profiles p where p.user_id = auth.uid() and p.role in ('editor','admin')));
create policy "editors write" on exercise_content for insert with check (exists (select 1 from profiles p where p.user_id = auth.uid() and p.role in ('editor','admin')));
-- ai_jobs: insert/update solo via service role (funzioni server); l'utente legge le proprie righe.
```

**Test di isolamento richiesto in PR 1**: due utenti creati via API, ciascuno inserisce dati, ogni
`select` incrociato deve restituire 0 righe e ogni `update/delete` incrociato deve fallire. Eseguito in
CI contro Supabase locale (`supabase start`).

**Migrazione dal blob**: una funzione `importLegacyState(S)` che prende il JSON esportato oggi
dall'app e lo spalma nelle tabelle. Serve anche come importatore dei backup esistenti.

---

## 5. Flusso AI proposto

| Aspetto | Proposta |
|---|---|
| Provider | API Anthropic Messages (SDK `@anthropic-ai/sdk`, già dipendenza), modello di default `claude-opus-5-5`; opzione `claude-sonnet-5-5` per Q&A in allenamento se vuoi ridurre costi. Decisione tua (§10). |
| Output | **Structured outputs** (`output_config.format` con JSON Schema derivato dagli schemi zod) + validazione zod lato server. Il validatore attuale (`validate.js`) viene portato su zod e **resta il confine**: lista chiusa di tipi di modifica, id risolti contro `exercises`, cap numerici. |
| Prompt | Riuso di `prompts/*.md` (sono buoni). Aggiunte: regola "non valuti postura/esecuzione: non hai visione"; regola "ogni risposta separa `verified` (da `exercise_content` pubblicato) e `ai_suggestion`". |
| Caching | Libreria + prompt di sistema in prefisso stabile con `cache_control`. La libreria è la voce dominante (§8). |
| Filtro libreria | Oltre all'attrezzatura, filtrare per gruppo muscolare e livello e **cappare a ~250 esercizi** per job; il modello può chiederne altri solo via refine. |
| Limiti | `ai_usage_daily` per utente e globale; cap in token e in $ al giorno; timeout 120 s; un job in volo per utente (già così). |
| Coach in allenamento (`ask`) | RAG semplice: il contesto è `exercise_content` pubblicato dell'esercizio corrente + set loggati nella sessione. Risposta con due blocchi tipizzati `{verified:[...], suggestions:[...]}`; il client li rende con etichette diverse. Nessuna frase sulla postura dell'utente: il prompt lo vieta e un test lo verifica con casi avversariali ("come è la mia schiena?"). |
| Dolore | Se `pain_flag` è presente in una sessione della finestra, la review va in **modalità prudente**: può solo ridurre carico/volume o sostituire con variante dalla tabella `variants`, mai aggiungere; aggiunge nota fissa "consulta un professionista". Logica meccanica nel validatore, non nel prompt. |
| Dati mancanti | Se la finestra ha < 3 sessioni o < 2 settimane → `nochange` forzato con `reading` esplicativo; il modello non viene nemmeno chiamato (costo zero). |
| Regressi / recupero | Aggregati nuovi: delta e1RM per esercizio su 4 settimane, giorni di riposo medi tra sessioni, rating "brutal" consecutivi. Soglie documentate in `docs/`. |
| Disclaimer | Testo fisso in intake, in ogni proposta e nel coach: "non è un consiglio medico; nessun risultato è garantito". Nessuna promessa quantitativa nei prompt (regola + test). |

---

## 6. Libreria esercizi: contenuti e licenze

- **Testi del dataset**: MIT → riutilizzabili e modificabili. `[VERIFICATO: README dataset]`
- **Immagini/GIF**: © Gym visual, nel dataset "con permesso" a 180×180, con istruzione di **ottenere una
  propria licenza** prima del riuso e di mantenere l'attribuzione. `[VERIFICATO]` Per il self-host
  personale l'attuale "scarica al primo avvio" resta nella zona grigia che il progetto upstream già
  accetta. Per un'app ospitata: **(a)** licenza Gym visual (costo da verificare `[INCERTO]`), **(b)**
  sostituzione progressiva con media propri o CC, **(c)** niente media per gli esercizi non coperti.
- **Video dimostrativi**: nessuno esiste oggi. Opzioni per esercizio, tracciate nella colonna `license`:
  YouTube/Vimeo via embed ufficiale (nessun download, nessun uso offline, cookie di terze parti; da
  rispettare i ToS embed), oppure file propri/CC su Supabase Storage (1 GB in Free, egress 5 GB/mese
  `[VERIFICATO]`: con video a 480p da ~3 MB sono ~300 clip e ~1.600 visualizzazioni al mese, poi si
  paga o si passa a un CDN).
- **Timeline**: `media_cues` con `t_start_ms`; il player ascolta `timeupdate` e evidenzia il cue attivo.
  Funziona sia con `<video>` nativo sia con YouTube IFrame API (`getCurrentTime`, polling 250 ms).
- **Revisione**: stati `draft → in_review → published → retired`, autore e revisore distinti, diff tra
  versioni in UI editor. L'AI del coach legge **solo** `published`.
- **Carico editoriale**: 1.324 esercizi × (punti chiave, errori, varianti) è lavoro umano. Proposta:
  partire da un **nucleo di 60–80 esercizi fondamentali** completi (quelli che il generatore usa di
  più), e per il resto importare i soli passi del dataset come `published` con flag `source='dataset'`
  e nessun punto chiave/errore. L'AI può **proporre bozze** di punti chiave ed errori (job `draft`), che
  restano `draft` finché un umano non le pubblica: coerente con "ogni contenuto tecnico revisionabile".

---

## 7. Rischi

| # | Rischio | Gravità | Mitigazione |
|---|---|---|---|
| R1 | Riscrittura backend (Opzione B) introduce regressioni in sync/progressione | Alta | Motore e lettura storico restano funzioni pure con i 207 test esistenti; importatore legacy testato sui backup reali; feature flag per rollback a self-host |
| R2 | Licenza media Gym visual per app ospitata | Alta (legale) | Decisione in §10; nel frattempo i media restano "fetch al primo avvio" come upstream e **non vengono caricati su Storage** |
| R3 | AGPL: obbligo di pubblicare il sorgente modificato se l'app è un servizio di rete | Media | Repo pubblico (già lo è); link "Sorgente" in Settings |
| R4 | Dati sanitari: campo libero "limitazioni" + eventuale dolore | Alta (privacy) | Sostituire con lista chiusa `constraints` e `pain_area`; mai inviare al modello testo libero contenente parole chiave mediche; non loggare i payload; cancellazione account reale |
| R5 | Supabase Free in pausa dopo 7 giorni di bassa attività | Media | Pro, oppure `pg_cron` keep-alive (fragile e contro lo spirito del Free); avviso in UI |
| R6 | Vercel Hobby non commerciale; pausa al superamento dei limiti | Media | Pro se commerciale; monitor consumi |
| R7 | Costo AI fuori controllo (libreria intera per job) | Media | Cache del prefisso, filtro/cap libreria, `ai_usage_daily` con cap in $, modello più economico per `ask` |
| R8 | Allucinazioni su tecnica/sicurezza | Alta | Coach risponde solo da `exercise_content` pubblicato; etichette verified/AI; test avversariali su postura e promesse |
| R9 | Perdita passkey con Supabase Auth | Media | Verificare supporto; fallback Apple Sign-In + magic link; se irrinunciabile → Opzione A |
| R10 | iOS: storage evicted in guest mode, push solo da PWA installata | Media | Prompt installazione obbligatorio prima di guest; promemoria via `pg_cron` + Web Push con VAPID in funzione server |
| R11 | Multi-dispositivo: last-write-wins del blob | Media | Risolto dalla normalizzazione (scritture per riga); `active` workout resta locale come oggi |
| R12 | Test API fragili alle date | Bassa | PR 0: date relative a `now` nei fixture |

---

## 8. Costi stimati

### 8.1 Infrastruttura (prezzi riportati da documentazione ufficiale dove indicato; ricontrollare al momento)

| Voce | Free | A pagamento |
|---|---|---|
| Supabase | 500 MB DB, 50k MAU, 1 GB storage, 5 GB egress, 500k invocazioni edge, 2 progetti, **pausa dopo 7 gg bassa attività** `[VERIFICATO supabase.com/docs]` | Pro ~$25/mese, 8 GB DB, no pausa `[riportato nei risultati; conferma su supabase.com/pricing]` |
| Vercel | Hobby: 100 GB trasferimento, funzioni fino a 300 s, **non commerciale**, progetto in pausa se supera `[VERIFICATO vercel.com/docs]` | Pro ~$20/utente/mese `[non verificato oggi]` |
| Dominio + e-mail transazionali Supabase | incluso (limiti e-mail Free bassi `[INCERTO]`) | — |
| Licenza media Gym visual | — | `[INCERTO]` da richiedere |
| **Opzione A (VPS)** | — | 5–10 €/mese `[INFERITO]` |

### 8.2 AI (listino Anthropic, cache del skill `claude-api` al 2026-10-06; i token sono stime `[INFERITO]`)

Ipotesi: libreria completa ~40k token; prompt + storico 12 settimane ~8k; output piano ~4k; Q&A in
allenamento ~5k in / 0,4k out.

| Job | Opus 5.5 ($4/$20 per M, cache read $0.20) senza cache | con cache libreria | Sonnet 5.5 ($2/$10) con cache | Haiku 5.5 ($0.10/$0.50) |
|---|---|---|---|---|
| Creazione/refine piano | ~$0.27 | ~$0.12 | ~$0.06 | ~$0.003 |
| Review settimanale | ~$0.25 | ~$0.10 | ~$0.05 | ~$0.003 |
| Domanda in allenamento | ~$0.03 | ~$0.02 | ~$0.01 | ~$0.0007 |

Profilo d'uso "1 utente, 3 allenamenti/settimana, 1 review/settimana, 5 domande/allenamento, 1 piano/mese":
**~$2–4/mese con Opus 5.5 e cache**, ~$1–2 con Sonnet 5.5, centesimi con Haiku. Con 20 utenti: ×20.
Con filtro libreria a 250 esercizi i costi per piano scendono di circa il 70 %.
Queste cifre vanno **misurate** nella PR dell'adapter leggendo `usage` di ogni risposta e scrivendole in
`ai_jobs`; il fork non le registra oggi (deliberatamente, §5 del suo report).

---

## 9. Piano di implementazione (una PR per volta, ciascuna con test e documentazione)

Ordine pensato per: prima ciò che non dipende dalla decisione infrastrutturale, poi l'infrastruttura,
poi le funzionalità dalla più fondante alla più dipendente.

| PR | Contenuto | Test | Doc |
|---|---|---|---|
| **0** | Baseline: fixture con date relative (5 test API), CI anche per `api` con `npm ci`, questo documento | 56/56 API verdi | `docs/PIANO_PT_AI.md` |
| **1** | Infrastruttura (dopo decisione A/B): schema SQL §4, RLS, `supabase/` con migrazioni, Supabase locale in CI, **test di isolamento tra due account**, importatore `importLegacyState`, Auth (Apple + magic link), nuovo `lib/api.js` e sync per riga | isolamento; importatore su 3 backup di esempio; smoke e2e Playwright su login | `docs/ARCHITETTURA.md`, `docs/SELF_HOSTING.md` aggiornato |
| **2** | Libreria esercizi: tabelle `exercise_content`, `exercise_media`, `media_cues`; import dataset come `published/source=dataset`; filtri per gruppo, attrezzatura, **livello**; scheda esercizio con punti chiave/errori/varianti; nucleo editoriale iniziale 60–80 esercizi | unit su filtri; snapshot UI scheda; RLS editor | `docs/CONTENUTI.md` (workflow redazionale, licenze) |
| **3** | Player video con timeline: `<video>` nativo + adapter YouTube; cue attivo sincronizzato; editor cue per `editor`; policy licenze in UI | unit su sincronizzazione cue; e2e su iPhone viewport | aggiornamento `CONTENUTI.md` |
| **4** | Adapter AI su API Anthropic: structured outputs + zod, prompt caching, `ai_jobs`/`ai_usage_daily`, cap in $ e token, registrazione `usage`, chiavi solo in funzione server, gestione errori per classe; fixture provider mantenuto per CI | contratto validatore (porting dei 30 test esistenti), repair round, cap, **test che la chiave non è mai nel bundle client** | `docs/AI_COACH.md` riscritto |
| **5** | Generatore programmi esteso: intake strutturato (preferenze/non graditi come id, `constraints` a lista chiusa), **recuperi per esercizio**, `alternatives` per attrezzatura mancante e non graditi, editor del programma con spiegazioni visibili, disclaimer | validatore su nuovi campi; e2e intake→piano→modifica | `docs/AI_COACH.md` §generazione |
| **6** | Coach durante l'allenamento: pannello con video/istruzioni dell'esercizio corrente, log carichi/rip/durata/RPE (già c'è), Q&A grounded con blocchi `verified` / `ai_suggestion` etichettati, divieto postura con test avversariali | unit su composizione contesto; avversariali ("valuta la mia schiena", "garantiscimi 10 kg") | `docs/AI_COACH.md` §coach |
| **7** | Progressione prudente: `pain_flag`/`pain_area`, modalità prudente meccanica, soglia dati insufficienti, aggregati regressi/recupero, conferma prima di applicare (già c'è) con riepilogo rischi | unit su ogni ramo prudente; review con dati mancanti non chiama il modello | `docs/PROGRESSIONE.md` |
| **8** | Privacy e account: export completo (JSON + CSV), **cancellazione account** server-side con cascata e revoca sessioni, pagina trasparenza "cosa viene inviato all'AI" generata da codice, promemoria/push via `pg_cron` + VAPID | e2e export/delete; verifica che dopo delete nessuna riga resti | `SECURITY.md`, `docs/PRIVACY.md` |
| **9** | PWA iPhone: prompt installazione guidato, avviso guest/storage, SW con precache build + offline per libreria testuale, test su Safari iOS reale | Lighthouse PWA; checklist manuale iOS | `docs/MOBILE.md` |

Ogni PR: branch dedicato, `npm test` + build verdi in CI, changelog aggiornato, nessun deploy in
produzione senza tua autorizzazione esplicita. Stima di sforzo relativa (non in giorni, perché dipende
dal ritmo di revisione): PR 1 e PR 2 sono le più grandi; PR 4 e PR 6 le più delicate.

---

## 10. Decisioni richieste prima di procedere

1. **Architettura**: Opzione B (Supabase + Vercel, riscrittura backend) o Opzione A (self-host evoluto)?
2. **Auth**: accetti Sign in with Apple + magic link al posto delle passkey, se Supabase non le
   supporta come login primario?
3. **Piani**: autorizzi Supabase Pro (~$25/mese) e, se l'uso è commerciale, Vercel Pro? Oppure partiamo
   in Free accettando la pausa dopo 7 giorni?
4. **Media**: (a) richiedere licenza Gym visual, (b) sostituire con media propri/CC, (c) tenere i media
   solo in self-host e partire senza immagini sull'app ospitata?
5. **Modello AI**: Opus 5.5 ovunque, oppure Sonnet/Haiku 5.5 per il Q&A in allenamento? Budget mensile
   massimo per l'AI?
6. **Nucleo editoriale**: confermi l'approccio "60–80 esercizi completi + resto solo con passi del
   dataset"? Chi è l'editor/revisore dei contenuti tecnici?
7. **Dati sanitari**: confermi la rimozione del campo libero "limitazioni" a favore di una lista chiusa?
8. **Deploy**: dove e quando fare il primo ambiente di staging (nessuna produzione fino a tuo ok).

Posso partire subito con la **PR 0** (non dipende da nessuna decisione) se mi dai il via.
