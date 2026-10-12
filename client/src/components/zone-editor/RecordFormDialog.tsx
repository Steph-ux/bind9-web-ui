import { useState } from "react";
import { Check, Copy, Info, Loader2, Mail, Shield, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  recordFormTypeOptions,
  recordPriorityTypes,
  type RecordFormValues,
} from "@/lib/client-schemas";

interface RecordFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  zoneDomain: string;
  submitting: boolean;
  values: RecordFormValues;
  errors: Partial<Record<keyof RecordFormValues, string>>;
  onOpenChange: (open: boolean) => void;
  onFieldChange: <K extends keyof RecordFormValues>(field: K, value: RecordFormValues[K]) => void;
  onSubmit: () => void;
}

const COMMON_TYPES: Array<RecordFormValues["type"]> = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "PTR", "NS"];
const TTL_PRESETS = [
  { label: "5 min (300s)", value: "300" },
  { label: "1 heure (3600s)", value: "3600" },
  { label: "4 heures (14400s)", value: "14400" },
  { label: "1 jour (86400s)", value: "86400" },
];

function isValidIPv4(ip: string): boolean {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d+$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

function isValidIPv6(ip: string): boolean {
  const trimmed = ip.trim();
  if (!trimmed) return false;
  return /^[0-9a-fA-F:]+$/.test(trimmed) && trimmed.includes(":");
}

export function RecordFormDialog({
  open,
  mode,
  zoneDomain,
  submitting,
  values,
  errors,
  onOpenChange,
  onFieldChange,
  onSubmit,
}: RecordFormDialogProps) {
  const [activeWizard, setActiveWizard] = useState<"none" | "spf" | "dmarc" | "dkim">("none");

  // SPF Wizard Local State
  const [spfIncludeMx, setSpfIncludeMx] = useState(true);
  const [spfIncludeA, setSpfIncludeA] = useState(true);
  const [spfIp4, setSpfIp4] = useState("");
  const [spfIncludeProvider, setSpfIncludeProvider] = useState("");
  const [spfPolicy, setSpfPolicy] = useState<"~all" | "-all" | "?all">("~all");

  // DMARC Wizard Local State
  const [dmarcPolicy, setDmarcPolicy] = useState<"none" | "quarantine" | "reject">("quarantine");
  const [dmarcPct, setDmarcPct] = useState("100");
  const [dmarcRua, setDmarcRua] = useState(`mailto:dmarc@${zoneDomain}`);

  // DKIM Wizard Local State
  const [dkimSelector, setDkimSelector] = useState("k1");
  const [dkimKey, setDkimKey] = useState("");

  const title = mode === "create" ? "Ajouter un enregistrement DNS" : "Modifier l'enregistrement DNS";
  const description =
    mode === "create"
      ? `Nouvel enregistrement autoritaire pour la zone ${zoneDomain}`
      : `Mise a jour de l'enregistrement dans la zone ${zoneDomain}`;
  const actionLabel = mode === "create" ? "Creer l'enregistrement" : "Enregistrer les modifications";

  const getComputedFQDN = (): string => {
    const rawName = values.name.trim();
    if (!rawName || rawName === "@") return `${zoneDomain}.`;
    if (rawName.endsWith(".")) return rawName;
    return `${rawName}.${zoneDomain}.`;
  };

  // Build generated strings
  const generatedSpf = (): string => {
    const parts = ["v=spf1"];
    if (spfIncludeMx) parts.push("mx");
    if (spfIncludeA) parts.push("a");
    if (spfIp4.trim()) parts.push(`ip4:${spfIp4.trim()}`);
    if (spfIncludeProvider.trim()) parts.push(`include:${spfIncludeProvider.trim()}`);
    parts.push(spfPolicy);
    return parts.join(" ");
  };

  const generatedDmarc = (): string => {
    const parts = ["v=DMARC1", `p=${dmarcPolicy}`, `pct=${dmarcPct || "100"}`];
    if (dmarcRua.trim()) parts.push(`rua=${dmarcRua.trim()}`);
    return parts.join("; ");
  };

  const generatedDkim = (): string => {
    return `v=DKIM1; k=rsa; p=${dkimKey.trim() || "CLE_PUBLIQUE_BASE64"}`;
  };

  const applySpf = () => {
    onFieldChange("value", generatedSpf());
    if (values.name === "") onFieldChange("name", "@");
    setActiveWizard("none");
  };

  const applyDmarc = () => {
    onFieldChange("name", "_dmarc");
    onFieldChange("value", generatedDmarc());
    setActiveWizard("none");
  };

  const applyDkim = () => {
    onFieldChange("name", `${dkimSelector.trim() || "k1"}._domainkey`);
    onFieldChange("value", generatedDkim());
    setActiveWizard("none");
  };

  const isIPv4Valid = values.type === "A" && values.value.trim().length > 0 ? isValidIPv4(values.value) : null;
  const isIPv6Valid = values.type === "AAAA" && values.value.trim().length > 0 ? isValidIPv6(values.value) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl border-border/70 bg-card/95 backdrop-blur-md">
        <DialogHeader className="border-b border-border/60 pb-3">
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>

        {/* FQDN Preview Banner */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-primary">Apercu du nom complet (FQDN) :</span>
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              Type {values.type}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground break-all">
            {getComputedFQDN()}
          </p>
        </div>

        <div className="space-y-4 py-2">
          {/* Record Type Selector */}
          <div>
            <Label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
              Type d'enregistrement
            </Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {COMMON_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onFieldChange("type", t)}
                  className={`rounded-lg px-3 py-1 font-mono text-xs font-bold transition-all ${
                    values.type === t
                      ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
              {!COMMON_TYPES.includes(values.type) && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {values.type}
                </Badge>
              )}
            </div>

            <div className="pt-1">
              <Select
                value={values.type}
                onValueChange={(val) => onFieldChange("type", val as RecordFormValues["type"])}
              >
                <SelectTrigger className="h-8 w-[200px] text-xs font-mono">
                  <SelectValue placeholder="Autres types..." />
                </SelectTrigger>
                <SelectContent>
                  {recordFormTypeOptions.map((opt) => (
                    <SelectItem key={opt} value={opt} className="font-mono text-xs">
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {errors.type && <p className="mt-1 text-xs text-destructive">{errors.type}</p>}
          </div>

          {/* Record Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor={`${mode}-name`} className="text-xs font-semibold uppercase text-muted-foreground">
                Nom d'hote (Prefixe / Sous-domaine)
              </Label>
              <button
                type="button"
                onClick={() => onFieldChange("name", "@")}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Utiliser la racine (@)
              </button>
            </div>
            <Input
              id={`${mode}-name`}
              value={values.name}
              onChange={(e) => onFieldChange("name", e.target.value)}
              className="font-mono text-sm"
              placeholder="@ ou mail, www, vpn, ftp"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Entrez <span className="font-mono text-foreground font-semibold">@</span> pour le domaine racine, ou un prefixe comme <span className="font-mono text-foreground">mail</span> pour <span className="font-mono text-foreground">mail.{zoneDomain}.</span>
            </p>
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Priority (if MX or SRV) */}
          {recordPriorityTypes.includes(values.type as (typeof recordPriorityTypes)[number]) && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <Label htmlFor={`${mode}-priority`} className="text-xs font-semibold uppercase text-emerald-400">
                Priorite (Mail Exchanger / Service)
              </Label>
              <div className="flex items-center gap-2 mt-1.5">
                <Input
                  id={`${mode}-priority`}
                  value={values.priority}
                  onChange={(e) => onFieldChange("priority", e.target.value)}
                  className="font-mono text-sm w-32"
                  placeholder="10"
                />
                <div className="flex gap-1">
                  {["10", "20", "50"].map((prio) => (
                    <button
                      key={prio}
                      type="button"
                      onClick={() => onFieldChange("priority", prio)}
                      className="rounded-lg border border-border/60 bg-background px-2.5 py-1 text-xs font-mono text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {prio}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Une valeur numerique inferieure a la priorite la plus haute (ex: 10 est traite avant 20).
              </p>
              {errors.priority && <p className="mt-1 text-xs text-destructive">{errors.priority}</p>}
            </div>
          )}

          {/* Target / Value */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor={`${mode}-value`} className="text-xs font-semibold uppercase text-muted-foreground">
                {values.type === "A"
                  ? "Adresse IPv4"
                  : values.type === "AAAA"
                  ? "Adresse IPv6"
                  : values.type === "CNAME"
                  ? "Nom canonique cible (FQDN)"
                  : values.type === "MX"
                  ? "Serveur de messagerie (Hote MX)"
                  : values.type === "TXT"
                  ? "Contenu du texte (Enregistrement TXT)"
                  : "Valeur cible"}
              </Label>
              {isIPv4Valid !== null && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    isIPv4Valid
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                      : "border-red-500/40 bg-red-500/10 text-red-400"
                  }`}
                >
                  {isIPv4Valid ? "Format IPv4 valide" : "Format IPv4 invalide"}
                </Badge>
              )}
              {isIPv6Valid !== null && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    isIPv6Valid
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                      : "border-red-500/40 bg-red-500/10 text-red-400"
                  }`}
                >
                  {isIPv6Valid ? "Format IPv6 valide" : "Format IPv6 invalide"}
                </Badge>
              )}
            </div>

            {values.type === "TXT" ? (
              <Textarea
                id={`${mode}-value`}
                value={values.value}
                onChange={(e) => onFieldChange("value", e.target.value)}
                className="font-mono text-xs min-h-[80px]"
                placeholder="v=spf1 mx a ~all ou chaine de verification"
              />
            ) : (
              <Input
                id={`${mode}-value`}
                value={values.value}
                onChange={(e) => onFieldChange("value", e.target.value)}
                className="font-mono text-sm"
                placeholder={
                  values.type === "A"
                    ? "192.168.11.10"
                    : values.type === "AAAA"
                    ? "2001:db8::1"
                    : values.type === "CNAME"
                    ? "serveur.isoceltelecom.com."
                    : values.type === "MX"
                    ? "mail.isoceltelecom.com."
                    : "Valeur de l'enregistrement"
                }
              />
            )}
            {errors.value && <p className="mt-1 text-xs text-destructive">{errors.value}</p>}
          </div>

          {/* TXT Wizard Helpers (SPF, DMARC, DKIM) */}
          {values.type === "TXT" && (
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-purple-400">
                  <Wand2 className="h-3.5 w-3.5" />
                  Assistants de Securite Messagerie (TXT)
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveWizard(activeWizard === "spf" ? "none" : "spf")}
                    className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold transition-all ${
                      activeWizard === "spf" ? "bg-purple-600 text-white" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    SPF
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveWizard(activeWizard === "dmarc" ? "none" : "dmarc")}
                    className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold transition-all ${
                      activeWizard === "dmarc" ? "bg-purple-600 text-white" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    DMARC
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveWizard(activeWizard === "dkim" ? "none" : "dkim")}
                    className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold transition-all ${
                      activeWizard === "dkim" ? "bg-purple-600 text-white" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    DKIM
                  </button>
                </div>
              </div>

              {/* SPF Panel */}
              {activeWizard === "spf" && (
                <div className="mt-2 space-y-3 rounded-lg border border-border/60 bg-background/60 p-3 text-xs">
                  <div className="font-semibold text-foreground">Generateur d'enregistrement SPF (Sender Policy Framework)</div>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={spfIncludeMx}
                        onCheckedChange={(checked) => setSpfIncludeMx(!!checked)}
                      />
                      <span>Inclure serveurs MX (+mx)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={spfIncludeA}
                        onCheckedChange={(checked) => setSpfIncludeA(!!checked)}
                      />
                      <span>Inclure adresses A (+a)</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span className="text-[11px] text-muted-foreground">Plage IPv4 autorisee (ip4:)</span>
                      <Input
                        value={spfIp4}
                        onChange={(e) => setSpfIp4(e.target.value)}
                        placeholder="192.168.11.0/24"
                        className="h-8 font-mono text-xs mt-1"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground">Include fournisseur externe</span>
                      <Input
                        value={spfIncludeProvider}
                        onChange={(e) => setSpfIncludeProvider(e.target.value)}
                        placeholder="_spf.google.com"
                        className="h-8 font-mono text-xs mt-1"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">Politique globale :</span>
                    {(["~all", "-all", "?all"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSpfPolicy(p)}
                        className={`rounded px-2 py-0.5 font-mono text-xs ${
                          spfPolicy === p ? "bg-primary text-primary-foreground font-bold" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <div className="rounded border border-border/50 bg-muted/40 p-2 font-mono text-xs">
                    {generatedSpf()}
                  </div>

                  <Button size="sm" type="button" onClick={applySpf} className="h-8 gap-1.5">
                    <Check className="h-3.5 w-3.5" />
                    Appliquer le SPF dans le formulaire
                  </Button>
                </div>
              )}

              {/* DMARC Panel */}
              {activeWizard === "dmarc" && (
                <div className="mt-2 space-y-3 rounded-lg border border-border/60 bg-background/60 p-3 text-xs">
                  <div className="font-semibold text-foreground">Generateur d'enregistrement DMARC</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">Politique (p=) :</span>
                    {(["none", "quarantine", "reject"] as const).map((pol) => (
                      <button
                        key={pol}
                        type="button"
                        onClick={() => setDmarcPolicy(pol)}
                        className={`rounded px-2.5 py-1 text-xs capitalize ${
                          dmarcPolicy === pol ? "bg-primary text-primary-foreground font-bold" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {pol}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span className="text-[11px] text-muted-foreground">Email de rapport global (rua=)</span>
                      <Input
                        value={dmarcRua}
                        onChange={(e) => setDmarcRua(e.target.value)}
                        placeholder={`mailto:dmarc@${zoneDomain}`}
                        className="h-8 font-mono text-xs mt-1"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground">Pourcentage applique (pct=)</span>
                      <Input
                        value={dmarcPct}
                        onChange={(e) => setDmarcPct(e.target.value)}
                        placeholder="100"
                        className="h-8 font-mono text-xs mt-1"
                      />
                    </div>
                  </div>

                  <div className="rounded border border-border/50 bg-muted/40 p-2 font-mono text-xs">
                    {generatedDmarc()}
                  </div>

                  <Button size="sm" type="button" onClick={applyDmarc} className="h-8 gap-1.5">
                    <Check className="h-3.5 w-3.5" />
                    Appliquer le DMARC (_dmarc) dans le formulaire
                  </Button>
                </div>
              )}

              {/* DKIM Panel */}
              {activeWizard === "dkim" && (
                <div className="mt-2 space-y-3 rounded-lg border border-border/60 bg-background/60 p-3 text-xs">
                  <div className="font-semibold text-foreground">Generateur d'enregistrement DKIM (DomainKeys)</div>
                  <div>
                    <span className="text-[11px] text-muted-foreground">Selecteur DKIM (ex: k1, s1, google)</span>
                    <Input
                      value={dkimSelector}
                      onChange={(e) => setDkimSelector(e.target.value)}
                      placeholder="k1"
                      className="h-8 font-mono text-xs mt-1"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground">Cle publique RSA (p=)</span>
                    <Textarea
                      value={dkimKey}
                      onChange={(e) => setDkimKey(e.target.value)}
                      placeholder="MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ..."
                      className="h-16 font-mono text-xs mt-1"
                    />
                  </div>

                  <div className="rounded border border-border/50 bg-muted/40 p-2 font-mono text-xs break-all">
                    {generatedDkim()}
                  </div>

                  <Button size="sm" type="button" onClick={applyDkim} className="h-8 gap-1.5">
                    <Check className="h-3.5 w-3.5" />
                    Appliquer le DKIM ({dkimSelector}._domainkey)
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* TTL Preset Selector */}
          <div>
            <Label htmlFor={`${mode}-ttl`} className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
              Duree de vie en cache (TTL en secondes)
            </Label>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {TTL_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => onFieldChange("ttl", preset.value)}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-all ${
                    values.ttl === preset.value
                      ? "border-primary bg-primary/10 text-primary font-bold"
                      : "border-border/60 bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <Input
              id={`${mode}-ttl`}
              value={values.ttl}
              onChange={(e) => onFieldChange("ttl", e.target.value)}
              className="font-mono text-sm max-w-[200px]"
            />
            {errors.ttl && <p className="mt-1 text-xs text-destructive">{errors.ttl}</p>}
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 pt-3 flex flex-row items-center justify-end gap-2">
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={onSubmit} disabled={submitting} className="min-w-[140px]">
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
