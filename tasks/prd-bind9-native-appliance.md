# PRD: BIND9 Native Appliance & Adaptive Control Plane

## 1. Introduction / Overview

BIND9 Configurator is transitioning from an external SSH-driven remote controller to a **Native Local Appliance Architecture**. The application is installed directly on the target host running the BIND9 DNS server, providing direct, zero-latency system integration with local configuration files, `rndc` controls, and `systemd` daemons.

The system must support two operational realities:
1. **Brownfield Deployments**: Existing servers with pre-configured BIND9 installations. The platform must inspect, traverse recursive `include` directives, and discover ACLs, keys, and zones even if they are defined inside shared monolithic configuration files (e.g. `named.conf.options`, `named.conf.local`), without overwriting or corrupting prior administrator configurations.
2. **Greenfield Deployments**: Clean hosts where BIND9 is not yet present or configured. The platform must provide an automated setup wizard to install packages, scaffold directory structures, generate baseline configuration profiles, and start the local DNS daemon.

The platform provides a modern, compact, fully bilingual (French & English) administrative web dashboard, with real-time hardware metrics, firewall management (UFW, firewalld, nftables, iptables), Response Policy Zone (RPZ) threat blocking, and TSIG cryptographic zone transfer controls.

---

## 2. Goals

- **Zero-SSH Native Operation**: Operate entirely through direct local host execution (filesystem access, local `rndc`, local systemd/service controls) with zero network overhead and 0ms startup timeout delays.
- **Intelligent Brownfield Auto-adaptation**: Inspect existing BIND9 file trees, follow all `include` hierarchies, and parse configuration blocks without destructive rewrites.
- **Greenfield Auto-provisioning**: Provide an integrated wizard to install BIND9 and generate validated configurations for Authoritative, Caching, or Hybrid DNS architectures.
- **Strict Bilingual Consistency**: Enforce complete, flawless dynamic translation (French and English) across 100% of the UI surfaces (dashboards, headers, metric cards, forms, tables, dialogs, toasts).
- **Truthful System Telemetry**: Display only real, verified hardware and firewall states; strictly eliminate fake mock statuses, misleading green active indicators, or simulated daemon states.
- **Ergonomic, Stable UI**: Maintain a sticky fixed sidebar during scrolling, eliminate vertical form card stretching, and eliminate redundant status badges from headers.

---

## 3. User Stories

### US-001: Native Local Appliance Execution
**Description:** As a system administrator, I want the application to interact directly with the local OS and BIND9 files without requiring SSH connections, so that operations are instant and independent of network credentials.

**Acceptance Criteria:**
- [ ] Application defaults to native local engine mode targeting `/etc/bind`, `/var/cache/bind`, and `/run/named/named.pid`.
- [ ] Server startup contains zero SSH connection retry loops or blocking timeouts.
- [ ] `rndc` commands (`reload`, `flush`, `status`) execute locally via local binary/socket.
- [ ] Typecheck/lint passes (`npm run check`).

### US-002: Brownfield BIND9 Configuration Auto-Discovery
**Description:** As an infrastructure engineer with an existing BIND9 setup, I want the system to parse my existing `named.conf` tree and identify existing ACLs, keys, and zones without breaking my existing setup.

**Acceptance Criteria:**
- [ ] Recursive traversal parser follows all `include` statements starting from the primary `named.conf`.
- [ ] ACL blocks defined inside non-standard or monolithic files (e.g. `named.conf.options`) are discovered and made manageable.
- [ ] TSIG keys with existing secrets are loaded with secret masking in the UI.
- [ ] Existing valid configuration files are never replaced or overwritten without explicit administrator action.
- [ ] Typecheck/lint passes (`npm run check`).

### US-003: Greenfield Automated Setup Wizard
**Description:** As an administrator on a new server without BIND9, I want an automated installation wizard so that I can install and initialize a functional DNS server directly from the web interface.

**Acceptance Criteria:**
- [ ] Wizard accurately detects host OS distribution (Debian, Ubuntu, Rocky, CentOS) and package availability.
- [ ] Supports profile selection: Authoritative DNS, Caching/Recursive Resolver, or Hybrid.
- [ ] Executes validation with `named-checkconf` prior to service activation.
- [ ] Typecheck/lint passes (`npm run check`).
- [ ] Verify in browser using dev-browser skill.

### US-004: Strict Bilingual Interface (French & English)
**Description:** As a multilingual network operator, I want the entire platform to seamlessly toggle between French and English with zero mixed languages.

**Acceptance Criteria:**
- [ ] 100% of route titles, metric cards, action buttons, table columns, modal dialogs, and notifications are bound to `i18n.tsx`.
- [ ] Language toggle in top navigation bar immediately updates all visible text without page reload.
- [ ] No hardcoded English strings appear when French is active, and vice versa.
- [ ] Typecheck/lint passes (`npm run check`).
- [ ] Verify in browser using dev-browser skill.

### US-005: Accurate System Firewall Detection
**Description:** As a security auditor, I want the network firewall module to report real OS firewall status so that I am never presented with false "Active" states or synthetic rules.

**Acceptance Criteria:**
- [ ] Backend probes real installed host utilities (`ufw`, `firewalld`, `nftables`, `iptables`).
- [ ] When no supported firewall engine is installed, status displays "Firewall Not Detected" with installation instructions and NO green pulsating dot.
- [ ] When a firewall is installed but stopped, status displays "Inactive" with switch toggled off.
- [ ] Rule creation is disabled when no firewall backend is present.
- [ ] Typecheck/lint passes (`npm run check`).
- [ ] Verify in browser using dev-browser skill.

### US-006: Ergonomic Layout & Sticky Navigation
**Description:** As a user managing long DNS tables and firewall rules, I want the sidebar and input forms to remain accessible and properly proportioned as I scroll.

**Acceptance Criteria:**
- [ ] Left navigation sidebar remains sticky (`sticky top-0 h-screen`) while the main content scrolls vertically.
- [ ] Form panels (e.g. "Add New Rule" on RPZ and firewall screens) remain compact and do not stretch to table height.
- [ ] Redundant header status badges (e.g. "2 zones au total", "Appliance locale", "BIND9 Non Détecté") are removed from page headers.
- [ ] Typecheck/lint passes (`npm run check`).
- [ ] Verify in browser using dev-browser skill.

---

## 4. Functional Requirements

- **FR-1**: The platform must execute in native local appliance mode by default, accessing configuration files on the local filesystem.
- **FR-2**: All startup routines must initiate immediately without attempting remote SSH connections or waiting for remote timeouts.
- **FR-3**: The BIND9 parser must recursively resolve all `include` directives starting from the primary `named.conf` file to build a comprehensive inventory of all defined zones, ACLs, and TSIG keys.
- **FR-4**: If pre-existing ACLs are found outside of `named.conf.acls`, the system must catalog them in read/manage mode without damaging surrounding configurations.
- **FR-5**: If BIND9 is absent from the host, the dashboard must present the setup wizard allowing automated installation via system package managers (`apt-get`, `dnf`).
- **FR-6**: The system must run `named-checkconf` and `named-checkzone` syntax checks before committing any modifications to zone files or configuration blocks.
- **FR-7**: The firewall service must detect installed Linux packet filters (`ufw`, `firewalld`, `nftables`, `iptables`).
- **FR-8**: If no firewall engine is detected, the UI must display a clear "Not Detected" alert banner and disable rule creation actions.
- **FR-9**: The interface must support full runtime language switching between French (`fr`) and English (`en`), with all dictionary keys managed centralized in `client/src/lib/i18n.tsx`.
- **FR-10**: The desktop sidebar (`<aside>`) must remain fixed in the viewport (`sticky top-0 h-screen`) during content scrolling.
- **FR-11**: The RPZ DNS firewall module must allow adding NXDOMAIN, NODATA, and REDIRECT policies, with form cards maintaining compact dimensions (`h-fit`).
- **FR-12**: System metrics (CPU, RAM, Uptime, BIND9 daemon status) must reflect real operating system telemetry via native OS APIs.

---

## 5. Non-Goals (Out of Scope)

- **Remote SSH Multi-Node Management**: Legacy SSH orchestration to remote secondary servers is deprecated and removed from this appliance profile.
- **DHCP / IPAM Server Integration**: Managing Kea or ISC DHCP configurations is out of scope (strictly focused on BIND9 DNS).
- **Public Cloud DNS Synchronization**: Direct real-time synchronization with AWS Route53 or Cloudflare public DNS APIs is out of scope.
- **Non-BIND DNS Daemons**: Support for PowerDNS, Unbound, or CoreDNS is out of scope.

---

## 6. Design & Ergonomic Considerations

- **Design Philosophy**: High density, clean administrative control plane, soft tactile elevation, zero decorative AI slop.
- **Color Palette & Indicators**:
  - Green / Emerald: Active, healthy, running services.
  - Amber / Yellow: Warning, inactive services, missing optional packages.
  - Red / Rose: Error, service failed, blocked threat.
  - Indigo / Violet: Primary navigational accents and brand identity.
- **Component Architecture**:
  - `DashboardLayout`: Sticky left sidebar with nested scroll area, top action bar with quick reload and language selector.
  - `PageHeader`: Clean title, subtitle, and primary contextual action buttons without redundant pill badges.
  - `MetricCard`: Standardized KPI indicators with consistent typography and iconography.

---

## 7. Technical Considerations

- **Backend Runtime**: Node.js 20+ with native TypeScript compilation (`tsx` / `esbuild`).
- **Frontend Stack**: React 18, Vite 7, Tailwind CSS, Radix UI, TanStack React Query, Lucide icons.
- **Database**: SQLite (via `better-sqlite3`) in WAL mode for persistent application users, audit logs, and RPZ blocklists.
- **BIND9 Integration**:
  - Daemon management: `systemctl status/start/stop/restart named` (or `bind9`).
  - Control channel: `rndc reload`, `rndc flush`, `rndc status`.
  - Validation: `named-checkconf -z`, `named-checkzone`.
- **Operating Systems Supported**: Debian 11/12, Ubuntu 20.04/22.04/24.04, Rocky Linux 8/9, AlmaLinux 8/9.

---

## 8. Success Metrics

- **Startup Latency**: Server boots to listening status in under 500ms (0ms blocking timeout).
- **Configuration Preservation**: 0% accidental overwrite or deletion of pre-existing valid BIND9 configurations during brownfield onboarding.
- **Bilingual Coverage**: 100% of UI elements translated; 0 untranslated strings when switching language.
- **Telemetry Accuracy**: 0 false positive "Active" indicators for uninstalled or stopped firewalls.
- **Syntax Safety**: 100% of configuration changes validated with `named-checkconf` prior to daemon reload.

---

## 9. Open Questions

1. Should the platform offer a one-click configuration backup and restore archive (`.tar.gz`) directly from the dashboard header?
2. Should custom systemd service unit names (e.g. `named-chroot.service` on RHEL/CentOS) be auto-detected via `systemctl list-unit-files`?
