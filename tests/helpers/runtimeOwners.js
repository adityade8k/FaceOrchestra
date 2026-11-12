import { SpawnRuntime } from "../../src/app/runtime/SpawnRuntime.js";
import { LooperConnectionRuntime } from "../../src/app/runtime/LooperConnectionRuntime.js";
import { MetronomeConnectionRuntime } from "../../src/app/runtime/MetronomeConnectionRuntime.js";
import { MetronomePulseRuntime } from "../../src/app/runtime/MetronomePulseRuntime.js";
import { HonkPresentationRuntime } from "../../src/app/runtime/HonkPresentationRuntime.js";

// Inject fixture services into the same explicit owners used by RuntimeHost.
export function runtimeOwners(host) {
  if (Object.hasOwn(host, "r") && host.r && host.r !== host) {
    runtimeOwners(host.r);
    tutorialOwners(host);
  }
  for (const [key, Owner] of Object.entries({
    spawn: SpawnRuntime,
    looperConnections: LooperConnectionRuntime,
    metronomeConnections: MetronomeConnectionRuntime,
    metronomePulses: MetronomePulseRuntime,
    presentation: HonkPresentationRuntime,
  })) {
    if (!(host[key] instanceof Owner)) host[key] = Object.assign(new Owner(host), host[key]);
  }
  return host;
}

import { ApplicationNavigation } from "../../src/navigation/ApplicationNavigation.js";
import { RecordingCoordinator } from "../../src/performance/RecordingCoordinator.js";
import { TutorialPanels } from "../../src/tutorial/TutorialPanels.js";
export function tutorialOwners(host) {
  for (const [key, Owner] of Object.entries({
    navigation: ApplicationNavigation,
    recording: RecordingCoordinator,
    panels: TutorialPanels,
  })) {
    if (!(host[key] instanceof Owner)) host[key] = Object.assign(new Owner(host), host[key]);
  }
  return host;
}
