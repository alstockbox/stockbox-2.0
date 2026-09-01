import type { Metadata } from "next";
import { BookOpenCheck, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import {
  addManualThesisEvidenceAction,
  createInvestmentThesisAction,
  deleteInvestmentThesisAction,
  setInvestmentThesisStatusAction,
  updateInvestmentThesisAction,
} from "@/lib/research/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Research memory" };
export const dynamic = "force-dynamic";

type ThesisRow = {
  id: string;
  ticker: string;
  company_name: string;
  status: "draft" | "active" | "invalidated" | "closed";
  title: string;
  thesis: string;
  assumptions: string[] | null;
  invalidation_triggers: string[] | null;
  target_metrics: string[] | null;
  notes: string | null;
  last_reviewed_at: string | null;
  updated_at: string;
};

type EvidenceRow = {
  id: string;
  thesis_id: string;
  event_kind: string;
  title: string;
  body: string;
  created_at: string;
};

function listValue(value: string[] | null | undefined) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function statusLabel(status: ThesisRow["status"], sv: boolean) {
  const labels = sv
    ? { draft: "Utkast", active: "Aktiv", invalidated: "Invaliderad", closed: "Stängd" }
    : { draft: "Draft", active: "Active", invalidated: "Invalidated", closed: "Closed" };
  return labels[status];
}

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [user, locale, params] = await Promise.all([requireUser(), getLocale(), searchParams]);
  const sv = locale === "sv";
  const supabase = await createClient();
  const [{ data: theses }, { data: evidence }] = supabase
    ? await Promise.all([
      supabase.from("investment_theses")
        .select("id,ticker,company_name,status,title,thesis,assumptions,invalidation_triggers,target_metrics,notes,last_reviewed_at,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
      supabase.from("thesis_evidence_events")
        .select("id,thesis_id,event_kind,title,body,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ])
    : [{ data: [] }, { data: [] }];

  const thesisRows = (theses ?? []) as ThesisRow[];
  const evidenceRows = (evidence ?? []) as EvidenceRow[];
  const copy = sv ? {
    kicker: "Researchminne",
    title: "Ditt investeringsarbete, sparat över tid",
    intro: "Spara tesen innan du glömmer varför du äger eller följer ett bolag. StockBox kan sedan koppla nya analyser och verifierad evidens mot samma researchminne.",
    create: "Ny investeringstes",
    investmentThesis: "Investment thesis",
    assumptions: "Antaganden",
    invalidation: "Invalidation triggers",
    targets: "Målmått / vad du vill se",
    notes: "Anteckningar",
    save: "Spara tes",
    update: "Uppdatera research",
    evidence: "Evidence timeline",
    addEvidence: "Lägg till egen evidens",
    noEvidence: "Ingen evidens sparad ännu.",
    empty: "Du har ännu inget researchminne. Skapa en tes för första bolaget du vill följa över tid.",
  } : {
    kicker: "Research memory",
    title: "Your investment work, preserved over time",
    intro: "Write the thesis before you forget why you own or follow a company. StockBox can then connect future analyses and verified evidence to the same research memory.",
    create: "New investment thesis",
    investmentThesis: "Investment thesis",
    assumptions: "Assumptions",
    invalidation: "Invalidation triggers",
    targets: "Target metrics / what you need to see",
    notes: "Notes",
    save: "Save thesis",
    update: "Update research",
    evidence: "Evidence timeline",
    addEvidence: "Add manual evidence",
    noEvidence: "No evidence saved yet.",
    empty: "No research memory yet. Create a thesis for the first company you want to follow over time.",
  };

  return (
    <Section>
      <Container>
        <p className="text-sm font-semibold text-[#e1cb95]">{copy.kicker}</p>
        <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">{copy.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">{copy.intro}</p>
        {params.error ? (
          <p className="mt-5 rounded-md border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-200" role="status">
            {sv ? "Researchminnet kunde inte sparas. Kontrollera bolag och fält och försök igen." : "The research memory could not be saved. Check the company and fields and try again."}
          </p>
        ) : null}

        <Card className="mt-8">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            <h2 className="serif text-xl font-semibold text-[#f4efe5]">{copy.create}</h2>
          </div>
          <form action={createInvestmentThesisAction} className="mt-5 grid gap-4 md:grid-cols-2">
            <input name="ticker" required maxLength={16} placeholder="AAPL" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3" />
            <input name="companyName" required maxLength={200} placeholder={sv ? "Bolagsnamn" : "Company name"} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3" />
            <input name="title" required maxLength={200} placeholder={sv ? "Tesens rubrik" : "Thesis title"} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 md:col-span-2" />
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-[#f4efe5]">{copy.investmentThesis}</span>
              <textarea name="thesis" required rows={4} className="w-full rounded-md border border-white/12 bg-[#07111f] p-3" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-[#f4efe5]">{copy.assumptions}</span>
              <textarea name="assumptions" rows={5} placeholder={sv ? "En per rad" : "One per line"} className="w-full rounded-md border border-white/12 bg-[#07111f] p-3" />
            </label>
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-[#f4efe5]"><ShieldAlert className="h-4 w-4 text-amber-300" aria-hidden="true" />{copy.invalidation}</span>
              <textarea name="invalidationTriggers" rows={5} placeholder={sv ? "En per rad" : "One per line"} className="w-full rounded-md border border-white/12 bg-[#07111f] p-3" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-[#f4efe5]">{copy.targets}</span>
              <textarea name="targetMetrics" rows={4} className="w-full rounded-md border border-white/12 bg-[#07111f] p-3" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-[#f4efe5]">{copy.notes}</span>
              <textarea name="notes" rows={4} className="w-full rounded-md border border-white/12 bg-[#07111f] p-3" />
            </label>
            <div className="md:col-span-2"><Button type="submit">{copy.save}</Button></div>
          </form>
        </Card>

        <div className="mt-8 grid gap-6">
          {thesisRows.length ? thesisRows.map((thesis) => {
            const thesisEvidence = evidenceRows.filter((item) => item.thesis_id === thesis.id);
            return (
              <Card key={thesis.id} className="overflow-hidden p-0">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-[#e1cb95]">{thesis.ticker}</span>
                      <span className="text-sm text-[#c9d2df]">{thesis.company_name}</span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-[#9aa7b8]">{statusLabel(thesis.status, sv)}</span>
                    </div>
                    <h2 className="serif mt-2 text-xl font-semibold text-[#f4efe5]">{thesis.title}</h2>
                  </div>
                  <form action={deleteInvestmentThesisAction}>
                    <input type="hidden" name="id" value={thesis.id} />
                    <Button variant="ghost" className="w-10 px-0" title={sv ? "Ta bort" : "Delete"}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </form>
                </div>

                <form action={updateInvestmentThesisAction} className="grid gap-4 px-5 py-5 md:grid-cols-2">
                  <input type="hidden" name="id" value={thesis.id} />
                  <input name="title" required defaultValue={thesis.title} maxLength={200} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 md:col-span-2" />
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-semibold text-[#f4efe5]">{copy.investmentThesis}</span>
                    <textarea name="thesis" required rows={4} defaultValue={thesis.thesis} className="w-full rounded-md border border-white/12 bg-[#07111f] p-3" />
                  </label>
                  <label className="space-y-2"><span className="text-sm font-semibold">{copy.assumptions}</span><textarea name="assumptions" rows={5} defaultValue={listValue(thesis.assumptions)} className="w-full rounded-md border border-white/12 bg-[#07111f] p-3" /></label>
                  <label className="space-y-2"><span className="text-sm font-semibold text-amber-200">{copy.invalidation}</span><textarea name="invalidationTriggers" rows={5} defaultValue={listValue(thesis.invalidation_triggers)} className="w-full rounded-md border border-white/12 bg-[#07111f] p-3" /></label>
                  <label className="space-y-2"><span className="text-sm font-semibold">{copy.targets}</span><textarea name="targetMetrics" rows={4} defaultValue={listValue(thesis.target_metrics)} className="w-full rounded-md border border-white/12 bg-[#07111f] p-3" /></label>
                  <label className="space-y-2"><span className="text-sm font-semibold">{copy.notes}</span><textarea name="notes" rows={4} defaultValue={thesis.notes ?? ""} className="w-full rounded-md border border-white/12 bg-[#07111f] p-3" /></label>
                  <div className="md:col-span-2"><Button type="submit">{copy.update}</Button></div>
                </form>

                <div className="grid gap-4 border-t border-white/10 px-5 py-5 lg:grid-cols-[220px_1fr]">
                  <form action={setInvestmentThesisStatusAction} className="space-y-3">
                    <input type="hidden" name="id" value={thesis.id} />
                    <label className="block text-sm font-semibold text-[#f4efe5]">
                      {sv ? "Tesstatus" : "Thesis status"}
                      <select name="status" defaultValue={thesis.status} className="mt-2 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3">
                        <option value="draft">{statusLabel("draft", sv)}</option>
                        <option value="active">{statusLabel("active", sv)}</option>
                        <option value="invalidated">{statusLabel("invalidated", sv)}</option>
                        <option value="closed">{statusLabel("closed", sv)}</option>
                      </select>
                    </label>
                    <Button type="submit" variant="secondary">{sv ? "Uppdatera status" : "Update status"}</Button>
                  </form>

                  <div>
                    <div className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" /><h3 className="font-semibold text-[#f4efe5]">{copy.evidence}</h3></div>
                    <form action={addManualThesisEvidenceAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                      <input type="hidden" name="thesisId" value={thesis.id} />
                      <input name="title" required maxLength={200} placeholder={sv ? "Rubrik" : "Title"} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3" />
                      <input name="body" required maxLength={5000} placeholder={sv ? "Vad har du observerat?" : "What did you observe?"} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3" />
                      <Button type="submit" variant="secondary">{copy.addEvidence}</Button>
                    </form>
                    {thesisEvidence.length ? (
                      <div className="mt-4 divide-y divide-white/10">
                        {thesisEvidence.slice(0, 12).map((event) => (
                          <div key={event.id} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex gap-2 text-xs text-[#8391a4]"><span className="font-semibold text-[#e1cb95]">{event.event_kind}</span><span>{new Date(event.created_at).toLocaleDateString(sv ? "sv-SE" : "en-GB")}</span></div>
                            <p className="mt-1 text-sm font-semibold text-[#f4efe5]">{event.title}</p>
                            <p className="mt-1 text-sm leading-6 text-[#aeb9c8]">{event.body}</p>
                          </div>
                        ))}
                      </div>
                    ) : <p className="mt-4 text-sm text-[#8391a4]">{copy.noEvidence}</p>}
                  </div>
                </div>
              </Card>
            );
          }) : (
            <Card><p className="text-sm text-[#9aa7b8]">{copy.empty}</p></Card>
          )}
        </div>
      </Container>
    </Section>
  );
}
