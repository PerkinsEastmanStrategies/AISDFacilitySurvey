import {
  loadManifestServer,
  toManifestSchoolOptions,
} from "@/lib/floor-plan-manifest-server";
import { readFile } from "fs/promises";
import path from "path";
import SurveyApp from "@/components/survey-app";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [defaultSvg, manifest] = await Promise.all([
    readFile(
      path.join(process.cwd(), "public/floor-plans/default-plan.svg"),
      "utf-8"
    ),
    loadManifestServer(),
  ]);

  return (
    <SurveyApp
      defaultSvg={defaultSvg}
      initialManifest={manifest.rows}
      initialSchools={toManifestSchoolOptions(manifest.rows)}
    />
  );
}
