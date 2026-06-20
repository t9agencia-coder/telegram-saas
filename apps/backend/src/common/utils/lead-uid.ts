import { v4 as uuidv4 } from 'uuid';

export function generateLeadUid(): string {
  const prefix = 'TG_';
  const suffix = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
  return `${prefix}${suffix}`;
}
