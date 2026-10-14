import { validate as validateSong } from './validate-song-browser.mjs';
// Supported runner entry: older CLI actions now exercise the current song.
export const validate = (app, options={}) => validateSong(app,{recording:false,...options,id:'kuch-to-hua-hai'});
