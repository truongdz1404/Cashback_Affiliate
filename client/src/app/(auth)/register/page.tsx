import { redirect } from "next/navigation";

// Same story as the login page next door: the screen is gone, the dialog took
// over, and this stays as the redirect of last resort. The referral code has
// to survive the hop - every invite link already in the wild points here.
type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const found = Array.isArray(value) ? value[0] : value;
  return found && found.trim() ? found.trim() : undefined;
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const next = one(params, "next");
  // ?ref=CODE is what a referral link carries, ?referralCode= is accepted too.
  const referralCode = one(params, "ref") ?? one(params, "referralCode");
  const query = new URLSearchParams({ auth: "register" });
  if (referralCode) query.set("ref", referralCode);
  if (next && next.startsWith("/") && !next.startsWith("//")) query.set("next", next);
  redirect(`/?${query.toString()}`);
}
