import type { ChangeEvent, RefObject } from "react";
import { FileText, Link, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";

type RpzImportDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    importTab: string;
    onImportTabChange: (value: string) => void;
    importText: string;
    onImportTextChange: (value: string) => void;
    importSourceName: string;
    onImportSourceNameChange: (value: string) => void;
    importUrl: string;
    onImportUrlChange: (value: string) => void;
    importUrlSource: string;
    onImportUrlSourceChange: (value: string) => void;
    fileInputRef: RefObject<HTMLInputElement | null>;
    onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
    onClearLoadedFile: () => void;
    onImportText: () => void;
    onImportUrl: () => void;
    importPending: boolean;
    importUrlPending: boolean;
};

export function RpzImportDialog({
    open,
    onOpenChange,
    importTab,
    onImportTabChange,
    importText,
    onImportTextChange,
    importSourceName,
    onImportSourceNameChange,
    importUrl,
    onImportUrlChange,
    importUrlSource,
    onImportUrlSourceChange,
    fileInputRef,
    onFileUpload,
    onClearLoadedFile,
    onImportText,
    onImportUrl,
    importPending,
    importUrlPending,
}: RpzImportDialogProps) {
    const { language } = useI18n();
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Upload className="mr-2 h-4 w-4" />
                    {language === "fr" ? "Importer" : "Import"}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{language === "fr" ? "Importer une liste de blocage RPZ" : "Import RPZ Blocklist"}</DialogTitle>
                    <DialogDescription>
                        {language === "fr"
                            ? "Importez des domaines depuis un fichier de zone RPZ, une URL externe ou du texte brut."
                            : "Import domains from an external RPZ blocklist file, URL, or pasted content."}
                    </DialogDescription>
                </DialogHeader>
                <Tabs value={importTab} onValueChange={onImportTabChange} className="mt-2">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="text">{language === "fr" ? "Coller du texte" : "Paste Text"}</TabsTrigger>
                        <TabsTrigger value="file">{language === "fr" ? "Fichier" : "Upload File"}</TabsTrigger>
                        <TabsTrigger value="url">{language === "fr" ? "Depuis une URL" : "From URL"}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="text" className="mt-4 space-y-4">
                        <div className="space-y-2">
                            <Label>{language === "fr" ? "Nom de la source" : "Source Name"}</Label>
                            <Input
                                placeholder="e.g. spamhaus-dbl"
                                value={importSourceName}
                                onChange={(event) => onImportSourceNameChange(event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>{language === "fr" ? "Contenu de la liste" : "Blocklist Content"}</Label>
                            <Textarea
                                placeholder={"Paste RPZ zone file or domain list here...\n\nExamples:\nexample.com CNAME .\nbad-site.org CNAME .\nmalware.net A 127.0.0.1\n\nOr plain domain list:\nexample.com\nbad-site.org\nmalware.net"}
                                className="min-h-[200px] font-mono text-sm"
                                value={importText}
                                onChange={(event) => onImportTextChange(event.target.value)}
                            />
                            <p className="text-[0.8rem] text-muted-foreground">
                                {language === "fr" ? "Prend en charge le format de zone RPZ, les listes de domaines et le format hosts." : "Supports RPZ zone file format, plain domain lists, and hosts-file style entries."}
                            </p>
                        </div>
                        <DialogFooter>
                            <Button onClick={onImportText} disabled={importPending || !importText.trim()}>
                                {importPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {language === "fr" ? "Import en cours..." : "Importing..."}
                                    </>
                                ) : (
                                    <>
                                        <Upload className="mr-2 h-4 w-4" />
                                        Import
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </TabsContent>

                    <TabsContent value="file" className="mt-4 space-y-4">
                        <div className="space-y-2">
                            <Label>{language === "fr" ? "Charger un fichier de liste" : "Upload Blocklist File"}</Label>
                            <div className="flex items-center gap-3">
                                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                                    <FileText className="mr-2 h-4 w-4" />
                                    {language === "fr" ? "Choisir un fichier" : "Choose File"}
                                </Button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".txt,.lst,.rpz,.conf,.zone,.hosts"
                                    className="hidden"
                                    onChange={onFileUpload}
                                />
                                <span className="text-sm text-muted-foreground">Max 200MB</span>
                            </div>
                            {importText && (
                                <div className="mt-3">
                                    <div className="mb-1 flex items-center justify-between">
                                        <span className="text-sm font-medium">File loaded: {importSourceName}</span>
                                        <Button variant="ghost" size="sm" onClick={onClearLoadedFile}>
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    <Textarea
                                        className="min-h-[150px] font-mono text-xs"
                                        value={`${importText.slice(0, 5000)}${importText.length > 5000 ? "\n... (truncated preview)" : ""}`}
                                        readOnly
                                    />
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button onClick={onImportText} disabled={importPending || !importText.trim()}>
                                {importPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Importing...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="mr-2 h-4 w-4" />
                                        {language === "fr" ? "Importer le fichier" : "Import File"}
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </TabsContent>

                    <TabsContent value="url" className="mt-4 space-y-4">
                        <div className="space-y-2">
                            <Label>{language === "fr" ? "Nom de la source (Optionnel)" : "Source Name (Optional)"}</Label>
                            <Input
                                placeholder="e.g. hagezi-threat"
                                value={importUrlSource}
                                onChange={(event) => onImportUrlSourceChange(event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>{language === "fr" ? "URL de la liste de blocage" : "Blocklist URL"}</Label>
                            <Input
                                placeholder="https://example.com/blocklist.rpz"
                                value={importUrl}
                                onChange={(event) => onImportUrlChange(event.target.value)}
                            />
                            <p className="text-[0.8rem] text-muted-foreground">
                                {language === "fr" ? "Seules les URLs http et https publiques sont autorisées." : "Only public http and https sources are accepted."}
                            </p>
                        </div>
                        <DialogFooter>
                            <Button onClick={onImportUrl} disabled={importUrlPending || !importUrl.trim()}>
                                {importUrlPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {language === "fr" ? "Téléchargement..." : "Fetching..."}
                                    </>
                                ) : (
                                    <>
                                        <Link className="mr-2 h-4 w-4" />
                                        {language === "fr" ? "Récupérer & Importer" : "Fetch & Import"}
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
