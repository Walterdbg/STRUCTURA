# Installing STRUCTURA

STRUCTURA runs as Docker containers. The same files install the online
(cloud) engine or the onsite engine; one setting (`ENGINE_MODE`) chooses
which. Version 0.1.0 is tested in **cloud mode** only. The onsite engine
arrives in Phase 4 (ROADMAP).

## What you need

- Docker with Docker Compose.
  - Windows PC for testing: Docker Desktop.
  - Onsite box (Phase 4): a small Linux computer with the free Docker
    Engine (DEC-010).
- The project folder (this repository).

## First installation

1. Copy `.env.example` to `.env` in the project folder and fill it in:

   | Setting | What to put |
   | --- | --- |
   | `DB_PASSWORD` | A long random password for the database. Nobody types it; keep it only in `.env`. |
   | `ENGINE_MODE` | `cloud` |
   | `DEPLOYMENT_ID` | A name for this installation, e.g. `cloud-main` |
   | `BIND_ADDRESS` | `127.0.0.1` to use it only on this computer |
   | `PORT` | A free port. On Walter's PC 8080 and 8090 are taken, so use `8095`. |
   | `BACKUP_DIR` | Where backups are written (default `./backups`) |

2. Start it:

   ```bash
   docker compose up -d --build
   ```

3. Create the organization and its first administrator (only once).
   Replace the values in capitals. The password goes in `ADMIN_PASSWORD`,
   never on the command line itself:

   ```bash
   docker compose exec -e ADMIN_PASSWORD='CHOOSE-A-PASSWORD' structura-app node server/dist/cli/bootstrap.js --tenant "ORGANIZATION NAME" --timezone America/Panama --email ADMIN@EMAIL --name "ADMIN NAME"
   ```

   The password needs at least 10 characters. The organization's
   timezone and language (Spanish by default) can be set here; add
   `--locale en` for English.

4. Open `http://127.0.0.1:PORT/` and sign in with that email and
   password.

## Where things are kept

| What | Where |
| --- | --- |
| Database | Docker volume `structura_structura-pgdata` |
| Product photos | Docker volume `structura_structura-files` |
| Backups | `BACKUP_DIR` (default `./backups`): one `structura_<date>_<time>.dump` (database) plus one `..._files.tar` (photos) per day; the newest 14 sets are kept |
| Settings | `.env` (never committed to git) |

The database has no port open to the network. Only STRUCTURA's own
containers can reach it.

## Updating to a new version

```bash
git pull
docker compose up -d --build
```

Database changes are applied automatically when the app starts. Each
change is applied once, in order, inside a transaction.

## Checking it's running

`http://127.0.0.1:PORT/api/health` answers with the version, the engine
mode and whether the database is reachable. The same information is
shown at the bottom of every screen.

## Stopping

```bash
docker compose stop
```

`docker compose down` also removes the containers, but keeps the data
volumes. **Never** add `-v` to `down` on a real installation: that deletes
the database and the photos.
