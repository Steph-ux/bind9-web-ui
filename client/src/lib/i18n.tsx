import React, { createContext, useContext, useEffect, useState } from "react";

export type Language = "fr" | "en";

export interface Translations {
  common: {
    refresh: string;
    refreshing: string;
    save: string;
    saving: string;
    cancel: string;
    delete: string;
    deleting: string;
    edit: string;
    create: string;
    search: string;
    filter: string;
    status: string;
    active: string;
    inactive: string;
    enabled: string;
    disabled: string;
    exportReport: string;
    confirm: string;
    actions: string;
    unknown: string;
    loading: string;
  };
  nav: {
    dnsManagement: string;
    securityFiltering: string;
    infrastructure: string;
    overview: string;
    zones: string;
    zoneEditor: string;
    config: string;
    acls: string;
    logs: string;
    status: string;
    firewallRpz: string;
    blacklist: string;
    firewall: string;
    apiTokens: string;
    replication: string;
    users: string;
    profile: string;
    logout: string;
    adminSubtitle: string;
    quickPalette: string;
  };
  theme: {
    light: string;
    dark: string;
    auto: string;
  };
  dashboard: {
    title: string;
    subtitle: string;
    zonesCard: string;
    zonesDesc: string;
    recordsCard: string;
    recordsDesc: string;
    uptimeCard: string;
    uptimeDesc: string;
    resourcesCard: string;
    cpu: string;
    ram: string;
    serviceInactive: string;
    reloadBind: string;
    reloadSuccess: string;
    flushCache: string;
    flushSuccess: string;
    dnsTester: string;
    dnsTesterDesc: string;
    queryTest: string;
    recentLogs: string;
    recentLogsDesc: string;
    distributionTitle: string;
    distributionSubtitle: string;
    bindOnline: string;
    bindOffline: string;
  };
  zones: {
    title: string;
    subtitle: string;
    totalZones: string;
    createZone: string;
    syncBind: string;
    filterPlaceholder: string;
    visibleZones: string;
    activeZones: string;
    masterZones: string;
    secondaryZones: string;
  };
  acls: {
    title: string;
    subtitle: string;
    managedAcls: string;
    managedAclsDesc: string;
    managedKeys: string;
    managedKeysDesc: string;
    aclFile: string;
    keysFile: string;
    createAcl: string;
    createKey: string;
    included: string;
    missing: string;
    writable: string;
    readOnly: string;
  };
  status: {
    title: string;
    subtitle: string;
    cpuUsage: string;
    memory: string;
    systemUptime: string;
    openFiles: string;
    executionEnv: string;
    mode: string;
    target: string;
    hostState: string;
    bindAccess: string;
    writableSurfaces: string;
    interfaces: string;
    processInfo: string;
    capabilities: string;
    forwarders: string;
    accessControls: string;
  };
  rpz: {
    title: string;
    subtitle: string;
    totalRules: string;
    blockedNxdomain: string;
    blockedNodata: string;
    redirected: string;
    addNewRule: string;
    blockOrRedirect: string;
    domainName: string;
    wildcardsSupported: string;
    action: string;
    blockNxdomain: string;
    blockNodata: string;
    redirect: string;
    redirectTarget: string;
    commentOptional: string;
    reasonPlaceholder: string;
    addRuleBtn: string;
    quickActions: string;
    syncFromBind: string;
    clearAllRules: string;
    activeRules: string;
    allTypes: string;
    searchPlaceholder: string;
    domainCol: string;
    typeCol: string;
    targetCol: string;
    commentCol: string;
    actionsCol: string;
    noRules: string;
    noRulesDesc: string;
    previous: string;
    next: string;
    deleteTitle: string;
    deleteDesc: string;
    clearTitle: string;
    clearDesc: string;
  };
  firewall: {
    title: string;
    subtitle: string;
    protectionCard: string;
    protectionActive: string;
    protectionInactive: string;
    protectionNotInstalled: string;
    protectionActiveDesc: string;
    protectionInactiveDesc: string;
    backendCard: string;
    backendUnavailable: string;
    backendDesc: string;
    loadedRulesCard: string;
    loadedRulesDesc: string;
    availableBackendsCard: string;
    availableBackendsDesc: string;
    statusActive: string;
    statusInactive: string;
    statusNotDetected: string;
    notDetectedDesc: string;
    installSupported: string;
    protectedDesc: string;
    exposedDesc: string;
    updating: string;
    enabled: string;
    disabled: string;
    activeOnStartup: string;
    activeRules: string;
    configuredRules: string;
    addRule: string;
    noRulesTitle: string;
    noRulesDesc: string;
    createFirstRule: string;
    deleteRuleTitle: string;
    deleteRuleDesc: string;
    deleteRuleBtn: string;
    ruleFrom: string;
    ruleProtocol: string;
    ruleNum: string;
    ruleAction: string;
    ruleDirection: string;
  };
  logs: {
    title: string;
    subtitle: string;
    allStreams: string;
    bindDaemon: string;
    application: string;
    visibleLogs: string;
    appEvents: string;
    bindEntries: string;
    viewMode: string;
  };
}

const translations: Record<Language, Translations> = {
  fr: {
    common: {
      refresh: "Actualiser",
      refreshing: "Actualisation...",
      save: "Enregistrer",
      saving: "Enregistrement...",
      cancel: "Annuler",
      delete: "Supprimer",
      deleting: "Suppression...",
      edit: "Modifier",
      create: "Créer",
      search: "Rechercher...",
      filter: "Filtrer",
      status: "État",
      active: "Actif",
      inactive: "Inactif",
      enabled: "Activé",
      disabled: "Désactivé",
      exportReport: "Exporter rapport",
      confirm: "Confirmer",
      actions: "Actions",
      unknown: "Inconnu",
      loading: "Chargement en cours...",
    },
    nav: {
      dnsManagement: "Gestion DNS",
      securityFiltering: "Sécurité & Filtrage",
      infrastructure: "Infrastructure",
      overview: "Vue d'ensemble",
      zones: "Zones DNS",
      zoneEditor: "Éditeur de Zone",
      config: "Configuration",
      acls: "ACLs & Clés",
      logs: "Logs & Audit",
      status: "Statut Serveur",
      firewallRpz: "Pare-feu RPZ",
      blacklist: "Liste Noire IP",
      firewall: "Pare-feu Réseau",
      apiTokens: "Jetons API",
      replication: "Réplication Cluster",
      users: "Utilisateurs",
      profile: "Profil Utilisateur",
      logout: "Déconnexion",
      adminSubtitle: "Administration DNS",
      quickPalette: "Palette rapide",
    },
    theme: {
      light: "Clair",
      dark: "Sombre",
      auto: "Automatique",
    },
    dashboard: {
      title: "Supervision BIND9 & Control Plane",
      subtitle: "Métriques en direct, état de santé du cluster DNS et activité des requêtes autoritaires.",
      zonesCard: "Zones Autoritaires",
      zonesDesc: "actives / synchronisées",
      recordsCard: "Enregistrements DNS",
      recordsDesc: "Directes, inverses & règles RPZ",
      uptimeCard: "Disponibilité BIND9",
      uptimeDesc: "Temps d'activité du service",
      resourcesCard: "Ressources Serveur",
      cpu: "CPU",
      ram: "RAM",
      serviceInactive: "Service inactif sur cet hôte",
      reloadBind: "Recharger BIND9",
      reloadSuccess: "Configuration BIND9 et zones rechargées avec succès.",
      flushCache: "Purger le Cache",
      flushSuccess: "Cache DNS purgé avec succès.",
      dnsTester: "Testeur de Résolution DNS",
      dnsTesterDesc: "Interrogation directe du serveur BIND9 (dig / resolver natif)",
      queryTest: "Tester",
      recentLogs: "Journal d'Audit & Événements DNS",
      recentLogsDesc: "Flux des requêtes DNS, transferts de zone et sauvegardes",
      distributionTitle: "Répartition des Enregistrements DNS",
      distributionSubtitle: "Ventilation typologique à travers les catalogues autoritaires",
      bindOnline: "BIND9 En Ligne (v9.18)",
      bindOffline: "BIND9 Non Détecté",
    },
    zones: {
      title: "Gestion des Zones DNS",
      subtitle: "Catalogue des zones directes, inverses et forwarders sous contrôle de BIND9.",
      totalZones: "zones au total",
      createZone: "Créer une zone",
      syncBind: "Synchroniser BIND9",
      filterPlaceholder: "Filtrer par nom de domaine...",
      visibleZones: "Zones Visibles",
      activeZones: "Zones Actives",
      masterZones: "Zones Primaires",
      secondaryZones: "Secondaires & Forward",
    },
    acls: {
      title: "Listes de Contrôle (ACL) & Clés TSIG",
      subtitle: "Gestion des règles de filtrage réseau et des clés cryptographiques de transfert de zone.",
      managedAcls: "Listes d'Accès (ACL)",
      managedAclsDesc: "Règles d'accès réseau actives",
      managedKeys: "Clés TSIG",
      managedKeysDesc: "Clés cryptographiques configurées",
      aclFile: "Fichier named.conf.acls",
      keysFile: "Fichier named.conf.keys",
      createAcl: "Créer une règle ACL",
      createKey: "Générer une clé TSIG",
      included: "Inclus",
      missing: "Absent",
      writable: "Écriture",
      readOnly: "Lecture seule",
    },
    status: {
      title: "Statut du Serveur",
      subtitle: "Supervision du processeur, mémoire vive, processus BIND9 et capacités d'administration.",
      cpuUsage: "Utilisation CPU",
      memory: "Mémoire RAM",
      systemUptime: "Temps d'activité",
      openFiles: "Fichiers Ouverts",
      executionEnv: "Environnement d'Exécution",
      mode: "Mode",
      target: "Hôte Cible",
      hostState: "État Hôte",
      bindAccess: "Accès BIND9",
      writableSurfaces: "Surfaces Éditables",
      interfaces: "Interfaces Réseau",
      processInfo: "Processus Démon BIND9",
      capabilities: "Capacités d'Administration",
      forwarders: "Redirecteurs Globaux (Forwarders)",
      accessControls: "Contrôles d'Accès Globaux",
    },
    rpz: {
      title: "Pare-feu DNS (RPZ)",
      subtitle: "Filtrage préventif des menaces et contrôle des domaines indésirables par Response Policy Zones.",
      totalRules: "Règles RPZ Actives",
      blockedNxdomain: "Bloqués (NXDOMAIN)",
      blockedNodata: "Silencieux (NODATA)",
      redirected: "Redirigés (CNAME)",
      addNewRule: "Ajouter une règle",
      blockOrRedirect: "Bloquer ou rediriger un domaine",
      domainName: "Nom de domaine",
      wildcardsSupported: "Les jokers comme *.example.com sont pris en charge automatiquement.",
      action: "Action",
      blockNxdomain: "Bloquer (NXDOMAIN)",
      blockNodata: "Bloquer en silence (NODATA)",
      redirect: "Rediriger (CNAME / IP)",
      redirectTarget: "Cible de redirection (IP ou FQDN)",
      commentOptional: "Commentaire (Optionnel)",
      reasonPlaceholder: "Motif de filtrage...",
      addRuleBtn: "Ajouter la règle",
      quickActions: "Actions Rapides",
      syncFromBind: "Synchroniser depuis le fichier de zone",
      clearAllRules: "Purger toutes les règles",
      activeRules: "Règles RPZ Actives",
      allTypes: "Tous les types",
      searchPlaceholder: "Rechercher un domaine...",
      domainCol: "Domaine",
      typeCol: "Action / Type",
      targetCol: "Cible",
      commentCol: "Commentaire",
      actionsCol: "Actions",
      noRules: "Aucune règle RPZ",
      noRulesDesc: "Ajoutez une règle manuellement ou synchronisez avec le serveur BIND9.",
      previous: "Précédent",
      next: "Suivant",
      deleteTitle: "Supprimer la règle RPZ",
      deleteDesc: "Êtes-vous sûr de vouloir supprimer cette règle ? Les requêtes vers ce domaine ne seront plus filtrées par cette politique.",
      clearTitle: "Purger toutes les règles",
      clearDesc: "Cette action supprimera toutes les règles de la base de données. Êtes-vous sûr ?",
    },
    firewall: {
      title: "Pare-feu Réseau",
      subtitle: "Gestion de la protection réseau de l'hôte, sélection du moteur et règles de filtrage de paquets.",
      protectionCard: "Protection Réseau",
      protectionActive: "Active",
      protectionInactive: "Inactive",
      protectionNotInstalled: "Non Détecté",
      protectionActiveDesc: "État opérationnel du pare-feu actif.",
      protectionInactiveDesc: "Aucun moteur de pare-feu supporté détecté.",
      backendCard: "Moteur Actif",
      backendUnavailable: "Indisponible",
      backendDesc: "option(s) de moteur détectée(s).",
      loadedRulesCard: "Règles Chargées",
      loadedRulesDesc: "Règles appliquées sur le moteur sélectionné.",
      availableBackendsCard: "Moteurs Disponibles",
      availableBackendsDesc: "Moteurs de filtrage supportés sur cet hôte.",
      statusActive: "Pare-feu Actif",
      statusInactive: "Pare-feu Inactif",
      statusNotDetected: "Aucun Pare-feu Réseau Détecté",
      notDetectedDesc: "Aucun moteur de pare-feu n'a été trouvé sur ce système. Installez l'un des moteurs supportés pour activer la protection :",
      installSupported: "Installez l'un des moteurs supportés (UFW, firewalld, nftables, iptables).",
      protectedDesc: "Votre système est protégé. Les connexions entrantes sont bloquées sauf autorisation explicite.",
      exposedDesc: "Le système est actuellement exposé à tout le trafic entrant. Activez le pare-feu pour sécuriser vos interfaces réseau.",
      updating: "Mise à jour...",
      enabled: "Activé",
      disabled: "Désactivé",
      activeOnStartup: "Actif au démarrage",
      activeRules: "Règles Actives",
      configuredRules: "Règles Configurées",
      addRule: "Ajouter une règle",
      noRulesTitle: "Aucune règle définie",
      noRulesDesc: "La politique de filtrage est vide. Ajoutez des règles pour autoriser le trafic vers vos services.",
      createFirstRule: "Créer une première règle",
      deleteRuleTitle: "Supprimer la règle de pare-feu",
      deleteRuleDesc: "Êtes-vous sûr de vouloir supprimer cette règle de filtrage ? Cette action est irréversible.",
      deleteRuleBtn: "Supprimer la règle",
      ruleFrom: "Source :",
      ruleProtocol: "Protocole :",
      ruleNum: "Règle #",
      ruleAction: "Action",
      ruleDirection: "Direction",
    },
    logs: {
      title: "Logs & Audit",
      subtitle: "Journalisation en continu des requêtes, rechargements et alertes de sécurité.",
      allStreams: "Tous les flux",
      bindDaemon: "Démon BIND9",
      application: "Applicatif",
      visibleLogs: "Journaux visibles",
      appEvents: "Événements applicatifs",
      bindEntries: "Entrées BIND9",
      viewMode: "Mode d'affichage",
    },
  },
  en: {
    common: {
      refresh: "Refresh",
      refreshing: "Refreshing...",
      save: "Save",
      saving: "Saving...",
      cancel: "Cancel",
      delete: "Delete",
      deleting: "Deleting...",
      edit: "Edit",
      create: "Create",
      search: "Search...",
      filter: "Filter",
      status: "Status",
      active: "Active",
      inactive: "Inactive",
      enabled: "Enabled",
      disabled: "Disabled",
      exportReport: "Export report",
      confirm: "Confirm",
      actions: "Actions",
      unknown: "Unknown",
      loading: "Loading...",
    },
    nav: {
      dnsManagement: "DNS Management",
      securityFiltering: "Security & Filtering",
      infrastructure: "Infrastructure",
      overview: "Overview",
      zones: "DNS Zones",
      zoneEditor: "Zone Editor",
      config: "Configuration",
      acls: "ACLs & Keys",
      logs: "Logs & Audit",
      status: "Server Status",
      firewallRpz: "RPZ Firewall",
      blacklist: "IP Blacklist",
      firewall: "Network Firewall",
      apiTokens: "API Tokens",
      replication: "Cluster Replication",
      users: "Users",
      profile: "User Profile",
      logout: "Sign Out",
      adminSubtitle: "DNS Administration",
      quickPalette: "Quick palette",
    },
    theme: {
      light: "Light",
      dark: "Dark",
      auto: "Automatic",
    },
    dashboard: {
      title: "BIND9 Monitoring & Control Plane",
      subtitle: "Live metrics, DNS cluster health status and authoritative query activity.",
      zonesCard: "Authoritative Zones",
      zonesDesc: "active / synchronized",
      recordsCard: "DNS Records",
      recordsDesc: "Forward, reverse & RPZ rules",
      uptimeCard: "BIND9 Availability",
      uptimeDesc: "Service operational uptime",
      resourcesCard: "Server Resources",
      cpu: "CPU",
      ram: "RAM",
      serviceInactive: "Service inactive on this host",
      reloadBind: "Reload BIND9",
      reloadSuccess: "BIND9 configuration and zones reloaded successfully.",
      flushCache: "Flush Cache",
      flushSuccess: "DNS query cache flushed successfully.",
      dnsTester: "DNS Resolution Tester",
      dnsTesterDesc: "Direct query to local BIND9 resolver (dig / native resolver)",
      queryTest: "Test",
      recentLogs: "Audit Log & DNS Events",
      recentLogsDesc: "DNS queries, zone transfers and system backup events stream",
      distributionTitle: "DNS Record Distribution",
      distributionSubtitle: "Typological breakdown across all authoritative catalogs",
      bindOnline: "BIND9 Online (v9.18)",
      bindOffline: "BIND9 Not Detected",
    },
    zones: {
      title: "DNS Zone Management",
      subtitle: "Catalog of authoritative forward, reverse and forwarder zones managed by BIND9.",
      totalZones: "total zones",
      createZone: "Create zone",
      syncBind: "Sync BIND9",
      filterPlaceholder: "Filter by domain name...",
      visibleZones: "Visible Zones",
      activeZones: "Active Zones",
      masterZones: "Primary Zones",
      secondaryZones: "Secondary & Forward",
    },
    acls: {
      title: "Access Control Lists (ACL) & TSIG Keys",
      subtitle: "Network filtering rules and cryptographic zone transfer shared secrets management.",
      managedAcls: "Access Lists (ACL)",
      managedAclsDesc: "Active network access rules",
      managedKeys: "TSIG Keys",
      managedKeysDesc: "Configured cryptographic keys",
      aclFile: "File named.conf.acls",
      keysFile: "File named.conf.keys",
      createAcl: "Create ACL rule",
      createKey: "Generate TSIG key",
      included: "Included",
      missing: "Missing",
      writable: "Writable",
      readOnly: "Read-only",
    },
    status: {
      title: "Server Status",
      subtitle: "Hardware processor, memory, BIND9 daemon metrics and administration capabilities.",
      cpuUsage: "CPU Usage",
      memory: "RAM Memory",
      systemUptime: "System Uptime",
      openFiles: "Open Files",
      executionEnv: "Execution Environment",
      mode: "Mode",
      target: "Target Host",
      hostState: "Host State",
      bindAccess: "BIND9 Access",
      writableSurfaces: "Writable Surfaces",
      interfaces: "Network Interfaces",
      processInfo: "BIND9 Daemon Process",
      capabilities: "Administration Capabilities",
      forwarders: "Global Forwarders",
      accessControls: "Global Access Controls",
    },
    rpz: {
      title: "DNS Firewall (RPZ)",
      subtitle: "Proactive threat filtering and unwanted domain control via Response Policy Zones.",
      totalRules: "Active RPZ Rules",
      blockedNxdomain: "Blocked (NXDOMAIN)",
      blockedNodata: "Silent Block (NODATA)",
      redirected: "Redirected (CNAME)",
      addNewRule: "Add New Rule",
      blockOrRedirect: "Block or redirect a domain",
      domainName: "Domain Name",
      wildcardsSupported: "Wildcards like *.example.com are supported automatically.",
      action: "Action",
      blockNxdomain: "Block (NXDOMAIN)",
      blockNodata: "Silent Block (NODATA)",
      redirect: "Redirect (CNAME / IP)",
      redirectTarget: "Redirect Target (IP or FQDN)",
      commentOptional: "Comment (Optional)",
      reasonPlaceholder: "Reason for blocking...",
      addRuleBtn: "Add Rule",
      quickActions: "Quick Actions",
      syncFromBind: "Sync from BIND9 Zone File",
      clearAllRules: "Clear All Rules",
      activeRules: "Active RPZ Rules",
      allTypes: "All Types",
      searchPlaceholder: "Search domain...",
      domainCol: "Domain",
      typeCol: "Action / Type",
      targetCol: "Target",
      commentCol: "Comment",
      actionsCol: "Actions",
      noRules: "No RPZ rules",
      noRulesDesc: "Add a rule manually or sync from your BIND9 server zone file.",
      previous: "Previous",
      next: "Next",
      deleteTitle: "Delete RPZ Rule",
      deleteDesc: "Are you sure you want to delete this rule? Queries to this domain will no longer be filtered by this policy.",
      clearTitle: "Clear All Rules",
      clearDesc: "This action will remove all rules from the database. Are you sure?",
    },
    firewall: {
      title: "Network Firewall",
      subtitle: "Manage host network protection, backend selection and packet filtering rules.",
      protectionCard: "Network Protection",
      protectionActive: "Active",
      protectionInactive: "Inactive",
      protectionNotInstalled: "Not Detected",
      protectionActiveDesc: "Current firewall operational state.",
      protectionInactiveDesc: "No supported firewall backend detected.",
      backendCard: "Active Backend",
      backendUnavailable: "Unavailable",
      backendDesc: "backend option(s) detected.",
      loadedRulesCard: "Loaded Rules",
      loadedRulesDesc: "Rules currently visible from the selected backend.",
      availableBackendsCard: "Available Backends",
      availableBackendsDesc: "Supported filtering engines detected on this host.",
      statusActive: "Firewall is Active",
      statusInactive: "Firewall is Inactive",
      statusNotDetected: "Firewall Not Detected",
      notDetectedDesc: "No firewall backend was found on this system. Install one of the supported backends to enable protection:",
      installSupported: "Install one of the supported backends (UFW, firewalld, nftables, iptables).",
      protectedDesc: "Your system is protected. Incoming connections are blocked unless explicitly allowed.",
      exposedDesc: "Your system is currently exposed to all incoming traffic. Enable the firewall to secure your network.",
      updating: "Updating...",
      enabled: "Enabled",
      disabled: "Disabled",
      activeOnStartup: "Active on Startup",
      activeRules: "Active Rules",
      configuredRules: "Configured Rules",
      addRule: "Add Rule",
      noRulesTitle: "No Rules Defined",
      noRulesDesc: "Your firewall policy is empty. Add rules to explicitly allow traffic to your services.",
      createFirstRule: "Create First Rule",
      deleteRuleTitle: "Delete Firewall Rule",
      deleteRuleDesc: "Are you sure you want to delete this firewall rule? This action cannot be undone.",
      deleteRuleBtn: "Delete Rule",
      ruleFrom: "From:",
      ruleProtocol: "Protocol:",
      ruleNum: "Rule #",
      ruleAction: "Action",
      ruleDirection: "Direction",
    },
    logs: {
      title: "Logs & Audit",
      subtitle: "Continuous streaming of DNS queries, reloads and security audit trails.",
      allStreams: "All Streams",
      bindDaemon: "BIND9 Daemon",
      application: "Application",
      visibleLogs: "Visible logs",
      appEvents: "Application events",
      bindEntries: "BIND9 entries",
      viewMode: "Display mode",
    },
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("bind9_language");
    if (saved === "en" || saved === "fr") {
      return saved;
    }
    const navLang = navigator.language.slice(0, 2);
    return navLang === "en" ? "en" : "fr";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("bind9_language", lang);
    document.documentElement.lang = lang;
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useI18n must be used within a LanguageProvider");
  }
  return context;
}
