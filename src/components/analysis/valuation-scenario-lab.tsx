"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { runInteractiveValuation } from "@/lib/analysis/interactive-valuation";
import type { DcfRangeResult, ScenarioName } from "@/lib/analysis/types";
import type { Locale } from "@/lib/i18n/types";
import { formatCompactCurrency, formatPercent } from "@/lib/utils/format";

function copyFor(locale: Locale) {
  return locale === "sv" ? {
    title: "Interaktiv scenariomodell",
    subtitle: "Justera centrala DCF-antaganden. Beräkningen använder StockBox deterministiska DCF-formel och visas bara när basmodellen har riktiga antaganden.",
    growth: "FCF-tillväxtjustering",
    discount: "Diskonteringsränta",
    terminal: "Terminal tillväxt",
    fairValue: "Estimerat värde per aktie",
    unavailable: "Scenario kan inte beräknas med nuvarande antaganden.",
    bear: "Bear", base: "Bas", bull: "Bull",
    current: "Aktuell kurs",
    upside: "Implikerad uppsida",
    valuesAreRanges: "Använd detta som känslighetsanalys, inte som ett exakt riktpris.",
  } : {
    title: "Interactive Scenario Model",
    subtitle: "Adjust core DCF assumptions. The calculation uses StockBox's deterministic DCF formula and only appears when the base model has real assumptions.",
    growth: "FCF growth adjustment",
    discount: "Discount rate",
    terminal: "Terminal growth",
    fairValue: "Estimated value / share",
    unavailable: "Scenario cannot be calculated with the current assumptions.",
    bear: "Bear", base: "Base", bull: "Bull",
    current: "Current price",
    upside: "Implied upside",
    valuesAreRanges: "Use this as sensitivity analysis, not a precise price target.",
  };
}

function scenarioLabel(name: ScenarioName, labels: ReturnType<typeof copyFor>) {
  if (name === "Bear") return labels.bear;
  if (name === "Bull") return labels.bull;
  return labels.base;
}

export function ValuationScenarioLab({ dcf, locale = "en" }: { dcf: DcfRangeResult; locale?: Locale }) {
  const copy = copyFor(locale);
  const baseScenario = dcf.scenarios.find((scenario) => scenario.name === "Base");
  const [growthAdjustment, setGrowthAdjustment] = useState(0);
  const [discountRate, setDiscountRate] = useState(baseScenario?.assumptions.discountRate ?? 0.1);
  const [terminalGrowthRate, setTerminalGrowthRate] = useState(baseScenario?.assumptions.terminalGrowthRate ?? 0.025);

  const interactive = useMemo(() => {
    if (!baseScenario) return null;
    return runInteractiveValuation({
      baseAssumptions: baseScenario.assumptions,
      growthAdjustment,
      discountRate,
      terminalGrowthRate,
    });
  }, [baseScenario, discountRate, growthAdjustment, terminalGrowthRate]);

  if (dcf.status !== "available" || !baseScenario) return null;

  const impliedUpside = interactive && dcf.currentPrice && dcf.currentPrice > 0
    ? interactive.perShareValue / dcf.currentPrice - 1
    : null;

  return (
    <div className="mt-5 rounded-md border border-[#b99b5f]/25 bg-[#081421]/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[#f4efe5]">
            <SlidersHorizontal className="h-4 w-4 text-[#e1cb95]" aria-hidden="true" />
            {copy.title}
          </h3>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-[#9aa7b8]">{copy.subtitle}</p>
        </div>
        <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#9aa7b8]">{copy.valuesAreRanges}</p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <label className="block text-xs text-[#c9d2df]">
            <span className="flex justify-between gap-3"><span>{copy.growth}</span><span className="number">{formatPercent(growthAdjustment)}</span></span>
            <input className="mt-2 w-full accent-[#b99b5f]" type="range" min="-0.1" max="0.1" step="0.005" value={growthAdjustment} onChange={(event) => setGrowthAdjustment(Number(event.target.value))} />
          </label>
          <label className="block text-xs text-[#c9d2df]">
            <span className="flex justify-between gap-3"><span>{copy.discount}</span><span className="number">{formatPercent(discountRate)}</span></span>
            <input className="mt-2 w-full accent-[#b99b5f]" type="range" min="0.04" max="0.2" step="0.0025" value={discountRate} onChange={(event) => setDiscountRate(Number(event.target.value))} />
          </label>
          <label className="block text-xs text-[#c9d2df]">
            <span className="flex justify-between gap-3"><span>{copy.terminal}</span><span className="number">{formatPercent(terminalGrowthRate)}</span></span>
            <input className="mt-2 w-full accent-[#b99b5f]" type="range" min="-0.02" max="0.04" step="0.0025" value={terminalGrowthRate} onChange={(event) => setTerminalGrowthRate(Number(event.target.value))} />
          </label>
        </div>

        <div>
          {interactive ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-[#b99b5f]/30 bg-[#b99b5f]/10 p-4">
                <p className="text-xs text-[#e1cb95]">{copy.fairValue}</p>
                <p className="number mt-1 text-2xl font-semibold text-[#f4efe5]">{formatCompactCurrency(interactive.perShareValue, dcf.currency)}</p>
              </div>
              <div className="rounded-md border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-[#9aa7b8]">{copy.current}</p>
                <p className="number mt-1 text-xl font-semibold text-[#f4efe5]">{formatCompactCurrency(dcf.currentPrice, dcf.currency)}</p>
              </div>
              <div className="rounded-md border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-[#9aa7b8]">{copy.upside}</p>
                <p className="number mt-1 text-xl font-semibold text-[#f4efe5]">{formatPercent(impliedUpside)}</p>
              </div>
            </div>
          ) : <p className="text-sm text-[#e1cb95]">{copy.unavailable}</p>}
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {dcf.scenarios.map((scenario) => (
              <div key={scenario.name} className="rounded-md border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-[#9aa7b8]">{scenarioLabel(scenario.name, copy)}</p>
                <p className="number mt-1 text-lg font-semibold text-[#f4efe5]">{formatCompactCurrency(scenario.perShareValue, dcf.currency)}</p>
                <p className="mt-1 text-xs text-[#9aa7b8]">{copy.discount}: {formatPercent(scenario.assumptions.discountRate)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
