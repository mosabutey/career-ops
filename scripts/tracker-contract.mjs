#!/usr/bin/env node

export const CANONICAL_STATUS_IDS = [
  'evaluated',
  'applied',
  'responded',
  'interview',
  'offer',
  'rejected',
  'discarded',
  'skip',
];

export const STATUS_LABELS = {
  evaluated: 'Evaluated',
  applied: 'Applied',
  responded: 'Responded',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  discarded: 'Discarded',
  skip: 'SKIP',
};

export const CANONICAL_STATUS_LABELS = CANONICAL_STATUS_IDS.map(id => STATUS_LABELS[id]);

const STATUS_ALIASES = {
  evaluated: 'evaluated',
  evaluada: 'evaluated',
  conditional: 'evaluated',
  condicional: 'evaluated',
  hold: 'evaluated',
  'on hold': 'evaluated',
  review: 'evaluated',
  evaluar: 'evaluated',
  verificar: 'evaluated',

  applied: 'applied',
  aplicado: 'applied',
  aplicada: 'applied',
  enviada: 'applied',
  sent: 'applied',
  submitted: 'applied',

  responded: 'responded',
  respondido: 'responded',

  interview: 'interview',
  entrevista: 'interview',

  offer: 'offer',
  oferta: 'offer',

  rejected: 'rejected',
  rechazado: 'rejected',
  rechazada: 'rejected',
  declined: 'rejected',

  discarded: 'discarded',
  descartado: 'discarded',
  descartada: 'discarded',
  cerrada: 'discarded',
  cancelada: 'discarded',
  closed: 'discarded',
  cancelled: 'discarded',
  canceled: 'discarded',

  skip: 'skip',
  'no apply': 'skip',
  'no aplicar': 'skip',
  no_aplicar: 'skip',
  monitor: 'skip',
  'geo blocker': 'skip',
};

export function stripStatusDecorations(raw = '') {
  return String(raw)
    .replace(/\*\*/g, '')
    .trim()
    .replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '')
    .trim();
}

function normalizeStatusKey(raw = '') {
  return stripStatusDecorations(raw)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeStatusId(raw = '') {
  const key = normalizeStatusKey(raw);

  if (!key || key === '-' || key === '—' || key === 'n/a') {
    return null;
  }

  if (/^(duplicate|duplicado|dup|repost)\b/i.test(key)) {
    return 'discarded';
  }

  return STATUS_ALIASES[key] ?? null;
}

export function normalizeStatusLabel(raw = '') {
  const id = normalizeStatusId(raw);
  return id ? STATUS_LABELS[id] : null;
}

export function looksLikeStatus(raw = '') {
  return normalizeStatusId(raw) !== null;
}

export function looksLikeScore(raw = '') {
  const value = String(raw).replace(/\*\*/g, '').trim();
  return /^\d+(\.\d+)?\/5$/.test(value) || value === 'N/A' || value === 'DUP';
}
