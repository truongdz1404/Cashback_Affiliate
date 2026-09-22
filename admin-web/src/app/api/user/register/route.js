import { loginThrough } from "@/lib/userSession";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  return loginThrough("/app/register", {
    phone: body.phone,
    password: body.password,
    referralCode: body.referralCode || undefined,
  });
}
