import { Ban, CornerUpRight, Globe, Shield } from "lucide-react";

import { MetricCard } from "@/components/layout/MetricCard";
import { useI18n } from "@/lib/i18n";
import type { RpzStats } from "./types";

type RpzStatsCardsProps = {
    stats?: RpzStats;
};

export function RpzStatsCards({ stats }: RpzStatsCardsProps) {
    const { t, language } = useI18n();

    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
                label={t.rpz.totalRules}
                value={stats?.total ?? 0}
                description={language === "fr" ? "Catalogue RPZ actif" : "Active RPZ catalog"}
                icon={Shield}
                tone="default"
            />
            <MetricCard
                label={t.rpz.blockedNxdomain}
                value={stats?.nxdomain ?? 0}
                description={language === "fr" ? "Politique NXDOMAIN" : "NXDOMAIN policy"}
                icon={Ban}
                tone="danger"
            />
            <MetricCard
                label={t.rpz.blockedNodata}
                value={stats?.nodata ?? 0}
                description={language === "fr" ? "Politique NODATA" : "NODATA policy"}
                icon={Globe}
                tone="warning"
            />
            <MetricCard
                label={t.rpz.redirected}
                value={stats?.redirect ?? 0}
                description={language === "fr" ? "Redirection CNAME / A" : "CNAME / A redirection"}
                icon={CornerUpRight}
                tone="success"
            />
        </div>
    );
}
