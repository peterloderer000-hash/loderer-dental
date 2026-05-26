import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from '../supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// PDF Export Utility — generates HTML-based PDFs via expo-print
// ═══════════════════════════════════════════════════════════════════════════════

const CSS_BASE = `
  body { font-family: 'Helvetica Neue', sans-serif; color: #2C1F14; margin: 0; padding: 30px; font-size: 12px; line-height: 1.5; }
  h1 { font-size: 20px; color: #2C1F14; margin-bottom: 4px; }
  h2 { font-size: 15px; color: #6B4F3A; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #E8E0D5; padding-bottom: 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #C9A84C; padding-bottom: 12px; }
  .clinic-name { font-size: 18px; font-weight: 700; color: #2C1F14; }
  .clinic-info { font-size: 10px; color: #6B4F3A; }
  .date { font-size: 10px; color: #6B4F3A; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #F5F0EA; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6B4F3A; padding: 8px; text-align: left; border-bottom: 1px solid #E8E0D5; }
  td { padding: 8px; border-bottom: 1px solid #F5F0EA; font-size: 11px; }
  .total-row td { font-weight: 700; border-top: 2px solid #C9A84C; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 700; }
  .badge-success { background: #D5F5E3; color: #1E8449; }
  .badge-warning { background: #FEF9E7; color: #7D6608; }
  .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #E8E0D5; font-size: 9px; color: #999; text-align: center; }
`;

type ClinicInfo = { name: string; address: string; ico: string; dic: string };

async function getClinicInfo(doctorId: string): Promise<ClinicInfo> {
  const { data } = await supabase
    .from('profiles')
    .select('clinic_name, clinic_address, clinic_ico, clinic_dic')
    .eq('id', doctorId)
    .maybeSingle();
  return {
    name: data?.clinic_name ?? 'Dentálna klinika',
    address: data?.clinic_address ?? '',
    ico: data?.clinic_ico ?? '',
    dic: data?.clinic_dic ?? '',
  };
}

function headerHtml(clinic: ClinicInfo, title: string, dateStr: string): string {
  return `
    <div class="header">
      <div>
        <div class="clinic-name">${clinic.name}</div>
        <div class="clinic-info">${clinic.address}${clinic.ico ? ` · IČO: ${clinic.ico}` : ''}${clinic.dic ? ` · DIČ: ${clinic.dic}` : ''}</div>
      </div>
      <div class="date">${title}<br/>${dateStr}</div>
    </div>
  `;
}

// ─── Invoice PDF ─────────────────────────────────────────────────────────────

export async function generateInvoicePdf(appointmentId: string): Promise<void> {
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, appointment_date, notes, custom_duration_minutes, patient:profiles!appointments_patient_id_fkey(full_name, phone_number, insurance_number), doctor_id, service:services(name, price_min, duration_minutes)')
    .eq('id', appointmentId)
    .single();

  if (!appt) throw new Error('Termín nenájdený');

  const clinic = await getClinicInfo(appt.doctor_id);
  const patient = appt.patient as any;
  const service = appt.service as any;
  const date = new Date(appt.appointment_date);
  const dateStr = date.toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
  const price = service?.price_min ?? 0;

  // Check if payment exists
  const { data: payment } = await supabase
    .from('payments')
    .select('amount_cents, method, paid_at')
    .eq('appointment_id', appointmentId)
    .maybeSingle();

  const html = `
    <html><head><style>${CSS_BASE}</style></head><body>
      ${headerHtml(clinic, 'FAKTÚRA', dateStr)}
      <h2>Údaje pacienta</h2>
      <table>
        <tr><td style="width:120px;font-weight:600">Meno</td><td>${patient?.full_name ?? '—'}</td></tr>
        <tr><td style="font-weight:600">Telefón</td><td>${patient?.phone_number ?? '—'}</td></tr>
        ${patient?.insurance_number ? `<tr><td style="font-weight:600">Číslo poistenca</td><td>${patient.insurance_number}</td></tr>` : ''}
      </table>
      <h2>Ošetrenie</h2>
      <table>
        <tr><th>Služba</th><th>Trvanie</th><th style="text-align:right">Cena</th></tr>
        <tr>
          <td>${service?.name ?? 'Ošetrenie'}</td>
          <td>${appt.custom_duration_minutes ?? service?.duration_minutes ?? 30} min</td>
          <td style="text-align:right;font-weight:700">${price.toFixed(2)} €</td>
        </tr>
        <tr class="total-row">
          <td colspan="2">Celkom</td>
          <td style="text-align:right">${price.toFixed(2)} €</td>
        </tr>
      </table>
      ${payment ? `
        <h2>Platba</h2>
        <p>Spôsob: <span class="badge badge-success">${payment.method === 'cash' ? 'Hotovosť' : payment.method === 'card' ? 'Karta' : 'Prevod'}</span></p>
        <p>Zaplatené: ${payment.paid_at ? new Date(payment.paid_at).toLocaleDateString('sk-SK') : '—'}</p>
        <p>Suma: ${(payment.amount_cents / 100).toFixed(2)} €</p>
      ` : '<p style="color:#E74C3C;font-weight:600">⚠ Nezaplatené</p>'}
      ${appt.notes ? `<h2>Poznámky</h2><p>${appt.notes}</p>` : ''}
      <div class="footer">Generované: ${new Date().toLocaleDateString('sk-SK')} · ${clinic.name}</div>
    </body></html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Faktúra' });
}

// ─── Monthly Report PDF ──────────────────────────────────────────────────────

export async function generateMonthlyReportPdf(doctorId: string, year: number, month: number): Promise<void> {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  const monthLabel = start.toLocaleDateString('sk-SK', { month: 'long', year: 'numeric' });

  const [clinic, apptRes, payRes] = await Promise.all([
    getClinicInfo(doctorId),
    supabase
      .from('appointments')
      .select('id, appointment_date, status, patient:profiles!appointments_patient_id_fkey(full_name), service:services(name, price_min)')
      .eq('doctor_id', doctorId)
      .gte('appointment_date', start.toISOString())
      .lte('appointment_date', end.toISOString())
      .order('appointment_date'),
    supabase
      .from('payments')
      .select('amount_cents, method')
      .eq('status', 'paid')
      .gte('paid_at', start.toISOString())
      .lte('paid_at', end.toISOString()),
  ]);

  const appts = apptRes.data ?? [];
  const pays = payRes.data ?? [];
  const completed = appts.filter(a => a.status === 'completed').length;
  const cancelled = appts.filter(a => a.status === 'cancelled').length;
  const totalRevenue = pays.reduce((s, p) => s + (p.amount_cents ?? 0), 0);
  const cash = pays.filter(p => p.method === 'cash').reduce((s, p) => s + (p.amount_cents ?? 0), 0);
  const card = pays.filter(p => p.method === 'card').reduce((s, p) => s + (p.amount_cents ?? 0), 0);
  const transfer = pays.filter(p => p.method === 'transfer').reduce((s, p) => s + (p.amount_cents ?? 0), 0);

  const apptRows = appts.slice(0, 100).map(a => {
    const d = new Date(a.appointment_date);
    const statusBadge = a.status === 'completed' ? 'badge-success' : 'badge-warning';
    const statusLabel = a.status === 'completed' ? 'Dokončené' : a.status === 'cancelled' ? 'Zrušené' : a.status;
    return `<tr>
      <td>${d.toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit' })}</td>
      <td>${d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}</td>
      <td>${(a.patient as any)?.full_name ?? '—'}</td>
      <td>${(a.service as any)?.name ?? '—'}</td>
      <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
      <td style="text-align:right">${((a.service as any)?.price_min ?? 0).toFixed(2)} €</td>
    </tr>`;
  }).join('');

  const html = `
    <html><head><style>${CSS_BASE}
      .kpi-grid { display: flex; gap: 12px; margin-bottom: 16px; }
      .kpi-box { flex: 1; background: #F5F0EA; border-radius: 8px; padding: 12px; text-align: center; }
      .kpi-val { font-size: 20px; font-weight: 800; color: #2C1F14; }
      .kpi-label { font-size: 9px; color: #6B4F3A; text-transform: uppercase; letter-spacing: 0.5px; }
    </style></head><body>
      ${headerHtml(clinic, 'MESAČNÝ REPORT', monthLabel)}
      
      <div class="kpi-grid">
        <div class="kpi-box"><div class="kpi-val">${(totalRevenue / 100).toFixed(0)} €</div><div class="kpi-label">Tržby</div></div>
        <div class="kpi-box"><div class="kpi-val">${completed}</div><div class="kpi-label">Dokončených</div></div>
        <div class="kpi-box"><div class="kpi-val">${cancelled}</div><div class="kpi-label">Zrušených</div></div>
        <div class="kpi-box"><div class="kpi-val">${appts.length}</div><div class="kpi-label">Celkom</div></div>
      </div>

      <h2>Rozpad platieb</h2>
      <table>
        <tr><th>Spôsob</th><th style="text-align:right">Suma</th></tr>
        <tr><td>Hotovosť</td><td style="text-align:right">${(cash / 100).toFixed(2)} €</td></tr>
        <tr><td>Karta</td><td style="text-align:right">${(card / 100).toFixed(2)} €</td></tr>
        <tr><td>Prevod</td><td style="text-align:right">${(transfer / 100).toFixed(2)} €</td></tr>
        <tr class="total-row"><td>Celkom</td><td style="text-align:right">${(totalRevenue / 100).toFixed(2)} €</td></tr>
      </table>

      <h2>Zoznam termínov</h2>
      <table>
        <tr><th>Dátum</th><th>Čas</th><th>Pacient</th><th>Služba</th><th>Stav</th><th style="text-align:right">Cena</th></tr>
        ${apptRows}
      </table>
      
      <div class="footer">Generované: ${new Date().toLocaleDateString('sk-SK')} · ${clinic.name} · Celkom ${appts.length} termínov</div>
    </body></html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Report ${monthLabel}` });
}

// ─── Treatment Plan PDF ──────────────────────────────────────────────────────

export async function generateTreatmentPlanPdf(planId: string): Promise<void> {
  const { data: plan } = await supabase
    .from('treatment_plans')
    .select('id, title, notes, status, patient:profiles!treatment_plans_patient_id_fkey(full_name), doctor_id, created_at')
    .eq('id', planId)
    .single();

  if (!plan) throw new Error('Liečebný plán nenájdený');

  const [clinic, { data: items }] = await Promise.all([
    getClinicInfo(plan.doctor_id),
    supabase
      .from('treatment_plan_items')
      .select('title, description, estimated_cost, tooth_number, status, sort_order')
      .eq('plan_id', planId)
      .order('sort_order'),
  ]);

  const planItems = items ?? [];
  const totalCost = planItems.reduce((s, i) => s + (i.estimated_cost ?? 0), 0);
  const dateStr = new Date(plan.created_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });

  const itemRows = planItems.map((item, idx) => {
    const statusBadge = item.status === 'completed' ? 'badge-success' : 'badge-warning';
    const statusLabel = item.status === 'completed' ? 'Hotové' : item.status === 'in_progress' ? 'Prebieha' : 'Plánované';
    return `<tr>
      <td>${idx + 1}</td>
      <td>${item.tooth_number ?? '—'}</td>
      <td><strong>${item.title}</strong>${item.description ? `<br/><span style="color:#6B4F3A;font-size:10px">${item.description}</span>` : ''}</td>
      <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
      <td style="text-align:right">${item.estimated_cost ? `${item.estimated_cost.toFixed(2)} €` : '—'}</td>
    </tr>`;
  }).join('');

  const html = `
    <html><head><style>${CSS_BASE}</style></head><body>
      ${headerHtml(clinic, 'LIEČEBNÝ PLÁN', dateStr)}
      <h1>${plan.title}</h1>
      <p>Pacient: <strong>${(plan.patient as any)?.full_name ?? '—'}</strong></p>
      ${plan.notes ? `<p style="color:#6B4F3A;font-style:italic">${plan.notes}</p>` : ''}
      
      <h2>Položky plánu</h2>
      <table>
        <tr><th>#</th><th>Zub</th><th>Popis</th><th>Stav</th><th style="text-align:right">Odhad ceny</th></tr>
        ${itemRows}
        <tr class="total-row">
          <td colspan="4">Celkový odhad</td>
          <td style="text-align:right">${totalCost.toFixed(2)} €</td>
        </tr>
      </table>
      
      <div class="footer">Generované: ${new Date().toLocaleDateString('sk-SK')} · ${clinic.name}</div>
    </body></html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Liečebný plán - ${plan.title}` });
}
