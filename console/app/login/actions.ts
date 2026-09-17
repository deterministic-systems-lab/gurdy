"use server";

import { signIn } from "@/auth";

export async function requestLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return;
  }
  await signIn("resend", { email, redirectTo: "/" });
}
