import { loginThrough } from "@/lib/userSession";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  return loginThrough("/app/login/google", { idToken: body.idToken });
}
