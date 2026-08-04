# Brick & River production operations runbook

This document is the authoritative runbook for deploying and operating the production Brick & River PocketBase application. It intentionally contains **no credentials, tokens, private keys, or encryption-key values**.

## Architecture at a glance

| Component | Production value |
|---|---|
| Public site | `https://brickandriver.com/` |
| Public Admin portal | `https://brickandriver.com/admin.html` |
| PocketBase dashboard | `https://brickandriver.com/_/` |
| Source repository | `https://github.com/armin-hartmann/places-to-go` |
| Production checkout | `/opt/old-town-explorer` |
| systemd service | `old-town-explorer.service` |
| PocketBase binary | `/opt/old-town-explorer/pocketbase` |
| Persistent PocketBase data | `/var/lib/pocketbase` |
| PocketBase migrations | `/opt/old-town-explorer/pb_migrations` |
| Built public assets | `/opt/old-town-explorer/dist/pb_public` |
| Local PocketBase listener | `127.0.0.1:8090` |

PocketBase serves the built public directory directly. The reverse proxy provides HTTPS for `brickandriver.com` and `www.brickandriver.com`; PocketBase itself is deliberately bound only to localhost.

## Roles and access

There are two different administration concepts:

- **PocketBase superuser**: signs into `https://brickandriver.com/_/`; manages schema, backups, and system-level PocketBase settings.
- **Brick & River application user**: signs into `/admin.html`; an `editor` can create/edit places and an `admin` can also delete them.

Do not use, document, or commit the PocketBase encryption key. The systemd service reads it from an environment file outside the checkout.

## Accessing the production host

Google Cloud Shell is a management shell, **not** the application VM. Do not expect `systemctl`, PocketBase files, or production data there.

1. In Cloud Shell, identify the target VM if needed:

   ```bash
   gcloud config list --format='text(core.project)'
   gcloud compute instances list \
     --format='table(name,zone,status,networkInterfaces[0].accessConfigs[0].natIP)'
   ```

2. SSH into the actual VM through the Google Cloud console or `gcloud compute ssh`.
3. Confirm that it is the correct host before changing anything:

   ```bash
   hostname
   ps -ef | grep '[p]ocketbase'
   sudo systemctl status old-town-explorer --no-pager
   ```

Expected PocketBase arguments include:

```text
--dir=/var/lib/pocketbase
--migrationsDir=/opt/old-town-explorer/pb_migrations
--publicDir=/opt/old-town-explorer/dist/pb_public
```

## Standard production deployment

Use this procedure for application, static-asset, and migration changes.

### 1. Preflight

From the production VM:

```bash
cd /opt/old-town-explorer
git status --short --branch
git pull --ff-only origin main
git log -3 --oneline

npm ci --ignore-scripts
npm audit --omit=dev
npm run check
npm run build
```

`npm ci --ignore-scripts` installs exactly what is in `package-lock.json` and avoids lifecycle-script execution. Do not use `npm audit fix --force` on production.

### 2. Create a PocketBase dashboard backup

Before a migration or data-affecting deployment:

1. Sign into `https://brickandriver.com/_/` as a **PocketBase superuser**.
2. Navigate to **Settings → Backups**.
3. Create a backup and wait for it to appear successfully.
4. Record its timestamp/name in the deployment note.

### 3. Create a consistent server-local backup and restart

Stopping PocketBase briefly ensures the SQLite database and any WAL files are archived consistently.

```bash
set -euo pipefail

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR=/var/backups/old-town-explorer
BACKUP_FILE="$BACKUP_DIR/pocketbase-$STAMP.tgz"

sudo install -d -m 700 "$BACKUP_DIR"
sudo systemctl stop old-town-explorer

sudo tar \
  --numeric-owner \
  -C /var/lib/pocketbase \
  -czf "$BACKUP_FILE" \
  .

sudo ls -lh "$BACKUP_FILE"
sudo systemctl start old-town-explorer
sudo systemctl is-active old-town-explorer
curl -fsS http://127.0.0.1:8090/api/health
```

If the archive command fails after the service stops, restart it immediately:

```bash
sudo systemctl start old-town-explorer
```

### 4. Verify the release

On the VM:

```bash
sudo systemctl status old-town-explorer --no-pager
curl -fsS http://127.0.0.1:8090/api/health
```

In a browser, verify:

- `https://brickandriver.com/` loads existing published places.
- `https://brickandriver.com/admin.html` permits the expected administrator/editor actions.
- Any new filters, labels, or categories appear correctly.
- For schema changes, create a **draft** test record first and confirm it saves.

PocketBase automatically applies committed migrations from `pb_migrations/` when the service starts.

## Static assets and browser caching

The HTML files cache-bust JavaScript and CSS using query-string versions, for example:

```html
<link rel="stylesheet" href="styles.css?v=10">
```

When changing a cached static file, bump the corresponding version in every HTML page that loads it. Otherwise browsers can render new HTML with old cached CSS or JavaScript. This previously caused new category labels to display without their color-dot styles.

After deployment, use a hard refresh while validating the page. Confirm the loaded stylesheet URL has the new version in browser developer tools.

## Troubleshooting

### Site is unavailable after deployment

```bash
sudo systemctl status old-town-explorer --no-pager
sudo journalctl -u old-town-explorer --since '30 minutes ago' --no-pager -n 100
curl -fsS http://127.0.0.1:8090/api/health
```

### Source code updated but public UI is unchanged

1. Confirm the production checkout is at the intended commit:

   ```bash
   git -C /opt/old-town-explorer log -3 --oneline
   ```

2. Re-run `npm run build` from `/opt/old-town-explorer`.
3. Check the browser’s static-asset query-string version and hard-refresh.

### Need to roll back

Do not overwrite production data impulsively. First preserve the current state with a new backup. For a database rollback, use the PocketBase dashboard backup/restore workflow and then verify the service health and public site. Escalate if a migration must be reversed manually.

## Repository hygiene

- Commit source, migrations, and documentation; do **not** commit `pb_data/`, the PocketBase binary, build output, secrets, or server-local backups.
- Keep `main` deployable: run `npm run check`, `npm audit --omit=dev`, and `npm run build` before pushing.
- Keep this runbook updated whenever hosting, service names, paths, backup mechanisms, or deployment behavior changes.
