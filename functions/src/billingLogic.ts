/**
 * Malaysian TNB Domestic Tariff Billing Logic
 * Implements the complete billing calculation according to TNB Tarif A (Residential) 2025
 */

export interface BillingInput {
  totalKWh: number;
  afaRate?: number; // RM/kWh, can be negative or positive. Only applies if usage >= 600 kWh (default -0.065)
}

export interface BillingBreakdown {
  totalKWh: number;
  energyCharge: number;
  capacityCharge: number;
  networkCharge: number;
  retailServiceCharge: number;
  afa: number;
  kwtbb: number;
  serviceTax: number;
  eeci: number; // negative value = rebate
  totalPayable: number;
  meta: {
    energyRateApplied: number;
    eeciRateApplied: number;
    subtotalBeforeKwtbb: number;
    subtotalBeforeServiceTax: number;
  };
}

/**
 * Get EECI rebate rate in sen/kWh based on total usage
 */
function getEECIRate(totalKWh: number): number {
  if (totalKWh <= 200) return -25.00;
  if (totalKWh <= 250) return -24.50;
  if (totalKWh <= 300) return -22.50;
  if (totalKWh <= 350) return -21.00;
  if (totalKWh <= 400) return -17.00;
  if (totalKWh <= 450) return -14.50;
  if (totalKWh <= 500) return -12.00;
  if (totalKWh <= 550) return -10.50;
  if (totalKWh <= 600) return -9.00;
  if (totalKWh <= 650) return -7.50;
  if (totalKWh <= 700) return -5.50;
  if (totalKWh <= 750) return -4.50;
  if (totalKWh <= 800) return -4.00;
  if (totalKWh <= 850) return -2.50;
  if (totalKWh <= 900) return -1.00;
  if (totalKWh <= 1000) return -0.50;
  return 0; // No incentive beyond 1000 kWh
}

/**
 * Calculate TNB domestic billing breakdown
 */
export function calculateBilling(input: BillingInput): BillingBreakdown {
  const { totalKWh, afaRate = -0.065 } = input;

  // 1. Energy Charge (Caj Tenaga)
  const energyRate = totalKWh > 1500 ? 0.3703 : 0.2703;
  const energyCharge = totalKWh * energyRate;

  // 2. Capacity Charge (Caj Kapasiti)
  const capacityCharge = totalKWh * 0.0455;

  // 3. Network Charge (Caj Rangkaian)
  const networkCharge = totalKWh * 0.1285;

  // 4. Retail Service Charge (Caj Peruncitan)
  const retailServiceCharge = totalKWh >= 600 ? 10.0 : 0;

  // 5. AFA (Additional Fixed Adjustment)
  // AFA applies only if usage >= 600 kWh, regardless of whether rate is positive or negative
  let afa = 0;
  if (totalKWh >= 600) {
    afa = totalKWh * afaRate;
  }

  // 6. EECI (Insentif Cekap Tenaga) - rebate in sen/kWh, convert to RM
  const eeciRateSen = getEECIRate(totalKWh);
  const eeci = totalKWh * (eeciRateSen / 100); // Convert sen to RM (negative value)

  // 7. Subtotal before KWTBB
  const subtotalBeforeKwtbb = energyCharge + capacityCharge + networkCharge + retailServiceCharge + afa - Math.abs(eeci);

  // 8. KWTBB (1.6%)
  const kwtbb = totalKWh > 300 ? 0.016 * subtotalBeforeKwtbb : 0;

  // 9. Subtotal before Service Tax
  const subtotalBeforeServiceTax = subtotalBeforeKwtbb + kwtbb;

  // 10. Service Tax (Cukai Perkhidmatan) - 8%
  const serviceTax = totalKWh > 600 ? 0.08 * subtotalBeforeServiceTax : 0;

  // 11. Total Payable
  const totalPayable = subtotalBeforeServiceTax + serviceTax;

  // Round all values to 2 decimal places
  const round = (val: number): number => Math.round(val * 100) / 100;

  return {
    totalKWh: round(totalKWh),
    energyCharge: round(energyCharge),
    capacityCharge: round(capacityCharge),
    networkCharge: round(networkCharge),
    retailServiceCharge: round(retailServiceCharge),
    afa: round(afa),
    kwtbb: round(kwtbb),
    serviceTax: round(serviceTax),
    eeci: round(eeci),
    totalPayable: round(totalPayable),
    meta: {
      energyRateApplied: energyRate,
      eeciRateApplied: eeciRateSen,
      subtotalBeforeKwtbb: round(subtotalBeforeKwtbb),
      subtotalBeforeServiceTax: round(subtotalBeforeServiceTax),
    },
  };
}

