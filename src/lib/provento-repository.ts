import { supabase, tableName } from './supabase';
import type { Provento, ProventoInsert } from '../types';

type ProventoRow = {
  id: number;
  ticker: string;
  tipo: string;
  valor: number | string;
  data_com: string | null;
  data_pagamento: string;
  created_at?: string;
};

const fetchPageSize = 1000;

function mapRow(row: ProventoRow): Provento {
  return {
    id: Number(row.id),
    ticker: row.ticker,
    tipo: row.tipo,
    valor: Number(row.valor),
    dataCom: row.data_com,
    dataPagamento: row.data_pagamento,
    createdAt: row.created_at,
  };
}

function mapInsert(provento: ProventoInsert) {
  return {
    ticker: provento.ticker,
    tipo: provento.tipo,
    valor: provento.valor,
    data_com: provento.dataCom,
    data_pagamento: provento.dataPagamento,
  };
}

function mapInsertWithCreatedAt(provento: ProventoInsert) {
  return {
    ...mapInsert(provento),
    created_at: new Date().toISOString(),
  };
}

export async function getProventos(): Promise<Provento[]> {
  const rows: ProventoRow[] = [];

  for (let start = 0; ; start += fetchPageSize) {
    const { data, error } = await supabase
      .from(tableName)
      .select('id, ticker, tipo, valor, data_com, data_pagamento, created_at')
      .order('data_pagamento', { ascending: false })
      .range(start, start + fetchPageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const page = (data ?? []) as ProventoRow[];
    rows.push(...page);

    if (page.length < fetchPageSize) {
      break;
    }
  }

  return rows.map(mapRow);
}

export async function createProvento(provento: ProventoInsert): Promise<Provento> {
  const { data, error } = await supabase
    .from(tableName)
    .insert(mapInsertWithCreatedAt(provento))
    .select('id, ticker, tipo, valor, data_com, data_pagamento, created_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapRow(data as ProventoRow);
}

export async function updateProvento(provento: Provento): Promise<void> {
  const { error } = await supabase
    .from(tableName)
    .update(mapInsert(provento))
    .eq('id', provento.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteProvento(id: number): Promise<void> {
  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function bulkInsertProventos(proventos: ProventoInsert[]): Promise<number> {
  const { error, count } = await supabase
    .from(tableName)
    .insert(proventos.map(mapInsertWithCreatedAt), { count: 'exact' });

  if (error) {
    throw new Error(error.message);
  }

  return count ?? proventos.length;
}
