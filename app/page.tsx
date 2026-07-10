import { readFile } from "fs/promises";
import path from "path";
import SurveyApp from "@/components/survey-app";

export default async function Page() {
  const defaultSvg = await readFile(
    path.join(process.cwd(), "public/floor-plans/default-plan.svg"),
    "utf-8"
  );

  return <SurveyApp defaultSvg={defaultSvg} />;
}
