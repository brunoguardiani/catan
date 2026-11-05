import { headers } from "next/headers";
import { notFound } from "next/navigation";
import TestLab from "./test-lab";

export const dynamic = "force-dynamic";

export default async function TestPage() {
  const host = (await headers()).get("host")?.split(":")[0];
  if ((process.env.NODE_ENV !== "development" && process.env.ENABLE_TEST_MODE !== "1") || (host !== "localhost" && host !== "127.0.0.1")) notFound();
  return <TestLab />;
}
