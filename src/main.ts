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
type ViewMode = 'cadastro' | 'resumo';

type SummaryFilters = {
  year: string;
  month: string;
  selectedTypes: string[];
};

const monthNames = [
  'Janeiro',
  'Fevereiro',
  'Marco',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

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

const getCurrentSummaryFilters = (): SummaryFilters => {
  const now = new Date();

  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, '0'),
    selectedTypes: [],
  };
};

class ProventoApp {
  private root: HTMLElement;
  private userEmail: string | null;
  private proventos: Provento[] = [];
  private formState: FormState = initialFormState();
  private selectedFile: File | null = null;
  private sortColumn: SortColumn = 'dataPagamento';
  private sortDirection: SortDirection = 'desc';
  private currentPage = 1;
  private itemsPerPage = 10;
  private readonly pageSizeOptions = [10, 20, 50, 100, -1];
  private activeView: ViewMode = 'cadastro';
  private summaryFilters: SummaryFilters = getCurrentSummaryFilters();
  private loading = false;

  constructor(root: HTMLElement, userEmail: string | null) {
    this.root = root;
    this.userEmail = userEmail;
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

  private get availableTypes() {
    return [...new Set(this.proventos.map((provento) => provento.tipo).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }),
    );
  }

  private get filteredTypes() {
    return new Set(this.summaryFilters.selectedTypes);
  }

  private get hasTypeFilter() {
    return this.summaryFilters.selectedTypes.length > 0;
  }

  private matchesSelectedTypes(provento: Provento) {
    return !this.hasTypeFilter || this.filteredTypes.has(provento.tipo);
  }

  private get monthlySummary() {
    const totalsByMonth = new Map<string, number>();

    this.proventos
      .filter((provento) => {
        return (
          provento.dataPagamento.slice(0, 4) === this.summaryFilters.year &&
          this.matchesSelectedTypes(provento)
        );
      })
      .forEach((provento) => {
        const month = provento.dataPagamento.slice(5, 7);
        totalsByMonth.set(month, (totalsByMonth.get(month) ?? 0) + provento.valor);
      });

    return [...totalsByMonth.entries()]
      .sort(([monthA], [monthB]) => monthA.localeCompare(monthB))
      .map(([month, total]) => ({ month, total }));
  }

  private get monthlyDetails() {
    return this.proventos
      .filter((provento) => {
        return (
          provento.dataPagamento.slice(0, 4) === this.summaryFilters.year &&
          provento.dataPagamento.slice(5, 7) === this.summaryFilters.month &&
          this.matchesSelectedTypes(provento)
        );
      })
      .sort((a, b) => {
        const tickerComparison = a.ticker.localeCompare(b.ticker, 'pt-BR', {
          sensitivity: 'base',
        });

        if (tickerComparison !== 0) {
          return tickerComparison;
        }

        return a.dataPagamento.localeCompare(b.dataPagamento);
      });
  }

  private get monthlyDetailsTotal() {
    return this.monthlyDetails.reduce((total, provento) => total + provento.valor, 0);
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

  private setView(view: ViewMode) {
    this.activeView = view;
    this.render();
  }

  private setSummaryFilter(field: 'year' | 'month', value: string) {
    this.summaryFilters = {
      ...this.summaryFilters,
      [field]: value,
    };
    this.render();
  }

  private toggleSummaryType(type: string, checked: boolean) {
    const selectedTypes = new Set(this.summaryFilters.selectedTypes);

    if (checked) {
      selectedTypes.add(type);
    } else {
      selectedTypes.delete(type);
    }

    this.summaryFilters = {
      ...this.summaryFilters,
      selectedTypes: [...selectedTypes],
    };
    this.render();
  }

  private clearSummaryTypes() {
    this.summaryFilters = {
      ...this.summaryFilters,
      selectedTypes: [],
    };
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

    const logoutButton = this.root.querySelector<HTMLButtonElement>('#logout');
    logoutButton?.addEventListener('click', () => {
      clearStoredUser();
      window.location.reload();
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        this.setView(button.dataset.view as ViewMode);
      });
    });

    const summaryYearInput = this.root.querySelector<HTMLInputElement>('#summary-year');
    summaryYearInput?.addEventListener('change', (event) => {
      this.setSummaryFilter('year', (event.currentTarget as HTMLInputElement).value);
    });

    const summaryMonthSelect = this.root.querySelector<HTMLSelectElement>('#summary-month');
    summaryMonthSelect?.addEventListener('change', (event) => {
      this.setSummaryFilter('month', (event.currentTarget as HTMLSelectElement).value);
    });

    this.root.querySelectorAll<HTMLInputElement>('[data-summary-type-index]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const type = this.availableTypes[Number(checkbox.dataset.summaryTypeIndex)];
        if (type) {
          this.toggleSummaryType(type, checkbox.checked);
        }
      });
    });

    const clearTypesButton = this.root.querySelector<HTMLButtonElement>('#clear-summary-types');
    clearTypesButton?.addEventListener('click', () => this.clearSummaryTypes());

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

    const monthOptions = monthNames
      .map((monthName, index) => {
        const month = String(index + 1).padStart(2, '0');

        return `
          <option value="${month}" ${month === this.summaryFilters.month ? 'selected' : ''}>
            ${month} - ${monthName}
          </option>
        `;
      })
      .join('');

    const typeFilters = this.availableTypes
      .map(
        (type, index) => `
          <label class="check-option">
            <input
              type="checkbox"
              data-summary-type-index="${index}"
              ${this.filteredTypes.has(type) ? 'checked' : ''}
            />
            <span>${type}</span>
          </label>
        `,
      )
      .join('');

    const monthlySummaryRows = this.monthlySummary
      .map(
        ({ month, total }) => `
          <tr>
            <td>${month} - ${monthNames[Number(month) - 1] ?? month}</td>
            <td>${currencyFormatter.format(total)}</td>
          </tr>
        `,
      )
      .join('');

    const monthlyDetailsRows = this.monthlyDetails
      .map(
        (provento) => `
          <tr>
            <td>${provento.ticker}</td>
            <td>${provento.tipo}</td>
            <td>${currencyFormatter.format(provento.valor)}</td>
            <td>${this.formatDate(provento.dataPagamento)}</td>
          </tr>
        `,
      )
      .join('');

    const cadastroContent = `
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
    `;

    const resumoContent = `
      <div class="grid">
        <section class="panel">
          <h2>Filtros do Resumo</h2>
          <div class="form-grid">
            <div class="field">
              <label for="summary-year">Ano</label>
              <input id="summary-year" type="number" min="1900" max="2100" value="${this.summaryFilters.year}" />
            </div>
            <div class="field">
              <label for="summary-month">Mes</label>
              <select id="summary-month">
                ${monthOptions}
              </select>
            </div>
          </div>
          <div class="type-filter">
            <div class="type-filter-header">
              <strong>Tipos</strong>
              <button class="mini-btn edit" id="clear-summary-types" type="button" ${!this.hasTypeFilter ? 'disabled' : ''}>
                Todos
              </button>
            </div>
            <div class="check-grid">
              ${
                this.availableTypes.length === 0
                  ? '<p class="hint">Nenhum tipo encontrado nos proventos carregados.</p>'
                  : typeFilters
              }
            </div>
          </div>
        </section>

        <section class="panel">
          <h2>Total por Mes em ${this.summaryFilters.year}</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th class="static">Mes</th>
                  <th class="static">Soma dos Valores</th>
                </tr>
              </thead>
              <tbody>
                ${
                  this.monthlySummary.length === 0
                    ? '<tr><td colspan="2" class="empty">Nenhum provento encontrado para estes filtros.</td></tr>'
                    : monthlySummaryRows
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel">
          <h2>Proventos de ${this.summaryFilters.month}/${this.summaryFilters.year}</h2>
          <div class="status compact-status">
            <span class="chip">Registros: ${this.monthlyDetails.length}</span>
            <span class="chip">Total: ${currencyFormatter.format(this.monthlyDetailsTotal)}</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th class="static">Ticker</th>
                  <th class="static">Tipo</th>
                  <th class="static">Valor</th>
                  <th class="static">Data Pagamento</th>
                </tr>
              </thead>
              <tbody>
                ${
                  this.monthlyDetails.length === 0
                    ? '<tr><td colspan="4" class="empty">Nenhum provento encontrado para este mes.</td></tr>'
                    : monthlyDetailsRows
                }
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;

    this.root.innerHTML = `
      <main class="shell">
        <section class="hero">
          <h1>Gerenciamento de Proventos</h1>
          <p>Aplicacao estatica em Vite + TypeScript usando Supabase como banco de dados.</p>
        </section>

        <section class="status">
          <span class="chip">Total de registros: ${this.totalItems}</span>
          <span class="chip">Ordenacao: ${this.sortColumn} ${this.sortDirection}</span>
          <span class="chip">Usuario: ${this.userEmail ?? '-'}</span>
          <span class="chip">${this.loading ? 'Sincronizando dados...' : 'Conectado ao Supabase'}</span>
          <button class="btn btn-secondary" id="logout" type="button" ${this.loading ? 'disabled' : ''}>Sair</button>
        </section>

        <nav class="tabs" aria-label="Navegacao principal">
          <button class="tab ${this.activeView === 'cadastro' ? 'active' : ''}" type="button" data-view="cadastro">
            Cadastro
          </button>
          <button class="tab ${this.activeView === 'resumo' ? 'active' : ''}" type="button" data-view="resumo">
            Resumo
          </button>
        </nav>

        ${this.activeView === 'cadastro' ? cadastroContent : resumoContent}
      </main>
    `;

    this.bindEvents();
  }
}

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Elemento #app nao encontrado.');
}

const rootEl = root;

type GoogleUser = { id: string; email: string; name: string; picture?: string };

const STORAGE_KEY = 'gestaofinanceira_google_user';

function getStoredUser(): GoogleUser | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GoogleUser) : null;
  } catch {
    return null;
  }
}

function setStoredUser(user: GoogleUser) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function clearStoredUser() {
  window.localStorage.removeItem(STORAGE_KEY);
}

function decodeJwtPayload<T>(jwt: string): T | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(payload);
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

async function loadGoogleIdentityScript() {
  if ((window as any).google?.accounts?.id) return;

  return new Promise<void>((resolve, reject) => {
    if (document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
      const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
      existing?.addEventListener('load', () => resolve());
      existing?.addEventListener('error', () => reject(new Error('Falha ao carregar Google Identity Services')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar Google Identity Services'));
    document.head.appendChild(script);
  });
}

async function renderLogin() {
  rootEl.innerHTML = `
    <main class="shell">
      <section class="hero">
        <h1>Entrar</h1>
        <p>Faça login com sua conta do Google para acessar o painel de proventos.</p>
      </section>

      <section class="panel">
        <div class="actions">
          <button id="login-google" class="btn btn-info">Entrar com Google</button>
        </div>
        <p class="hint">
          ⚙️ Coloque seu <code>VITE_GOOGLE_CLIENT_ID</code> no arquivo <code>.env</code>.
        </p>
      </section>
    </main>
  `;

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    await Swal.fire(
      'Erro',
      'A variável VITE_GOOGLE_CLIENT_ID não está configurada. Verifique seu .env.',
      'error',
    );
    return;
  }

  await loadGoogleIdentityScript();

  const callback = (response: any) => {
    const payload = decodeJwtPayload<{ sub: string; email: string; name: string; picture?: string }>(
      response.credential,
    );

    if (!payload?.email) {
      Swal.fire('Erro', 'Não foi possível obter seu e-mail do Google.', 'error');
      return;
    }

    setStoredUser({
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    });

    void initApp();
  };

  (window as any).google.accounts.id.initialize({
    client_id: googleClientId,
    callback,
    ux_mode: 'popup',
  });

  const loginButton = rootEl.querySelector<HTMLButtonElement>('#login-google');
  loginButton?.addEventListener('click', () => {
    const shouldIgnoreConsole = (text: string) => {
      return (
        text.includes('Not signed in with the identity provider') ||
        text.includes('FedCM get() rejects with AbortError') ||
        text.includes('AbortError: signal is aborted')
      );
    };

    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      const message = String(args[0] ?? '');
      if (shouldIgnoreConsole(message)) return;
      originalConsoleError(...args);
    };

    const originalConsoleWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const message = String(args[0] ?? '');
      if (shouldIgnoreConsole(message)) return;
      originalConsoleWarn(...args);
    };

    const restoreConsole = () => {
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
    };

    const handler = (event: PromiseRejectionEvent) => {
      const reason = event.reason as Error | undefined;
      const message = String(reason?.message ?? '');
      if (shouldIgnoreConsole(message)) {
        event.preventDefault();
        event.stopImmediatePropagation();

        Swal.fire({
          title: 'Atenção',
          html: `Você precisa estar logado em sua conta Google para continuar.<br/><br/>` +
            `Abra <a href="https://accounts.google.com/ServiceLogin" target="_blank" rel="noopener">Google</a> e faça login, então tente novamente.`,
          icon: 'info',
        });
      }
    };

    window.addEventListener('unhandledrejection', handler);

    try {
      (window as any).google.accounts.id.prompt();
    } finally {
      window.setTimeout(() => {
        window.removeEventListener('unhandledrejection', handler);
        restoreConsole();
      }, 1500);
    }
  });
}


async function initApp() {
  const user = getStoredUser();

  if (!user) {
    await renderLogin();
    return;
  }

  const app = new ProventoApp(rootEl, user.email ?? null);
  await app.start();
}

void initApp();
