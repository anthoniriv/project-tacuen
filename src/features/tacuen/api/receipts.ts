export async function createReceipt(file: File) {
    const fd = new FormData();
    fd.append("file", file);
  
    const res = await fetch("/api/receipts", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error creando receipt");
    return json as { id: string; access_token: string; status?: string; dedup?: boolean };
  }
  
  export async function processReceipt(id: string, accessToken: string, contexto?: string) {
    const res = await fetch(`/api/receipts/${id}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-receipt-token": accessToken },
      body: JSON.stringify({ contexto: contexto ?? "" }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error procesando receipt");
    return json as { status: string };
  }
  
  export async function getReceipt(id: string, accessToken: string) {
    const res = await fetch(`/api/receipts/${id}`, {
      headers: { "x-receipt-token": accessToken },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error obteniendo receipt");
    return json as {
      id: string;
      status: "uploaded" | "processing" | "retrying" | "done" | "needs_review" | "error";
      parsed_json: any | null;
      difference_cents: number | null;
      error_reason: string | null;
    };
  }
  
