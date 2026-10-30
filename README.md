# BIND9 Web UI

Self-hosted DNS control panel and native appliance for BIND9.

BIND9 Web UI transforms any Linux server running BIND9 into an intuitive, automated DNS appliance. It supports direct host management (local appliance mode) as well as centralized multi-server management over SSH, providing a dashboard for zones, records, ACLs, TSIG keys, RPZ firewalls, replication, automated backups, user roles, and operational health.

Copyright (c) 2025 Stephane ASSOGBA

<!-- keywords: bind9 web ui, dns manager, dns control panel, self hosted dns, bind9 appliance -->

![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.0-000?logo=express)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supported-4169E1?logo=postgresql&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-Supported-4479A1?logo=mysql&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

---

## Table of Contents

- [Quick Start (Production Install)](#quick-start-production-install)
- [Core Features](#core-features)
- [Architecture & Operating Modes](#architecture--operating-modes)
- [Configuration & Environment](#configuration--environment)
- [Database Backends](#database-backends)
- [Remote SSH BIND Permissions](#remote-bind-permissions)
- [Zone Reloading & Propagation](#zone-reloading--propagation)
- [Security Architecture](#security-architecture)
- [Development & Building](#development--building)
- [License](#license)

---

## Quick Start (Production Install)

On Debian, Ubuntu, or compatible Linux systems:

```bash
git clone https://github.com/Steph-ux/bind9-web-ui.git
cd bind9-web-ui
sudo bash install.sh
```

### What the installer does by default:
- Installs the application to `/opt/bind9-web-ui` as a systemd service (`bind9-web-ui`)
- Enables local BIND9 management permissions and sudoers rules for service management
- Configures an HTTPS reverse proxy (Nginx or Apache) on `https://<server-ip>:8443`
- Initializes a local SQLite database and generates a bootstrap administrator password in `/root/bind9-web-ui-bootstrap-admin.txt`

### Installer Customization Flags:
```bash
# Custom initial admin password
sudo env DEFAULT_ADMIN_PASSWORD='YourStrongPassword' bash install.sh

# Use standard HTTPS port (443) with custom domain
sudo env WEB_SERVER=nginx WEB_HTTP_PORT=80 WEB_HTTPS_PORT=443 SERVER_NAME=dns.example.com bash install.sh

# Deploy without reverse proxy (bring your own TLS proxy)
sudo env WEB_SERVER=none bash install.sh
```

---

## Core Features

### Native BIND9 Host Appliance & In-UI Installer
- **Host Detection**: Automatically identifies the Linux distribution, package manager (`apt`, `dnf`, `yum`, `apk`, `pacman`), BIND9 service state, listening ports, and conflict detection with `systemd-resolved`.
- **1-Click Package Installation**: Installs BIND9 and core utilities directly from the web interface if not yet present on the host.
- **Guided Setup Wizard**: Scaffolds BIND9 configurations (`named.conf.options`, `named.conf.local`, `named.conf.acls`, `rndc.key`) with three profiles:
  - **Authoritative Server**: Enterprise DNS hosting with hardened recursion controls.
  - **Caching / Recursive Resolver**: Configured forwarders, DNSSEC validation, and LAN access controls.
  - **Hybrid Server**: Local authoritative zones with recursive upstream resolution.
- **Service Lifecycle Control**: Start, Stop, Restart, and Reload (`rndc reload`) BIND9 systemd services from the dashboard.
- **Interactive DNS Query Tester**: Built-in `dig` / native resolver query tool to test live resolution on `127.0.0.1:53` without opening a terminal.

### Comprehensive DNS Zone Management
- Create, modify, and delete forward and reverse DNS zones (`master`, `slave`, `forward`).
- Full record editor supporting `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `NS`, `SOA`, `PTR`, `SRV`, `CAA`, `TLSA`, `DS`, and `DNSKEY`.
- Automatic reverse zone and PTR record calculation from network CIDR notation.
- Automated zone file generation, parsing, serial bumping, and syntax validation via `named-checkzone`.

### RPZ (Response Policy Zone) / DNS Firewall
- Manage DNS firewall rules directly from the web interface.
- Block, redirect, or drop malicious domains and IP addresses.
- Bulk import capabilities from plain text blocklists, zone files, or remote URLs.

### Security, ACLs & TSIG Keys
- Dedicated management for BIND9 Access Control Lists (`named.conf.acls`).
- TSIG Key generation and deployment (`named.conf.keys`) with HMAC-SHA256 / SHA512 support for secure transfers.

### Multi-Server Remote Management over SSH
- Manage multiple remote BIND9 instances from a single central web panel.
- Automatic remote path detection and configuration sync over SFTP / SSH execution.
- Real-time switching between local appliance mode and remote targets.

### High Availability, Replication & Backups
- Secondary server replication tracking and zone-to-server binding.
- Manual and scheduled automated backups (full system, zones only, or configuration files).
- One-click restore workflow with timestamped snapshots.

---

## Architecture & Operating Modes

BIND9 Web UI operates under two paradigms:

```text
Local Appliance Mode:
[ BIND9 Web UI ] <--- (Local FS / sudo / rndc) ---> [ Local BIND9 Service ]

Central Management Mode:
[ BIND9 Web UI ] <--- (SSH / SFTP / sudo) ---> [ Remote BIND9 Server 1 ]
                 <--- (SSH / SFTP / sudo) ---> [ Remote BIND9 Server 2 ]
```

### Managed Include Files
To prevent overwriting custom BIND options, the Web UI utilizes dedicated modular includes:
- `named.conf.local` : Managed forward and reverse zone declarations
- `named.conf.acls` : Defined access control lists
- `named.conf.keys` : Defined TSIG keys

Ensure your primary `named.conf` includes these files:
```conf
include "/etc/bind/named.conf.local";
include "/etc/bind/named.conf.acls";
include "/etc/bind/named.conf.keys";
```

---

## Configuration & Environment

Environment settings can be defined in `.env` (development) or `/etc/bind9-web-ui.env` (production):

| Variable | Default | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | Bind address for the Node.js HTTP server |
| `PORT` | `3001` | Internal HTTP port |
| `NODE_ENV` | `production` | Runtime mode (`production` or `development`) |
| `SESSION_SECRET` | Auto-generated | Secret key for HTTP session encryption (mandatory in production) |
| `DB_TYPE` | `sqlite` | Database engine: `sqlite`, `postgresql`, or `mysql` |
| `DATABASE_URL` | `data/bind9admin.db` | SQLite file path or external database connection URI |
| `BIND9_CONF_DIR` | `/etc/bind` | Path to BIND9 configuration directory |
| `BIND9_ZONE_DIR` | `/var/cache/bind` | Path to BIND9 zone file storage |
| `RNDC_BIN` | `rndc` | Path or name of the `rndc` binary |
| `DEFAULT_ADMIN_PASSWORD` | unset | Initial bootstrap admin password |

---

## Database Backends

### 1. SQLite (Default)
Zero configuration required. Data is stored in `data/bind9admin.db`.
```bash
npm run db:push
```

### 2. PostgreSQL
```bash
DB_TYPE=postgresql
DATABASE_URL=postgresql://user:password@localhost:5432/bind9admin
```
Push the schema:
```bash
npm run db:push:pg
```

### 3. MySQL
```bash
DB_TYPE=mysql
DATABASE_URL=mysql://user:password@localhost:3306/bind9admin
```
Push the schema:
```bash
npm run db:push:mysql
```

---

## Remote BIND Permissions

When managing remote BIND servers over SSH with a non-root user, grant the required non-interactive `sudo` permissions in `/etc/sudoers.d/bind9-web-ui`:

```sudoers
<user> ALL=(ALL) NOPASSWD: /usr/sbin/rndc, /usr/bin/named-checkconf, /usr/bin/named-checkzone, /usr/bin/cp /tmp/* /etc/bind/*
```

---

## Zone Reloading & Propagation

When a record is updated in the Web UI, the zone file is validated and `rndc reload <domain>` is executed automatically.

To verify manual changes outside the UI:
```bash
sudo named-checkconf
sudo named-checkzone example.com /var/cache/bind/db.example.com
sudo rndc reload example.com
```

---

## Security Architecture

- **Role-Based Access Control (RBAC)**: Distinct permissions for `admin` (full access), `operator` (zone and service mutations), and `viewer` (read-only monitoring).
- **Session Protection**: Hardened cookies with `HttpOnly`, `SameSite=Lax`, and `__Host-` prefix enforcement in production.
- **Input Validation**: Strict RFC 1035 / ARPA validation via Zod schemas, blocking directory traversal (`../`) and shell injection.
- **Path Containment**: File write operations are constrained strictly to authorized BIND directories (`/etc/bind`, `/etc/named`, `/var/cache/bind`, `/var/named`).
- **CSRF & CSWSH Defense**: Browser origin verification on all state-mutating HTTP requests and WebSocket handshakes (`/ws/logs`, `/ws/replication`).
- **Brute-Force Protection**: Integrated IP rate limiting and failed login ban management.

---

## Development & Building

### Prerequisites
- Node.js 20+
- npm 10+
- Build tools: `build-essential python3` (Debian/Ubuntu)

### Running Locally
```bash
# Clone repository
git clone https://github.com/Steph-ux/bind9-web-ui.git
cd bind9-web-ui

# Install dependencies
npm install

# Initialize local SQLite database
npm run db:push

# Start development server
npm run dev
```

Open `http://localhost:3001` in your browser. Default login: `admin` (password generated in console on first run).

### Production Build
```bash
# Typecheck
npm run check

# Compile client and server
npm run build

# Start production server
node dist/index.cjs
```

---

## Project Structure

```text
Bind-Config/
├── client/              # React frontend (Vite 7, Tailwind 4, Wouter)
│   ├── src/components/  # Modular UI and domain components
│   ├── src/pages/       # View pages (dashboard, zones, firewall, status)
│   └── src/lib/         # API client and authentication context
├── server/              # Express backend and appliance services
│   ├── host-bind-manager.ts # Native BIND9 installer, wizard, and service management
│   ├── bind9-service.ts     # Zone parser, file generator, and rndc execution
│   └── routes.ts            # REST endpoints and WebSocket handlers
├── shared/              # Shared TypeScript interfaces and Zod schemas
├── install.sh           # Automated production appliance installer
└── README.md
```

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and verify type safety with `npm run check` before submitting a pull request.

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for full details.
