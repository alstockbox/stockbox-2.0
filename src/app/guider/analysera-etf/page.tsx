import type { Metadata } from "next";
import Link from "next/link";
import { SeoArticle, SeoHero, SeoJsonLd, SeoSection, breadcrumbJsonLd } from "@/components/seo/seo-shell";

export const metadata: Metadata = {
  title: "Hur analyserar man en ETF? Kostnad, tracking, innehav och risk",
  description: "Lär dig analysera ETF:er med avgift, tracking difference, tracking error, likviditet, koncentration, look-through-värdering och produktspecifik risk.",
  alternates: { canonical: "/guider/analysera-etf" },
};

export default function AnalyzeEtfPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [
    { label: "StockBox", href: "/" },
    { label: "Guider", href: "/guider" },
    { label: "Analysera ETF", href: "/guider/analysera-etf" },
  ];
  const url = new URL("/guider/analysera-etf", baseUrl).toString();

  return <>
    <SeoJsonLd data={{
      "@context": "https://schema.org",
      "@graph": [
        breadcrumbJsonLd(baseUrl, breadcrumbs),
        {
          "@type": "TechArticle",
          "@id": `${url}#guide`,
          url,
          headline: "Hur analyserar man en ETF?",
          description: metadata.description,
          inLanguage: "sv-SE",
          publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
          author: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
          about: ["ETF", "börshandlad fond", "expense ratio", "tracking difference", "likviditet", "koncentration", "look-through analysis"],
        },
      ],
    }} />

    <SeoHero
      eyebrow="ETF-analys"
      title="Hur analyserar man en ETF?"
      lead="En ETF ska inte bedömas som om fonden vore ett vanligt rörelsebolag. En robust ETF-analys behöver i stället förstå vad fonden äger, vad exponeringen kostar, hur väl produkten följer sitt mandat, hur koncentrerad den är och vilka risker som följer av just ETF-typen."
      breadcrumbs={breadcrumbs}
      secondaryHref="/guider/hur-analyserar-man-en-aktie"
      secondaryLabel="Guide till aktieanalys"
    />

    <SeoArticle>
      <SeoSection title="Börja med vilken ETF du faktiskt analyserar">
        <p>Två ETF:er kan se lika ut i en söklista men bära helt olika ekonomisk risk. En bred aktie-ETF, en sektor-ETF, en obligationsfond, en råvaru-ETF och en dagligt ombalanserad hävstångsprodukt behöver inte samma analysmodell. Kontrollera därför index eller mandat, tillgångsslag, valutaexponering, replikeringsmetod och produktstruktur innan du jämför poäng eller avkastning.</p>
      </SeoSection>

      <SeoSection title="Expense ratio är viktig – men inte hela kostnaden">
        <p><strong>Expense ratio</strong> beskriver fondens löpande avgift och är en central faktor eftersom återkommande kostnader direkt minskar hur mycket av underliggande avkastning investeraren behåller. Men en billig ETF kan fortfarande vara ineffektiv om den har stor spread eller följer sitt index dåligt. Läs därför avgiften tillsammans med tracking och faktisk handelslikviditet.</p>
      </SeoSection>

      <SeoSection title="Tracking difference och tracking error mäter leveransen">
        <p><strong>Tracking difference</strong> beskriver hur fondens avkastning avviker från jämförelseindex över en period, medan tracking error beskriver hur varierande avvikelsen är. De två måtten svarar på olika frågor: en ETF kan ha en relativt stabil men negativ avvikelse, eller en mer ojämn följsamhet. StockBox behandlar därför tracking som en egen fondspecifik kvalitetsfaktor.</p>
      </SeoSection>

      <SeoSection title="Likviditet och spread påverkar vad du faktiskt kan handla till">
        <p><strong>Likviditet</strong> handlar inte bara om fondens storlek. Bid/ask-spread och omsatt dollarvolym ger information om praktisk tradability och transaktionsfriktion. En tunn ETF kan fungera som långsiktig exponering men ändå vara dyr eller svår att handla effektivt vid större order eller stressade marknader.</p>
      </SeoSection>

      <SeoSection title="Look-through: analysera innehaven, inte fondskalets redovisning">
        <p>För en aktie-ETF ligger den ekonomiska kvaliteten i portföljen under fondskalet. <strong>Look-through</strong>-analys väger därför underliggande innehav och kan använda deras kvalitet, tillväxt, kapitalavkastning och värdering när tillräcklig data finns. Värdering bör då vara portföljaggregerad; ett ETF-level P/E utan förståelse för innehaven är inte samma sak som att analysera ett operativt bolag.</p>
        <p>Vill du förstå de underliggande värderingsmåtten bättre kan du läsa guiderna om <Link href="/nyckeltal/pe-tal" className="font-semibold text-[#e1cb95] hover:text-white">P/E</Link>, <Link href="/nyckeltal/roic" className="font-semibold text-[#e1cb95] hover:text-white">ROIC</Link> och <Link href="/nyckeltal/fritt-kassaflode" className="font-semibold text-[#e1cb95] hover:text-white">fritt kassaflöde</Link>.</p>
      </SeoSection>

      <SeoSection title="Koncentration är mer än antal innehav">
        <p>En fond med hundratals innehav kan ändå vara koncentrerad om de största positionerna eller en enskild sektor dominerar portföljen. Därför bör top-10-vikt, största innehav och koncentrationsmått analyseras separat från det nominella antalet värdepapper. Diversifiering och koncentrationsrisk är relaterade, men inte identiska, frågor.</p>
      </SeoSection>

      <SeoSection title="Riskjusterad historik och fondstabilitet">
        <p>Historisk avkastning blir mer informativ när den sätts i relation till volatilitet och drawdown. Fondens AUM och historik kan dessutom ge en begränsad signal om operativ stabilitet. De här måtten ska inte tolkas som garanti för framtida avkastning; de används som beskrivande risk- och produktdata.</p>
      </SeoSection>

      <SeoSection title="Bond-ETF: ränta, duration och kreditkvalitet">
        <p>En <strong>Bond-ETF</strong> bör inte få aktiebolagsmått för lönsamhet. Yield to maturity, duration och andelen investment grade eller high yield svarar bättre på fondens ekonomiska exponering. Hög yield ska inte automatiskt tolkas som hög kvalitet eftersom kreditrisk och räntesensitivitet kan vara orsaken till den högre förväntade avkastningen.</p>
      </SeoSection>

      <SeoSection title="Råvaru-ETF: spotpris räcker inte alltid">
        <p>För en <strong>råvaru-ETF</strong> som använder terminskontrakt kan contango, backwardation och roll yield påverka avkastningen kraftigt. Därför behöver analysen separera själva råvaruexponeringen från hur effektivt produkten levererar den exponeringen. Företagsmått som P/E och rörelsemarginal är inte relevanta för den typen av produkt.</p>
      </SeoSection>

      <SeoSection title="Hävstång och inverse: path dependency måste vara explicit">
        <p>En ETF med <strong>hävstång</strong> eller omvänd exponering kan ha daglig reset. Då beror längre avkastning på vägen marknaden tar, inte bara start- och slutnivån. Volatilitet kan skapa decay och en 2x-produkt behöver inte ge två gånger indexets långsiktiga avkastning. Den strukturella risken ska därför modelleras separat i stället för att döljas i ett generellt riskmått.</p>
      </SeoSection>

      <SeoSection title="Så analyserar StockBox ETF:er">
        <p>StockBox universal-security-motor använder en ETF-specifik modell i stället för vanlig corporate scoring. Beroende på produkttyp kan modellen väga underliggande innehavskvalitet, look-through-värdering, kostnad, diversifiering, likviditet, tracking, riskjusterad historik, koncentration, fondstabilitet och strukturella risker. Bond-, commodity- och leveraged/inverse-ETF:er får särskilda overlays för de risker som är ekonomiskt relevanta för respektive produkt.</p>
        <p>När underlaget inte räcker hålls <strong>saknade faktorer</strong> som N/A och datatäckningen begränsar hur starkt ett score får tolkas. StockBox ersätter inte okänd ETF-data med noll och använder inte företagsmått på produktkategorier där de inte är ekonomiskt tillämpliga.</p>
      </SeoSection>

      <SeoSection title="Checklista för ETF-analys">
        <ul className="list-disc space-y-2 pl-5">
          <li>Vilket index, mandat eller tillgångsslag försöker fonden följa?</li>
          <li>Vad är fondens Expense ratio och vilka andra handelsfriktioner finns?</li>
          <li>Hur ser Tracking difference och tracking error ut?</li>
          <li>Hur likvid är ETF:en och hur bred är bid/ask-spreaden?</li>
          <li>Hur koncentrerade är top-10, största innehavet, sektorer och länder?</li>
          <li>Vad visar look-through-kvalitet och look-through-värdering när datan finns?</li>
          <li>Är produkten en Bond-ETF, råvaru-ETF eller hävstångs/inverse-ETF med andra centrala risker?</li>
          <li>Hur stor del av den ETF-specifika modellen har verifierbar datatäckning?</li>
        </ul>
      </SeoSection>

      <SeoSection title="Fortsätt med StockBox metodik">
        <p>Se <Link href="/docs/methodology" className="font-semibold text-[#e1cb95] hover:text-white">StockBox metodik</Link>, <Link href="/data-sources" className="font-semibold text-[#e1cb95] hover:text-white">datakällor</Link> och <Link href="/research-standard" className="font-semibold text-[#e1cb95] hover:text-white">Research Standard</Link> för hur modellen hanterar datatäckning, källor och begränsningar. För holding companies och svenska investmentbolag finns en separat guide om <Link href="/guider/analysera-investmentbolag" className="font-semibold text-[#e1cb95] hover:text-white">substansvärde och NAV</Link>.</p>
      </SeoSection>
    </SeoArticle>
  </>;
}
