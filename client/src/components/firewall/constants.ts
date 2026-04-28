import {
  Activity,
  FileCode,
  MessageSquare,
  Network,
  Radio,
  type LucideIcon,
  Zap,
} from "lucide-react";

import type { RuleType } from "@/lib/api";

export interface FirewallRuleFormState {
  ruleType: RuleType;
  toPort: string;
  toPortEnd: string;
  proto: string;
  action: string;
  fromIp: string;
  direction: "in" | "out";
  service: string;
  iface: string;
  rateLimit: string;
  icmpType: string;
  logEnabled: boolean;
  comment: string;
  rawRule: string;
}

export interface FirewallRuleTypeOption {
  value: RuleType;
  label: string;
  icon: LucideIcon;
  desc: string;
}

export const DEFAULT_FIREWALL_RULE_FORM: FirewallRuleFormState = {
  ruleType: "port",
  toPort: "",
  toPortEnd: "",
  proto: "tcp",
  action: "allow",
  fromIp: "any",
  direction: "in",
  service: "",
  iface: "",
  rateLimit: "",
  icmpType: "echo-request",
  logEnabled: false,
  comment: "",
  rawRule: "",
};

export const KNOWN_SERVICES = [
  { value: "ssh", label: "SSH", port: "22", proto: "tcp" },
  { value: "http", label: "HTTP", port: "80", proto: "tcp" },
  { value: "https", label: "HTTPS", port: "443", proto: "tcp" },
  { value: "dns", label: "DNS", port: "53", proto: "any" },
  { value: "ftp", label: "FTP", port: "21", proto: "tcp" },
  { value: "smtp", label: "SMTP", port: "25", proto: "tcp" },
  { value: "smtps", label: "SMTPS", port: "465", proto: "tcp" },
  { value: "imap", label: "IMAP", port: "143", proto: "tcp" },
  { value: "imaps", label: "IMAPS", port: "993", proto: "tcp" },
  { value: "pop3", label: "POP3", port: "110", proto: "tcp" },
  { value: "pop3s", label: "POP3S", port: "995", proto: "tcp" },
  { value: "mysql", label: "MySQL", port: "3306", proto: "tcp" },
  { value: "postgresql", label: "PostgreSQL", port: "5432", proto: "tcp" },
  { value: "redis", label: "Redis", port: "6379", proto: "tcp" },
  { value: "mongodb", label: "MongoDB", port: "27017", proto: "tcp" },
  { value: "nfs", label: "NFS", port: "2049", proto: "tcp" },
  { value: "samba", label: "Samba", port: "139", proto: "tcp" },
  { value: "ntp", label: "NTP", port: "123", proto: "udp" },
  { value: "syslog", label: "Syslog", port: "514", proto: "udp" },
  { value: "snmp", label: "SNMP", port: "161", proto: "udp" },
  { value: "rsync", label: "Rsync", port: "873", proto: "tcp" },
  { value: "vnc", label: "VNC", port: "5900", proto: "tcp" },
  { value: "rdp", label: "RDP", port: "3389", proto: "tcp" },
  { value: "openvpn", label: "OpenVPN", port: "1194", proto: "udp" },
  { value: "wireguard", label: "WireGuard", port: "51820", proto: "udp" },
] as const;

export const ICMP_TYPES = [
  { value: "echo-request", label: "Echo Request (Ping)" },
  { value: "echo-reply", label: "Echo Reply" },
  { value: "destination-unreachable", label: "Destination Unreachable" },
  { value: "time-exceeded", label: "Time Exceeded" },
  { value: "redirect", label: "Redirect" },
  { value: "router-advertisement", label: "Router Advertisement" },
  { value: "router-solicitation", label: "Router Solicitation" },
  { value: "parameter-problem", label: "Parameter Problem" },
  { value: "timestamp-request", label: "Timestamp Request" },
  { value: "timestamp-reply", label: "Timestamp Reply" },
] as const;

export const RATE_LIMIT_PRESETS = [
  { value: "3/min", label: "3/min (Strict)" },
  { value: "6/min", label: "6/min (Moderate)" },
  { value: "10/min", label: "10/min (Lenient)" },
  { value: "30/min", label: "30/min (Permissive)" },
  { value: "100/hour", label: "100/hour" },
] as const;

export const RULE_TYPE_CONFIG: FirewallRuleTypeOption[] = [
  { value: "port", label: "Port", icon: Network, desc: "Single port rule" },
  { value: "service", label: "Service", icon: Zap, desc: "Predefined service" },
  { value: "portRange", label: "Port Range", icon: Activity, desc: "Range of ports" },
  { value: "multiPort", label: "Multi-Port", icon: Radio, desc: "Multiple ports" },
  { value: "icmp", label: "ICMP", icon: MessageSquare, desc: "ICMP protocol" },
  { value: "raw", label: "Raw Rule", icon: FileCode, desc: "Custom command" },
];

export function ruleTypeLabel(ruleType: string): string {
  return RULE_TYPE_CONFIG.find((item) => item.value === ruleType)?.label || ruleType;
}
