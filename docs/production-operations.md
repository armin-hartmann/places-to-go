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
| Deployment trigger | GitHub Actions on pushes to `main` |
| Deployment workflow | `.github/workflows/deploy-production.yml` |
| Server deployment script | `/usr/local/sbin/deploy-old-town-explorer` |
| Server-local backups | `/var/backups/old-town-explorer` |

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

Production deploys automatically after a commit is merged or pushed to `main`.
The GitHub Actions workflow validates the commit, then connects to the production
VM and runs the restricted server deployment script. Do not manually run `git
pull`, `npm run build`, or restart the service for an ordinary release.

### 1. Before merging

On the pull request (or locally before pushing), run:

```bash
npm ci --ignore-scripts
npm audit --omit=dev
npm run check
npm run build
```

`npm ci --ignore-scripts` installs exactly what is in `package-lock.json` and
avoids lifecycle-script execution. Do not use `npm audit fix --force`.

For a migration or other data-affecting change, create a PocketBase dashboard
backup **before merging**:

1. Sign into `https://brickandriver.com/_/` as a PocketBase superuser.
2. Open **Settings → Backups**.
3. Create a backup and confirm it appears successfully.
4. Record its timestamp/name with the release notes.

### 2. Merge and monitor the automated deployment

1. Merge the approved pull request into `main`.
2. Open the repository's **Actions** tab and select **Deploy production**.
3. Confirm every step succeeds, especially **Validate the application** and
   **Deploy the validated commit**.

The workflow passes the exact commit SHA it validated to
`/usr/local/sbin/deploy-old-town-explorer`. The server script verifies that SHA,
updates `/opt/old-town-explorer`, installs dependencies, runs the checks and
build, creates a consistent local backup, restarts PocketBase, and waits up to
30 seconds for `http://127.0.0.1:8090/api/health` to succeed.

The workflow uses GitHub repository secrets named `PRODUCTION_HOST`,
`PRODUCTION_USER`, `PRODUCTION_SSH_KEY`, and `PRODUCTION_KNOWN_HOSTS`. Never
put their values in this repository or in workflow logs.

### 3. Verify the release

After a successful workflow, verify in a browser:

- `https://brickandriver.com/` loads existing published places.
- `https://brickandriver.com/admin.html` permits the expected administrator
  actions.
- Any changed filters, labels, categories, or map behavior appear correctly.
- For schema changes, create a **draft** test record and confirm it saves.

PocketBase automatically applies committed migrations from `pb_migrations/`
when the service starts.

### Manual recovery deployment

Use this only if GitHub Actions is unavailable or a failed deployment requires
server-side investigation. First SSH into the **actual production VM** (not
Cloud Shell), then inspect the failed Actions log before changing anything.

To deploy the current `main` commit through the same safeguarded script:

```bash
cd /opt/old-town-explorer
git fetch origin main
SHA=$(git rev-parse origin/main)
sudo /usr/local/sbin/deploy-old-town-explorer "$SHA"
```

The command creates a server-local backup in
`/var/backups/old-town-explorer`, briefly stops PocketBase so the SQLite data is
archived consistently, restarts it, and checks its health. If the script fails
after stopping the service, restore service availability immediately:

```bash
sudo systemctl start old-town-explorer
```

## Static assets and browser caching

`npm run build` automatically adds a short content hash to the CSS and JavaScript
URLs in the generated `dist/pb_public/index.html` and `admin.html`, for example:

```html
<link rel="stylesheet" href="styles.css?v=018faaf1a2c9">
```

The hash changes only when that asset changes. This makes browsers request the
new CSS or JavaScript after a deployment while allowing unchanged files to stay
cached. The source HTML files may show placeholder `?v=` values; do **not**
update those values manually. The generated files in `dist/` are deployment
artifacts and are not committed.

After deployment, use a normal refresh while validating the page. If an old
browser tab still appears stale, do one hard refresh and confirm the loaded
asset URL has the new hash in browser developer tools.

## Troubleshooting

### Site is unavailable after deployment

```bash
sudo systemctl status old-town-explorer --no-pager
sudo journalctl -u old-town-explorer --since '30 minutes ago' --no-pager -n 100
curl -fsS http://127.0.0.1:8090/api/health
```

### Deployment succeeded but public UI is unchanged

1. Confirm the **Deploy production** GitHub Actions run deployed the intended
   commit and completed successfully.
2. Confirm the production checkout matches that commit:

   ```bash
   git -C /opt/old-town-explorer log -3 --oneline
   ```

3. Check the browser’s static-asset query-string version and hard-refresh.
4. If the server-side build needs investigation, use the manual recovery
   procedure above rather than directly editing build output.

### Need to roll back

Do not overwrite production data impulsively. First preserve the current state with a new backup. For a database rollback, use the PocketBase dashboard backup/restore workflow and then verify the service health and public site. Escalate if a migration must be reversed manually.

## Repository hygiene

- Commit source, migrations, and documentation; do **not** commit `pb_data/`, the PocketBase binary, build output, secrets, or server-local backups.
- Keep `main` deployable: run `npm run check`, `npm audit --omit=dev`, and `npm run build` before pushing.
- Keep this runbook updated whenever hosting, service names, paths, backup mechanisms, or deployment behavior changes.
