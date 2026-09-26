import { redirect } from "next/navigation";

// Signing in happens in a dialog now (components/public/AuthDialog.tsx), so
// this URL no longer has a screen behind it. proxy.js normally redirects
// /login before Next.js gets here; this is the same redirect one layer down,
// for the day someone narrows the proxy matcher and does not think of this
// page. The form itself is untouched and still lives in AuthForm, so bringing
// the standalone screen back is a matter of restoring these few lines.
type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const found = Array.isArray(value) ? value[0] : value;
  return found && found.trim() ? found.trim() : undefined;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const next = one(params, "next");
  const query = new URLSearchParams({ auth: "login" });
  if (next && next.startsWith("/") && !next.startsWith("//")) query.set("next", next);
  redirect(`/?${query.toString()}`);
}
