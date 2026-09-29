import type { Metadata } from "next";
import { SignupClient } from "./SignupClient";

export const metadata: Metadata = {
  title: "Criar conta · SERTÃO",
};

export default function SignupPage() {
  return <SignupClient />;
}
