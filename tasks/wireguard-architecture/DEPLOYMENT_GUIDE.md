# Guide de Deploiement : Reseau Dedie WireGuard pour BIND9

Ce document presente la procedure pas-a-pas pour deployer un reseau d'overlay chiffre WireGuard entre vos serveurs DNS (`dnsrpz01: 192.168.11.103` et `dnsrpz02: 192.168.11.106`) et votre poste d'administration.

---

## 1. Objectifs de Securite

1. **Chiffrement des transferts de zones (AXFR / IXFR)** : Les zones DNS internes contiennent l'inventaire complet de votre reseau. Sur WireGuard, ce trafic est chiffre en ChaCha20-Poly1305.
2. **Cloisonnement de l'administration** : Les ports sensibles (SSH 22, RNDC 953) ne sont plus exposes directement sur le LAN physique `ens18` mais uniquement a l'interieur du tunnel `wg0`.
3. **Maintien de la disponibilite pour les utilisateurs** : Les postes clients de l'entreprise continuent d'interroger BIND9 sur le port 53 de `192.168.11.103` sans aucune modification ni logiciel client requis.

---

## 2. Plan d'Adressage WireGuard

| Equipement | IP Physique LAN (ens18) | IP Privee WireGuard (wg0) | Role |
|---|---|---|---|
| **dnsrpz01** | `192.168.11.103` | `10.50.0.1/24` | BIND9 Maitre (Master) |
| **dnsrpz02** | `192.168.11.106` | `10.50.0.2/24` | BIND9 Esclave (Slave AXFR) |
| **Admin** | `192.168.11.74` / `.221` | `10.50.0.10/24` | Console Web / SSH / RNDC |

---

## 3. Procedure d'Installation sur les Serveurs Debian 12

### Etape 1 : Installation du paquet WireGuard
Sur `dnsrpz01` et `dnsrpz02` :
```bash
sudo apt update
sudo apt install -y wireguard
```

### Etape 2 : Generation des paires de cles cryptographiques
Sur `dnsrpz01` :
```bash
cd /etc/wireguard
umask 077
wg genkey | tee privatekey_dnsrpz01 | wg pubkey > publickey_dnsrpz01
cat privatekey_dnsrpz01
cat publickey_dnsrpz01
```

Sur `dnsrpz02` :
```bash
cd /etc/wireguard
umask 077
wg genkey | tee privatekey_dnsrpz02 | wg pubkey > publickey_dnsrpz02
cat privatekey_dnsrpz02
cat publickey_dnsrpz02
```

### Etape 3 : Deploiement des fichiers de configuration
1. Copier la maquette `wg0-dnsrpz01.conf` vers `/etc/wireguard/wg0.conf` sur `192.168.11.103` en y inserant les cles generees.
2. Copier la maquette `wg0-dnsrpz02.conf` vers `/etc/wireguard/wg0.conf` sur `192.168.11.106` en y inserant les cles generees.
3. Fixer les permissions de securite :
```bash
sudo chmod 600 /etc/wireguard/wg0.conf
```

### Etape 4 : Activation et demarrage du service WireGuard
Sur chaque serveur :
```bash
sudo systemctl enable --now wg-quick@wg0
```

Verification du statut du tunnel :
```bash
sudo wg show
```
Tester la connectivite privee chiffree :
```bash
# Depuis dnsrpz01 :
ping -c 3 10.50.0.2

# Depuis dnsrpz02 :
ping -c 3 10.50.0.1
```

---

## 4. Basculement de BIND9 sur le Reseau WireGuard

Une fois le ping `10.50.0.1 <-> 10.50.0.2` etabli :

1. **Sur le maitre dnsrpz01** :
   - Modifier `/etc/bind/named.conf.options` pour ajouter `10.50.0.1` dans `listen-on port 53`.
   - Modifier `/etc/bind/named.conf.local` pour que `allow-transfer` et `also-notify` pointent sur `10.50.0.2`.
   - Recharger : `sudo rndc reload`.

2. **Sur l'esclave dnsrpz02** :
   - Modifier `/etc/bind/named.conf.options` pour ajouter `10.50.0.2` dans `listen-on port 53`.
   - Modifier `/etc/bind/named.conf.local` pour que la directive `masters` pointe sur `10.50.0.1`.
   - Recharger : `sudo rndc reload`.

3. **Validation du transfert de zone AXFR** :
```bash
# Tester le transfert depuis dnsrpz02 sur le tunnel prive :
dig @10.50.0.1 AXFR intra.isoceltelecom.com
```

---

## 5. Application des Regles de Filtrage nftables

Remplacer ou completer `/etc/nftables.conf` par la maquette `nftables-wireguard.conf` :
```bash
sudo nft -c -f /etc/nftables.conf
sudo systemctl reload nftables
```

L'infrastructure BIND9 dispose desormais de son propre reseau prive, invisible et hermetiquement separe du reseau bureautique standard.
