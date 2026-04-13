# TP 4 - Cloud Monitoring (Node.js / Express / Postgres)

Projet pédagogique de **Notes API** avec Docker, enrichi pour le TP Observabilité sur 3 axes :

1. **Logs structurés** (Pino)
2. **Métriques Prometheus** (`prom-client`)
3. **Health checks** (`/health` et `/health/db`)

L'objectif est d'avoir une implémentation simple, lisible et directement vérifiable.

---

## 1) Présentation rapide du projet

- API REST en Node.js / Express
- Base de données Postgres
- Exécution via Docker Compose (`api` + `db`)
- Endpoints métier existants conservés (`/notes`, `/notes/:id`)
- Endpoints d'observabilité ajoutés :
  - `GET /health`
  - `GET /health/db`
  - `GET /metrics`

---

## 2) Prérequis

- Docker
- Docker Compose
- (Optionnel hors Docker) Node.js 18+

---

## 3) Installation

### Option A — avec Docker (recommandé)

1. Créer un fichier `.env` à la racine `notes_app-observabilite/`.
2. Exemple minimal :

```env
PORT=3000
LOG_LEVEL=info

DB_HOST=db
DB_PORT=5432
DB_NAME=notesdb
DB_USER=notesuser
DB_PASSWORD=notespwd

POSTGRES_DB=notesdb
POSTGRES_USER=notesuser
POSTGRES_PASSWORD=notespwd
```

3. Lancer les services :

```bash
docker compose up --build
```

### Initialisation automatique de la base (Docker)

- Le dossier `docker/db/init` contient les scripts SQL exécutés automatiquement par l'image officielle Postgres :
  - `01-schema.sql` : crée la table `notes`
  - `02-seed.sql` : insère des notes de démonstration
- Ce dossier est monté dans le conteneur DB via `/docker-entrypoint-initdb.d`.
- Important : ces scripts ne s'exécutent **qu'au premier démarrage** si le volume Postgres est vide.
- Pour rejouer l'initialisation complète :

```bash
docker compose down -v
docker compose up --build
```

### Option B — local sans Docker

Depuis `notes_app-observabilite/api` :

```bash
npm install
npm start
```

(Assurez-vous d'avoir Postgres joignable avec les variables `DB_*`.)

---

## 4) Lancement

- API exposée sur `http://localhost:3000`
- Vérifier rapidement :

```bash
curl -i http://localhost:3000/health
```

Réponse attendue : HTTP 200 avec JSON `{"status":"ok","service":"up"}`.

---

## 5) Variables d'environnement utiles

### API

- `PORT` : port HTTP de l'API (défaut: `3000`)
- `LOG_LEVEL` : niveau de logs Pino (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) ; défaut `info`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` : accès Postgres

### Postgres (docker)

- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`

---

## 6) Logs structurés (Pino)

### Ce qui a été fait

- Logger centralisé dans `api/src/logger.js`
- Tous les `console.log` remplacés par `logger.info|warn|error`
- Niveau piloté par `LOG_LEVEL`
- Format JSON structuré (compatible agrégation cloud)

### Tester les logs

#### Niveau `info` (par défaut)

```bash
curl -X POST http://localhost:3000/notes \
  -H "Content-Type: application/json" \
  -d '{"title":"TP observabilité","content":"demo"}'
```

Vous devez voir des logs `info` comme `"Creating note"` puis `"Note created"`.

#### Vérifier `LOG_LEVEL=warn`

1. Mettre `LOG_LEVEL=warn` dans `.env`
2. Redémarrer l'API (`docker compose up --build`)
3. Rejouer la requête précédente

Résultat attendu : les logs `info` n'apparaissent plus, mais les `warn` et `error` restent visibles.

### Exemple de sortie observable (Pino)

```json
{"level":30,"time":1710000000000,"service":"notes-api","msg":"Creating note","title":"TP observabilité"}
```

---

## 7) Métriques Prometheus (`/metrics`)

### Ce qui a été fait

Module centralisé `api/src/metrics.js` avec :

- registre de métriques
- `collectDefaultMetrics`
- métriques custom :
  - `http_requests_total` (**Counter**)
  - `http_request_duration_seconds` (**Histogram**)
- labels communs :
  - `method`
  - `route`
  - `status_code`
- instrumentation sur `res.on("finish")` (fin de traitement)

### Tester les métriques

1. Générer du trafic :

```bash
curl -s http://localhost:3000/health > /dev/null
curl -s http://localhost:3000/notes/999999 > /dev/null
```

2. Consulter les métriques :

```bash
curl -s http://localhost:3000/metrics | head -n 40
```

### Ce qu'il faut observer

- Exposition texte Prometheus (`text/plain; version=0.0.4`)
- Présence de lignes ressemblant à :

```txt
http_requests_total{method="GET",route="/health",status_code="200"} 1
http_request_duration_seconds_bucket{method="GET",route="/health",status_code="200",le="0.1"} ...
```

---

## 8) Health checks

### `GET /health`

- But : **liveness** (process API vivant)
- Ne dépend pas de Postgres
- Réponse : HTTP 200 + JSON machine-readable

```bash
curl -i http://localhost:3000/health
```

### `GET /health/db`

- But : **readiness DB** (vérifie l'accès réel à Postgres)
- Exécute `SELECT 1`
- Retourne :
  - HTTP 200 si DB accessible
  - HTTP 503 si DB indisponible

```bash
curl -i http://localhost:3000/health/db
```

### Simuler une DB indisponible

Exemple avec Docker :

```bash
docker compose stop db
curl -i http://localhost:3000/health/db
curl -i http://localhost:3000/health
```

Attendu :
- `/health/db` -> **503**
- `/health` -> **200**

Cela montre bien la différence de rôle entre les deux endpoints.

---

## 9) Réponses théoriques du TP

### A) Logs

#### À quoi ressemble un log `console.log` ?

Exemple :

```txt
Creating note { title: 'TP observabilité' }
```

#### À quoi ressemble un log `logger` (Pino) ?

Exemple :

```json
{"level":30,"time":1710000000000,"service":"notes-api","msg":"Creating note","title":"TP observabilité"}
```

#### Différences

- `console.log` : texte libre, peu structuré, parsing fragile
- Pino : JSON structuré, niveaux, champs exploitables (filtrage/alerting/corrélation)

#### Pourquoi ne pas stocker simplement des logs dans un fichier sur le cloud ?

- En conteneurs/instances multiples, les fichiers sont dispersés
- Rotation/rétention et recherche deviennent complexes
- Risque de perte lors des redémarrages
- Les plateformes d'observabilité attendent un flux centralisé (stdout + collecteur)

### B) Metrics

#### Différence entre `Counter` et `Histogram`

- `Counter` : compteur cumulatif monotone (ex: nombre total de requêtes)
- `Histogram` : distribution d'une valeur (ex: latence) via buckets + somme + count

### C) Health

#### À quoi sert `/health/db` comparé à `/health` ?

- `/health` : confirme que le process API est vivant
- `/health/db` : confirme que l'API peut réellement parler à Postgres

En prod, c'est essentiel pour distinguer "service en ligne" de "service réellement prêt".

---

## 10) Résumé de validation rapide

1. Lancer : `docker compose up --build`
2. Vérifier liveness : `curl -i http://localhost:3000/health` (200)
3. Vérifier DB readiness : `curl -i http://localhost:3000/health/db` (200)
4. Générer du trafic puis lire métriques : `curl http://localhost:3000/metrics`
5. Passer `LOG_LEVEL=warn` et vérifier la disparition des logs `info`
