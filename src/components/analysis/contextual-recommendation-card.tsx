import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { contextualRecommendation } from "@/lib/analysis/contextual-recommendation";
import type { Recommendation } from "@/lib/analysis/types";
import type { Locale } from "@/lib/i18n/types";
import { formatPercent } from "@/lib/utils/format";

function actionTone(action: ReturnType<typeof contextualRecommendation>["action"]) {
  if (action === "buy") return "border-emerald-400/30 bg-emerald-950/25 text-emerald-100";
  if (action === "sell" || action === "avoid") return "border-red-400/30 bg-red-950/25 text-red-100";
  if (action === "hold" || action === "wait") return "border-amber-300/30 bg-amber-950/25 text-amber-100";
  return "border-white/10 bg-white/5 text-[#f4efe5]";
}

export function ContextualRecommendationCard({
  recommendation,
  inPortfolio,
  score,
  confidence,
  dataCoverage,
  locale,
}: {
  recommendation: Recommendation;
  inPortfolio: boolean;
  score: number | null;
  confidence: number;
  dataCoverage?: number;
  locale: Locale;
}) {
  const contextual = contextualRecommendation(recommendation, inPortfolio, locale);
  const sv = locale === "sv";

  return (
    <Card className={`border ${actionTone(contextual.action)} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-80">
            {sv ? "StockBox-rekommendation" : "StockBox recommendation"}
          </p>
          <p className="mt-1 text-3xl font-semibold">{contextual.label}</p>
          <p className="mt-2 text-sm opacity-80">
            {inPortfolio
              ? (sv ? "Bolaget finns i din portfölj — därför visas Köp / Håll / Sälj." : "This company is in your portfolio — so StockBox shows Buy / Hold / Sell.")
              : (sv ? "Bolaget finns inte i din portfölj — därför visas Köp / Vänta / Undvik." : "This company is not in your portfolio — so StockBox shows Buy / Wait / Avoid.")}
          </p>
        </div>
        <Badge>{inPortfolio ? (sv ? "I portföljen" : "In portfolio") : (sv ? "Inte i portföljen" : "Not in portfolio")}</Badge>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs opacity-85">
        <span>{sv ? "Poäng" : "Score"}: {score === null ? "—" : `${Math.round(score)}/100`}</span>
        <span>{sv ? "Konfidens" : "Confidence"}: {Math.round(confidence)}%</span>
        {dataCoverage !== undefined ? <span>{sv ? "Datatäckning" : "Data coverage"}: {formatPercent(dataCoverage, 0)}</span> : null}
      </div>
    </Card>
  );
}
