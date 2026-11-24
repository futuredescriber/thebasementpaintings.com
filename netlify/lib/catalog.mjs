// Original catalog durations measured from the deployed MP3s with ffprobe.
export const catalog = Object.freeze([
  {
    "id": "antipodes/01-instinct",
    "name": "Instinct",
    "album": "Antipodes",
    "durationMs": 516027
  },
  {
    "id": "antipodes/02-gnosis",
    "name": "Gnosis",
    "album": "Antipodes",
    "durationMs": 498333
  },
  {
    "id": "antipodes/03-koan",
    "name": "Koan",
    "album": "Antipodes",
    "durationMs": 274016
  },
  {
    "id": "antipodes/04-ziggurat",
    "name": "Ziggurat",
    "album": "Antipodes",
    "durationMs": 699645
  },
  {
    "id": "antipodes/05-soma",
    "name": "Soma",
    "album": "Antipodes",
    "durationMs": 560830
  },
  {
    "id": "antipodes/06-antipodes",
    "name": "Antipodes",
    "album": "Antipodes",
    "durationMs": 923968
  },
  {
    "id": "mystic/01-nomad",
    "name": "Nomad",
    "album": "Mystic",
    "durationMs": 367107
  },
  {
    "id": "mystic/02-veda",
    "name": "Veda",
    "album": "Mystic",
    "durationMs": 666733
  },
  {
    "id": "mystic/03-river",
    "name": "River",
    "album": "Mystic",
    "durationMs": 195413
  },
  {
    "id": "mystic/04-portal",
    "name": "Portal",
    "album": "Mystic",
    "durationMs": 401640
  },
  {
    "id": "mystic/05-cave-dance",
    "name": "Cave Dance",
    "album": "Mystic",
    "durationMs": 497333
  },
  {
    "id": "mystic/06-pensive",
    "name": "Pensive",
    "album": "Mystic",
    "durationMs": 282520
  },
  {
    "id": "mystic/07-oneiros",
    "name": "Oneiros",
    "album": "Mystic",
    "durationMs": 787280
  },
  {
    "id": "mystic/08-mystic",
    "name": "Mystic",
    "album": "Mystic",
    "durationMs": 408942
  },
  {
    "id": "time-lapse-city/01-time-lapse-city",
    "name": "Time Lapse City",
    "album": "Time Lapse City",
    "durationMs": 553480
  },
  {
    "id": "time-lapse-city/02-adult-male-beluga-whale",
    "name": "Adult Male Beluga Whale",
    "album": "Time Lapse City",
    "durationMs": 526120
  },
  {
    "id": "time-lapse-city/03-desert-surfer",
    "name": "Desert Surfer",
    "album": "Time Lapse City",
    "durationMs": 476320
  },
  {
    "id": "self-titled/01-future-describer",
    "name": "Future Describer",
    "album": "Self-Titled",
    "durationMs": 201000
  },
  {
    "id": "self-titled/02-forest",
    "name": "Forest",
    "album": "Self-Titled",
    "durationMs": 557000
  },
  {
    "id": "self-titled/03-sharp-and-dull",
    "name": "Sharp & Dull",
    "album": "Self-Titled",
    "durationMs": 305000
  },
  {
    "id": "self-titled/04-adult-male-beluga-whale",
    "name": "Adult Male Beluga Whale",
    "album": "Self-Titled",
    "durationMs": 550000
  },
  {
    "id": "self-titled/05-the-carl-sagan-abduction",
    "name": "The Carl Sagan Abduction",
    "album": "Self-Titled",
    "durationMs": 251880
  },
  {
    "id": "self-titled/06-cycles",
    "name": "Cycles",
    "album": "Self-Titled",
    "durationMs": 311107
  },
  {
    "id": "self-titled/07-robot-stomp",
    "name": "Robot Stomp",
    "album": "Self-Titled",
    "durationMs": 600000
  },
  {
    "id": "self-titled/08-desert-surfer",
    "name": "Desert Surfer",
    "album": "Self-Titled",
    "durationMs": 528440
  }
].map(Object.freeze));
export const catalogById = new Map(catalog.map(track => [track.id, track]));
