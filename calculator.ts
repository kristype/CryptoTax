const fiatUnits = ['eur', 'usd', 'nok'];

interface CalculationResult {
  realized?: Realized[];
  deposit?: Deposit;
  unrealized?: Unrealized[];
}

export function calculateEntry(entry: Entry, unrealized: Unrealized[], valuta: Valuta[]): CalculationResult {
  // Kjøp med fiat
  const { time, sell, buy, withdraw, fee, deposit, convert } = entry;

  if (buy && sell && fiatUnits.includes(sell.unit)) {
    const value = getSellValueInNok(time, sell, valuta);
    return { unrealized: [...unrealized, createUnrealizedEntry(entry, buy, fee, value)] };
  }

  // Kjøp med crypto
  else if (buy && sell && !fiatUnits.includes(sell.unit) && !fiatUnits.includes(buy.unit)) {
    if (!sell.unitPriceUsd) {
      throw new Error(`Warning: missing sell price for: ${sell.unit} ${time.toISOString()}`);
    }

    let feeRealization = null;

    if (fee && fee.unit != buy.unit) {
      // Realization of fee amount when crypto is used for fees
      if (!fiatUnits.includes(fee.unit)) {
        if (!fee.unitPriceUsd) {
          throw new Error(`Warning: missing fee price for: ${fee.unit} ${time.toISOString()}`);
        }

        const feeRealizedUsd = fee.unitPriceUsd * fee.amount;
        const feeRealizedNok = findConversion(time, 'usd', valuta) * feeRealizedUsd;
        feeRealization = createRealizationEntry(time, fee.amount, fee.unit, feeRealizedNok, unrealized);
      } else {
        throw new Error(`Warning: Unsupported case for fee: ${fee.unit} ${time.toISOString()}`);
      }
    }

    const newUnrealized = feeRealization?.newUnrealized ?? unrealized;

    const realizedUsd = sell.unitPriceUsd * sell.amount;
    const realizedNok = findConversion(time, 'usd', valuta) * realizedUsd;

    const realization = createRealizationEntry(time, sell.amount, sell.unit, realizedNok, newUnrealized);
    const realized = [realization.realized];
    if (feeRealization) {
      realized.push(feeRealization.realized);
    }

    return {
      realized: realized,
      unrealized: [
        ...realization.newUnrealized,
        createUnrealizedEntry(entry, buy, feeRealization ? null : fee, realizedNok),
      ],
    };
  }

  //Salg av krypto til fiat
  else if (sell && buy && fiatUnits.includes(buy.unit)) {
    if (fee && fee.unit != buy.unit) {
      throw new Error('Fee is not the same unit as buy');
    }

    const realizedNok =
      findConversion(time, buy.unit, valuta) * (buy.amount - (fee?.unit == buy.unit ? fee.amount : 0));

    const realization = createRealizationEntry(time, sell.amount, sell.unit, realizedNok, unrealized);
    return {
      realized: [realization.realized],
      unrealized: realization.newUnrealized,
    };
  }

  // Flytting av crypto, realisering av fees
  else if (deposit && withdraw && fee) {
    if (!fee.unitPriceUsd) {
      throw new Error(`Warning: missing fee price for: ${fee.unit} ${time.toISOString()}`);
    }

    const realizedUsd = fee.unitPriceUsd * fee.amount;
    const realizedNok = findConversion(time, 'usd', valuta) * realizedUsd;

    const realization = createRealizationEntry(time, fee.amount, fee.unit, realizedNok, unrealized);
    return {
      realized: [realization.realized],
      unrealized: realization.newUnrealized,
    };
  }

  // Inntekt farming, fork split osv.
  else if (deposit && !buy && !sell && !withdraw) {
    if (!deposit.unitPriceUsd) {
      throw new Error(`Warning: missing deposit price for: ${deposit.unit} ${time.toISOString()}`);
    }

    const valueUsd = deposit.unitPriceUsd * deposit.amount;
    const valueNok = findConversion(time, 'usd', valuta) * valueUsd;

    return {
      unrealized: [...unrealized, createUnrealizedEntry(entry, deposit, null, valueNok)],
      deposit: { time, unit: deposit.unit, valueNok: valueNok },
    };
  }

  // Binance convert to BNB
  else if (convert && buy) {
    let sumRealizedNok = 0;
    const realizations: Realized[] = [];
    let newUnrealized = unrealized;

    convert.forEach(v => {
      if (!v.unitPriceUsd) {
        throw new Error(`Warning: missing convert price for: ${v.unit} ${time}`);
      }

      const realizedUsd = v.unitPriceUsd * v.amount;
      const realizedNok = findConversion(time, 'usd', valuta) * realizedUsd;
      sumRealizedNok += realizedNok;

      // fiat should just be added to sum
      if (!fiatUnits.includes(v.unit)) {
        const realization = createRealizationEntry(time, v.amount, v.unit, realizedNok, newUnrealized);
        realizations.push(realization.realized);
        newUnrealized = realization.newUnrealized;
      }
    });

    return {
      unrealized: [...newUnrealized, createUnrealizedEntry(entry, buy, null, sumRealizedNok)],
      realized: realizations,
    };
  }

  return {};
}

function createRealizationEntry(
  time: Date,
  amount: number,
  unit: string,
  realizedNok: number,
  unrealized: Unrealized[],
): { realized: Realized; newUnrealized: Unrealized[] } {
  let remainingToRealize = amount;
  let buyValue = 0;
  let newUnrealized = unrealized;

  while (remainingToRealize > 0.000000001) {
    const toRealize = newUnrealized.find(v => v.unit === unit);
    if (!toRealize) {
      throw new Error('Could not find matching unit');
    }

    const willRealize = Math.min(toRealize.amount, remainingToRealize);
    const valueToRealize = (toRealize.buyValueInNok / toRealize.amount) * willRealize;

    toRealize.buyValueInNok = toRealize.buyValueInNok - valueToRealize;
    toRealize.amount = toRealize.amount - willRealize;
    toRealize.isPartiallyRealized = true;

    if (toRealize.amount === 0) {
      newUnrealized = newUnrealized.filter(v => v !== toRealize);
    }

    buyValue += valueToRealize;
    remainingToRealize -= willRealize;
  }

  return {
    realized: {
      time: time,
      unit: unit,
      amount: amount,
      sellValueNok: realizedNok,
      buyValueNok: buyValue,
      resultNok: realizedNok - buyValue,
    },
    newUnrealized,
  };
}

function createUnrealizedEntry(
  entry: Entry,
  entryDetails: EntryDetails,
  fee: EntryDetails | null,
  valueInNok: number,
): Unrealized {
  if (fee && fee.unit != entryDetails.unit) {
    throw new Error(`Fee ${fee.unit} is not the same unit as buy ${entryDetails.unit}. ${entry.time.toISOString()}`);
  }

  return {
    time: entry.time,
    unit: entryDetails.unit,
    amount: entryDetails.amount - (fee ? fee.amount : 0),
    buyValueInNok: valueInNok,
    unitPrice: valueInNok / entryDetails.amount,
    isPartiallyRealized: false,
  };
}

function getSellValueInNok(time: Date, sell: EntryDetails, valuta: Valuta[]): number {
  if (sell.unit === 'nok') {
    return sell.amount;
  }

  return findConversion(time, sell.unit, valuta) * sell.amount;
}

function findConversion(time: Date, unit: string, valuta: Valuta[]) {
  const unitValues = valuta.filter(v => v.unit === unit);
  return unitValues.find((_v, i, s) => s[i + 1].date > time)?.value as number;
}
