import {
  loadManifestServer,
  toManifestSchoolOptions,
} from "@/lib/floor-plan-manifest-server";
import SurveyApp from "@/components/survey-app";

export const dynamic = "force-dynamic";

export default async function Page() {
  const manifest = await loadManifestServer();

  return (
    <SurveyApp
      initialManifest={manifest.rows}
      initialSchools={toManifestSchoolOptions(manifest.rows)}
    />
  );
}
