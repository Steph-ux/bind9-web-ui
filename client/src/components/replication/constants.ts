export interface ReplicationServerFormState {
  name: string;
  host: string;
  port: string;
  username: string;
  authType: "password" | "key";
  password: string;
  privateKey: string;
  bind9ConfDir: string;
  bind9ZoneDir: string;
  role: "slave" | "secondary";
}

export interface ReplicationBindingDraft {
  id: string;
  domain: string;
  enabled: boolean;
  mode: "push" | "pull" | "both";
}

export interface NotificationChannelFormState {
  name: string;
  type: "email" | "webhook" | "slack";
  url: string;
  email: string;
}

export const DEFAULT_REPLICATION_SERVER_FORM: ReplicationServerFormState = {
  name: "",
  host: "",
  port: "22",
  username: "root",
  authType: "password",
  password: "",
  privateKey: "",
  bind9ConfDir: "/etc/bind",
  bind9ZoneDir: "",
  role: "slave",
};

export const DEFAULT_NOTIFICATION_CHANNEL_FORM: NotificationChannelFormState = {
  name: "",
  type: "webhook",
  url: "",
  email: "",
};
