import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
// In der Cloud-Umgebung das vorinstallierte Chromium nutzen
if (process.env.REMOTION_BROWSER) Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
