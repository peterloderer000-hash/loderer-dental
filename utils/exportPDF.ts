/**
 * Loderer Dental App — PDF export utilita
 * Používa expo-print + expo-sharing
 *
 * Inštalácia (raz, v priečinku /app):
 *   npx expo install expo-print expo-sharing
 */
import * as Print   from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';
import type { Appointment } from '../hooks/useAppointments';

// ─── Farby ───────────────────────────────────────────────────────────────────
const C = {
  esp:   '#111827',
  wal:   '#6B4F35',
  sand:  '#BBACA0',
  cream: '#E8D5B0',
  bg:    '#FAF7F2',
};

// ─── Typy ────────────────────────────────────────────────────────────────────
export type ClinicInfo = {
  clinic_name:    string | null;
  clinic_address: string | null;
  clinic_ico:     string | null;
  clinic_dic:     string | null;
};

export type InvoiceAppointment = {
  id: string;
  appointment_date: string;
  status: string;
  notes: string | null;
  doctor_notes: string | null;
  service: { name: string; emoji: string | null; price_min: number | null; price_max: number | null; duration_minutes: number } | null;
  custom_duration_minutes: number | null;
};

export type MonthlyAppt = {
  id: string;
  appointment_date: string;
  patient_name: string | null;
  service: { name: string; emoji: string | null; price_min: number | null } | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('sk-SK', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}
function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}
function fmtNow() {
  return new Date().toLocaleDateString('sk-SK', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const SK_MONTHS_FULL = [
  'Január','Február','Marec','Apríl','Máj','Jún',
  'Júl','August','September','Október','November','December',
];

const STATUS_SK: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Čaká na schválenie', color: '#7D6608', bg: '#FEF9E7' },
  scheduled: { label: 'Naplánovaný',        color: '#1A5276', bg: '#EBF5FB' },
  completed: { label: 'Dokončený',           color: '#1E8449', bg: '#EAFAF1' },
  cancelled: { label: 'Zrušený',             color: '#922B21', bg: '#FDEDEC' },
};

// ─── HTML šablóna — hlavička ──────────────────────────────────────────────────
function htmlHead(
  title: string,
  doctorDisplay = 'MDDr. Loderer',
  clinicInfo?: ClinicInfo | null,
) {
  const nameLine  = clinicInfo?.clinic_name || doctorDisplay;
  const subParts  = ['Zubná ambulancia'];
  if (clinicInfo?.clinic_address) subParts.push(clinicInfo.clinic_address);
  const subLine   = subParts.join(' · ');
  const taxLine   = [
    clinicInfo?.clinic_ico ? `IČO: ${clinicInfo.clinic_ico}` : '',
    clinicInfo?.clinic_dic ? `DIČ: ${clinicInfo.clinic_dic}` : '',
  ].filter(Boolean).join(' · ');

  return `
<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
           background: ${C.bg}; color: ${C.esp}; font-size: 13px; }
    .page  { max-width: 720px; margin: 0 auto; padding: 40px 32px; }
    /* Header */
    .clinic-header { display: flex; align-items: center; gap: 20px;
                     background: ${C.esp}; color: #fff; border-radius: 14px;
                     padding: 24px 28px; margin-bottom: 28px; }
    .clinic-logo   { font-size: 38px; }
    .clinic-name   { font-size: 20px; font-weight: 800; color: #fff; }
    .clinic-sub    { font-size: 11px; color: ${C.cream}; letter-spacing: 1px;
                     text-transform: uppercase; margin-top: 3px; }
    .clinic-tax    { font-size: 9px; color: ${C.sand}; margin-top: 2px; }
    .clinic-right  { margin-left: auto; text-align: right; }
    .clinic-date   { font-size: 11px; color: ${C.sand}; }
    /* Section title */
    .section-title { font-size: 10px; font-weight: 700; letter-spacing: 2px;
                     text-transform: uppercase; color: ${C.wal}; margin-bottom: 10px;
                     border-left: 3px solid ${C.sand}; padding-left: 10px; }
    /* Stats row */
    .stats-row { display: flex; gap: 12px; margin-bottom: 28px; flex-wrap: wrap; }
    .stat-box  { flex: 1; min-width: 100px; background: #fff; border-radius: 12px;
                 padding: 14px 16px; border: 1px solid ${C.cream}; text-align: center; }
    .stat-num  { font-size: 26px; font-weight: 800; color: ${C.esp}; }
    .stat-lbl  { font-size: 10px; color: ${C.wal}; text-transform: uppercase;
                 letter-spacing: 1px; margin-top: 2px; }
    /* Table */
    table  { width: 100%; border-collapse: collapse; background: #fff;
             border-radius: 12px; overflow: hidden; border: 1px solid ${C.cream};
             margin-bottom: 28px; }
    thead  { background: ${C.esp}; color: #fff; }
    thead th { padding: 11px 14px; font-size: 10px; letter-spacing: 1px;
               text-transform: uppercase; text-align: left; font-weight: 700; }
    tbody tr { border-bottom: 1px solid #f0ebe3; }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:nth-child(even) { background: #faf8f5; }
    tbody td { padding: 11px 14px; font-size: 12px; vertical-align: middle; }
    .badge { display: inline-block; padding: 3px 9px; border-radius: 20px;
             font-size: 10px; font-weight: 700; }
    .rating-stars { color: #F39C12; letter-spacing: 1px; }
    .urgent-badge { display: inline-block; background: #FDEDEC; color: #C0392B;
                    font-size: 10px; font-weight: 800; padding: 2px 6px;
                    border-radius: 4px; margin-left: 5px; }
    /* Footer */
    .footer { text-align: center; font-size: 10px; color: ${C.wal};
              margin-top: 32px; padding-top: 16px; border-top: 1px solid ${C.cream}; }
  </style>
</head>
<body>
<div class="page">
  <div class="clinic-header">
    <div class="clinic-logo">🦷</div>
    <div>
      <div class="clinic-name">${nameLine}</div>
      <div class="clinic-sub">${subLine}</div>
      ${taxLine ? `<div class="clinic-tax">${taxLine}</div>` : ''}
    </div>
    <div class="clinic-right">
      <div class="clinic-date">Exportované: ${fmtNow()}</div>
    </div>
  </div>`;
}

function htmlFoot() {
  return `
  <div class="footer">
    Tento dokument bol vygenerovaný aplikáciou Loderer Dental App • ${fmtNow()}
  </div>
</div>
</body>
</html>`;
}

// ─── Funkcia: export histórie pacienta ───────────────────────────────────────
export async function exportPatientHistory(
  patientName: string,
  appointments: Appointment[],
): Promise<void> {
  try {
    const sorted = [...appointments].sort(
      (a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime()
    );

    const total     = sorted.length;
    const completed = sorted.filter((a) => a.status === 'completed').length;
    const upcoming  = sorted.filter((a) => a.status === 'scheduled').length;
    const pending   = sorted.filter((a) => a.status === 'pending').length;
    const cancelled = sorted.filter((a) => a.status === 'cancelled').length;

    const rows = sorted.map((a) => {
      const st  = STATUS_SK[a.status] ?? STATUS_SK.cancelled;
      const stars = a.patient_rating
        ? '★'.repeat(a.patient_rating) + '☆'.repeat(5 - a.patient_rating)
        : '—';
      const urgentTag = a.is_urgent
        ? '<span class="urgent-badge">🚨 URGENTNÉ</span>' : '';
      return `
        <tr>
          <td><strong>${fmtDate(a.appointment_date)}</strong><br/>
              <span style="color:#888;font-size:11px;">${fmtTime(a.appointment_date)}</span>
          </td>
          <td>${a.service?.emoji ?? '🦷'} ${a.service?.name ?? '—'}${urgentTag}</td>
          <td><span class="badge" style="background:${st.bg};color:${st.color};">${st.label}</span></td>
          <td><span class="rating-stars">${stars}</span></td>
          <td style="color:#888;font-size:11px;">${a.notes ?? '—'}</td>
        </tr>`;
    }).join('');

    const html = `
${htmlHead('História termínov — ' + patientName)}
  <div class="section-title">Pacient: ${patientName}</div>
  <div class="stats-row" style="margin-top:10px;">
    <div class="stat-box">
      <div class="stat-num">${total}</div>
      <div class="stat-lbl">Celkom</div>
    </div>
    <div class="stat-box">
      <div class="stat-num" style="color:#1E8449;">${completed}</div>
      <div class="stat-lbl">Dokončené</div>
    </div>
    <div class="stat-box">
      <div class="stat-num" style="color:#1A5276;">${upcoming}</div>
      <div class="stat-lbl">Plánované</div>
    </div>
    <div class="stat-box">
      <div class="stat-num" style="color:#D4AC0D;">${pending}</div>
      <div class="stat-lbl">Čakajúce</div>
    </div>
    <div class="stat-box">
      <div class="stat-num" style="color:#922B21;">${cancelled}</div>
      <div class="stat-lbl">Zrušené</div>
    </div>
  </div>

  <div class="section-title">Všetky termíny</div>
  <table>
    <thead>
      <tr>
        <th>Dátum a čas</th>
        <th>Služba</th>
        <th>Status</th>
        <th>Hodnotenie</th>
        <th>Poznámka</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:20px;">Žiadne termíny</td></tr>'}
    </tbody>
  </table>
${htmlFoot()}`;

    await _printOrShare(html, `terminy_${patientName.replace(/\s+/g, '_')}.pdf`);
  } catch (e: any) {
    Alert.alert('Chyba exportu', e?.message ?? 'Nepodarilo sa vygenerovať PDF.');
  }
}

// ─── Funkcia: export denného plánu doktora ───────────────────────────────────
export async function exportDailySchedule(
  doctorName: string,
  date: Date,
  appointments: Appointment[],
): Promise<void> {
  try {
    const dateLabel = date.toLocaleDateString('sk-SK', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    const dayAppts = appointments
      .filter((a) => {
        const d = new Date(a.appointment_date);
        return (
          d.getFullYear() === date.getFullYear() &&
          d.getMonth()    === date.getMonth()    &&
          d.getDate()     === date.getDate()     &&
          a.status !== 'cancelled'
        );
      })
      .sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime());

    const rows = dayAppts.map((a, i) => {
      const st = STATUS_SK[a.status] ?? STATUS_SK.cancelled;
      const urgentTag = a.is_urgent
        ? '<span class="urgent-badge">🚨 URGENTNÉ</span>' : '';
      return `
        <tr>
          <td style="font-weight:700;color:${C.esp};font-size:14px;">${i + 1}.</td>
          <td>
            <strong>${fmtTime(a.appointment_date)}</strong>
            ${a.service?.duration_minutes
              ? `<br/><span style="color:#888;font-size:10px;">${a.service.duration_minutes} min</span>`
              : ''}
          </td>
          <td>
            <strong>${a.patient?.full_name ?? 'Neznámy pacient'}</strong>
            ${a.patient?.phone_number
              ? `<br/><span style="color:#888;font-size:11px;">📞 ${a.patient.phone_number}</span>`
              : ''}
          </td>
          <td>${a.service?.emoji ?? '🦷'} ${a.service?.name ?? '—'}${urgentTag}</td>
          <td><span class="badge" style="background:${st.bg};color:${st.color};">${st.label}</span></td>
          <td style="color:#888;font-size:11px;">${a.notes ?? '—'}</td>
        </tr>`;
    }).join('');

    const html = `
${htmlHead('Denný plán — ' + dateLabel, doctorName)}
  <div style="margin-bottom:24px;">
    <div style="font-size:22px;font-weight:800;color:${C.esp};margin-bottom:4px;">${dateLabel}</div>
    <div style="font-size:13px;color:${C.wal};">👨‍⚕️ ${doctorName} &nbsp;·&nbsp; ${dayAppts.length} termín${dayAppts.length === 1 ? '' : dayAppts.length < 5 ? 'y' : 'ov'}</div>
  </div>

  <div class="section-title">Harmonogram dna</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Čas</th>
        <th>Pacient</th>
        <th>Ošetrenie</th>
        <th>Status</th>
        <th>Poznámka</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:20px;">Žiadne termíny na dnes</td></tr>'}
    </tbody>
  </table>
${htmlFoot()}`;

    const dateStr = date.toISOString().slice(0, 10);
    await _printOrShare(html, `plan_${dateStr}.pdf`);
  } catch (e: any) {
    Alert.alert('Chyba exportu', e?.message ?? 'Nepodarilo sa vygenerovať PDF.');
  }
}

// ─── Funkcia: export faktúry za termín ───────────────────────────────────────
export async function exportInvoice(
  doctorName: string,
  patientName: string,
  appointment: InvoiceAppointment,
  clinicInfo?: ClinicInfo | null,
): Promise<void> {
  try {
    const d           = new Date(appointment.appointment_date);
    const dateLabel   = d.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeLabel   = d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
    const invoiceNum  = `INV-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${appointment.id.slice(0, 6).toUpperCase()}`;

    const svc         = appointment.service;
    const priceMin    = svc?.price_min ?? 0;
    const priceMax    = svc?.price_max ?? null;
    const duration    = appointment.custom_duration_minutes ?? svc?.duration_minutes ?? 0;
    const priceStr    = priceMax && priceMax > priceMin
      ? `${priceMin.toLocaleString('sk-SK')} – ${priceMax.toLocaleString('sk-SK')} €`
      : priceMin > 0
        ? `${priceMin.toLocaleString('sk-SK')} €`
        : 'Dohodou';

    const supplierName    = clinicInfo?.clinic_name    || doctorName;
    const supplierAddress = clinicInfo?.clinic_address || '';
    const supplierIco     = clinicInfo?.clinic_ico     || '';
    const supplierDic     = clinicInfo?.clinic_dic     || '';

    const supplierBlock = `
      <div style="font-size:16px;font-weight:800;color:${C.esp};margin-bottom:4px;">👨‍⚕️ ${supplierName}</div>
      ${supplierAddress ? `<div style="font-size:12px;color:${C.wal};">${supplierAddress}</div>` : ''}
      ${supplierIco ? `<div style="font-size:11px;color:${C.wal};">IČO: ${supplierIco}</div>` : ''}
      ${supplierDic ? `<div style="font-size:11px;color:${C.wal};">DIČ: ${supplierDic}</div>` : ''}
    `;

    const html = `
${htmlHead('Faktúra — ' + invoiceNum, doctorName, clinicInfo)}

  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;gap:20px;flex-wrap:wrap;">
    <div>
      <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.wal};margin-bottom:6px;">FAKTÚRA</div>
      <div style="font-size:28px;font-weight:800;color:${C.esp};margin-bottom:4px;">${invoiceNum}</div>
      <div style="font-size:12px;color:${C.wal};">Dátum: <strong>${dateLabel}</strong></div>
      <div style="font-size:12px;color:${C.wal};">Čas: <strong>${timeLabel}</strong></div>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;">
      <div style="background:#fff;border-radius:12px;padding:16px 20px;border:1.5px solid ${C.cream};">
        <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.wal};margin-bottom:8px;">POSKYTOVATEĽ</div>
        ${supplierBlock}
      </div>
      <div style="background:#fff;border-radius:12px;padding:16px 20px;border:1.5px solid ${C.cream};">
        <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.wal};margin-bottom:8px;">PACIENT</div>
        <div style="font-size:16px;font-weight:800;color:${C.esp};">${patientName}</div>
      </div>
    </div>
  </div>

  <div class="section-title">Poskytnuté ošetrenie</div>
  <table style="margin-bottom:24px;">
    <thead>
      <tr>
        <th>Ošetrenie</th>
        <th>Trvanie</th>
        <th style="text-align:right;">Cena</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <strong style="font-size:14px;">${svc?.emoji ?? '🦷'} ${svc?.name ?? 'Stomatologické ošetrenie'}</strong>
          ${appointment.doctor_notes ? `<br/><span style="color:#888;font-size:11px;">📝 ${appointment.doctor_notes}</span>` : ''}
        </td>
        <td style="color:${C.wal};">${duration > 0 ? `${duration} min` : '—'}</td>
        <td style="text-align:right;font-weight:800;font-size:15px;color:${C.esp};">${priceStr}</td>
      </tr>
    </tbody>
  </table>

  <div style="background:${C.esp};color:#fff;border-radius:12px;padding:20px 24px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.sand};margin-bottom:4px;">CELKOVÁ SUMA</div>
      <div style="font-size:32px;font-weight:800;color:#fff;">${priceStr}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;color:${C.sand};">Lekár</div>
      <div style="font-size:14px;font-weight:700;color:#fff;">👨‍⚕️ ${doctorName}</div>
    </div>
  </div>

  <div class="section-title" style="margin-bottom:20px;">Podpis a pečiatka ambulancie</div>
  <div style="display:flex;gap:40px;margin-bottom:40px;">
    <div style="flex:1;border-top:1.5px solid ${C.cream};padding-top:8px;">
      <div style="font-size:10px;color:${C.wal};">Podpis lekára</div>
    </div>
    <div style="flex:1;border-top:1.5px solid ${C.cream};padding-top:8px;">
      <div style="font-size:10px;color:${C.wal};">Pečiatka</div>
    </div>
  </div>

  <div style="background:#EAFAF1;border-radius:10px;padding:12px 16px;border:1px solid #A9DFBF;">
    <div style="font-size:11px;color:#1E8449;">* Ceny sú orientačné. Presná suma závisí od rozsahu ošetrenia a použitých materiálov.</div>
  </div>

${htmlFoot()}`;

    await _printOrShare(html, `faktura_${invoiceNum}.pdf`);
  } catch (e: any) {
    Alert.alert('Chyba exportu', e?.message ?? 'Nepodarilo sa vygenerovať faktúru.');
  }
}

// ─── Funkcia: mesačný export všetkých faktúr ─────────────────────────────────
export async function exportMonthlyInvoices(
  doctorName: string,
  clinicInfo: ClinicInfo | null,
  month: number,   // 0-indexed (0 = január)
  year: number,
  appointments: MonthlyAppt[],
): Promise<void> {
  try {
    const monthLabel = `${SK_MONTHS_FULL[month]} ${year}`;
    const totalRevenue = appointments.reduce((sum, a) => sum + (a.service?.price_min ?? 0), 0);

    const rows = appointments
      .sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())
      .map((a, i) => {
        const d        = new Date(a.appointment_date);
        const dateStr  = d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' });
        const timeStr  = d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
        const price    = a.service?.price_min ?? 0;
        const priceStr = price > 0 ? `${price.toLocaleString('sk-SK')} €` : 'Dohodou';
        const invNum   = `INV-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${a.id.slice(0,6).toUpperCase()}`;
        return `
          <tr>
            <td style="font-weight:700;color:${C.esp};">${i + 1}.</td>
            <td>
              <div style="font-size:9px;color:#888;">${invNum}</div>
              <strong>${dateStr}</strong>
              <span style="color:#888;font-size:11px;"> o ${timeStr}</span>
            </td>
            <td><strong>${a.patient_name ?? 'Pacient'}</strong></td>
            <td>${a.service?.emoji ?? '🦷'} ${a.service?.name ?? 'Ošetrenie'}</td>
            <td style="text-align:right;font-weight:800;color:${C.esp};font-size:13px;">${priceStr}</td>
          </tr>`;
      }).join('');

    const revenueStr = totalRevenue > 0
      ? `${totalRevenue.toLocaleString('sk-SK')} €`
      : '—';

    const supplierName    = clinicInfo?.clinic_name    || doctorName;
    const supplierAddress = clinicInfo?.clinic_address || '';
    const supplierIco     = clinicInfo?.clinic_ico     || '';
    const supplierDic     = clinicInfo?.clinic_dic     || '';

    const html = `
${htmlHead('Mesačné fakturácie — ' + monthLabel, doctorName, clinicInfo)}

  <div style="margin-bottom:24px;">
    <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.wal};margin-bottom:6px;">MESAČNÉ FAKTURÁCIE</div>
    <div style="font-size:26px;font-weight:800;color:${C.esp};margin-bottom:8px;">${monthLabel}</div>
    <div style="font-size:13px;color:${C.wal};">👨‍⚕️ ${supplierName}${supplierAddress ? ` · ${supplierAddress}` : ''}${supplierIco ? ` · IČO: ${supplierIco}` : ''}${supplierDic ? ` · DIČ: ${supplierDic}` : ''}</div>
  </div>

  <div class="stats-row">
    <div class="stat-box">
      <div class="stat-num">${appointments.length}</div>
      <div class="stat-lbl">Termínov</div>
    </div>
    <div class="stat-box">
      <div class="stat-num" style="color:#1E8449;">${revenueStr}</div>
      <div class="stat-lbl">Celkový príjem</div>
    </div>
    <div class="stat-box">
      <div class="stat-num" style="color:${C.wal};">${appointments.length > 0 ? Math.round(totalRevenue / appointments.length).toLocaleString('sk-SK') + ' €' : '—'}</div>
      <div class="stat-lbl">Priemer / termín</div>
    </div>
  </div>

  <div class="section-title">Zoznam termínov</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Dátum</th>
        <th>Pacient</th>
        <th>Ošetrenie</th>
        <th style="text-align:right;">Cena</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:20px;">Žiadne dokončené termíny za tento mesiac</td></tr>'}
      ${appointments.length > 0 ? `
      <tr style="background:${C.esp};">
        <td colspan="4" style="text-align:right;font-size:11px;font-weight:700;color:${C.cream};letter-spacing:1px;text-transform:uppercase;">CELKOVÁ SUMA</td>
        <td style="text-align:right;font-weight:800;font-size:16px;color:#fff;">${revenueStr}</td>
      </tr>` : ''}
    </tbody>
  </table>

  <div style="background:#EAFAF1;border-radius:10px;padding:12px 16px;border:1px solid #A9DFBF;margin-bottom:20px;">
    <div style="font-size:11px;color:#1E8449;">* Sumy sú odhadnuté na základe minimálnych cien služieb. Presné sumy závisí od rozsahu ošetrenia.</div>
  </div>

  <div class="section-title" style="margin-bottom:20px;">Podpis a pečiatka ambulancie</div>
  <div style="display:flex;gap:40px;margin-bottom:20px;">
    <div style="flex:1;border-top:1.5px solid ${C.cream};padding-top:8px;">
      <div style="font-size:10px;color:${C.wal};">Podpis lekára</div>
    </div>
    <div style="flex:1;border-top:1.5px solid ${C.cream};padding-top:8px;">
      <div style="font-size:10px;color:${C.wal};">Pečiatka</div>
    </div>
  </div>

${htmlFoot()}`;

    await _printOrShare(html, `faktury_${year}_${String(month + 1).padStart(2, '0')}.pdf`);
  } catch (e: any) {
    Alert.alert('Chyba exportu', e?.message ?? 'Nepodarilo sa vygenerovať PDF.');
  }
}

// ─── Funkcia: export zdravotného pasu pacienta ───────────────────────────────
export type HealthPassportData = {
  patientName: string;
  bloodType?: string | null;
  insuranceProvider?: string | null;
  insuranceNumber?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  isPregnant?: boolean;
  lastDentalVisit?: string | null;
  medConditions?: string[];
  allergies?: string | null;
  medications?: string | null;
  visitReasons?: string[];
  dentalFreq?: string | null;
  fearLevel?: string | null;
  comfort?: string | null;
  aesthetics?: string[];
  lifestyle?: string[];
  investment?: string | null;
  openQ?: string | null;
};

export async function exportHealthPassport(data: HealthPassportData): Promise<void> {
  try {
    function row(label: string, value: string | null | undefined) {
      if (!value) return '';
      return `
        <tr>
          <td style="font-weight:700;color:${C.wal};width:180px;">${label}</td>
          <td style="color:${C.esp};">${value}</td>
        </tr>`;
    }
    function listRow(label: string, items: string[] | undefined) {
      if (!items?.length) return '';
      return row(label, items.join(', '));
    }

    const html = `
${htmlHead('Zdravotný pas — ' + data.patientName)}
  <div style="margin-bottom:24px;">
    <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.wal};margin-bottom:6px;">ZDRAVOTNÝ PAS PACIENTA</div>
    <div style="font-size:26px;font-weight:800;color:${C.esp};margin-bottom:4px;">👤 ${data.patientName}</div>
    <div style="font-size:12px;color:${C.wal};">Exportované: ${fmtNow()}</div>
  </div>

  <div class="section-title">Základné zdravotné údaje</div>
  <table style="margin-bottom:24px;">
    <tbody>
      ${row('Krvná skupina', data.bloodType)}
      ${row('Zdravotná poisťovňa', [data.insuranceProvider, data.insuranceNumber].filter(Boolean).join(' · '))}
      ${row('Núdzový kontakt', [data.emergencyName, data.emergencyPhone].filter(Boolean).join(' · '))}
      ${row('Tehotenstvo', data.isPregnant ? '✓ Áno' : null)}
      ${row('Posledná návšteva', data.lastDentalVisit)}
    </tbody>
  </table>

  <div class="section-title">Anamnéza</div>
  <table style="margin-bottom:24px;">
    <tbody>
      ${listRow('Ochorenia', data.medConditions)}
      ${row('Alergie', data.allergies)}
      ${row('Lieky', data.medications)}
    </tbody>
  </table>

  <div class="section-title">Dentálne preference</div>
  <table style="margin-bottom:24px;">
    <tbody>
      ${listRow('Dôvod návštevy', data.visitReasons)}
      ${row('Frekvencia návštev', data.dentalFreq)}
      ${row('Strach zo zubára', data.fearLevel)}
      ${row('Komfort počas ošetrenia', data.comfort)}
      ${listRow('Estetické ciele', data.aesthetics)}
      ${listRow('Životný štýl', data.lifestyle)}
      ${row('Investičná preferencia', data.investment)}
      ${row('Poznámka pacienta', data.openQ)}
    </tbody>
  </table>

  <div style="background:#E8F8F5;border-radius:10px;padding:12px 16px;border:1px solid #A2D9CE;margin-bottom:20px;">
    <div style="font-size:11px;color:#0E6655;">
      ⚠️ Tento dokument obsahuje citlivé zdravotné údaje. Zaobchádzajte s ním v súlade s GDPR a platnou legislatívou.
    </div>
  </div>

${htmlFoot()}`;

    await _printOrShare(html, `zdravotny_pas_${data.patientName.replace(/\s+/g, '_')}.pdf`);
  } catch (e: any) {
    Alert.alert('Chyba exportu', e?.message ?? 'Nepodarilo sa vygenerovať PDF.');
  }
}

// ─── Funkcia: export liečebného plánu ────────────────────────────────────────
export type TreatmentPlanItem = {
  title:          string;
  description:    string | null;
  estimated_cost: number | null;
  tooth_number:   number | null;
  status:         'planned' | 'scheduled' | 'completed' | 'skipped';
  sort_order:     number;
};

export type TreatmentPlanExport = {
  title:      string;
  notes:      string | null;
  status:     'active' | 'completed' | 'cancelled';
  created_at: string;
  items:      TreatmentPlanItem[];
};

const PLAN_STATUS_SK: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: 'Aktívny',  color: C.wal,    bg: '#E2DDD6' },
  completed: { label: 'Hotový',   color: '#1E8449', bg: '#EAFAF1' },
  cancelled: { label: 'Zrušený',  color: '#922B21', bg: '#FDEDEC' },
};

const ITEM_STATUS_SK: Record<string, { label: string; color: string; bg: string }> = {
  planned:   { label: 'Plánované',   color: '#1A5276', bg: '#EBF5FB' },
  scheduled: { label: 'Naplánované', color: '#7D6608', bg: '#FEF9E7' },
  completed: { label: 'Hotové',      color: '#1E8449', bg: '#EAFAF1' },
  skipped:   { label: 'Preskočené',  color: '#7F8C8D', bg: '#F4F6F7' },
};

export async function exportTreatmentPlan(
  plan:        TreatmentPlanExport,
  patientName: string,
  doctorName = 'MDDr. Loderer',
): Promise<void> {
  try {
    const pSt  = PLAN_STATUS_SK[plan.status] ?? PLAN_STATUS_SK.active;
    const total = plan.items.reduce((s, i) => s + (i.estimated_cost ?? 0), 0);
    const done  = plan.items.filter(i => i.status === 'completed').reduce((s, i) => s + (i.estimated_cost ?? 0), 0);

    const rows = plan.items.map((item, idx) => {
      const iSt = ITEM_STATUS_SK[item.status] ?? ITEM_STATUS_SK.planned;
      return `
        <tr>
          <td style="font-weight:700;color:${C.esp};text-align:center;">${idx + 1}.</td>
          <td>
            <strong>${item.title}</strong>
            ${item.description ? `<br/><span style="color:#888;font-size:11px;">${item.description}</span>` : ''}
          </td>
          <td style="text-align:center;color:${C.wal};">
            ${item.tooth_number != null ? `🦷 ${item.tooth_number}` : '—'}
          </td>
          <td>
            <span class="badge" style="background:${iSt.bg};color:${iSt.color};">${iSt.label}</span>
          </td>
          <td style="text-align:right;font-weight:700;color:${C.esp};">
            ${item.estimated_cost != null ? `${item.estimated_cost.toFixed(2).replace('.', ',')} €` : '—'}
          </td>
        </tr>`;
    }).join('');

    const html = `
${htmlHead('Liečebný plán — ' + patientName, doctorName)}

  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;gap:16px;flex-wrap:wrap;">
    <div>
      <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.wal};margin-bottom:6px;">LIEČEBNÝ PLÁN</div>
      <div style="font-size:26px;font-weight:800;color:${C.esp};margin-bottom:4px;">📋 ${plan.title}</div>
      <div style="font-size:12px;color:${C.wal};">Pacient: <strong>${patientName}</strong></div>
      <div style="font-size:12px;color:${C.wal};">Vytvorené: <strong>${fmtDate(plan.created_at)}</strong></div>
    </div>
    <div>
      <span class="badge" style="font-size:13px;padding:6px 14px;background:${pSt.bg};color:${pSt.color};">${pSt.label}</span>
    </div>
  </div>

  <div class="stats-row">
    <div class="stat-box">
      <div class="stat-num">${plan.items.length}</div>
      <div class="stat-lbl">Výkonov</div>
    </div>
    <div class="stat-box">
      <div class="stat-num" style="color:#1E8449;">${plan.items.filter(i => i.status === 'completed').length}</div>
      <div class="stat-lbl">Hotových</div>
    </div>
    <div class="stat-box">
      <div class="stat-num" style="color:${C.wal};">${total > 0 ? total.toFixed(2).replace('.', ',') + ' €' : '—'}</div>
      <div class="stat-lbl">Celková cena</div>
    </div>
    <div class="stat-box">
      <div class="stat-num" style="color:#1E8449;">${done > 0 ? done.toFixed(2).replace('.', ',') + ' €' : '—'}</div>
      <div class="stat-lbl">Uhradené</div>
    </div>
  </div>

  ${plan.notes ? `
  <div style="background:#FDFBF8;border-radius:10px;padding:14px 16px;border:1px solid ${C.cream};margin-bottom:24px;">
    <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.wal};margin-bottom:6px;">POZNÁMKY</div>
    <div style="font-size:13px;color:${C.esp};line-height:1.6;">${plan.notes}</div>
  </div>` : ''}

  <div class="section-title">Zoznam výkonov</div>
  <table>
    <thead>
      <tr>
        <th style="text-align:center;width:32px;">#</th>
        <th>Výkon</th>
        <th style="text-align:center;">Zub</th>
        <th>Stav</th>
        <th style="text-align:right;">Cena</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:20px;">Žiadne výkony</td></tr>'}
      ${plan.items.length > 0 ? `
      <tr style="background:${C.esp};">
        <td colspan="4" style="text-align:right;font-size:11px;font-weight:700;color:${C.cream};letter-spacing:1px;text-transform:uppercase;">CELKOVÁ SUMA</td>
        <td style="text-align:right;font-weight:800;font-size:15px;color:#fff;">${total > 0 ? total.toFixed(2).replace('.', ',') + ' €' : '—'}</td>
      </tr>` : ''}
    </tbody>
  </table>

  <div class="section-title" style="margin-bottom:20px;">Podpis a pečiatka ambulancie</div>
  <div style="display:flex;gap:40px;margin-bottom:40px;">
    <div style="flex:1;border-top:1.5px solid ${C.cream};padding-top:8px;">
      <div style="font-size:10px;color:${C.wal};">Podpis lekára</div>
    </div>
    <div style="flex:1;border-top:1.5px solid ${C.cream};padding-top:8px;">
      <div style="font-size:10px;color:${C.wal};">Podpis pacienta</div>
    </div>
    <div style="flex:1;border-top:1.5px solid ${C.cream};padding-top:8px;">
      <div style="font-size:10px;color:${C.wal};">Pečiatka</div>
    </div>
  </div>

${htmlFoot()}`;

    const slug = `${patientName.replace(/\s+/g, '_')}_${plan.title.replace(/\s+/g, '_')}`;
    await _printOrShare(html, `liecebny_plan_${slug}.pdf`);
  } catch (e: any) {
    Alert.alert('Chyba exportu', e?.message ?? 'Nepodarilo sa vygenerovať PDF.');
  }
}

// ─── Funkcia: export receptu ──────────────────────────────────────────────────
export type PrescriptionExport = {
  id: string;
  medication: string;
  dosage: string | null;
  instructions: string | null;
  valid_until: string | null;
  created_at: string;
};

export async function exportPrescription(
  doctorName: string,
  clinicName: string | null,
  clinicAddress: string | null,
  patientName: string,
  rx: PrescriptionExport,
): Promise<void> {
  try {
    const issued   = new Date(rx.created_at);
    const rxDate   = issued.toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
    const rxNum    = `RX-${issued.getFullYear()}${String(issued.getMonth() + 1).padStart(2, '0')}-${rx.id.slice(0, 6).toUpperCase()}`;

    const validUntilLine = rx.valid_until
      ? `<div style="margin-top:8px;">
           <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.wal};">PLATNOSŤ</span>
           <div style="font-size:14px;color:${C.esp};margin-top:4px;">📅 ${new Date(rx.valid_until).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
         </div>`
      : '';

    const html = `
${htmlHead('Recept — ' + rxNum, doctorName)}

  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;gap:16px;flex-wrap:wrap;">
    <div>
      <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.wal};margin-bottom:6px;">LEKÁRSKY RECEPT</div>
      <div style="font-size:26px;font-weight:800;color:${C.esp};margin-bottom:4px;">💊 ${rxNum}</div>
      <div style="font-size:12px;color:${C.wal};">Dátum vystavenia: <strong>${rxDate}</strong></div>
    </div>
  </div>

  <div style="display:flex;gap:16px;margin-bottom:28px;flex-wrap:wrap;">
    <div style="flex:1;min-width:200px;background:#fff;border-radius:12px;padding:16px 20px;border:1.5px solid ${C.cream};">
      <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.wal};margin-bottom:8px;">VYSTAVIL LEKÁR</div>
      <div style="font-size:16px;font-weight:800;color:${C.esp};margin-bottom:4px;">👨‍⚕️ ${doctorName}</div>
      ${clinicName ? `<div style="font-size:13px;color:${C.wal};">${clinicName}</div>` : ''}
      ${clinicAddress ? `<div style="font-size:12px;color:${C.wal};">${clinicAddress}</div>` : ''}
    </div>
    <div style="flex:1;min-width:200px;background:#fff;border-radius:12px;padding:16px 20px;border:1.5px solid ${C.cream};">
      <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.wal};margin-bottom:8px;">PACIENT</div>
      <div style="font-size:16px;font-weight:800;color:${C.esp};">👤 ${patientName}</div>
    </div>
  </div>

  <div class="section-title">Predpísaný liek</div>
  <div style="background:#fff;border-radius:12px;padding:22px 24px;border:1.5px solid ${C.cream};margin-bottom:28px;">
    <div style="font-size:22px;font-weight:800;color:${C.esp};margin-bottom:14px;">💊 ${rx.medication}</div>
    ${rx.dosage ? `
    <div style="margin-bottom:12px;">
      <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.wal};">DÁVKOVANIE</span>
      <div style="font-size:14px;color:${C.esp};margin-top:4px;">${rx.dosage}</div>
    </div>` : ''}
    ${rx.instructions ? `
    <div style="margin-bottom:12px;">
      <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.wal};">POKYNY</span>
      <div style="font-size:14px;color:${C.esp};margin-top:4px;">${rx.instructions}</div>
    </div>` : ''}
    ${validUntilLine}
  </div>

  <div class="section-title" style="margin-bottom:20px;">Pečiatka a podpis</div>
  <div style="display:flex;gap:32px;margin-bottom:40px;">
    <div style="flex:1;min-height:88px;border:1.5px dashed ${C.cream};border-radius:10px;padding:12px 16px;">
      <div style="font-size:10px;color:${C.wal};">Podpis lekára</div>
    </div>
    <div style="flex:1;min-height:88px;border:1.5px dashed ${C.cream};border-radius:10px;padding:12px 16px;">
      <div style="font-size:10px;color:${C.wal};">Pečiatka ambulancie</div>
    </div>
  </div>

  <div style="background:#EBF5FB;border-radius:10px;padding:12px 16px;border:1px solid #AED6F1;margin-bottom:20px;">
    <div style="font-size:11px;color:#1A5276;">ℹ️ Vystavené elektronicky cez Loderer Dental App · ${fmtNow()}</div>
  </div>

${htmlFoot()}`;

    await _printOrShare(html, `recept_${rxNum}.pdf`);
  } catch (e: any) {
    Alert.alert('Chyba exportu', e?.message ?? 'Nepodarilo sa vygenerovať PDF receptu.');
  }
}

// ─── Interný helper: print / share ───────────────────────────────────────────
async function _printOrShare(html: string, filename: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Uložiť alebo zdieľať PDF',
      UTI: 'com.adobe.pdf',
    });
  } else {
    // Fallback: priamo tlač (iOS)
    await Print.printAsync({ uri });
  }
}
