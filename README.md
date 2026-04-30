# BIND9 Web UI

The missing web UI for BIND9.

BIND9 Web UI is a self-hosted administration panel for BIND9 servers. It supports both local management and remote management over SSH, with a modern dashboard for zones, records, ACLs, TSIG keys, RPZ, replication, backups, user access, and operational visibility.

Copyright (c) 2025 Stephane ASSOGBA

<!-- keywords: bind9 web ui, dns manager, dns control panel, self hosted dns -->

![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.0-000?logo=express)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supported-4169E1?logo=postgresql&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-Supported-4479A1?logo=mysql&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

## Why This Exists

BIND9 is one of the most capable DNS servers available, but it still lacks an official management interface. In practice that means:

- manual edits in multiple configuration files
- easy-to-miss syntax mistakes
- weak visibility across zones, access control, and runtime state
- awkward remote administration when BIND runs on another host

This project fills that gap with a full web UI focused on operational safety and day-to-day administration.

## Screenshots

<table>
  <tr>
    <td align="center"><b>Dashboard</b></td>
    <td align="center"><b>Logs</b></td>
    <td align="center"><b>Connections</b></td>
  </tr>
  <tr>
    <td><img src="screenshots/Dashboard.png" alt="Dashboard" width="400" /></td>
    <td><img src="screenshots/Logs.png" alt="Logs" width="400" /></td>
    <td><img src="screenshots/SSH.png" alt="SSH connections" width="400" /></td>
  </tr>
</table>

## Core Features

### DNS management

- Create, edit, and delete DNS zones
- Manage records for `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `NS`, `SOA`, `PTR`, `SRV`, and more
- Generate and parse BIND zone files automatically
- Create reverse DNS and PTR records automatically when appropriate
- Import existing zones and managed includes from an existing BIND installation

### Access control and key management

- Manage ACLs through dedicated BIND include files
- Manage TSIG keys through dedicated include files
- Configure zone transfer authorization more safely

### RPZ / DNS firewall

- Manage Response Policy Zone entries from the UI
- Import RPZ data from text, zone-file style content, or remote URLs
- Handle large blocklists with pagination and batch processing
- Keep RPZ data synchronized with BIND-managed files

### Remote server management

- Add multiple BIND servers over SSH
- Detect platform details and common BIND paths automatically
- Switch the active target between local mode and remote mode
- Run configuration reads, writes, validation, and `rndc` operations against the active target

### Replication and operations

- Register secondary or replication targets
- Maintain zone-to-server bindings
- Run sync operations and conflict detection
- Send BIND notify actions where applicable

### Monitoring and maintenance

- Dashboard with server, DNS, and operational summaries
- Status view for service health and runtime information
- Real-time logs
- Backups and restore flows
- Configuration snapshots
- User management and API tokens

### Security controls

- Session-based authentication
- Role-based access control for admin, operator, and viewer roles
- Forced password rotation for bootstrap users
- Validation and sanitization across BIND-facing inputs
- CSRF-aware authenticated mutations
- SSRF protections for remote fetch and notification features

## Management Model

The application supports two operating modes.

### Local mode

The web UI runs on the same host as BIND9 and interacts with:

- BIND configuration files
- zone files
- `rndc`
- validation binaries such as `named-checkconf` and `named-checkzone`

### Remote SSH mode

The web UI runs on a separate host and connects to a BIND server over SSH. The application executes commands and manages files remotely through the active SSH connection.

This is the mode used when the UI is deployed on a central management server and your BIND servers live elsewhere.

## Important BIND Integration Notes

This project does not try to rewrite arbitrary BIND layouts blindly. A few conventions matter if you want the UI to manage everything cleanly.

### Managed include files

ACLs and TSIG keys are managed through dedicated include files:

- `named.conf.acls`
- `named.conf.keys`

Your main BIND configuration should include them, for example:

```conf
include "/etc/bind/named.conf.acls";
include "/etc/bind/named.conf.keys";
```

If an ACL exists only inside `named.conf.options`, BIND will use it, but the ACL page in the UI will not import it as a managed ACL until it is moved to `named.conf.acls`.

### Existing manual changes

The UI can import and reflect existing BIND configuration, but if you modify files manually outside the UI, the safest workflow is:

1. make the manual BIND change
2. validate it on the server
3. use the relevant sync or refresh flow in the UI

### Structural zone edits

Record-level edits are first-class in the UI. Some deeper structural zone changes are still safer to perform directly in BIND and then sync back into the application.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, Vite 7, TypeScript, Tailwind CSS 4, shadcn/ui, Wouter |
| Backend | Node.js, Express 5, TypeScript |
| Data | SQLite by default, with PostgreSQL and MySQL support via Drizzle ORM |
| Realtime | WebSocket (`ws`) |
| Remote access | `ssh2` |
| Validation | Zod, drizzle-zod |

## Project Structure

```text
Bind-Config/
├── client/              # React frontend
├── server/              # Express backend and BIND services
├── shared/              # Shared schemas and types
├── data/                # SQLite database and local data
├── script/              # Build scripts
├── screenshots/         # README screenshots
├── DESIGN.md            # Active design system direction
└── README.md
```

## Requirements

### Development

- Node.js 20+ recommended
- npm
- build tools required by native dependencies such as `better-sqlite3`

On Debian or Ubuntu:

```bash
sudo apt update
sudo apt install -y build-essential python3
```

### BIND target

For local mode:

- a host with BIND9 installed
- access to BIND config and zone directories
- `rndc`, `named-checkconf`, and `named-checkzone`

For remote mode:

- SSH access to the target server
- a user with sufficient file and command permissions
- passwordless `sudo` for required BIND operations if the user is not already privileged

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/Steph-ux/bind9-web-ui.git
cd bind9-web-ui
```

### 2. Install dependencies

```bash
npm install
```

### 3. Initialize the database

```bash
npm run db:push
```

### 4. Start development mode

On Windows:

```bash
npm run dev
```

Then open:

```text
http://localhost:3001
```

### 5. First login

On first startup, a bootstrap `admin` account is created automatically.

- Username: `admin`
- Password: the value of `DEFAULT_ADMIN_PASSWORD`, if set
- Otherwise: a generated bootstrap password is created

In production, the bootstrap password is not written to logs. Set `DEFAULT_ADMIN_PASSWORD` before first startup if you want a known initial password.

## Production Build

Build the application:

```bash
npm run build
```

Start the compiled server:

```bash
node dist/index.cjs
```

Set `NODE_ENV=production` in your environment or service manager.

Note:

- `npm start` is currently written for Windows-style environment variable syntax
- for Linux services, prefer setting `NODE_ENV=production` in systemd, Docker, or your shell and launching `node dist/index.cjs`

## Environment Variables

The repository already includes an `.env.example`.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port for the application |
| `NODE_ENV` | `development` | Runtime mode |
| `SESSION_SECRET` | random in development | Mandatory in production |
| `DB_TYPE` | `sqlite` | `sqlite`, `postgresql`, or `mysql` |
| `DATABASE_URL` | `data/bind9admin.db` | SQLite path or database connection URL |
| `BIND9_CONF_DIR` | `/etc/bind` | Local-mode BIND config directory |
| `BIND9_ZONE_DIR` | `/var/cache/bind` | Local-mode zone directory |
| `RNDC_BIN` | `rndc` | Path to the `rndc` binary |
| `NAMED_CHECKCONF` | `named-checkconf` | Path to the config validation binary |
| `DEFAULT_ADMIN_PASSWORD` | unset | Optional initial bootstrap admin password |

## Database Backends

SQLite is the default and easiest option. PostgreSQL and MySQL are also supported.

### SQLite

No extra setup is required beyond:

```bash
npm run db:push
```

### PostgreSQL

Set:

```bash
DB_TYPE=postgresql
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

Then push the schema.

On Windows:

```bash
npm run db:push:pg
```

On Linux:

```bash
DB_TYPE=postgresql npx drizzle-kit push --config=drizzle.config.pg.ts
```

### MySQL

Set:

```bash
DB_TYPE=mysql
DATABASE_URL=mysql://user:password@host:3306/dbname
```

Then push the schema.

On Windows:

```bash
npm run db:push:mysql
```

On Linux:

```bash
DB_TYPE=mysql npx drizzle-kit push --config=drizzle.config.mysql.ts
```

## Development Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the server in development mode |
| `npm run dev:client` | Start only the Vite client |
| `npm run build` | Build the client and server for production |
| `npm start` | Windows-oriented production start shortcut |
| `npm run check` | Run TypeScript checks |
| `npm run db:push` | Push the SQLite schema |
| `npm run db:push:pg` | Push the PostgreSQL schema |
| `npm run db:push:mysql` | Push the MySQL schema |

## Remote BIND Permissions

For remote SSH management, the SSH user may need passwordless `sudo` for BIND commands and safe file operations. A typical example looks like this:

```bash
<user> ALL=(ALL) NOPASSWD: /usr/sbin/rndc, /usr/bin/named-checkconf, /usr/bin/named-checkzone, /bin/cp, /usr/bin/cp
```

Adjust this to your platform and operational policy.

If you also use firewall management through the UI, you may need additional `sudo` permissions for tools such as:

- `ufw`
- `nft`
- `iptables`
- `firewall-cmd`
- `systemctl`

## Security Highlights

- Passwords are hashed using Node.js crypto primitives
- Sessions are hardened with strict cookie settings in production
- Login throttling and IP ban logic are built in
- Mutating routes require authenticated, same-site-safe flows
- API tokens support scoped access
- BIND-facing input is validated and sanitized
- Remote fetch and notification targets are checked to reduce SSRF risk
- Sensitive fields are masked in API responses where appropriate

## Operational Notes

- The UI applies supported changes automatically to the active BIND target
- Configuration writes are validated before reload or reconfigure actions are considered successful
- If an operation fails, the UI is expected to surface the error instead of reporting a false success
- Backups are stored under the application data directory
- Real-time logs and status views are available even when some local-only BIND metrics are not

## Recommended Production Setup

- run the web UI behind HTTPS
- set a strong `SESSION_SECRET`
- set `DEFAULT_ADMIN_PASSWORD` only for initial bootstrap, then rotate it
- prefer SSH key authentication over password authentication
- restrict SSH access tightly
- keep remote sudo permissions minimal
- use PostgreSQL or MySQL if you need a database backend beyond local SQLite
- monitor the host and back up the application data directory

## License

MIT License. See [LICENSE](LICENSE).
