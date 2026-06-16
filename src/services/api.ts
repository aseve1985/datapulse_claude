import { Sale } from "../types";

export async function fetchSalesData(
  fecha_desde: string,
  fecha_hasta: string,
  onProgress?: (count: number) => void
): Promise<{ records: Sale[], fullResponse: any }> {
  console.log(`[S3] Fetching sales data from ${fecha_desde} to ${fecha_hasta}`);

  const url = new URL('/api/sales-s3', window.location.origin);
  url.searchParams.append('fecha_desde', fecha_desde);
  url.searchParams.append('fecha_hasta', fecha_hasta);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'accept': 'application/json' }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.details || errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json();

  const records: Sale[] = (data.records || []).map((r: any) => ({
    id: r.loan_id || r.id || r.ID || r.sale_id || r.uuid || Math.random().toString(36).substring(2, 11),
    ...r
  }));

  records.sort((a, b) => {
    const dateA = new Date(a.fecha_desembolso || a.fecha || 0).getTime();
    const dateB = new Date(b.fecha_desembolso || b.fecha || 0).getTime();
    return dateA - dateB;
  });

  if (onProgress) onProgress(records.length);

  return { records, fullResponse: data };
}

export async function fetchServicesData(
  fecha_desde: string,
  fecha_hasta: string,
  onProgress?: (count: number) => void
): Promise<{ records: any[], fullResponse: any }> {
  console.log(`[Services-S3] Fetching services data from ${fecha_desde} to ${fecha_hasta}`);

  const url = new URL('/api/services-s3', window.location.origin);
  url.searchParams.append('fecha_desde', fecha_desde);
  url.searchParams.append('fecha_hasta', fecha_hasta);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'accept': 'application/json' }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.details || errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json();

  const records = (data.records || []).map((r: any) => ({
    id: r.id || r.service_id || r.uuid || Math.random().toString(36).substring(2, 11),
    ...r
  }));

  records.sort((a: any, b: any) => {
    const dateA = new Date(a.fecha_originacion || a.fecha || 0).getTime();
    const dateB = new Date(b.fecha_originacion || b.fecha || 0).getTime();
    return dateA - dateB;
  });

  if (onProgress) onProgress(records.length);

  return { records, fullResponse: data };
}

export async function fetchCollectionsData(
  fecha_desde: string,
  fecha_hasta: string,
  onProgress?: (count: number) => void
): Promise<{ records: any[], fullResponse: any }> {
  console.log(`[Collections-S3] Fetching collections data from ${fecha_desde} to ${fecha_hasta}`);

  const url = new URL('/api/collections-s3', window.location.origin);
  url.searchParams.append('fecha_desde', fecha_desde);
  url.searchParams.append('fecha_hasta', fecha_hasta);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'accept': 'application/json' }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.details || errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json();

  const records = (data.records || []).map((r: any) => ({
    id: r.id || r.collection_id || r.uuid || Math.random().toString(36).substring(2, 11),
    ...r
  }));

  records.sort((a: any, b: any) => {
    const dateA = new Date(a.fecha_pago || a.fecha || 0).getTime();
    const dateB = new Date(b.fecha_pago || b.fecha || 0).getTime();
    return dateA - dateB;
  });

  if (onProgress) onProgress(records.length);

  return { records, fullResponse: data };
}

export async function fetchMarketingData(
  fecha_desde: string,
  fecha_hasta: string,
  onProgress?: (count: number) => void
): Promise<{ records: any[], fullResponse: any }> {
  console.log(`[Marketing-S3] Fetching marketing data from ${fecha_desde} to ${fecha_hasta}`);

  const url = new URL('/api/marketing-s3', window.location.origin);
  url.searchParams.append('fecha_desde', fecha_desde);
  url.searchParams.append('fecha_hasta', fecha_hasta);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'accept': 'application/json' }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.details || errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json();

  const records = (data.records || []).map((r: any) => ({
    id: r.lead_id || r.id || Math.random().toString(36).substring(2, 11),
    ...r
  }));

  records.sort((a: any, b: any) => {
    const dateA = new Date(a.fecha_lead || 0).getTime();
    const dateB = new Date(b.fecha_lead || 0).getTime();
    return dateA - dateB;
  });

  if (onProgress) onProgress(records.length);

  return { records, fullResponse: data };
}
