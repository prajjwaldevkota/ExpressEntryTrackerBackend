// IRCC used suffixed identifiers (91a and 91b) for two historical rounds.
// Keep the numeric field for existing clients and expose roundId when needed.
export const drawId = draw => draw.roundId || String(draw.drawNumber);
export const newestFirst = (a, b) => b.drawNumber - a.drawNumber || drawId(b).localeCompare(drawId(a));
