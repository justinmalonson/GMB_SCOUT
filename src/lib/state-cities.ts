export const STATE_CITIES: Record<string, string[]> = {
  SC: [
    "Myrtle Beach",
    "Conway",
    "North Myrtle Beach",
    "Charleston",
    "Columbia",
    "Greenville",
    "Spartanburg",
    "Florence",
    "Sumter",
    "Rock Hill",
    "Mount Pleasant",
    "Summerville",
    "Aiken",
    "Anderson",
    "Beaufort",
    "Hilton Head Island",
    "Lexington",
    "Goose Creek",
    "Greer",
    "Greenwood"
  ]
};

export function normalizeStateKey(state: string): string {
  return state.trim().toUpperCase();
}
