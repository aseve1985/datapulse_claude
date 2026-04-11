import { Sale } from "../types";

export async function fetchSalesData(
  fecha_desde: string, 
  fecha_hasta: string, 
  onProgress?: (count: number) => void
): Promise<{ records: Sale[], fullResponse: any }> {
  let allNormalizedRecords: Sale[] = [];
  let lastFullResponse: any = null;
  let page = 1;
  let hasMore = true;
  const MAX_PAGES = 500; // Increased to 500 pages (5000 records)
  const seenIds = new Set<string | number>();

  console.log(`Starting auto-pagination for ${fecha_desde} to ${fecha_hasta}`);

  while (hasMore && page <= MAX_PAGES) {
    const url = new URL('/api/sales-proxy', window.location.origin);
    url.searchParams.append('fecha_desde', fecha_desde);
    url.searchParams.append('fecha_hasta', fecha_hasta);
    url.searchParams.append('page', page.toString());
    url.searchParams.append('rows', '100'); 

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'accept': 'application/json' }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.details || errorData.error || `HTTP ${response.status}`;
      
      if (page === 1) {
        throw new Error(`Error al obtener datos: ${errorMsg}`);
      } else {
        console.error(`Error on page ${page}: ${errorMsg}`);
        break;
      }
    }

    const data = await response.json();
    lastFullResponse = data;

    let records = [];
    if (Array.isArray(data)) {
      records = data;
    } else if (data && typeof data === 'object') {
      if (Array.isArray(data.data)) records = data.data;
      else if (data.data && Array.isArray(data.data.ventas)) records = data.data.ventas;
      else if (data.data && Array.isArray(data.data.reporte)) records = data.data.reporte;
      else if (Array.isArray(data.ventas)) records = data.ventas;
      else if (Array.isArray(data.reporte)) records = data.reporte;
      else if (Array.isArray(data.records)) records = data.records;
      else if (Array.isArray(data.result)) records = data.result;
      else if (Array.isArray(data.results)) records = data.results;
      else if (data.id || data.fecha) records = [data];
    }

    if (records.length === 0) {
      hasMore = false;
      break;
    }

    // Check for duplicates
    const firstId = records[0].loan_id || records[0].id;
    if (seenIds.has(firstId)) {
      console.log("Detected duplicate data at page", page, ". Stopping pagination.");
      hasMore = false;
      break;
    }
    records.forEach((r: any) => seenIds.add(r.loan_id || r.id));

    const normalized = records.map((r: any) => {
      // We keep the original record as is, only ensuring an ID exists if missing
      return {
        id: r.loan_id || r.id || r.ID || r.sale_id || r.uuid || Math.random().toString(36).substr(2, 9),
        ...r
      };
    });

    allNormalizedRecords = [...allNormalizedRecords, ...normalized];
    if (onProgress) onProgress(allNormalizedRecords.length);
    
    if (records.length < 10) {
      hasMore = false;
    } else {
      page++;
    }
  }

  // Sort by date chronologically
  allNormalizedRecords.sort((a, b) => {
    const dateA = new Date(a.fecha).getTime();
    const dateB = new Date(b.fecha).getTime();
    return dateA - dateB;
  });

  return { records: allNormalizedRecords, fullResponse: lastFullResponse };
}
