export interface ReportReceipt { ok?: boolean; id?: string; error?: string; queued?: boolean; storage?: string }
export function receiptText(receipt: ReportReceipt) {
  return receipt.queued || receipt.storage === "server-queue"
    ? `SAVED ON GAME SERVER · ${receipt.id || "QUEUED"} · DATABASE DELIVERY PENDING`
    : `REPORT SENT · ${receipt.id || "THANK YOU"}`;
}
