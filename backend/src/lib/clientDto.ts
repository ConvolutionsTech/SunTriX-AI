/**
 * Shapes returned by public, token-authenticated client endpoints.
 *
 * A capability link must only reveal what the client page shows — never admin
 * notes, other tokens, Stripe identifiers, signer IP/user agent or audit logs.
 */
type Doc = Record<string, any>;

const plain = (doc: Doc | null | undefined): Doc => (doc && typeof doc.toObject === "function" ? doc.toObject() : { ...(doc ?? {}) });
const pick = (src: Doc | null | undefined, keys: string[]): Doc =>
  Object.fromEntries(keys.filter((k) => src?.[k] !== undefined).map((k) => [k, src![k]]));

const PROPOSAL_FIELDS = [
  "_id", "proposalToken", "title", "status", "expiresAt", "acceptedAt", "contractToken", "clientName", "clientEmail",
  "clientNote", "totalAmount", "currency", "milestones", "timeline", "introduction", "scopeItems", "terms",
  "executiveSummary", "scopeOfWork", "deliverables", "pricingBreakdown", "revisionsPolicy", "clientResponsibilities",
  "supportAndWarranty", "paymentTerms", "nextSteps", "createdAt",
];

export function toClientProposal(doc: Doc): Doc {
  const p = plain(doc);
  return { ...pick(p, PROPOSAL_FIELDS), taskRequestId: pick(p.taskRequestId, ["projectTitle", "service", "selectedPlan"]) };
}

const CONTRACT_FIELDS = [
  "_id", "contractToken", "status", "projectTitle", "clientName", "clientEmail", "fullContractText",
  "expiresAt", "signedAt", "clientSignatureName", "createdAt",
];

export function toClientContract(doc: Doc): Doc {
  return pick(plain(doc), CONTRACT_FIELDS);
}

const INVOICE_FIELDS = [
  "_id", "invoiceToken", "status", "type", "amount", "currency", "description", "clientName", "clientEmail",
  "expiresAt", "paidAt", "receiptUrl", "trackingToken", "createdAt",
];

export function toClientInvoice(doc: Doc, task?: Doc | null): Doc {
  return { ...pick(plain(doc), INVOICE_FIELDS), taskRequestId: pick(task, ["projectTitle", "service"]) };
}

/** Tracker as the client hub sees it: no audit log, no Stripe identifiers. */
export function toClientTracker(doc: Doc): Doc {
  const t = plain(doc);
  delete t.auditLog;
  t.milestones = (t.milestones ?? []).map((m: Doc) => {
    const { stripePaymentIntentId: _pi, invoiceId: _inv, ...rest } = m;
    return rest;
  });
  return t;
}
