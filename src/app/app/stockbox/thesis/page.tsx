import { Save, Sparkles } from "lucide-react";
import { createThesis } from "@/lib/stockbox/db";
import { sampleStockAnalysis } from "@/lib/stockbox/sample-analysis";

export default function ThesisPage() {
  return (
    <main className="mx-auto grid max-w-3xl gap-5">
      <header>
        <p className="text-sm font-black uppercase text-[var(--primary-strong)]">Decision Journal</p>
        <h1 className="display text-4xl font-black">Ny investeringstes</h1>
        <p className="mt-2 font-bold text-[var(--muted)]">Lås resonemanget före paper trade och skapa första versionen av tesen.</p>
      </header>

      <section className="grid gap-4">
        <div className="card p-5">
          <form action={createThesis} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label>Ticker</label>
                <input className="input" name="ticker" defaultValue={sampleStockAnalysis.company.ticker} required />
              </div>
              <div className="field">
                <label>Bolag</label>
                <input className="input" name="companyName" defaultValue={sampleStockAnalysis.company.name} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label>Confidence</label>
                <input className="input" name="confidence" type="number" min="0" max="100" placeholder="72" />
              </div>
              <div className="field">
                <label>Värderingssyn</label>
                <input className="input" name="valuationView" placeholder={sampleStockAnalysis.valuation.qualityAdjusted.label} />
              </div>
            </div>
            <TextArea name="summary" label="Tes i en mening" placeholder="Vad tror du marknaden underskattar?" required />
            <TextArea name="whyNow" label="Varför nu?" placeholder="Vilken trigger eller datapunkt gör caset relevant just nu?" />
            <TextArea name="keyDrivers" label="Viktigaste drivare" placeholder="Tillväxt, marginal, kapitalallokering, värdering, kvalitet..." />
            <TextArea name="risks" label="Risker" placeholder="Vad kan gå fel?" />
            <TextArea name="disconfirmingEvidence" label="Vad falsifierar tesen?" placeholder="Vilken konkret signal får dig att ändra dig?" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label>Tidshorisont</label>
                <select className="input" name="timeHorizon" defaultValue="12m">
                  <option value="3m">3 månader</option>
                  <option value="6m">6 månader</option>
                  <option value="12m">12 månader</option>
                  <option value="36m">3 år</option>
                </select>
              </div>
              <div className="field">
                <label>Reviewdatum</label>
                <input className="input" name="reviewDueOn" type="date" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button className="button secondary" type="button">
                <Sparkles size={18} /> AI-check
              </button>
              <button className="button" type="submit">
                <Save size={18} /> Spara tes
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-[8px] bg-white/75 p-4 font-bold text-[var(--muted)]">
          När V2-migrationen är körd sparas detta till `stockbox_theses`, skapar version 1 och länkar en rapport-snapshot innan paper trade bekräftas.
        </div>
      </section>
    </main>
  );
}

function TextArea({ name, label, placeholder, required = false }: { name: string; label: string; placeholder: string; required?: boolean }) {
  return (
    <div className="field">
      <label>{label}</label>
      <textarea className="input min-h-24 resize-y" name={name} placeholder={placeholder} required={required} />
    </div>
  );
}
