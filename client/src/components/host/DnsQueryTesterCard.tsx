import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Globe,
  Loader2,
  Search,
  Server,
  Terminal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { testDnsQuery, type DnsQueryResult } from "@/lib/api";

const DNS_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "PTR", "SOA", "SRV", "CAA"];

export function DnsQueryTesterCard() {
  const [domain, setDomain] = useState("google.com");
  const [type, setType] = useState("A");
  const [server, setServer] = useState("127.0.0.1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DnsQueryResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const { toast } = useToast();

  const handleTest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!domain.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await testDnsQuery(domain, type, server);
      setResult(res);
      if (res.status === "NOERROR") {
        toast({
          title: "Requête DNS réussie",
          description: `${res.answers.length} réponse(s) en ${res.queryTimeMs} ms`,
        });
      } else {
        toast({
          title: `Statut DNS: ${res.status}`,
          description: `Résultat retourné en ${res.queryTimeMs} ms`,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Échec du test DNS",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="rounded-2xl border border-border/70 bg-card/85 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Search className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-bold tracking-tight text-foreground">
              Testeur de Résolution DNS
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Interrogation directe du serveur BIND9 local (dig / resolver natif)
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        <form onSubmit={handleTest} className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          <div className="md:col-span-5">
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="Nom de domaine (ex: isocel.bj, mail.mon-domaine.lan)"
              className="font-mono text-xs"
            />
          </div>

          <div className="md:col-span-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="font-mono text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {DNS_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="font-mono text-xs">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-3">
            <Input
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="Serveur (127.0.0.1)"
              className="font-mono text-xs"
            />
          </div>

          <div className="md:col-span-2">
            <Button
              type="submit"
              disabled={loading || !domain.trim()}
              className="w-full bg-primary hover:bg-primary/90 text-white text-xs gap-1.5"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              Tester
            </Button>
          </div>
        </form>

        {result && (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`font-mono text-[11px] font-bold ${
                    result.status === "NOERROR"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                      : "border-rose-500/40 bg-rose-500/10 text-rose-400"
                  }`}
                >
                  {result.status}
                </Badge>
                <span className="font-mono text-xs font-semibold text-foreground">
                  {result.domain} ({result.type})
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                <span className="flex items-center gap-1">
                  <Server className="h-3 w-3" />
                  @{result.server}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {result.queryTimeMs} ms
                </span>
              </div>
            </div>

            {/* Answers Table */}
            {result.answers.length > 0 ? (
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-muted/50 text-[10px] text-muted-foreground uppercase border-b border-border/50">
                    <tr>
                      <th className="py-1.5 px-3">Nom</th>
                      <th className="py-1.5 px-3">Type</th>
                      <th className="py-1.5 px-3">TTL</th>
                      <th className="py-1.5 px-3">Donnée / Cible</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {result.answers.map((ans, idx) => (
                      <tr key={idx} className="hover:bg-muted/30">
                        <td className="py-1.5 px-3 text-foreground truncate max-w-[140px]">{ans.name}</td>
                        <td className="py-1.5 px-3 text-primary font-bold">{ans.type}</td>
                        <td className="py-1.5 px-3 text-muted-foreground">{ans.ttl}s</td>
                        <td className="py-1.5 px-3 text-emerald-400 break-all">{ans.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic py-1">
                Aucun enregistrement retourné pour ce type ou nom de domaine.
              </p>
            )}

            {/* Toggle Raw Output */}
            {result.rawOutput && (
              <div className="pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRaw(!showRaw)}
                  className="h-6 px-1.5 text-[11px] text-muted-foreground gap-1"
                >
                  <Terminal className="h-3 w-3" />
                  {showRaw ? "Masquer la sortie brute" : "Afficher la sortie brute (dig)"}
                  {showRaw ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>

                {showRaw && (
                  <pre className="mt-2 p-2.5 rounded-lg bg-black/80 font-mono text-[10px] text-zinc-300 whitespace-pre-wrap overflow-x-auto max-h-48">
                    {result.rawOutput}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
