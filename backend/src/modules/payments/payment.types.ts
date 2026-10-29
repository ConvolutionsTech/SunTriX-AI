import { IPayment, PaymentType, PaymentStatus } from "../../models/Payment";

export { IPayment, PaymentType, PaymentStatus };

export interface CreateInvoiceDTO {
  taskRequestId: string;
  /** Defaults to the request's email */
  clientEmail?: string;
  clientName?: string;
  description: string;
  amountCents: number;
  currency?: string;
  expiresInDays?: number;
}
