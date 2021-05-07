import { readFileSync } from 'fs';

export function getValuta(file: string): Valuta[] {
  var rows = readFileSync(file, { encoding: 'utf8' }).split('\r\n');
  return rows.map(row => {
    const rowData = row.split(';');
    return {
      date: new Date(rowData[14]),
      unit: rowData[2]?.toLowerCase(),
      value: Number(rowData[15]?.replace(',', '.')),
    };
  });
}

export function getData(file: string, yearCutoff: Date): Entry[] {
  const result = readFileSync(file, { encoding: 'utf8' });
  const rows = result.split('\r\n');
  const rawData = rows.map<ParsedData>(row => {
    const rowData = row.split(',');
    return {
      time: rowData[0],
      account: rowData[1],
      type: rowData[2].toLowerCase(),
      unit: rowData[3].toLowerCase(),
      amount: Math.abs(Number(rowData[4])),
      unitPriceUsd: rowData[5] ? Number(rowData[5]) : null,
      remark: rowData[6],
    };
  });

  const uniqueTimes = rawData.map(v => v.time).filter((v, i, s) => s.indexOf(v) === i);

  return uniqueTimes
    .map<Entry>(v => {
      const entries = rawData.filter(raw => raw.time === v);
      return {
        time: new Date(v),
        buy: getEntry(entries, 'buy'),
        sell: getEntry(entries, 'sell'),
        deposit: getEntry(entries, 'deposit'),
        withdraw: getEntry(entries, 'withdraw'),
        fee: getEntry(entries, 'fee'),
        convert: getConvert(entries),
      };
    })
    .filter(v => v.time < yearCutoff);
}

function getEntry(entries: ParsedData[], type: string): EntryDetails | null {
  const filteredEntries = entries.filter(e => e.type == type);
  const firstEntry = filteredEntries[0];
  if (!filteredEntries.every(v => v.unit === firstEntry.unit)) {
    console.log('WARNING: Entry with mixed units');
  }

  return filteredEntries.length > 0
    ? {
        amount: filteredEntries.reduce((pV, cV) => pV + cV.amount, 0),
        unit: firstEntry.unit,
        unitPriceUsd: firstEntry.unitPriceUsd,
      }
    : null;
}

function getConvert(entries: ParsedData[]) {
  const filteredEntries = entries.filter(e => e.type == 'convert');
  return filteredEntries.length > 0
    ? filteredEntries.map(v => ({
        amount: v.amount,
        unit: v.unit,
        unitPriceUsd: v.unitPriceUsd,
      }))
    : null;
}
