export type LegalEnvEntry = {
  key: string;
  value: string;
  type: "sensitive";
  target: string[];
  comment: string;
};

export function buildLegalEnvEntries(input: {
  businessName?: string;
  organizationNumber?: string;
  postalAddress?: string;
  supportEmail?: string;
  supportPhone?: string;
  vatMode?: string;
  vatNumber?: string;
}): LegalEnvEntry[];

export function summarizeLegalEnvEntries(entries: LegalEnvEntry[]): {
  count: number;
  keys: string[];
  targets: string[];
  sensitive: boolean;
};