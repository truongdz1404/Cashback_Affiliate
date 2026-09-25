import { loginThrough } from "@/lib/userSession";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  // referralCode only matters when this sign-in creates the account; the
  // backend ignores it for anyone who already has one.
  return loginThrough("/app/login/google", {
    idToken: body.idToken,
    referralCode: body.referralCode || undefined,
  });
}
