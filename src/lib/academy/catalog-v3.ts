export type AcademyLessonCategoryV3 =
  | "financial_statements"
  | "growth_quality"
  | "valuation"
  | "financial_health"
  | "risk"
  | "portfolio";

export type AcademyLocalizedTextV3 = { sv: string; en: string };

export type AcademyQuizQuestionV3 = {
  id: string;
  prompt: AcademyLocalizedTextV3;
  options: AcademyLocalizedTextV3[];
};

export type AcademyLessonV3 = {
  id: string;
  category: AcademyLessonCategoryV3;
  order: number;
  title: AcademyLocalizedTextV3;
  summary: AcademyLocalizedTextV3;
  objectives: AcademyLocalizedTextV3[];
  sections: Array<{
    heading: AcademyLocalizedTextV3;
    body: AcademyLocalizedTextV3;
  }>;
  quiz: AcademyQuizQuestionV3[];
  passingScore: number;
  estimatedMinutes: number;
};

export const ACADEMY_V3_CATALOG_VERSION = "stockbox-academy-catalog-v3.0.0";

export const ACADEMY_LESSONS_V3: readonly AcademyLessonV3[] = [
  {
    id: "financial-statements-basics",
    category: "financial_statements",
    order: 10,
    title: { sv: "Förstå de tre rapporterna", en: "Understand the three statements" },
    summary: { sv: "Lär dig hur resultat-, balans- och kassaflödesrapporten hänger ihop.", en: "Learn how the income statement, balance sheet and cash-flow statement connect." },
    objectives: [
      { sv: "Skilja redovisad vinst från kassaflöde.", en: "Distinguish accounting profit from cash flow." },
      { sv: "Förstå tillgångar, skulder och eget kapital.", en: "Understand assets, liabilities and equity." },
    ],
    sections: [
      {
        heading: { sv: "Resultaträkningen", en: "Income statement" },
        body: { sv: "Resultaträkningen visar intäkter och kostnader under en period. Nettoresultatet är inte samma sak som kontanter som faktiskt kommit in eller lämnat bolaget.", en: "The income statement shows revenue and expenses over a period. Net income is not the same thing as cash that actually entered or left the company." },
      },
      {
        heading: { sv: "Balansräkningen", en: "Balance sheet" },
        body: { sv: "Balansräkningen är en ögonblicksbild. Tillgångar finansieras av skulder och eget kapital. Förändringar i balansposter hjälper till att förklara kassaflödet.", en: "The balance sheet is a point-in-time snapshot. Assets are financed by liabilities and equity. Changes in balance-sheet items help explain cash flow." },
      },
      {
        heading: { sv: "Kassaflödet", en: "Cash flow" },
        body: { sv: "Kassaflödesrapporten visar rörelse-, investerings- och finansieringsflöden. Ett lönsamt bolag kan fortfarande få likviditetsproblem om kassaflödet är svagt.", en: "The cash-flow statement separates operating, investing and financing flows. A profitable company can still face liquidity problems when cash flow is weak." },
      },
    ],
    quiz: [
      {
        id: "profit-vs-cash",
        prompt: { sv: "Vilket påstående är mest korrekt?", en: "Which statement is most accurate?" },
        options: [
          { sv: "Nettoresultat och kassaflöde är alltid samma sak.", en: "Net income and cash flow are always the same." },
          { sv: "Ett bolag kan visa vinst men ändå ha svagt kassaflöde.", en: "A company can report a profit while still having weak cash flow." },
          { sv: "Balansräkningen visar endast intäkter och kostnader.", en: "The balance sheet only shows revenue and expenses." },
        ],
      },
      {
        id: "balance-identity",
        prompt: { sv: "Vad beskriver balansräkningen bäst?", en: "What best describes the balance sheet?" },
        options: [
          { sv: "Tillgångar, skulder och eget kapital vid en tidpunkt.", en: "Assets, liabilities and equity at a point in time." },
          { sv: "Endast årets fria kassaflöde.", en: "Only the year's free cash flow." },
          { sv: "En prognos över framtida aktiekurs.", en: "A forecast of the future share price." },
        ],
      },
    ],
    passingScore: 70,
    estimatedMinutes: 8,
  },
  {
    id: "growth-quality",
    category: "growth_quality",
    order: 20,
    title: { sv: "Tillväxt med kvalitet", en: "Growth with quality" },
    summary: { sv: "Bedöm om tillväxten skapar ekonomiskt värde eller bara större omsättning.", en: "Assess whether growth creates economic value or merely increases revenue." },
    objectives: [
      { sv: "Jämföra tillväxt med marginaler och kassaflöde.", en: "Compare growth with margins and cash flow." },
      { sv: "Identifiera när utspädning eller hög kapitalåtgång försämrar kvaliteten.", en: "Identify when dilution or high capital intensity reduces quality." },
    ],
    sections: [
      {
        heading: { sv: "Tillväxt är inte ett frikort", en: "Growth is not a free pass" },
        body: { sv: "Omsättningstillväxt blir starkare som investeringssignal när den kombineras med uthålliga marginaler, förbättrad kapitalavkastning och rimlig finansiering.", en: "Revenue growth is a stronger investment signal when paired with durable margins, improving returns on capital and sensible financing." },
      },
      {
        heading: { sv: "Kvalitet i finansieringen", en: "Funding quality" },
        body: { sv: "Snabb expansion som kräver återkommande nyemissioner, stigande skuld eller stora aktiebaserade ersättningar kan skapa svagare värde per aktie trots hög bolagstillväxt.", en: "Rapid expansion that repeatedly requires equity issuance, rising debt or heavy stock-based compensation can weaken per-share value despite strong company growth." },
      },
    ],
    quiz: [
      {
        id: "growth-signal",
        prompt: { sv: "Vilken kombination stärker normalt kvaliteten i tillväxten?", en: "Which combination normally strengthens growth quality?" },
        options: [
          { sv: "Högre omsättning tillsammans med försämrat kassaflöde och ständig utspädning.", en: "Higher revenue together with worsening cash flow and constant dilution." },
          { sv: "Högre omsättning tillsammans med hållbara marginaler och bättre kassaflöde.", en: "Higher revenue together with durable margins and better cash flow." },
          { sv: "Omsättningstillväxt utan någon kontroll av lönsamhet eller finansiering.", en: "Revenue growth without checking profitability or financing." },
        ],
      },
      {
        id: "per-share",
        prompt: { sv: "Varför bör antal aktier följas över tid?", en: "Why should share count be tracked over time?" },
        options: [
          { sv: "För att utspädning kan göra att bolagets tillväxt inte blir lika stark per aktie.", en: "Because dilution can make company growth less powerful on a per-share basis." },
          { sv: "För att fler aktier alltid ökar vinsten per aktie.", en: "Because more shares always increase earnings per share." },
          { sv: "Antalet aktier saknar betydelse för ägarandelen.", en: "Share count has no effect on ownership percentage." },
        ],
      },
    ],
    passingScore: 70,
    estimatedMinutes: 7,
  },
  {
    id: "valuation-basics",
    category: "valuation",
    order: 30,
    title: { sv: "Värdering utan genvägar", en: "Valuation without shortcuts" },
    summary: { sv: "Förstå varför pris, multiplar, tillväxt och risk måste bedömas tillsammans.", en: "Understand why price, multiples, growth and risk must be assessed together." },
    objectives: [
      { sv: "Tolka multiplar relativt bolagets ekonomi.", en: "Interpret multiples relative to company economics." },
      { sv: "Förstå varför en låg multipel inte automatiskt betyder billigt.", en: "Understand why a low multiple does not automatically mean cheap." },
    ],
    sections: [
      {
        heading: { sv: "Pris är relativt", en: "Price is relative" },
        body: { sv: "P/E, EV/EBITDA och fria kassaflödesmultiplar mäter olika delar av värderingen. Rätt jämförelse beror på sektor, kapitalstruktur, redovisning och bolagets mognad.", en: "P/E, EV/EBITDA and free-cash-flow multiples measure different aspects of valuation. The right comparison depends on sector, capital structure, accounting and company maturity." },
      },
      {
        heading: { sv: "Billigt kan vara motiverat", en: "Cheap can be justified" },
        body: { sv: "En låg multipel kan spegla strukturell nedgång, svag balansräkning eller osäker vinst. En hög multipel kan ibland motiveras av hög kvalitet och uthållig tillväxt, men ökar känsligheten för besvikelser.", en: "A low multiple can reflect structural decline, a weak balance sheet or uncertain earnings. A high multiple can sometimes be justified by high quality and durable growth, but increases sensitivity to disappointment." },
      },
    ],
    quiz: [
      {
        id: "low-multiple",
        prompt: { sv: "Betyder ett lågt P/E alltid att aktien är billig?", en: "Does a low P/E always mean a stock is cheap?" },
        options: [
          { sv: "Ja, utan undantag.", en: "Yes, without exception." },
          { sv: "Nej, låg värdering kan spegla hög risk eller fallande vinst.", en: "No, a low valuation can reflect high risk or declining earnings." },
          { sv: "Ja, om aktiekursen har fallit senaste veckan.", en: "Yes, if the share price fell last week." },
        ],
      },
      {
        id: "comparison",
        prompt: { sv: "Vad gör en värderingsjämförelse mer rättvis?", en: "What makes a valuation comparison fairer?" },
        options: [
          { sv: "Att jämföra företag utan hänsyn till sektor eller kapitalstruktur.", en: "Comparing companies without considering sector or capital structure." },
          { sv: "Att använda samma multipel för banker, REITs och SaaS oavsett affärsmodell.", en: "Using the same multiple for banks, REITs and SaaS regardless of business model." },
          { sv: "Att anpassa mått och jämförelsegrupp till affärsmodell och ekonomi.", en: "Adapting metrics and peer group to the business model and economics." },
        ],
      },
    ],
    passingScore: 70,
    estimatedMinutes: 8,
  },
  {
    id: "financial-health",
    category: "financial_health",
    order: 40,
    title: { sv: "Balansräkning och finansiell motståndskraft", en: "Balance sheet and financial resilience" },
    summary: { sv: "Lär dig bedöma skuld, likviditet och förmågan att klara svagare perioder.", en: "Learn to assess debt, liquidity and the ability to withstand weaker periods." },
    objectives: [
      { sv: "Se skuld i relation till kassaflöde och affärsmodell.", en: "View debt relative to cash flow and business model." },
      { sv: "Förstå refinansierings- och likviditetsrisk.", en: "Understand refinancing and liquidity risk." },
    ],
    sections: [
      {
        heading: { sv: "Skuld måste sättas i sammanhang", en: "Debt needs context" },
        body: { sv: "Skuldsättning bör bedömas mot räntetäckning, kassaflöde, löptider och stabiliteten i verksamheten. Samma skuldnivå kan vara rimlig för ett reglerat elnät men farlig för ett volatilt cykliskt bolag.", en: "Leverage should be assessed against interest coverage, cash flow, maturities and business stability. The same debt level can be reasonable for a regulated utility and dangerous for a volatile cyclical company." },
      },
      {
        heading: { sv: "Likviditet köper tid", en: "Liquidity buys time" },
        body: { sv: "Kassa och tillgänglig finansiering minskar risken att bolaget måste ta in kapital under dåliga marknadsförhållanden. Men stor kassa ersätter inte en hållbar affärsmodell.", en: "Cash and available financing reduce the risk of needing to raise capital in poor market conditions. But a large cash balance does not replace a sustainable business model." },
      },
    ],
    quiz: [
      {
        id: "debt-context",
        prompt: { sv: "Vilket är mest relevant när skuld bedöms?", en: "What is most relevant when assessing debt?" },
        options: [
          { sv: "Endast det absoluta skuldbeloppet.", en: "Only the absolute amount of debt." },
          { sv: "Skuld tillsammans med kassaflöde, räntetäckning och stabilitet.", en: "Debt together with cash flow, interest coverage and stability." },
          { sv: "Endast aktiens senaste dagsrörelse.", en: "Only the stock's latest daily move." },
        ],
      },
      {
        id: "liquidity",
        prompt: { sv: "Vad kan god likviditet hjälpa ett bolag med?", en: "What can strong liquidity help a company with?" },
        options: [
          { sv: "Att undvika alla affärsrisker permanent.", en: "Avoiding all business risks permanently." },
          { sv: "Att klara svagare perioder utan akut finansiering.", en: "Withstanding weaker periods without emergency financing." },
          { sv: "Att garantera en stigande aktiekurs.", en: "Guaranteeing a rising share price." },
        ],
      },
    ],
    passingScore: 70,
    estimatedMinutes: 7,
  },
  {
    id: "risk-and-uncertainty",
    category: "risk",
    order: 50,
    title: { sv: "Risk, osäkerhet och datakvalitet", en: "Risk, uncertainty and data quality" },
    summary: { sv: "Skilj bolagsrisk från osäkerhet i underlaget och från StockBox egna dataproblem.", en: "Separate company risk from uncertainty in the evidence and from StockBox data problems." },
    objectives: [
      { sv: "Förstå skillnaden mellan bolagsrisk och datarisk.", en: "Understand the difference between company risk and data risk." },
      { sv: "Hantera konfliktande eller saknad data utan att fylla i siffror.", en: "Handle conflicting or missing data without filling in numbers." },
    ],
    sections: [
      {
        heading: { sv: "Två olika frågor", en: "Two different questions" },
        body: { sv: "Ett bolag kan vara riskfyllt trots perfekt data, och datat kan vara ofullständigt trots att bolaget är stabilt. Analysen blir mer rättvis när dessa två dimensioner hålls isär.", en: "A company can be risky despite perfect data, and data can be incomplete despite a stable company. Analysis is fairer when these dimensions are kept separate." },
      },
      {
        heading: { sv: "Osäkerhet ska synas", en: "Uncertainty should be visible" },
        body: { sv: "Om källor motsäger varandra eller StockBox inte kan verifiera ett viktigt värde ska systemet markera osäkerheten i stället för att välja den siffra som ger snyggast analys.", en: "If sources conflict or StockBox cannot verify an important value, the system should expose the uncertainty instead of choosing the number that produces the neatest analysis." },
      },
    ],
    quiz: [
      {
        id: "data-vs-company",
        prompt: { sv: "StockBox misslyckas att hämta ett viktigt värde. Vad säger det direkt om bolagets kvalitet?", en: "StockBox fails to retrieve an important value. What does that directly say about company quality?" },
        options: [
          { sv: "Bolaget är automatiskt dåligt.", en: "The company is automatically bad." },
          { sv: "Ingenting direkt; ett StockBox-fel ska hållas separat från bolagskvalitet.", en: "Nothing directly; a StockBox failure should stay separate from company quality." },
          { sv: "Aktien är automatiskt ett sälj.", en: "The stock is automatically a sell." },
        ],
      },
      {
        id: "conflict",
        prompt: { sv: "Vad är bäst vid en olöst konflikt mellan seriösa datakällor?", en: "What is best when credible data sources remain in unresolved conflict?" },
        options: [
          { sv: "Hitta på ett genomsnitt och kalla det verifierat.", en: "Invent an average and call it verified." },
          { sv: "Markera konflikten och sänk säkerheten i slutsatsen.", en: "Flag the conflict and reduce confidence in the conclusion." },
          { sv: "Välj alltid den högsta siffran.", en: "Always choose the highest number." },
        ],
      },
    ],
    passingScore: 70,
    estimatedMinutes: 7,
  },
  {
    id: "portfolio-diversification",
    category: "portfolio",
    order: 60,
    title: { sv: "Portfölj, koncentration och diversifiering", en: "Portfolio, concentration and diversification" },
    summary: { sv: "Förstå varför portföljrisk inte bara är summan av varje enskild akties risk.", en: "Understand why portfolio risk is more than the sum of each individual stock's risk." },
    objectives: [
      { sv: "Se skillnaden mellan bolagsanalys och portföljkonstruktion.", en: "Distinguish company analysis from portfolio construction." },
      { sv: "Identifiera koncentration mot bolag, sektor och gemensamma riskfaktorer.", en: "Identify concentration in companies, sectors and shared risk factors." },
    ],
    sections: [
      {
        heading: { sv: "Bra bolag kan ändå ge en dåligt balanserad portfölj", en: "Good companies can still form a poorly balanced portfolio" },
        body: { sv: "Flera starka bolag kan vara exponerade mot samma ränta, råvara, kundgrupp eller konjunktur. Diversifiering handlar därför om riskkällor, inte bara antal tickers.", en: "Several strong companies can share exposure to the same interest rate, commodity, customer group or economic cycle. Diversification is therefore about risk sources, not just ticker count." },
      },
      {
        heading: { sv: "Vikt spelar roll", en: "Weight matters" },
        body: { sv: "En liten position och en dominerande position påverkar portföljens risk olika. Koncentrationsmått bör därför utgå från vikter och inte bara antalet innehav.", en: "A small position and a dominant position affect portfolio risk differently. Concentration measures should therefore use weights rather than only the number of holdings." },
      },
    ],
    quiz: [
      {
        id: "diversification",
        prompt: { sv: "Vilket beskriver diversifiering bäst?", en: "Which best describes diversification?" },
        options: [
          { sv: "Att äga många tickers oavsett om de har samma riskfaktorer.", en: "Owning many tickers regardless of whether they share the same risk factors." },
          { sv: "Att sprida exponering över oberoende riskkällor och rimliga vikter.", en: "Spreading exposure across independent risk sources and sensible weights." },
          { sv: "Att alltid ge varje innehav exakt samma vikt.", en: "Always assigning every holding exactly the same weight." },
        ],
      },
      {
        id: "company-vs-portfolio",
        prompt: { sv: "Kan en objektivt stark aktie ändå vara problematisk i en portfölj?", en: "Can an objectively strong stock still be problematic in a portfolio?" },
        options: [
          { sv: "Nej, stark rating eliminerar portföljrisk.", en: "No, a strong rating eliminates portfolio risk." },
          { sv: "Ja, om positionen exempelvis förstärker en redan stor koncentration.", en: "Yes, for example if the position increases an already large concentration." },
          { sv: "Nej, portföljvikter spelar ingen roll.", en: "No, portfolio weights do not matter." },
        ],
      },
    ],
    passingScore: 70,
    estimatedMinutes: 8,
  },
] as const;

export function getAcademyLessonV3(lessonId: string) {
  return ACADEMY_LESSONS_V3.find((lesson) => lesson.id === lessonId) ?? null;
}

export function academyLessonCategoriesV3() {
  return [...new Set(ACADEMY_LESSONS_V3.map((lesson) => lesson.category))];
}
