import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";

export function SignOutButton({ label }: { label: string }) {
  return (
    <form action={signOutAction}>
      <button
        className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-[#c9d2df] hover:bg-white/8"
        type="submit"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
    </form>
  );
}
