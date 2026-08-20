import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { signInAction } from "@/lib/auth/actions";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back" copy="Continue to your research workspace." alternate={<><Link href="/auth/signup" className="text-[#e1cb95]">Create an account</Link><span> or </span><Link href="/auth/forgot" className="text-[#e1cb95]">reset your password</Link>.</>}>
      <AuthForm action={signInAction} submitLabel="Log in" />
    </AuthShell>
  );
}
