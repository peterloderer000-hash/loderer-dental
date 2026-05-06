export function pluralizeAppointments(n: number): string {
  if (n === 1) return 'termín';
  if (n >= 2 && n <= 4) return 'termíny';
  return 'termínov';
}

export function pluralizePatients(n: number): string {
  if (n === 1) return 'pacient';
  if (n >= 2 && n <= 4) return 'pacienti';
  return 'pacientov';
}

export function pluralizeMessages(n: number): string {
  if (n === 1) return 'správa';
  if (n >= 2 && n <= 4) return 'správy';
  return 'správ';
}

export function pluralize(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}
