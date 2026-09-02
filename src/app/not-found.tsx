import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="card gloss max-w-md p-6 text-center">
        <p className="text-sm font-black uppercase text-[var(--primary-strong)]">404</p>
        <h1 className="display mt-2 text-4xl font-black">Sidan finns inte</h1>
        <p className="my-4 font-bold text-[var(--muted)]">Den kan vara flyttad, privat eller borttagen.</p>
        <ButtonLink href="/app">Till översikten</ButtonLink>
      </section>
    </main>
  );
}
