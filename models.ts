interface ParsedData {
  time: string;
  account: string;
  type: string;
  unit: string;
  amount: number;
  unitPriceUsd: number | null;
  remark: string;
}

interface Entry {
  time: Date;
  buy: EntryDetails | null;
  sell: EntryDetails | null;
  deposit: EntryDetails | null;
  withdraw: EntryDetails | null;
  fee: EntryDetails | null;
  convert: EntryDetails[] | null;
}

interface EntryDetails {
  amount: number;
  unit: string;
  unitPriceUsd: number | null;
}

interface Valuta {
  date: Date;
  unit: string;
  value: number;
}

interface Realized {
  time: Date;
  unit: string;
  amount: number;
  sellValueNok: number;
  buyValueNok: number;
  resultNok: number;
}

interface Unrealized {
  time: Date;
  unit: string;
  amount: number;
  buyValueInNok: number;
  unitPrice: number;
  isPartiallyRealized: boolean;
}

interface Deposit {
  time: Date;
  unit: string;
  valueNok: number;
}

enum RealizationType {
  First,
  Last,
}
