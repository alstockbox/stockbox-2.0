import Link from "next/link";
import type { ReactNode } from "react";
import { Card, Container, Section } from "@/components/ui/card";

export function AuthShell({ title, copy, children, alternate }: { title: string; copy: string; children: ReactNode; alternate?: ReactNode }) {
  return (
    <Section className="min-h-[72vh]">
      <Container className="grid place-items-center">
        <Card className="w-full max-w-md p-6 sm:p-8">
          <Link href="/" className="serif text-lg text-[#e1cb95]">StockBox</Link>
          <h1 className="mt-5 text-2xl font-semibold text-[#f4efe5]">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{copy}</p>
          <div className="mt-6">{children}</div>
          {alternate ? <div className="mt-5 border-t border-white/10 pt-5 text-sm text-[#9aa7b8]">{alternate}</div> : null}
        </Card>
      </Container>
    </Section>
  );
}
