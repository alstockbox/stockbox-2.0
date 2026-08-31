import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { answerCopilotQuestion } from "@/lib/investor-intelligence/copilot-service";

const schema=z.object({question:z.string().trim().min(3).max(500)});
export async function POST(request:Request){
  const user=await requireUser();
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:"Invalid question."},{status:422});
  const answer=await answerCopilotQuestion(user.id,parsed.data.question);
  return Response.json({ok:true,data:answer});
}
