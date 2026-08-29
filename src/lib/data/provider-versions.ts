export const PROVIDER_ADAPTER_VERSIONS = {
  secCompanyfacts: "sec-companyfacts-adapter-v4",
  secSubmissions: "sec-submissions-adapter-v1",
  yahooFundamentals: "yahoo-fundamentals-adapter-v4",
  yahooChart: "yahoo-chart-adapter-v1",
  stooqEod: "stooq-eod-adapter-v1",
  twelveData: "twelve-data-adapter-v1",
} as const;

export function providerAdapterVersion(provider: string | null | undefined): string {
  switch (provider?.trim().toLowerCase()) {
    case "sec":
    case "sec-companyfacts":
    case "sec companyfacts":
      return PROVIDER_ADAPTER_VERSIONS.secCompanyfacts;
    case "sec-submissions":
    case "sec submissions":
      return PROVIDER_ADAPTER_VERSIONS.secSubmissions;
    case "yahoo-fundamentals":
    case "yahoo finance fundamentals":
      return PROVIDER_ADAPTER_VERSIONS.yahooFundamentals;
    case "yahoo-chart":
      return PROVIDER_ADAPTER_VERSIONS.yahooChart;
    case "stooq-eod":
      return PROVIDER_ADAPTER_VERSIONS.stooqEod;
    case "twelve-data":
      return PROVIDER_ADAPTER_VERSIONS.twelveData;
    default:
      return "unknown-adapter-version";
  }
}
