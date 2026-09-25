import type { Metadata } from "next";
import { RecuperarClient } from "./RecuperarClient";

export const metadata: Metadata = {
  title: "Recuperar senha · Segundo Cérebro",
};

export default function RecuperarPage() {
  return <RecuperarClient />;
}
