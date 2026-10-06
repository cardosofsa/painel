import type { Metadata } from "next";
import { RecuperarClient } from "./RecuperarClient";

export const metadata: Metadata = {
  title: "Recuperar senha",
};

export default function RecuperarPage() {
  return <RecuperarClient />;
}
