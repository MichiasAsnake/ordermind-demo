import type { Metadata } from "next";
import Dashboard from "./dashboard";

export const metadata: Metadata = {
  title: "Synapto — AI Operations Assistant",
  description: "Real-time shop health dashboard and risk intelligence for print shops",
};

export default function Home() {
  return <Dashboard />;
}
