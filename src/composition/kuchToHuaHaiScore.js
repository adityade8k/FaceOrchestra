// First-pass rhythmic arrangement, NOT an exact transcription.
// Edit tempoBpm below and the [pitch, local start beat, duration in beats]
// tuples. Starts are relative to each phrase; gaps are deliberate rests.
// Each lyrical half begins at beat 0 or 8 (an arrangement choice, not a bar
// interpretation of '|'). Gates leave breathing room for the Honk release.
// The exported events contain absolute startBeat, durationBeats and phraseId.

export const COMPOSITION_PITCHES = Object.freeze([
  "G3", "A3", "Bb3", "C4", "D4", "E4", "F4", "F#4", "G4", "A4", "B4",
]);

const phrase = (id, section, label, startBeat, notation, notes) => ({
  id, section, label, startBeat, durationBeats: 16,
  subphraseStartBeats: [startBeat, startBeat + 8],
  notation,
  events: notes.map(([pitch, beat, durationBeats], index) => ({
    id: `${id}:${index}`, phraseId: id, pitch,
    startBeat: startBeat + beat, durationBeats,
  })),
});

const phrases = [
  phrase(1, "Opening", "Kuch To Hua Hai / Kuch Ho Gayaa Hai", 0,
    "g D C D E | g D D DED C", [
      ["G3", 0, .8], ["D4", 1, 1.3], ["C4", 2.5, .8], ["D4", 3.5, .8], ["E4", 4.5, 2.5],
      ["G3", 8, .8], ["D4", 9, 1.3], ["D4", 10.5, .8],
      ["D4", 11.5, .35], ["E4", 12, .35], ["D4", 12.5, .35], ["C4", 13, 2],
    ]),
  phrase(2, "Opening", "Do Chaar Din Sae / Lagta Hai Jaise", 16,
    "FE D C a# FED | D DG D DE EDCag", [
      ["F4", 0, .35], ["E4", .5, .35], ["D4", 1, 1.3], ["C4", 2.5, 1.3], ["Bb3", 4, 1.3],
      ["F4", 5.5, .35], ["E4", 6, .35], ["D4", 6.5, .7],
      ["D4", 8, .8], ["D4", 9, .35], ["G4", 9.5, .7], ["D4", 10.5, .7],
      ["D4", 11.5, .35], ["E4", 12, .35], ["E4", 12.5, .35], ["D4", 13, .35],
      ["C4", 13.5, .35], ["A3", 14, .35], ["G3", 14.5, .7],
    ]),
  phrase(3, "Opening", "Sab Kuch Alag Hai / Sab Kuch Nayaa Hai", 32,
    "g D CD D E | g D D DED C", [
      ["G3", 0, .8], ["D4", 1, 1.3], ["C4", 2.5, .35], ["D4", 3, .35],
      ["D4", 3.5, .8], ["E4", 4.5, 2.5],
      ["G3", 8, .8], ["D4", 9, 1.3], ["D4", 10.5, .8],
      ["D4", 11.5, .35], ["E4", 12, .35], ["D4", 12.5, .35], ["C4", 13, 2],
    ]),
  phrase(4, "Opening", "Kuch To Hua Hai / Kuch Ho Gayaa Hai", 48,
    "g D C D E | g g F E DED C", [
      ["G3", 0, .8], ["D4", 1, 1.3], ["C4", 2.5, .8], ["D4", 3.5, .8], ["E4", 4.5, 2.5],
      ["G3", 8, .8], ["G3", 9, .8], ["F4", 10, .8], ["E4", 11, .8],
      ["D4", 12, .35], ["E4", 12.5, .35], ["D4", 13, .35], ["C4", 13.5, 1.5],
    ]),
  phrase(5, "Charanam 1", "Cheezein Mein Rakh Ke / Bhool Jaati Hoon", 64,
    "D E E D D E...F | F E D Ca D", [
      ["D4", 0, .8], ["E4", 1, .8], ["E4", 2, .8], ["D4", 3, .8], ["D4", 4, .8],
      ["E4", 5, 1.7], ["F4", 7, .65],
      ["F4", 8, 1.3], ["E4", 9.5, 1.3], ["D4", 11, .8],
      ["C4", 12, .35], ["A3", 12.5, .35], ["D4", 13, 2],
    ]),
  phrase(6, "Charanam 1", "Bekhayaali Mein / Gungunati Hoon", 80,
    "D E E GD E..F | F E DCa D", [
      ["D4", 0, .8], ["E4", 1, .8], ["E4", 2, 1.3], ["G4", 3.5, .35], ["D4", 4, .8],
      ["E4", 5, 1.45], ["F4", 6.75, .8],
      ["F4", 8, 1.3], ["E4", 9.5, 1.3], ["D4", 11, .35],
      ["C4", 11.5, .35], ["A3", 12, .35], ["D4", 13, 2],
    ]),
  phrase(7, "Charanam 1", "Ab Akele Mein / Muskuraati Hoon", 96,
    "FF EDCa# F ED | D D GD E EDCag", [
      ["F4", 0, .55], ["F4", .75, .8], ["E4", 2, .35], ["D4", 2.5, .35],
      ["C4", 3, .35], ["Bb3", 3.5, 1.3], ["F4", 5, .8], ["E4", 6, .35], ["D4", 6.5, .7],
      ["D4", 8, .8], ["D4", 9, .8], ["G4", 10, .35], ["D4", 10.5, .8], ["E4", 11.5, .8],
      ["E4", 12.5, .35], ["D4", 13, .35], ["C4", 13.5, .35], ["A3", 14, .35], ["G3", 14.5, .7],
    ]),
  phrase(8, "Charanam 1", "Badli Hui Si / Meri Ada Hai", 112,
    "g gD CD E | g D DED C", [
      ["G3", 0, .8], ["G3", 1.5, .35], ["D4", 2, 1.3], ["C4", 3.5, .35], ["D4", 4, .8], ["E4", 5, 2],
      ["G3", 8, .8], ["D4", 9, 2], ["D4", 11.5, .35], ["E4", 12, .35], ["D4", 12.5, .35], ["C4", 13, 2],
    ]),
  phrase(9, "Charanam 1", "Kuch To Hua Hai / Kuch Ho Gayaa Hai", 128,
    "g D C D E | F F F E DED C", [
      ["G3", 0, .8], ["D4", 1, 1.3], ["C4", 2.5, .8], ["D4", 3.5, .8], ["E4", 4.5, 2.5],
      ["F4", 8, .8], ["F4", 9, .8], ["F4", 10, .8], ["E4", 11, .8],
      ["D4", 12, .35], ["E4", 12.5, .35], ["D4", 13, .35], ["C4", 13.5, 1.5],
    ]),
  phrase(10, "Charanam 2", "Pighla Pighla Hai / Dil Mera Jab Se", 144,
    "E E E G E G A | A ABA G F# G", [
      ["E4", 0, .8], ["E4", 1, .8], ["E4", 2, .8], ["G4", 3, .8], ["E4", 4, .8],
      ["G4", 5, .8], ["A4", 6, 1.2],
      ["A4", 8, 1.3], ["A4", 9.5, .35], ["B4", 10, .35], ["A4", 10.5, .35],
      ["G4", 11.5, .8], ["F#4", 12.5, .8], ["G4", 13.5, 1.5],
    ]),
  phrase(11, "Charanam 2", "Achcha Rehta Hain / Mood Bhi Tab Se", 160,
    "E E G EG GA | A A BA G F# G", [
      ["E4", 0, .8], ["E4", 1, 1.3], ["G4", 2.5, 1.3], ["E4", 4, .35], ["G4", 4.5, .8],
      ["G4", 5.5, .35], ["A4", 6, 1.2],
      ["A4", 8, .8], ["A4", 9, .8], ["B4", 10, .35], ["A4", 10.5, .35],
      ["G4", 11.5, .8], ["F#4", 12.5, .8], ["G4", 13.5, 1.5],
    ]),
  phrase(12, "Charanam 2", "Haske Milta Hoon / Aaj Kal Sab Se", 176,
    "F E D Ca# FED | D D G D E E EDCag", [
      ["F4", 0, .8], ["E4", 1, .8], ["D4", 2, 1.3], ["C4", 3.5, .35], ["Bb3", 4, .8],
      ["F4", 5, .35], ["E4", 5.5, .35], ["D4", 6, 1.2],
      ["D4", 8, .8], ["D4", 9, .55], ["G4", 9.75, .55], ["D4", 10.5, .55],
      ["E4", 11.25, .55], ["E4", 12, .35], ["E4", 12.5, .35], ["D4", 13, .35],
      ["C4", 13.5, .35], ["A3", 14, .35], ["G3", 14.5, .7],
    ]),
  phrase(13, "Charanam 2", "Khush Ho Gaya Hai / Jo Bhi Mila Hai", 192,
    "g D C D E | g D D ED C", [
      ["G3", 0, .8], ["D4", 1, 1.3], ["C4", 2.5, .8], ["D4", 3.5, .8], ["E4", 4.5, 2.5],
      ["G3", 8, .8], ["D4", 9, 1.3], ["D4", 10.5, .8],
      ["E4", 12, .35], ["D4", 12.5, .35], ["C4", 13, 2],
    ]),
  phrase(14, "Charanam 2", "Kuch To Hua Hai / Kuch Ho Gayaa Hai", 208,
    "g D C D E DEF | F F FG F ED C", [
      ["G3", 0, .8], ["D4", 1, .8], ["C4", 2, .8], ["D4", 3, .8], ["E4", 4, 1.2],
      ["D4", 5.5, .35], ["E4", 6, .35], ["F4", 6.5, .7],
      ["F4", 8, .8], ["F4", 9, .8], ["F4", 10, .35], ["G4", 10.5, .35],
      ["F4", 11, .8], ["E4", 12, .35], ["D4", 12.5, .35], ["C4", 13, 2.6],
    ]),
];

export const kuchToHuaHaiScore = {
  title: "Kuch To Hua Hai",
  tempoBpm: 96,
  phrases,
  events: phrases.flatMap(({ events }) => events),
};

export function tuningForCompositionPitch(pitch) {
  const match = /^([A-G])([#b]?)([34])$/.exec(pitch);
  if (!match || !COMPOSITION_PITCHES.includes(pitch)) throw new Error(`Unsupported pitch: ${pitch}`);
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]] +
    (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0);
  return { note: pitch, semitonesFromF: semitone - 5, octaveOffset: Number(match[3]) - 4 };
}
