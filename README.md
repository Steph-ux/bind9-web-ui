# BIND9 Admin Panel

> Panneau d'administration web complet pour serveurs **BIND9**, avec support de gestion **locale** et **distante via SSH**.

![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.0-000?logo=express)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

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
| **Base de données** | SQLite (better-sqlite3), Drizzle ORM |
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
│       │   └── firewall.tsx              # Gestion du pare-feu
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
│   └── schema.ts                # Schéma Drizzle (8 tables)
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

## Installation

### Prérequis

- **Node.js** 18+
- **npm** ou **yarn**
- (Optionnel) Un serveur BIND9 accessible localement ou via SSH

### 1. Cloner le projet

```bash
git clone https://github.com/Steph-ux/bind9.git
cd bind9
```

### 2. Prérequis Linux (compilation du module SQLite natif)

```bash
sudo apt update && sudo apt install -y build-essential python3
```

### 3. Installer les dépendances

```bash
npm install
```

### 3. Initialiser la base de données

```bash
npm run db:push
```

Cela crée automatiquement le fichier `data/bind9admin.db` avec toutes les tables.

### 4. Lancer en développement

```bash
npm run dev
```

Le serveur démarre sur **http://localhost:3001** (backend + frontend servis ensemble).

### 5. Build de production

```bash
npm run build
npm start
```

### 6. Premier Connexion

Lors du premier lancement, un utilisateur administrateur est créé automatiquement :

- **URL** : http://localhost:3001
- **Utilisateur** : `admin`
- **Mot de passe** : `admin`

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
| `DATABASE_URL` | `data/bind9admin.db` | Chemin vers la base SQLite |
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

### Schéma (SQLite, 8 tables)

```
users           → Comptes utilisateurs
zones           → Zones DNS (domain, type, serial, filePath)
dns_records     → Enregistrements DNS (A, AAAA, CNAME, MX, TXT, NS, etc.)
acls            → Listes de contrôle d'accès
tsig_keys       → Clés TSIG pour l'authentification DNS
config_snapshots → Historique des configurations
log_entries     → Logs applicatifs
connections     → Connexions SSH distantes
```

### Commandes Drizzle

```bash
# Pousser le schéma vers la DB (créer/mettre à jour les tables)
npm run db:push

# Générer une migration
npx drizzle-kit generate

# Visualiser la DB
npx drizzle-kit studio
```

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

> **Note :** Les mots de passe SSH sont stockés en base de données en clair. Pour un environnement de production, il est recommandé de :
> - Chiffrer les mots de passe en base
> - Utiliser un coffre-fort de secrets (HashiCorp Vault, etc.)
> - Privilégier l'authentification par clé SSH
> - L'authentification par session et JWT est activée et sécurisée.
> - Les mots de passe utilisateurs sont hachés (scrypt).

### Configuration sudoers pour SSH distant

Pour que les commandes BIND9 et pare-feu fonctionnent sans mot de passe sudo sur le serveur distant, ajoutez cette entrée dans `/etc/sudoers.d/bind9` :

```bash
echo "<utilisateur> ALL=(ALL) NOPASSWD: /usr/sbin/rndc, /usr/sbin/named, /usr/sbin/named-checkconf, /usr/sbin/ufw, /usr/sbin/nft, /usr/sbin/iptables, /usr/sbin/iptables-save, /usr/bin/firewall-cmd, /usr/bin/systemctl" > /etc/sudoers.d/bind9
chmod 440 /etc/sudoers.d/bind9
```

> **Important :** Sans cette configuration, les opérations pare-feu et rndc via SSH renverront une erreur "sudo: a password is required".

---

## Licence

MIT
