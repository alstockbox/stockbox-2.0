import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { signUpAction } from "@/lib/auth/actions";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthShell title="Start researching" copy="The Free plan includes real company analysis and no payment card." alternate={<>Already have an account? <Link href="/auth/login" className="text-[#e1cb95]">Log in</Link>.</>}>
      <AuthForm action={signUpAction} submitLabel="Create account" />
    </AuthShell>
  );
}
