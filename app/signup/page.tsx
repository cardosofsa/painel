import type { Metadata } from "next";
import { SignupClient } from "./SignupClient";

export const metadata: Metadata = {
  title: "Criar conta · Segundo Cérebro",
};

export default function SignupPage() {
  return <SignupClient />;
}
