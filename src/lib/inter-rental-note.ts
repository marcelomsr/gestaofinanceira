import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { ProventoInsert } from '../types';

type TextContentItem = {
  str?: string;
  transform?: number[];
};

export type InterRentalImportRow = ProventoInsert & {
  contrato: string;
  numeroNota: string;
};

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const document = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(buildPageText(content.items as TextContentItem[]));
  }

  return pages.join('\n');
}

function buildPageText(items: TextContentItem[]) {
  const positionedItems = items
    .map((item) => ({
      text: item.str ?? '',
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
    }))
    .filter((item) => item.text.trim());

  positionedItems.sort((a, b) => {
    const yDifference = b.y - a.y;

    if (Math.abs(yDifference) > 2) {
      return yDifference;
    }

    return a.x - b.x;
  });

  const lines: { y: number; items: typeof positionedItems }[] = [];

  positionedItems.forEach((item) => {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2);

    if (line) {
      line.items.push(item);
      return;
    }

    lines.push({ y: item.y, items: [item] });
  });

  return lines
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(' '),
    )
    .join('\n');
}

export function parseInterRentalNoteText(text: string): InterRentalImportRow[] {
  const normalizedText = normalizeText(text);
  const header = normalizedText.match(
    /Nr\.\s*nota\s+Folha\s+Data\s+(\d+)\s+\d+\s+(\d{2}\/\d{2}\/\d{4})/i,
  );

  if (!header) {
    throw new Error('Nao foi possivel identificar numero e data da nota de aluguel.');
  }

  const numeroNota = header[1];
  const dataPagamento = toIsoDate(header[2]);
  const movementText = normalizedText.split(/Resumo Financeiro/i)[0];
  const blocks = movementText.split(/Tipo do Contrato:/i).slice(1);

  return blocks
    .map((block) => mapOperationBlock(block, numeroNota, dataPagamento))
    .filter((row): row is InterRentalImportRow => row !== null);
}

function mapOperationBlock(
  block: string,
  numeroNota: string,
  dataPagamento: string,
): InterRentalImportRow | null {
  const ticker = block.match(/Papel:\s*([A-Z0-9]+)/i)?.[1]?.toUpperCase();
  const contrato = block.match(/Contrato:\s*([0-9-]+)/i)?.[1];
  const liquidMatch = block.match(
    /L[ií]quido\s+para:\s*\d{2}\/\d{2}\/\d{4}\s+(-?R\$\s*[\d.]+,\d{2})/i,
  );

  if (!ticker || !contrato || !liquidMatch) {
    return null;
  }

  const valor = parseBrazilianCurrency(liquidMatch[1]);

  if (!Number.isFinite(valor) || valor === 0) {
    return null;
  }

  return {
    ticker,
    tipo: 'Aluguel',
    valor,
    dataCom: null,
    dataPagamento,
    origem: 'Banco Inter PDF',
    referenciaExterna: buildReference(numeroNota, contrato, ticker, dataPagamento, valor),
    contrato,
    numeroNota,
  };
}

function normalizeText(text: string) {
  return text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
}

function parseBrazilianCurrency(rawValue: string) {
  const normalized = rawValue
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  return Number(normalized);
}

function toIsoDate(date: string) {
  const [day, month, year] = date.split('/');
  return `${year}-${month}-${day}`;
}

function buildReference(
  numeroNota: string,
  contrato: string,
  ticker: string,
  dataPagamento: string,
  valor: number,
) {
  return ['inter-aluguel', numeroNota, contrato, ticker, dataPagamento, valor.toFixed(2)].join(':');
}
