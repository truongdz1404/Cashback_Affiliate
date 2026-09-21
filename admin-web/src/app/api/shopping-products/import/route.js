import { NextResponse } from "next/server";
import { proxyUpload } from "@/lib/api";

export async function POST(req) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Thiếu file cần import" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return proxyUpload("/admin/shopping-products/import", buffer, file.name);
}
