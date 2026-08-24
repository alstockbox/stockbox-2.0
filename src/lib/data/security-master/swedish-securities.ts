import snapshot from "@/data/security-master/sweden.generated.json";
import type { ListedSecurity, SecurityMasterSourceMetadata } from "./types";

type SwedishSecuritySnapshot = {
  metadata: SecurityMasterSourceMetadata;
  securities: ListedSecurity[];
};

const swedishSecuritySnapshot = snapshot as SwedishSecuritySnapshot;

export const swedishListedSecuritySeed = swedishSecuritySnapshot.securities;
export const swedishSecuritySourceMetadata = swedishSecuritySnapshot.metadata;
