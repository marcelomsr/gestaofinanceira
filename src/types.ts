export interface Provento {
  id: number;
  ticker: string;
  tipo: string;
  valor: number;
  dataCom: string | null;
  dataPagamento: string;
  createdAt?: string;
}

export interface ProventoInsert {
  ticker: string;
  tipo: string;
  valor: number;
  dataCom: string | null;
  dataPagamento: string;
}

export type SortColumn = 'ticker' | 'tipo' | 'valor' | 'dataCom' | 'dataPagamento';
export type SortDirection = 'asc' | 'desc';
