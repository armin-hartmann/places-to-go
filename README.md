# Old Town Explorer

An interactive Old Town Alexandria guide backed by PocketBase. Public visitors can browse published places; authenticated editors and administrators can manage the directory.

## Local setup

Prerequisites:

- Node.js 20 or newer
- [PocketBase 0.39.7](https://pocketbase.io/docs/) for your operating system

Install the browser SDK and build PocketBase's public directory:

```sh
npm install
npm run build
```

Place the PocketBase executable in the project root, then start the app:

```sh
./pocketbase serve --publicDir=dist/pb_public
```

PocketBase applies the committed migrations automatically and seeds the initial five places. Open:

- Explorer: <http://127.0.0.1:8090/>
- Admin portal: <http://127.0.0.1:8090/admin.html>
- PocketBase dashboard: <http://127.0.0.1:8090/_/>

On first launch, create a PocketBase superuser from the dashboard. Then create records in the `users` collection for people who can use the app's admin portal. Set each record's role to:

- `editor`: create and edit places
- `admin`: create, edit, and delete places

Public account registration is intentionally disabled. Draft places are visible to editors and administrators but excluded from the public explorer.

## Configuration

By default, the browser client connects to the same origin serving the site. This is the recommended production layout because PocketBase can serve `dist/pb_public` directly.

To use a separate PocketBase origin, define `window.OLD_TOWN_CONFIG.pocketBaseUrl` before `config.js` loads. Configure allowed origins at the reverse proxy and serve both origins over HTTPS.

## Data and deployment

- `pb_migrations/` is committed and defines the schema, access rules, indexes, and seed records.
- `pb_data/` contains the SQLite database and uploaded files. It is ignored by Git and must be stored on a persistent volume.
- `dist/` and the PocketBase executable are generated/deployment artifacts and are ignored by Git.

For production, back up `pb_data`, configure SMTP for account email flows, put PocketBase behind HTTPS, and keep the PocketBase version pinned and deliberately upgraded.

## Checks

```sh
npm run check
npm run build
```
