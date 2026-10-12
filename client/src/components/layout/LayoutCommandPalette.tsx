import type { ComponentType } from "react";
import { RefreshCw, RotateCcw, Plus, Terminal, ShieldAlert } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { executeRndc } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export function LayoutCommandPalette({
  open,
  onOpenChange,
  navSections,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navSections: NavSection[];
  onNavigate: (href: string) => void;
}) {
  const { toast } = useToast();

  const handleRndc = async (cmd: "reload" | "flush") => {
    onOpenChange(false);
    try {
      toast({ title: `RNDC ${cmd}`, description: `Execution de rndc ${cmd}...` });
      const res = await executeRndc(cmd);
      toast({
        title: `RNDC ${cmd} reussi`,
        description: res.output || `Commande rndc ${cmd} executee avec succes.`,
      });
    } catch (err: any) {
      toast({
        title: `Erreur RNDC ${cmd}`,
        description: err.message,
        variant: "destructive",
      });
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Rechercher une page ou executer une action..." />
      <CommandList>
        <CommandEmpty>Aucun resultat trouve.</CommandEmpty>
        
        <CommandGroup heading="Actions Rapides BIND9">
          <CommandItem onSelect={() => handleRndc("reload")}>
            <RefreshCw className="h-4 w-4 text-emerald-400" />
            <span>Recharger BIND9 (rndc reload)</span>
          </CommandItem>
          <CommandItem onSelect={() => handleRndc("flush")}>
            <RotateCcw className="h-4 w-4 text-sky-400" />
            <span>Purger le Cache DNS (rndc flush)</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              onNavigate("/zones");
            }}
          >
            <Plus className="h-4 w-4 text-indigo-400" />
            <span>Creer une nouvelle Zone DNS</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              onNavigate("/logs");
            }}
          >
            <Terminal className="h-4 w-4 text-amber-400" />
            <span>Visualiser les logs en direct</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              onNavigate("/blacklist");
            }}
          >
            <ShieldAlert className="h-4 w-4 text-red-400" />
            <span>Gerer les adresses IP bannies</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {navSections.map((section) => (
          <CommandGroup key={section.title} heading={section.title}>
            {section.items.map((item) => (
              <CommandItem
                key={item.href}
                onSelect={() => {
                  onOpenChange(false);
                  onNavigate(item.href);
                }}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
