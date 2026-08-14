# Brick & River

An interactive Old Town Alexandria guide named for the city’s historic brick streets and Potomac waterfront. Public visitors can browse published places; authenticated editors and administrators can manage the PocketBase-backed directory.

> **Production operations:** See [docs/production-operations.md](docs/production-operations.md) for the authoritative deployment, backup, verification, rollback, production-host access, and cache-busting runbook.

## Features

### Public explorer

- Browse published places on an interactive map and directory.
- Search across place names, descriptions, and descriptive tags.
- Filter by primary category (Dining, Bars, Historic & Unique, Cafes, or Transportation & Parking) and by tags such as `Historic`, `Waterfront`, `Cocktails`, or `Family-friendly`.
- On mobile, open a map-first place browser, scroll its directory, and drag its handle down to dismiss it.
- Select a directory item or marker to open the same structured place card, with category/tag details, description, optional address, an external **Get directions** link, and an optional website link.

### Admin portal

Authorized users can create and edit places; administrators can also delete them. A place supports:

- name, description, published/draft status, categories, and optional discovery tags;
- map position, address/location details, and optional website;
- address-first entry via OpenStreetMap search, or a pasted Google Maps link containing coordinates;
- a clickable, draggable map pin for refining the final location.

The app uses OpenStreetMap's Nominatim search service for optional address lookup and does not require a Google Maps API key. Editors should confirm search results and map-pin placement before saving.

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

- `pb_migrations/` is committed and defines the schema, access rules, indexes, seed records, and place fields such as tags, address, and website. PocketBase applies them on startup.
- `pb_data/` contains the SQLite database and uploaded files. It is ignored by Git and must be stored on a persistent volume.
- `dist/` and the PocketBase executable are generated/deployment artifacts and are ignored by Git.

For production, back up `pb_data`, configure SMTP for account email flows, put PocketBase behind HTTPS, and keep the PocketBase version pinned and deliberately upgraded.

## Checks

```sh
npm run check
npm run build
```
