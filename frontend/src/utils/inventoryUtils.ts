
export interface UnitOption {
  value: string;
  label: string;
  group: 'mass' | 'volume' | 'discrete';
  factor: number; // Factor relative to base unit (gram for mass, ml for volume, 1 for discrete)
}

export const UNIT_OPTIONS: UnitOption[] = [
  { value: 'tonne', label: 'Metric Tonne (t)', group: 'mass', factor: 1000000 },
  { value: 'kg', label: 'Kilogram (kg)', group: 'mass', factor: 1000 },
  { value: 'gram', label: 'Gram (g)', group: 'mass', factor: 1 },
  { value: 'litre', label: 'Litre (l)', group: 'volume', factor: 1000 },
  { value: 'ml', label: 'Millilitre (ml)', group: 'volume', factor: 1 },
  { value: 'unit', label: 'Unit (pcs)', group: 'discrete', factor: 1 },
  { value: 'pkt', label: 'Packet (pkt)', group: 'discrete', factor: 1 },
  { value: 'box', label: 'Box', group: 'discrete', factor: 1 }
];

/**
 * Gets the unit details for a given unit value.
 */
export const getUnitDetails = (unitValue: string): UnitOption | undefined => {
  if (!unitValue) return undefined;
  return UNIT_OPTIONS.find(u => u.value.toLowerCase() === unitValue.toLowerCase());
};

/**
 * Converts a value from one unit to another within the same measurement group.
 * Handles edge cases like undefined units, incompatible groups, and non-numeric values.
 */
export const convertValue = (value: number, fromUnit: string, toUnit: string): number => {
  // Graceful handling of invalid numeric input
  if (typeof value !== 'number' || isNaN(value)) {
    console.warn('convertValue: Invalid numeric value provided', value);
    return 0;
  }

  // Identical units require no math
  if (fromUnit === toUnit) return value;

  const from = getUnitDetails(fromUnit);
  const to = getUnitDetails(toUnit);

  // If either unit is unrecognized or groups don't match, return original value (fallback)
  if (!from || !to || from.group !== to.group) {
    return value;
  }

  // Discrete units (pcs, boxes) do not have standard conversion ratios without item context
  if (from.group === 'discrete') {
    return value;
  }

  try {
    // Convert to base unit (gram or ml) then to target unit
    const valueInBaseUnit = value * from.factor;
    const result = valueInBaseUnit / to.factor;

    // Return precision limited to 4 decimal places
    return parseFloat(result.toFixed(4));
  } catch (error) {
    console.error('convertValue: Mathematical error during conversion', error);
    return value;
  }
};

/**
 * Checks if two units belong to the same convertible group (Mass or Volume).
 */
export const areUnitsCompatible = (unitA: string, unitB: string): boolean => {
  const detailsA = getUnitDetails(unitA);
  const detailsB = getUnitDetails(unitB);
  
  if (!detailsA || !detailsB) return false;
  if (detailsA.group === 'discrete') return false; 
  
  return detailsA.group === detailsB.group;
};
