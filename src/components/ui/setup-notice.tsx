import { AlertTriangle } from "lucide-react";
import { Card } from "./card";

export function SetupNotice({
  title,
  detail
}: {
  title: string;
  detail: string;
}) {
  return (
    <Card className="border-[#b99b5f]/35 bg-[#b99b5f]/10">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#e1cb95]" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold text-[#f4efe5]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#c9d2df]">{detail}</p>
        </div>
      </div>
    </Card>
  );
}
