/** Address/city mappings made before purposes were separated need to be learned again. */
export function legacyMemory(memory: Record<string, string>): Record<string, string> {
  const changed = new Set(["basic.address", "basic.addressRegion", "basic.postcode", "basic.expectedCity"]);
  return Object.fromEntries(Object.entries(memory).filter(([, target]) => !changed.has(target)));
}
