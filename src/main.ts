import './styles.css';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import {
  bulkInsertProventos,
  createProvento,
  deleteProvento,
  getProventos,
  updateProvento,
} from './lib/provento-repository';
import type { Provento, ProventoInsert, SortColumn, SortDirection } from './types';

type FormState = ProventoInsert & { id: number };

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const initialFormState = (): FormState => ({
  id: 0,
  ticker: '',
  tipo: '',
  valor: 0,
  dataCom: null,
  dataPagamento: '',
});

class ProventoApp {
  private root: HTMLElement;
  private proventos: Provento[] = [];
  private formState: FormState = initialFormState();
  private selectedFile: File | null = null;
  private sortColumn: SortColumn = 'dataPagamento';
  private sortDirection: SortDirection = 'desc';
  private currentPage = 1;
  private itemsPerPage = 10;
  private readonly pageSizeOptions = [10, 20, 50, 100, -1];
  private loading = false;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async start() {
    this.render();
    await this.loadProventos();
  }

  private async loadProventos() {
    this.setLoading(true);

    try {
      this.proventos = await getProventos();
      this.adjustCurrentPage();
      this.render();
    } catch (error) {
      await this.showError('Nao foi possivel carregar os proventos.', error);
    } finally {
      this.setLoading(false);
    }
  }

  private setLoading(value: boolean) {
    this.loading = value;
    this.render();
  }

  private resetForm() {
    this.formState = initialFormState();
    this.render();
    const tickerInput = this.root.querySelector<HTMLInputElement>('#ticker');
    tickerInput?.focus();
  }

  private get isEditing() {
    return this.formState.id > 0;
  }

  private get sortedProventos() {
    const items = [...this.proventos];

    items.sort((a, b) => {
      const valueA = a[this.sortColumn];
      const valueB = b[this.sortColumn];

      let comparison = 0;

      if (this.sortColumn === 'valor') {
        comparison = Number(valueA) - Number(valueB);
      } else if (this.sortColumn === 'dataCom' || this.sortColumn === 'dataPagamento') {
        const timeA = valueA ? new Date(valueA).getTime() : Number.NEGATIVE_INFINITY;
        const timeB = valueB ? new Date(valueB).getTime() : Number.NEGATIVE_INFINITY;
        comparison = timeA - timeB;
      } else {
        comparison = String(valueA ?? '').localeCompare(String(valueB ?? ''), 'pt-BR', {
          sensitivity: 'base',
        });
      }

      return this.sortDirection === 'asc' ? comparison : comparison * -1;
    });

    return items;
  }

  private get totalItems() {
    return this.proventos.length;
  }

  private get totalPages() {
    if (this.itemsPerPage === -1) {
      return 1;
    }

    return Math.max(1, Math.ceil(this.totalItems / this.itemsPerPage));
  }

  private get paginatedProventos() {
    if (this.itemsPerPage === -1) {
      return this.sortedProventos;
    }

    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    return this.sortedProventos.slice(startIndex, startIndex + this.itemsPerPage);
  }

  private get pageNumbers() {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let page = startPage; page <= endPage; page += 1) {
      pages.push(page);
    }

    return pages;
  }

  private adjustCurrentPage() {
    this.currentPage = Math.min(this.currentPage, this.totalPages);
    this.currentPage = Math.max(1, this.currentPage);
  }

  private setSort(column: SortColumn) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.currentPage = 1;
    this.render();
  }

  private setField(field: keyof FormState, value: string | number | null) {
    this.formState = {
      ...this.formState,
      [field]: value,
    };
  }

  private async submitForm() {
    const payload: ProventoInsert = {
      ticker: this.formState.ticker.trim().toUpperCase(),
      tipo: this.formState.tipo.trim(),
      valor: Number(this.formState.valor),
      dataCom: this.formState.dataCom || null,
      dataPagamento: this.formState.dataPagamento,
    };

    if (!payload.ticker || !payload.tipo || !payload.dataPagamento || Number.isNaN(payload.valor)) {
      await Swal.fire('Atencao', 'Preencha ticker, tipo, valor e data de pagamento.', 'warning');
      return;
    }

    this.setLoading(true);

    try {
      if (this.isEditing) {
        await updateProvento({ id: this.formState.id, ...payload });
        await Swal.fire('Sucesso', 'Provento atualizado com sucesso.', 'success');
      } else {
        await createProvento(payload);
        await Swal.fire('Sucesso', 'Provento adicionado com sucesso.', 'success');
      }

      this.resetForm();
      await this.loadProventos();
    } catch (error) {
      await this.showError('Nao foi possivel salvar o provento.', error);
    } finally {
      this.setLoading(false);
    }
  }

  private editProvento(id: number) {
    const provento = this.proventos.find((item) => item.id === id);

    if (!provento) {
      return;
    }

    this.formState = {
      id: provento.id,
      ticker: provento.ticker,
      tipo: provento.tipo,
      valor: provento.valor,
      dataCom: provento.dataCom,
      dataPagamento: provento.dataPagamento,
    };

    this.render();
    const tickerInput = this.root.querySelector<HTMLInputElement>('#ticker');
    tickerInput?.focus();
  }

  private async removeProvento(id: number) {
    const provento = this.proventos.find((item) => item.id === id);

    if (!provento) {
      return;
    }

    const confirmation = await Swal.fire({
      title: 'Confirma a exclusao?',
      html: `Voce deseja excluir o provento <b>${provento.ticker}</b> no valor de <b>${currencyFormatter.format(provento.valor)}</b>?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sim, excluir',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
    });

    if (!confirmation.isConfirmed) {
      return;
    }

    this.setLoading(true);

    try {
      await deleteProvento(id);
      await Swal.fire('Excluido', `O provento ${provento.ticker} foi removido.`, 'success');
      if (this.formState.id === id) {
        this.resetForm();
      }
      await this.loadProventos();
    } catch (error) {
      await this.showError('Nao foi possivel excluir o provento.', error);
    } finally {
      this.setLoading(false);
    }
  }

  private async importFile() {
    if (!this.selectedFile) {
      await Swal.fire('Atencao', 'Selecione um arquivo .xlsx antes de importar.', 'warning');
      return;
    }

    this.setLoading(true);

    try {
      const rows = await this.readWorkbook(this.selectedFile);

      if (rows.length === 0) {
        await Swal.fire('Atencao', 'Nenhum provento valido foi encontrado no arquivo.', 'warning');
        return;
      }

      const count = await bulkInsertProventos(rows);
      this.selectedFile = null;
      await Swal.fire('Sucesso', `${count} proventos importados com sucesso.`, 'success');
      await this.loadProventos();
    } catch (error) {
      await this.showError('Nao foi possivel importar a planilha.', error);
    } finally {
      this.setLoading(false);
      this.render();
    }
  }

  private async readWorkbook(file: File): Promise<ProventoInsert[]> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    if (!sheet) {
      return [];
    }

    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });

    return rows
      .slice(1)
      .map((row, index) => this.mapSheetRow(row, index + 2))
      .filter((row): row is ProventoInsert => row !== null);
  }

  private mapSheetRow(row: (string | number | null)[], rowNumber: number): ProventoInsert | null {
    const tickerRaw = String(row[0] ?? '').trim();
    if (!tickerRaw) {
      return null;
    }

    const tipo = String(row[2] ?? '').trim();
    const dataPagamentoText = String(row[1] ?? '').trim();

    const ticker = tickerRaw.includes(' - ') ? tickerRaw.split(' - ')[0].trim() : tickerRaw;
    const valor = this.parseSpreadsheetAmount(row[6]);

    if (!tipo || Number.isNaN(valor)) {
      throw new Error(`Linha ${rowNumber}: tipo ou valor invalidos.`);
    }

    const dataPagamento = this.normalizeSpreadsheetDate(dataPagamentoText, row[1]);

    if (!dataPagamento) {
      throw new Error(`Linha ${rowNumber}: data de pagamento invalida.`);
    }

    return {
      ticker: ticker.toUpperCase(),
      tipo,
      valor,
      dataCom: null,
      dataPagamento,
    };
  }

  private parseSpreadsheetAmount(rawValue: string | number | null): number {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      return rawValue;
    }

    const text = String(rawValue ?? '')
      .trim()
      .replace(/R\$/gi, '')
      .replace(/\s/g, '');

    if (!text) {
      return Number.NaN;
    }

    const hasComma = text.includes(',');
    const hasDot = text.includes('.');

    if (hasComma && hasDot) {
      return Number(text.replace(/\./g, '').replace(',', '.'));
    }

    if (hasComma) {
      return Number(text.replace(',', '.'));
    }

    return Number(text);
  }

  private normalizeSpreadsheetDate(rawText: string, rawValue: string | number | null): string | null {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      const parsed = XLSX.SSF.parse_date_code(rawValue);
      if (!parsed) {
        return null;
      }

      const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
      return date.toISOString().slice(0, 10);
    }

    const text = rawText.trim();
    if (!text) {
      return null;
    }

    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return text;
    }

    const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const [, day, month, year] = slashMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString().slice(0, 10);
  }

  private async showError(message: string, error: unknown) {
    const detail = error instanceof Error ? error.message : 'Erro desconhecido.';
    await Swal.fire('Erro', `${message} ${detail}`, 'error');
  }

  private bindEvents() {
    const form = this.root.querySelector<HTMLFormElement>('#provento-form');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submitForm();
    });

    const cancelButton = this.root.querySelector<HTMLButtonElement>('#cancel-edit');
    cancelButton?.addEventListener('click', () => this.resetForm());

    const tickerInput = this.root.querySelector<HTMLInputElement>('#ticker');
    tickerInput?.addEventListener('input', (event) => {
      const value = (event.currentTarget as HTMLInputElement).value.toUpperCase();
      this.setField('ticker', value);
      (event.currentTarget as HTMLInputElement).value = value;
    });

    const tipoInput = this.root.querySelector<HTMLInputElement>('#tipo');
    tipoInput?.addEventListener('input', (event) => {
      this.setField('tipo', (event.currentTarget as HTMLInputElement).value);
    });

    const valorInput = this.root.querySelector<HTMLInputElement>('#valor');
    valorInput?.addEventListener('input', (event) => {
      const value = Number((event.currentTarget as HTMLInputElement).value);
      this.setField('valor', Number.isNaN(value) ? 0 : value);
    });

    const dataComInput = this.root.querySelector<HTMLInputElement>('#data-com');
    dataComInput?.addEventListener('input', (event) => {
      this.setField('dataCom', (event.currentTarget as HTMLInputElement).value || null);
    });

    const dataPagamentoInput = this.root.querySelector<HTMLInputElement>('#data-pagamento');
    dataPagamentoInput?.addEventListener('input', (event) => {
      this.setField('dataPagamento', (event.currentTarget as HTMLInputElement).value);
    });

    const fileInput = this.root.querySelector<HTMLInputElement>('#file-upload');
    fileInput?.addEventListener('change', (event) => {
      const files = (event.currentTarget as HTMLInputElement).files;
      this.selectedFile = files && files.length > 0 ? files[0] : null;
      this.render();
    });

    const importButton = this.root.querySelector<HTMLButtonElement>('#import-button');
    importButton?.addEventListener('click', () => {
      void this.importFile();
    });

    const pageSizeSelect = this.root.querySelector<HTMLSelectElement>('#page-size');
    pageSizeSelect?.addEventListener('change', (event) => {
      this.itemsPerPage = Number((event.currentTarget as HTMLSelectElement).value);
      this.currentPage = 1;
      this.render();
    });

    this.root.querySelectorAll<HTMLTableCellElement>('[data-sort]').forEach((cell) => {
      cell.addEventListener('click', () => {
        this.setSort(cell.dataset.sort as SortColumn);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-edit-id]').forEach((button) => {
      button.addEventListener('click', () => {
        this.editProvento(Number(button.dataset.editId));
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-delete-id]').forEach((button) => {
      button.addEventListener('click', () => {
        void this.removeProvento(Number(button.dataset.deleteId));
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((button) => {
      button.addEventListener('click', () => {
        this.currentPage = Number(button.dataset.page);
        this.adjustCurrentPage();
        this.render();
      });
    });
  }

  private getSortIcon(column: SortColumn) {
    if (this.sortColumn !== column) {
      return '';
    }

    return this.sortDirection === 'asc' ? ' ▲' : ' ▼';
  }

  private formatDate(value: string | null) {
    if (!value) {
      return '-';
    }

    return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
  }

  private render() {
    const tableRows = this.paginatedProventos
      .map(
        (provento) => `
          <tr>
            <td>${provento.ticker}</td>
            <td>${provento.tipo}</td>
            <td>${currencyFormatter.format(provento.valor)}</td>
            <td>${this.formatDate(provento.dataCom)}</td>
            <td>${this.formatDate(provento.dataPagamento)}</td>
            <td class="actions-cell">
              <button class="mini-btn edit" data-edit-id="${provento.id}">Editar</button>
              <button class="mini-btn delete" data-delete-id="${provento.id}">Excluir</button>
            </td>
          </tr>
        `,
      )
      .join('');

    const paginationButtons = this.pageNumbers
      .map(
        (page) => `
          <button class="btn ${page === this.currentPage ? 'btn-info' : 'btn-secondary'}" data-page="${page}">
            ${page}
          </button>
        `,
      )
      .join('');

    const pageSizeOptions = this.pageSizeOptions
      .map(
        (option) => `
          <option value="${option}" ${option === this.itemsPerPage ? 'selected' : ''}>
            ${option === -1 ? 'Todos' : option}
          </option>
        `,
      )
      .join('');

    this.root.innerHTML = `
      <main class="shell">
        <section class="hero">
          <h1>Gerenciamento de Proventos</h1>
          <p>Aplicacao estatica em Vite + TypeScript usando Supabase como banco de dados.</p>
        </section>

        <section class="status">
          <span class="chip">Total de registros: ${this.totalItems}</span>
          <span class="chip">Ordenacao: ${this.sortColumn} ${this.sortDirection}</span>
          <span class="chip">${this.loading ? 'Sincronizando dados...' : 'Conectado ao Supabase'}</span>
        </section>

        <div class="grid">
          <section class="panel">
            <h2>${this.isEditing ? 'Editar Provento' : 'Adicionar Novo Provento'}</h2>
            <form id="provento-form">
              <div class="form-grid">
                <div class="field">
                  <label for="ticker">Ticker</label>
                  <input id="ticker" name="ticker" type="text" maxlength="50" value="${this.formState.ticker}" required />
                </div>
                <div class="field">
                  <label for="tipo">Tipo</label>
                  <input id="tipo" name="tipo" type="text" value="${this.formState.tipo}" required />
                </div>
                <div class="field">
                  <label for="valor">Valor</label>
                  <input id="valor" name="valor" type="number" step="0.01" min="0" value="${this.formState.valor || ''}" required />
                </div>
                <div class="field">
                  <label for="data-com">Data COM</label>
                  <input id="data-com" name="dataCom" type="date" value="${this.formState.dataCom ?? ''}" />
                </div>
                <div class="field">
                  <label for="data-pagamento">Data Pagamento</label>
                  <input id="data-pagamento" name="dataPagamento" type="date" value="${this.formState.dataPagamento}" required />
                </div>
              </div>
              <div class="actions">
                <button class="btn btn-primary" type="submit" ${this.loading ? 'disabled' : ''}>
                  ${this.isEditing ? 'Atualizar' : 'Adicionar'}
                </button>
                ${
                  this.isEditing
                    ? `<button class="btn btn-secondary" id="cancel-edit" type="button" ${this.loading ? 'disabled' : ''}>Cancelar edicao</button>`
                    : ''
                }
              </div>
            </form>
          </section>

          <section class="panel">
            <h2>Importar Proventos via XLSX</h2>
            <div class="form-grid">
              <div class="field">
                <label for="file-upload">Planilha</label>
                <input id="file-upload" type="file" accept=".xlsx" ${this.loading ? 'disabled' : ''} />
              </div>
            </div>
            <div class="actions">
              <button class="btn btn-info" id="import-button" type="button" ${!this.selectedFile || this.loading ? 'disabled' : ''}>
                Importar arquivo
              </button>
            </div>
            <p class="hint">
              Espera a mesma estrutura usada hoje no backend: ticker na coluna A, data de pagamento na B, tipo na C e valor na G.
            </p>
            <p class="hint">
              Arquivo selecionado: ${this.selectedFile ? this.selectedFile.name : 'nenhum arquivo'}
            </p>
          </section>

          <section class="panel">
            <h2>Lista de Proventos</h2>
            <div class="toolbar">
              <label for="page-size">
                Registros por pagina
                <select id="page-size">
                  ${pageSizeOptions}
                </select>
              </label>
              <div>Pagina ${this.currentPage} de ${this.totalPages}</div>
            </div>

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th data-sort="ticker">Ticker${this.getSortIcon('ticker')}</th>
                    <th data-sort="tipo">Tipo${this.getSortIcon('tipo')}</th>
                    <th data-sort="valor">Valor${this.getSortIcon('valor')}</th>
                    <th data-sort="dataCom">Data COM${this.getSortIcon('dataCom')}</th>
                    <th data-sort="dataPagamento">Data Pagamento${this.getSortIcon('dataPagamento')}</th>
                    <th class="static">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    this.totalItems === 0
                      ? `<tr><td colspan="6" class="empty">Nenhum provento encontrado.</td></tr>`
                      : tableRows
                  }
                </tbody>
              </table>
            </div>

            <div class="pagination">
              <div class="pagination-buttons">
                <button class="btn btn-secondary" data-page="1" ${this.currentPage === 1 ? 'disabled' : ''}>Primeira</button>
                <button class="btn btn-secondary" data-page="${Math.max(1, this.currentPage - 1)}" ${this.currentPage === 1 ? 'disabled' : ''}>Anterior</button>
                ${paginationButtons}
                <button class="btn btn-secondary" data-page="${Math.min(this.totalPages, this.currentPage + 1)}" ${this.currentPage === this.totalPages ? 'disabled' : ''}>Proxima</button>
                <button class="btn btn-secondary" data-page="${this.totalPages}" ${this.currentPage === this.totalPages ? 'disabled' : ''}>Ultima</button>
              </div>
              <div>Total exibido: ${this.totalItems} registros</div>
            </div>
          </section>
        </div>
      </main>
    `;

    this.bindEvents();
  }
}

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Elemento #app nao encontrado.');
}

void new ProventoApp(root).start();
