import { calculateEntry } from './calculator.js';
import { getData, getValuta } from './parser.js';

const yearCutoff = new Date(2021, 0, 1);
const realizedFromCutoff = new Date(2019, 11, 31);
const realizedToCutoff = new Date(2021, 0, 1);

const valuta = getValuta('./valuta.csv');
const groupedData = getData('./data.csv', yearCutoff);

let unrealized: Unrealized[] = [];
const r: Realized[] = [];
const inntekt: Deposit[] = [];

groupedData.forEach(entry => {
  const result = calculateEntry(entry, unrealized, valuta);
  if (result.deposit) {
    inntekt.push(result.deposit);
  }

  if (result.realized) {
    r.push(...result.realized);
  }

  if (result.unrealized) {
    unrealized = result.unrealized;
  }
});

const realizedInCutoff = r.filter(v => v.time > realizedFromCutoff && v.time < realizedToCutoff);

console.log('Realisert oversikt');
const reducedRealized = realizedInCutoff
  .map(v => v.unit)
  .filter((v, i, s) => s.indexOf(v) === i)
  .map(v => ({
    unit: v,
    resultNok: realizedInCutoff.filter(u => u.unit === v).reduce((pv, cv) => pv + cv.resultNok, 0),
  }));
console.log(reducedRealized);
console.log(reducedRealized.reduce((pV, cV) => pV + cV.resultNok, 0));

console.log('Beholdning');
const reducedUnrealized = unrealized
  .map(v => v.unit)
  .filter((v, i, s) => s.indexOf(v) === i)
  .map(v => ({
    unit: v,
    amount: unrealized.filter(u => u.unit === v).reduce((pv, cv) => pv + cv.amount, 0),
  }));
reducedUnrealized.forEach(v => console.log(v));

console.log('Inntekt fra deposits');
const inntektInCutoff = inntekt.filter(v => v.time > realizedFromCutoff && v.time < realizedToCutoff);
const inntektPerUnit = inntektInCutoff
  .map(v => v.unit)
  .filter((v, i, s) => s.indexOf(v) === i)
  .map(v => ({
    unit: v,
    amount: inntektInCutoff.filter(u => u.unit === v).reduce((pv, cv) => pv + cv.valueNok, 0),
  }));
console.log(inntektPerUnit);
