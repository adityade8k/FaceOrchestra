export const DEFAULT_RAY_STYLE=Object.freeze({leftColor:'#44ffaa',rightColor:'#ffaa44',opacity:.85,length:1.5});

// Missing settings in older projects retain the original ray appearance.
export function normalizeRayStyle(value) {
  const style=value&&typeof value==='object'?value:{};
  const color=(key)=>typeof style[key]==='string'&&/^#[0-9a-f]{6}$/i.test(style[key])?style[key].toLowerCase():DEFAULT_RAY_STYLE[key];
  const bounded=(key,max)=>Number.isFinite(style[key])?Math.max(0,Math.min(max,style[key])):DEFAULT_RAY_STYLE[key];
  return {leftColor:color('leftColor'),rightColor:color('rightColor'),opacity:bounded('opacity',1),length:bounded('length',10)};
}
