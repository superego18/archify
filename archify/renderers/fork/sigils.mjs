// Fork extension (superego18/archify dev_chanju): extra card symbols.
// `components[].sigil` names one of these 24-unit line glyphs and draws it in
// place of the type sigil (same tone, same place). Glyphs come from Lucide
// (ISC) and Tabler Icons (MIT); see THIRD_PARTY_ICONS.md beside this file.

export const FORK_SIGILS = Object.freeze({
  // Lucide (ISC): users
  "users": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/> <path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/> <path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/> <circle cx=\"9\" cy=\"7\" r=\"4\"/>",
  // Tabler Icons (MIT): database-import
  "database-import": "<path d=\"M4 6c0 1.657 3.582 3 8 3s8 -1.343 8 -3s-3.582 -3 -8 -3s-8 1.343 -8 3\"/> <path d=\"M4 6v6c0 1.657 3.582 3 8 3c.856 0 1.68 -.05 2.454 -.144m5.546 -2.856v-6\"/> <path d=\"M4 12v6c0 1.657 3.582 3 8 3c.171 0 .341 -.002 .51 -.006\"/> <path d=\"M19 22v-6\"/> <path d=\"M22 19l-3 -3l-3 3\"/>",
  // Lucide (ISC): workflow
  "workflow": "<rect width=\"8\" height=\"8\" x=\"3\" y=\"3\" rx=\"2\"/> <path d=\"M7 11v4a2 2 0 0 0 2 2h4\"/> <rect width=\"8\" height=\"8\" x=\"13\" y=\"13\" rx=\"2\"/>",
  // Lucide (ISC): waves-horizontal
  "waves": "<path d=\"M2 12q2.5 2 5 0t5 0 5 0 5 0\"/> <path d=\"M2 19q2.5 2 5 0t5 0 5 0 5 0\"/> <path d=\"M2 5q2.5 2 5 0t5 0 5 0 5 0\"/>",
  // Lucide (ISC): database-backup
  "database-sync": "<ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\"/> <path d=\"M3 12a9 3 0 0 0 5 2.69\"/> <path d=\"M21 9.3V5\"/> <path d=\"M3 5v14a9 3 0 0 0 6.47 2.88\"/> <path d=\"M12 12v4h4\"/> <path d=\"M13 20a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L12 16\"/>",
  // Lucide (ISC): database-zap
  "database-zap": "<ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\"/> <path d=\"M3 5V19A9 3 0 0 0 15 21.84\"/> <path d=\"M21 5V8\"/> <path d=\"M21 12L18 17H22L19 22\"/> <path d=\"M3 12A9 3 0 0 0 14.59 14.87\"/>",
  // Lucide (ISC): database-search
  "database-search": "<path d=\"M21 11.693V5\"/> <path d=\"m22 22-1.875-1.875\"/> <path d=\"M3 12a9 3 0 0 0 8.697 2.998\"/> <path d=\"M3 5v14a9 3 0 0 0 9.28 2.999\"/> <circle cx=\"18\" cy=\"18\" r=\"3\"/> <ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\"/>",
  // Lucide (ISC): table
  "table": "<path d=\"M12 3v18\"/> <rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/> <path d=\"M3 9h18\"/> <path d=\"M3 15h18\"/>",
  // Drawn for this fork: a database with a small table at its lower right.
  // The two plain rects repaint the card behind the table so the cylinder
  // lines do not show through it.
  "database-table": "<ellipse cx=\"9\" cy=\"5\" rx=\"7\" ry=\"2.5\"/> <path d=\"M2 5v12a7 2.5 0 0 0 14 0V5\"/> <path d=\"M2 11a7 2.5 0 0 0 14 0\"/> <rect x=\"11\" y=\"11\" width=\"12\" height=\"12\" rx=\"2\" class=\"c-mask\" style=\"stroke:none\"/> <rect x=\"11\" y=\"11\" width=\"12\" height=\"12\" rx=\"2\" class=\"c-database\" style=\"stroke:none\"/> <rect x=\"12.5\" y=\"12.5\" width=\"9.5\" height=\"9.5\" rx=\"1.5\"/> <path d=\"M12.5 15.7h9.5M12.5 18.9h9.5M17.25 12.5v9.5\"/>",
});

export const FORK_SIGIL_GRID = 24;

// Glyphs whose lines fill most of the grid read heavier than the others at the
// same stroke; this factor evens out their painted weight.
export const FORK_SIGIL_WEIGHT = Object.freeze({ table: 0.62 });

