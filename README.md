# BIND9 Web UI / Admin Panel

**The missing Web UI for BIND9.**

Manage DNS zones, records, ACLs, TSIG keys, firewall and remote servers — all from a modern dashboard.

⚡ Built for sysadmins, DevOps and homelab users.

Copyright © 2025 Stephane ASSOGBA

<!-- keywords: bind9 web ui, dns manager, dns control panel, self hosted dns -->

> Panneau d'administration web complet pour serveurs **BIND9**, avec support de gestion **locale** et **distante via SSH**.

![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.0-000?logo=express)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supported-4169E1?logo=postgresql&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-Supported-4479A1?logo=mysql&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

---

## Why?

BIND9 is one of the most powerful DNS servers, but:

- No official web interface
- Complex configuration files
- Error-prone manual edits

This project solves that by providing a modern, secure and user-friendly control panel.

---

## Screenshots

<table>
  <tr>
    <td align="center"><b>Dashboard</b></td>
    <td align="center"><b>Real-time Logs</b></td>
    <td align="center"><b>SSH Connections</b></td>
  </tr>
  <tr>
    <td><img src="screenshots/Dashboard.png" alt="Dashboard" width="400" /></td>
    <td><img src="screenshots/Logs.png" alt="Real-time Logs" width="400" /></td>
    <td><img src="screenshots/SSH.png" alt="SSH Connections" width="400" /></td>
  </tr>
</table>

---

## Fonctionnalités

### DNS Management
- **Zones** — Création, modification et suppression de zones DNS (master, slave, forward)
- **Enregistrements** — CRUD complet pour A, AAAA, CNAME, MX, TXT, NS, SOA, PTR, SRV
- **Fichiers de zone** — Génération et parsing automatique des fichiers de zone BIND9
- **Reverse DNS Auto** — Création automatique des zones et enregistrements PTR lors de l'ajout de records A
- **Existing Config Import** — Importation automatique des zones, ACLs et clés depuis `named.conf` (y compris les fichiers inclus)

### Sécurité & Réseau
- **ACLs** — Gestion des listes de contrôle d'accès pour sécuriser les requêtes et transferts
- **Zone Transfers** — Configuration simplifiée pour autoriser les transferts vers les serveurs esclaves (Secondary NS)
- **TSIG Keys** — Gestion des clés d'authentification (hmac-sha256, etc.) avec support des fichiers `.key` inclus
- **Firewall** — Gestion du pare-feu avec auto-détection du backend (UFW, firewalld, nftables, iptables), ouverture/fermeture de ports, règles par IP, switch de backend en un clic
- **DNS Firewall (RPZ)** — Blocage DNS via Response Policy Zones : import de blocklists (HaGeZi, etc.), gestion CRUD, filtrage/pagination côté serveur, sync bidirectionnelle avec BIND9, support de 1M+ entrées
- **RBAC** — Gestion des rôles utilisateurs (Admin, Operator, Viewer)

### Configuration
- **Éditeur de configuration** — Édition de `named.conf.options` et `named.conf.local` avec sauvegarde automatique
- **Snapshots** — Historique des configurations en base de données
- **Backup automatique** — Sauvegarde avant chaque modification avec rollback en cas d'erreur de validation

### Monitoring
- **Dashboard** — Vue d'ensemble temps réel (zones, records, CPU, mémoire, logs récents)
- **Server Status** — Métriques système détaillées (CPU, RAM, interfaces réseau, fichiers ouverts)
- **Logs en temps réel** — Streaming WebSocket des logs BIND9 et système avec filtrage
- **Commandes rndc** — Exécution directe de commandes rndc (reload, flush, status, stats, reconfig, querylog)

### Connexion SSH distante
- **Multi-serveur** — Gérez plusieurs serveurs BIND9 depuis un seul panneau
- **Détection automatique** — Auto-détection des chemins BIND9 sur le serveur distant (Debian, CentOS, FreeBSD)
- **Auto-détection Firewall** — Détection automatique du backend pare-feu actif et des backends disponibles sur le serveur distant
- **Test de connexion** — Vérification SSH avec affichage des infos serveur (OS, version BIND9, état)
- **Basculement** — Passage transparent entre mode local et SSH
- **Reconnexion** — Restauration automatique de la connexion active au démarrage

---

## Stack Technique

| Couche | Technologies |
|--------|-------------|
| **Frontend** | React 19, Vite 7, TypeScript, Tailwind CSS 4, shadcn/ui, Recharts, Lucide React, Wouter |
| **Backend** | Node.js, Express 5, TypeScript, WebSocket (ws) |
| **Base de données** | SQLite (better-sqlite3) / PostgreSQL (pg) / MySQL (mysql2), Drizzle ORM |
| **SSH** | ssh2 (connexion, exécution de commandes, SFTP) |
| **Validation** | Zod, drizzle-zod |

---

## Architecture du Projet

```
Bind-Config/
├── client/                      # Frontend React
│   └── src/
│       ├── components/
│       │   ├── layout/
│       │   │   └── DashboardLayout.tsx   # Layout principal + sidebar
│       │   └── ui/                       # Composants shadcn/ui
│       ├── pages/
│       │   ├── dashboard.tsx             # Vue d'ensemble
│       │   ├── zones.tsx                 # Gestion des zones DNS
│       │   ├── config.tsx                # Éditeur de configuration
│       │   ├── acls.tsx                  # ACLs & TSIG Keys
│       │   ├── logs.tsx                  # Logs temps réel (WebSocket)
│       │   ├── status.tsx                # Métriques serveur
│       │   ├── connections.tsx           # Connexions SSH distantes
│       │   ├── firewall.tsx              # Gestion du pare-feu
│       │   └── firewall-dns.tsx          # DNS Firewall (RPZ)
│       ├── lib/
│       │   └── api.ts                    # Client API typé
│       └── App.tsx                       # Router
│
├── server/                      # Backend Express
│   ├── index.ts                 # Point d'entrée serveur
│   ├── routes.ts                # Tous les endpoints REST + WebSocket
│   ├── bind9-service.ts         # Service BIND9 (local + SSH)
│   ├── firewall-service.ts      # Service Pare-feu (UFW/firewalld/nftables/iptables)
│   ├── ssh-manager.ts           # Gestionnaire de connexions SSH
│   ├── storage.ts               # Couche d'accès aux données (Drizzle)
│   ├── db.ts                    # Initialisation SQLite
│   └── vite.ts                  # Middleware Vite pour le dev
│
├── shared/
│   ├── schema.ts                # Schéma Drizzle SQLite (9 tables)
│   ├── schema-pg.ts             # Schéma Drizzle PostgreSQL
│   └── schema-mysql.ts          # Schéma Drizzle MySQL
│
├── data/
│   └── bind9admin.db            # Base SQLite (auto-créée)
│
├── drizzle.config.ts            # Configuration Drizzle Kit
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## ⚡ Quick Start

```bash
# 1 — Cloner
git clone https://github.com/Steph-ux/bind9-web-ui.git
cd bind9-web-ui

# 2 — Installer (Linux : sudo apt install -y build-essential python3)
npm install

# 3 — Base de données
npm run db:push

# 4 — Lancer
npm run dev

# 5 — Ouvrir http://localhost:3001  →  admin / admin
```

> **Première connexion** : identifiants `admin` / `admin` — vous serez invité à changer le mot de passe.

---

## Installation détaillée

### Prérequis

- **Node.js** 18+
- **npm** ou **yarn**
- (Optionnel) Un serveur BIND9 accessible localement ou via SSH

### 1. Cloner le projet

```bash
git clone https://github.com/Steph-ux/bind9-web-ui.git
cd bind9-web-ui
```

### 2. Prérequis Linux (compilation du module SQLite natif)

```bash
sudo apt update && sudo apt install -y build-essential python3
```

### 3. Installer les dépendances

```bash
npm install
```

### 4. Initialiser la base de données

```bash
npm run db:push
```

Cela crée automatiquement le fichier `data/bind9admin.db` avec toutes les tables.

### 5. Lancer en développement

```bash
npm run dev
```

Le serveur démarre sur **http://localhost:3001** (backend + frontend servis ensemble).

### 6. Build de production

```bash
npm run build
npm start
```

### 7. Première connexion

Lors du premier lancement, un utilisateur administrateur est créé automatiquement :

- **URL** : http://localhost:3001
- **Utilisateur** : `admin`
- **Mot de passe** : `admin`

> ⚠️ Vous serez automatiquement redirigé vers la page de changement de mot de passe.

> **Note :** Si la connexion échoue, vous pouvez réinitialiser le mot de passe administrateur en exécutant le script de secours :
> ```bash
> npx tsx fix-admin.ts
> ```
---

## Configuration

### Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PORT` | `3001` | Port du serveur |
| `DB_TYPE` | `sqlite` | Type de base de données : `sqlite`, `postgresql`, `mysql` |
| `DATABASE_URL` | `data/bind9admin.db` | Chemin SQLite ou URL de connexion PG/MySQL |
| `SESSION_SECRET` | *(random en dev)* | Secret de session (obligatoire en production) |
| `BIND9_CONF_DIR` | `/etc/bind` | Répertoire de configuration BIND9 (mode local) |
| `BIND9_ZONE_DIR` | `/var/cache/bind` | Répertoire des fichiers de zone (mode local) |
| `RNDC_BIN` | `rndc` | Chemin vers le binaire rndc |
| `NAMED_CHECKCONF` | `named-checkconf` | Chemin vers named-checkconf |

### Mode de fonctionnement

L'application supporte deux modes :

#### Mode Local (défaut)
Le panneau interagit directement avec BIND9 sur la machine locale via les commandes `rndc` et l'accès direct aux fichiers de configuration.

#### Mode SSH (distant)
Le panneau se connecte à un serveur BIND9 distant via SSH. Toutes les commandes et opérations fichiers transitent par la connexion SSH.

Pour configurer une connexion SSH :
1. Aller dans **Connections** dans la sidebar
2. Cliquer **Add Connection**
3. Renseigner l'hôte, le port SSH, l'utilisateur et le mot de passe
4. (Optionnel) Les chemins BIND9 sont auto-détectés, mais peuvent être spécifiés manuellement
5. Cliquer **Test** pour vérifier la connexion et détecter les chemins
6. Cliquer **Activate** pour basculer en mode SSH

---

## API REST

### Dashboard
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/dashboard` | Données agrégées du tableau de bord |

### Zones
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/zones` | Lister toutes les zones |
| GET | `/api/zones/:id` | Détail d'une zone avec ses records |
| POST | `/api/zones` | Créer une zone |
| PUT | `/api/zones/:id` | Modifier une zone |
| DELETE | `/api/zones/:id` | Supprimer une zone |

### DNS Records
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/zones/:id/records` | Lister les records d'une zone |
| POST | `/api/zones/:id/records` | Ajouter un record |
| PUT | `/api/records/:id` | Modifier un record |
| DELETE | `/api/records/:id` | Supprimer un record |

### Configuration
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/config/:section` | Lire une section de configuration |
| PUT | `/api/config/:section` | Sauvegarder une section |

### ACLs
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/acls` | Lister les ACLs |
| POST | `/api/acls` | Créer une ACL |
| PUT | `/api/acls/:id` | Modifier une ACL |
| DELETE | `/api/acls/:id` | Supprimer une ACL |

### TSIG Keys
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/keys` | Lister les clés (secrets masqués) |
| POST | `/api/keys` | Créer une clé |
| DELETE | `/api/keys/:id` | Supprimer une clé |

### Logs
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/logs?level=&source=&search=` | Lister les logs avec filtres |
| DELETE | `/api/logs` | Vider les logs |
| WS | `/ws/logs` | Streaming temps réel |

### Server Status
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/status` | État BIND9 + métriques système |

### rndc Commands
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/rndc/:command` | Exécuter une commande rndc |

Commandes autorisées : `reload`, `flush`, `status`, `stats`, `reconfig`, `dumpdb`, `querylog`

### Connexions SSH
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/connections` | Lister les connexions |
| POST | `/api/connections` | Créer une connexion |
| PUT | `/api/connections/:id` | Modifier une connexion |
| DELETE | `/api/connections/:id` | Supprimer une connexion |
| POST | `/api/connections/:id/test` | Tester la connexion SSH |
| POST | `/api/connections/test` | Tester avec credentials inline |
| PUT | `/api/connections/:id/activate` | Activer (bascule en mode SSH) |
| PUT | `/api/connections/deactivate` | Désactiver (retour mode local) |

### Firewall
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/firewall/status` | État du pare-feu (actif/inactif, backend détecté, backends disponibles, règles) |
| GET | `/api/firewall/rules` | Lister les règles |
| POST | `/api/firewall/rules` | Ajouter une règle (allow/deny) |
| DELETE | `/api/firewall/rules/:id` | Supprimer une règle |
| POST | `/api/firewall/toggle` | Activer/Désactiver le pare-feu |
| POST | `/api/firewall/backend` | Changer le backend pare-feu (`{ backend: "ufw"\|"firewalld"\|"nftables"\|"iptables" }`) |

> **Backends supportés :** UFW (Debian/Ubuntu), firewalld (RHEL/CentOS/Fedora), nftables, iptables.
> L'auto-détection s'exécute en un seul appel SSH (~0.5s) et identifie le backend actif ainsi que tous les backends installés.
> Les règles configurées sont visibles même si le pare-feu est inactif.

### DNS Firewall (RPZ)
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/rpz?page=&limit=&search=&type=` | Entrées RPZ paginées avec filtrage |
| GET | `/api/rpz/stats` | Statistiques (total, par type) |
| POST | `/api/rpz` | Ajouter une entrée RPZ |
| DELETE | `/api/rpz/:id` | Supprimer une entrée |
| DELETE | `/api/rpz` | Supprimer toutes les entrées (admin) |
| GET | `/api/rpz/zone-file` | Lire le fichier de zone RPZ de BIND9 |
| POST | `/api/rpz/sync` | Synchroniser depuis le fichier de zone BIND9 |
| POST | `/api/rpz/import` | Importer depuis du texte (zone file ou liste de domaines) |
| POST | `/api/rpz/import-url` | Importer depuis une URL (max 200MB, 1M entrées, timeout 120s) |

> **Types RPZ :** `nxdomain` (bloquer), `nodata` (bloquer sans erreur), `redirect` (rediriger vers IP/domaine).
> **Import :** Supporte le format zone file RPZ et les listes de domaines (un par ligne, hosts-file).
> **Performance :** Pagination côté serveur (50/page), insertion par batch (500), déduplication efficace, sync BIND9 en arrière-plan.
> **Blocklists compatibles :** HaGeZi (TIF, Ultimate, Light), Steven Black, OISD, etc.

---

## Importation de configuration existante

L'application est conçue pour s'adapter à une installation BIND9 existante sans tout écraser.

### Au démarrage
1. **Détection récursive** : L'app analyse `named.conf` et suit tous les fichiers `include`.
2. **Zones** : Les zones définies dans `named.conf.local` sont importées en base de données.
3. **ACLs** : Les ACLs définies dans `named.conf.acls` sont importées.
4. **Clés TSIG** : Les clés définies dans `named.conf.keys` **ET** dans tout autre fichier inclus (ex: `/etc/bind/transfert.key`) sont importées.

### Gestion des conflits
- Les données existantes sont préservées.
- Si une clé (ex: `transfert-key`) est importée, elle apparaîtra dans le dashboard.
- L'application écrira ensuite cette clé dans `named.conf.keys`.
- **Recommandation** : Une fois la clé visible dans le dashboard, supprimez l'ancien `include "transfert.key";` de votre `named.conf` pour éviter les avertissements de duplication au redémarrage de BIND9.

---

## Base de Données

L'application supporte **3 moteurs de base de données** via Drizzle ORM :

### SQLite (défaut)
Aucune configuration supplémentaire. La base est auto-créée dans `data/bind9admin.db`.

```bash
npm run db:push          # Créer/mettre à jour les tables
npx drizzle-kit studio   # Visualiser la DB
```

### PostgreSQL

1. Installer et configurer PostgreSQL
2. Créer la base de données :
   ```sql
   CREATE USER bind9admin WITH PASSWORD 'bind9admin';
   CREATE DATABASE bind9admin OWNER bind9admin;
   ```
3. Configurer les variables d'environnement :
   ```bash
   export DB_TYPE=postgresql
   export DATABASE_URL=postgresql://bind9admin:bind9admin@localhost:5432/bind9admin
   ```
4. Pousser le schéma :
   ```bash
   npm run db:push:pg
   ```
5. Lancer l'application :
   ```bash
   npm run dev
   ```

### MySQL

1. Installer et configurer MySQL
2. Créer la base de données :
   ```sql
   CREATE USER 'bind9admin'@'localhost' IDENTIFIED BY 'bind9admin';
   CREATE DATABASE bind9admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   GRANT ALL PRIVILEGES ON bind9admin.* TO 'bind9admin'@'localhost';
   FLUSH PRIVILEGES;
   ```
3. Configurer les variables d'environnement :
   ```bash
   export DB_TYPE=mysql
   export DATABASE_URL=mysql://bind9admin:bind9admin@localhost:3306/bind9admin
   ```
4. Pousser le schéma :
   ```bash
   npm run db:push:mysql
   ```
5. Lancer l'application :
   ```bash
   npm run dev
   ```

### Schéma (9 tables, identique pour les 3 moteurs)

```
users           → Comptes utilisateurs
zones           → Zones DNS (domain, type, serial, filePath)
dns_records     → Enregistrements DNS (A, AAAA, CNAME, MX, TXT, NS, etc.)
acls            → Listes de contrôle d'accès
tsig_keys       → Clés TSIG pour l'authentification DNS
config_snapshots → Historique des configurations
log_entries     → Logs applicatifs
connections     → Connexions SSH distantes
rpz_entries     → Entrées DNS Firewall (RPZ) — name, type (nxdomain/nodata/redirect), target, comment
```

### Commandes Drizzle

| Commande | Description |
|----------|-------------|
| `npm run db:push` | Synchroniser le schéma SQLite |
| `npm run db:push:pg` | Synchroniser le schéma PostgreSQL |
| `npm run db:push:mysql` | Synchroniser le schéma MySQL |
| `npm run db:generate:pg` | Générer les migrations PostgreSQL |
| `npm run db:generate:mysql` | Générer les migrations MySQL |
| `npm run db:studio:pg` | Drizzle Studio pour PostgreSQL |
| `npm run db:studio:mysql` | Drizzle Studio pour MySQL |

---

## Développement

### Scripts disponibles

| Script | Description |
|--------|-------------|
| `npm run dev` | Lancer le serveur en mode dev (backend + frontend) |
| `npm run dev:client` | Lancer uniquement le frontend Vite |
| `npm run build` | Builder pour la production |
| `npm start` | Lancer la version de production |
| `npm run check` | Vérification TypeScript |
| `npm run db:push` | Synchroniser le schéma DB |

### Ajouter une nouvelle page

1. Créer le composant dans `client/src/pages/ma-page.tsx`
2. Ajouter la route dans `client/src/App.tsx`
3. Ajouter le lien dans la sidebar (`DashboardLayout.tsx`)
4. (Optionnel) Ajouter les fonctions API dans `client/src/lib/api.ts`

### Ajouter une nouvelle table

1. Définir le schéma dans `shared/schema.ts`
2. Ajouter les méthodes CRUD dans `server/storage.ts`
3. Ajouter les routes API dans `server/routes.ts`
4. Pousser le schéma : `npm run db:push`

---

## Sécurité

L'application intègre de multiples couches de sécurité :

### Authentification & Sessions
- **Hachage des mots de passe** — scrypt avec sel aléatoire (Node.js crypto)
- **Sessions sécurisées** — `express-session` avec cookies `httpOnly`, `secure` (prod), `sameSite`
- **Secret de session** — Variable `SESSION_SECRET` obligatoire en production (random en dev)
- **Forced password change** — L'utilisateur `admin` par défaut doit changer son mot de passe à la première connexion
- **Rate limiting** — 5 tentatives de login par IP / 60 secondes
- **Route dédiée** — `PUT /api/auth/password` pour que tout utilisateur authentifié change son propre mot de passe

### Contrôle d'accès (RBAC)
- **3 rôles** : `admin` (toutes les opérations), `operator` (DNS + firewall), `viewer` (lecture seule)
- **Middleware** : `requireAuth`, `requireAdmin`, `requireOperator` sur toutes les routes API
- **WebSocket auth** — Vérification du cookie de session avant acceptation de la connexion WS

### Validation des entrées
- **Zod schemas** — Validation des données entrantes sur les routes de création
- **Whitelisting des champs** — Les routes PUT n'acceptent que les champs autorisés (pas de mass assignment)
- **Validation des identifiants** — Noms de zones, ACLs, TSIG keys, sections de config validés par regex
- **Sanitisation BIND9** — Les identifiants injectés dans les fichiers de config sont nettoyés (`sanitizeIdentifier`)
- **Validation des commandes** — Les commandes rndc sont validées par regex avant exécution
- **Validation firewall** — Ports (digits only), IPs (regex CIDR), protocoles/actions/backends (whitelist)

### Protection contre les injections
- **Command injection** — Validation stricte des entrées avant interpolation dans les commandes shell
- **SQL injection** — Requêtes Drizzle ORM paramétrées + échappement des wildcards LIKE
- **Path traversal** — Validation des noms de section, chemins SSH, et paramètres de config
- **Config injection** — Nettoyage des caractères dangereux dans les fichiers BIND9 (`"';{}\n\r`)
- **Regex injection** — Sanitisation des domaines avant construction de regex dynamiques
- **SSRF** — Validation du format host/port dans le test de connexion SSH

### Headers de sécurité
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security` (production)
- `Content-Security-Policy` (production)

### Gestion des erreurs
- Les erreurs 500 en production ne leakent pas les détails internes
- Les mots de passe et clés privées SSH sont masqués dans les réponses API

### Recommandations pour la production
> **Important :** Les mots de passe SSH sont stockés en base de données en clair. Pour un environnement de production, il est recommandé de :
> - Chiffrer les mots de passe en base (AES-256)
> - Utiliser un coffre-fort de secrets (HashiCorp Vault, etc.)
> - Privilégier l'authentification par clé SSH
> - Utiliser un store de session externe (Redis/PostgreSQL) au lieu du store mémoire
> - Ajouter une protection CSRF (`csurf` ou double-submit cookie)
> - Activer la vérification des clés hôtes SSH pour prévenir les attaques MITM
> - Implémenter un journal d'audit pour les actions administrateurs

### Configuration sudoers pour SSH distant

Pour que les commandes BIND9 et pare-feu fonctionnent sans mot de passe sudo sur le serveur distant, ajoutez cette entrée dans `/etc/sudoers.d/bind9` :

```bash
echo "<utilisateur> ALL=(ALL) NOPASSWD: /usr/sbin/rndc, /usr/sbin/named, /usr/sbin/named-checkconf, /usr/sbin/ufw, /usr/sbin/nft, /usr/sbin/iptables, /usr/sbin/iptables-save, /usr/bin/firewall-cmd, /usr/bin/systemctl" > /etc/sudoers.d/bind9
chmod 440 /etc/sudoers.d/bind9
```

> **Important :** Sans cette configuration, les opérations pare-feu et rndc via SSH renverront une erreur "sudo: a password is required".

---

## Licence

MIT License — Copyright © 2025 Stephane ASSOGBA
