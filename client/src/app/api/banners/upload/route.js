import { NextResponse } from "next/server";
import { proxyUpload } from "@/lib/api";

// Takes the file the admin picked and hands back the URL to store on the
// banner row. The bytes go to the backend rather than into this app's
// public/ folder, which Next bakes into the image at build time - a file
// written there at runtime would vanish on the next deploy.
export async function POST(req) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Chưa chọn ảnh để tải lên" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return proxyUpload("/admin/banners/upload", buffer, file.name);
}
