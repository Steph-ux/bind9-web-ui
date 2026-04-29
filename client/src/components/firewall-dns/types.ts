import type { RpzEntry, RpzEntryType, RpzStats, RpzTypeFilter } from "@/lib/api";

export type { RpzEntry, RpzEntryType, RpzStats, RpzTypeFilter };

export type RpzEntryDraft = {
    name: string;
    type: RpzEntryType;
    target: string;
    comment: string;
};
