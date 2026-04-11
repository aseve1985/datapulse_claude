export interface Sale {
  id: string | number;
  fecha: string;
  monto: number;
  producto: string;
  categoria?: string;
  cliente?: string;
  cantidad?: number;
  [key: string]: any; // Allow for extra fields from API
}

export interface SalesReport {
  data: Sale[];
  summary: {
    totalSales: number;
    totalAmount: number;
    averageTicket: number;
    topProduct: string;
  };
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface ReportFilters {
  startDate: string;
  endDate: string;
  filterSlots: { field: string; values: string[] }[];
  cardConfigs?: { id: number; title: string; type: string; field: string; color: string }[];
  chartConfigs?: { id: string; title: string; type: string; dimension: string; metric: string }[];
  sheetUrl?: string;
}

export interface SavedReport {
  id: string;
  usuario: string;
  nombre: string;
  modulo: string;
  filtros: ReportFilters;
  fecha: string;
}
