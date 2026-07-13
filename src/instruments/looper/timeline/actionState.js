export const ACTION_FIELDS = ["squeeze", "bend", "earLeft", "earRight", "nose", "vowel"];
export const NUMERIC_ACTION_FIELDS = ["squeeze", "bend", "earLeft", "earRight", "nose"];

export function resetActionState(target) {
  for (const field of ACTION_FIELDS) {
    target[field] = undefined;
  }
  return target;
}

export function createActionState(values = null) {
  const state = {
    squeeze: undefined,
    bend: undefined,
    earLeft: undefined,
    earRight: undefined,
    nose: undefined,
    vowel: undefined,
  };
  if (values) {
    copyActionState(state, values);
  }
  return state;
}

export function copyActionState(target, source = null) {
  resetActionState(target);
  if (!source) {
    return target;
  }

  for (const field of ACTION_FIELDS) {
    if (source[field] !== undefined) {
      target[field] = source[field];
    }
  }
  return target;
}

export function cloneActionState(source = null) {
  return createActionState(source);
}

export function hasActionValue(state, field) {
  return state?.[field] !== undefined && state?.[field] !== null;
}

export function actionStateToJSON(source = null) {
  const serialized = {};
  if (!source) {
    return serialized;
  }

  for (const field of ACTION_FIELDS) {
    if (source[field] !== undefined) {
      serialized[field] = source[field];
    }
  }
  return serialized;
}
