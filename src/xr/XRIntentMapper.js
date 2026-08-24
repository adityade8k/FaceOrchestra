export const XRIntentType = Object.freeze({
  SpawnMenuOpen: "spawn.menu.open",
  SpawnMenuConfirm: "spawn.menu.confirm",
  ContextSecondary: "context.secondary",
  InstrumentDelete: "instrument.delete",
  TriggerBegin: "interaction.trigger.begin",
  TriggerEnd: "interaction.trigger.end",
  GripBegin: "interaction.grip.begin",
  GripEnd: "interaction.grip.end",
  HorizontalScaleStep: "instrument.scale.horizontal.step",
  PreviewDistanceStep: "spawn.preview.distance.step",
});

export class XRIntentMapper {
  map(inputEvent) {
    const base = {
      controllerId: inputEvent.controllerId,
      controller: inputEvent.controller,
      handedness: inputEvent.handedness,
      timestamp: inputEvent.timestamp,
    };

    if (inputEvent.type === "axis.step") {
      if (inputEvent.axis === "thumbstickX") {
        return [{ ...base, type: XRIntentType.HorizontalScaleStep, direction: inputEvent.direction }];
      }
      if (inputEvent.axis === "thumbstickY") {
        return [{ ...base, type: XRIntentType.PreviewDistanceStep, direction: inputEvent.direction }];
      }
      return [];
    }
    if (inputEvent.type !== "button.transition") {
      return [];
    }

    const { button, pressed, handedness } = inputEvent;
    if (button === "trigger") {
      return [{ ...base, type: pressed ? XRIntentType.TriggerBegin : XRIntentType.TriggerEnd }];
    }
    if (button === "grip") {
      return [{ ...base, type: pressed ? XRIntentType.GripBegin : XRIntentType.GripEnd }];
    }
    if (button === "primary" && handedness === "right") {
      return [{ ...base, type: pressed ? XRIntentType.SpawnMenuOpen : XRIntentType.SpawnMenuConfirm }];
    }
    if (button === "primary" && handedness === "left" && pressed) {
      return [{ ...base, type: XRIntentType.InstrumentDelete }];
    }
    if (button === "secondary" && handedness === "right" && pressed) {
      return [{ ...base, type: XRIntentType.ContextSecondary }];
    }
    return [];
  }
}
