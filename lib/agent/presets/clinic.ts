import 'server-only';
// "Diffusion Dental" demo receptionist (Voice Customer Support Agent
// cookbook). Demo data only: an in-memory store seeded deterministically from
// today's date (UTC). With a session id the state lives in module memory for
// an hour (warm server instance); without one each request starts fresh.
import type { AgentTool } from '../types';

export const CLINIC_HOURS = [9, 10, 11, 14, 15, 16];

interface Provider {
  id: number;
  name: string;
  specialty: string;
}
interface Patient {
  id: number;
  name: string;
  phone: string;
  email?: string;
}
interface Slot {
  id: number;
  provider_id: number;
  start_time: string; // YYYY-MM-DDTHH:MM
  duration_min: number;
  status: 'available' | 'booked';
  patient_id?: number;
  reason?: string;
}
export interface ClinicState {
  today: string;
  providers: Provider[];
  patients: Patient[];
  slots: Slot[];
}

const PROVIDERS: Provider[] = [
  { id: 1, name: 'Dr. Ada Molar', specialty: 'General Dentistry' },
  { id: 2, name: 'Dr. Reed Wyre', specialty: 'Orthodontics' },
  { id: 3, name: 'Dr. Pearl Flossmore', specialty: 'Hygiene & Cleaning' },
];
const PATIENTS: Patient[] = [
  { id: 1, name: 'Penny Placeholder', phone: '+1-415-555-0101', email: 'penny@example.com' },
  { id: 2, name: 'Sam Sampleton', phone: '+1-415-555-0102', email: 'sam@example.com' },
  { id: 3, name: 'Molly Mockford', phone: '+1-415-555-0103', email: 'molly@example.com' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** The next five business days after `today` (never today, so no past slots). */
export function businessDays(today: Date, count = 5): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  while (out.length < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(isoDate(d));
  }
  return out;
}

export function seedClinic(now = new Date()): ClinicState {
  const days = businessDays(now);
  const slots: Slot[] = [];
  let id = 101;
  for (const day of days) {
    for (const p of PROVIDERS) {
      for (const h of CLINIC_HOURS) {
        slots.push({ id: id++, provider_id: p.id, start_time: `${day}T${pad(h)}:00`, duration_min: 30, status: 'available' });
      }
    }
  }
  const book = (day: number, provider: number, hour: number, patient: number, reason: string) => {
    const s = slots.find((x) => x.start_time === `${days[day]}T${pad(hour)}:00` && x.provider_id === provider)!;
    Object.assign(s, { status: 'booked', patient_id: patient, reason });
  };
  book(0, 1, 10, 1, 'Check-up');
  book(1, 3, 14, 2, 'Cleaning');
  return {
    today: isoDate(now),
    providers: PROVIDERS.map((p) => ({ ...p })),
    patients: PATIENTS.map((p) => ({ ...p })),
    slots,
  };
}

const sessions = new Map<string, { state: ClinicState; expires: number }>();
const SESSION_TTL = 60 * 60_000;

export function getClinicState(sessionId?: string): ClinicState {
  if (!sessionId) return seedClinic();
  const now = Date.now();
  const hit = sessions.get(sessionId);
  // Reseed when the day changes so slots stay in the future.
  if (hit && hit.expires > now && hit.state.today === isoDate(new Date())) {
    hit.expires = now + SESSION_TTL;
    return hit.state;
  }
  const state = seedClinic();
  sessions.set(sessionId, { state, expires: now + SESSION_TTL });
  if (sessions.size > 500) {
    for (const [k, v] of sessions) if (v.expires <= now) sessions.delete(k);
    if (sessions.size > 500) sessions.delete(sessions.keys().next().value!);
  }
  return state;
}

const digits = (s: string) => s.replace(/\D/g, '');
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const int = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
};

function matchPatients(st: ClinicState, name: string, phone: string): Patient[] {
  const n = name.toLowerCase();
  const p = digits(phone);
  return st.patients.filter((x) => {
    if (n && !x.name.toLowerCase().includes(n)) return false;
    if (p && !digits(x.phone).includes(p.slice(-10))) return false;
    return !!(n || p);
  });
}

const TITLES = new Set(['dr', 'doctor', 'mr', 'mrs', 'ms', 'prof']);
function providerFromName(st: ClinicState, raw: string): Provider | null | undefined {
  const words = raw
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !TITLES.has(w));
  if (!words.length) return undefined;
  return st.providers.find((p) => words.every((w) => p.name.toLowerCase().includes(w))) ?? null;
}

function slotView(st: ClinicState, s: Slot) {
  const p = st.providers.find((x) => x.id === s.provider_id)!;
  const d = new Date(`${s.start_time}:00Z`);
  const when = d.toLocaleString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return { id: s.id, start_time: s.start_time, when, provider: p.name, specialty: p.specialty, duration_min: s.duration_min };
}

type Json = Record<string, unknown>;
const ok = (v: Json) => ({ content: JSON.stringify(v) });

export function clinicTools(st: ClinicState): AgentTool[] {
  const t = (
    name: string,
    description: string,
    parameters: AgentTool['parameters'],
    label: AgentTool['label'],
    run: (a: Record<string, unknown>) => Json,
  ): AgentTool => ({
    name,
    description,
    parameters,
    source: 'preset:clinic',
    label,
    execute: async (args) => ok(run(args)),
  });

  return [
    t(
      'find_patient',
      'Look up an existing patient by name and/or phone number.',
      {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Full or partial patient name' },
          phone: { type: 'string', description: 'Full or partial phone number' },
        },
      },
      (a) => `Looking up ${str(a.name) || str(a.phone) || 'patient'}`,
      (a) => {
        const patients = matchPatients(st, str(a.name), str(a.phone));
        return { patients, count: patients.length };
      },
    ),
    t(
      'list_available_slots',
      'List OPEN appointment slots. Filter by date (format YYYY-MM-DD) and/or provider surname. Call this before booking so you can offer the patient a real, open slot id.',
      {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Day to search, YYYY-MM-DD' },
          provider_name: { type: 'string', description: "Provider surname, e.g. 'Flossmore'" },
        },
      },
      (a) => `Checking open slots${str(a.provider_name) ? ` with ${str(a.provider_name)}` : ''}${str(a.date) ? ` on ${str(a.date)}` : ''}`,
      (a) => {
        let list = st.slots.filter((s) => s.status === 'available');
        const date = str(a.date);
        if (date) list = list.filter((s) => s.start_time.startsWith(date));
        const pn = str(a.provider_name);
        if (pn) {
          const p = providerFromName(st, pn);
          if (p === null) return { error: `No provider matching '${pn}'.` };
          if (p) list = list.filter((s) => s.provider_id === p.id);
        }
        const available_slots = list.slice(0, 20).map((s) => slotView(st, s));
        return { available_slots, count: available_slots.length, total_open: list.length };
      },
    ),
    t(
      'book_appointment',
      "Book a specific available slot for a patient. Requires the slot_id (from list_available_slots), the patient's name, and their phone number.",
      {
        type: 'object',
        properties: {
          slot_id: { type: 'integer', description: 'id of an available slot' },
          patient_name: { type: 'string' },
          patient_phone: { type: 'string' },
          reason: { type: 'string', description: 'Reason for the visit' },
        },
        required: ['slot_id', 'patient_name', 'patient_phone'],
      },
      (a) => `Booking slot ${a.slot_id ?? ''} for ${str(a.patient_name) || 'patient'}`,
      (a) => {
        const id = int(a.slot_id);
        const name = str(a.patient_name);
        const phone = str(a.patient_phone);
        if (id === null) return { error: 'slot_id must be an integer.' };
        if (!name || digits(phone).length < 7) return { error: 'A patient name and a phone number (7+ digits) are required.' };
        const slot = st.slots.find((s) => s.id === id);
        if (!slot) return { error: `Slot ${id} does not exist.` };
        if (slot.status !== 'available') return { error: `Slot ${id} is not available.` };
        let patient = st.patients.find((p) => digits(p.phone).slice(-10) === digits(phone).slice(-10));
        if (!patient) {
          patient = { id: Math.max(0, ...st.patients.map((p) => p.id)) + 1, name: name.slice(0, 80), phone: phone.slice(0, 30) };
          st.patients.push(patient);
        }
        Object.assign(slot, { status: 'booked', patient_id: patient.id, reason: str(a.reason).slice(0, 200) || undefined });
        return { status: 'booked', confirmation: slotView(st, slot), patient_id: patient.id };
      },
    ),
    t(
      'reschedule_appointment',
      'Move an existing booking to a new available slot.',
      {
        type: 'object',
        properties: {
          appointment_id: { type: 'integer', description: 'id of the current booking' },
          new_slot_id: { type: 'integer', description: 'id of the new available slot' },
        },
        required: ['appointment_id', 'new_slot_id'],
      },
      (a) => `Moving appointment ${a.appointment_id ?? ''} to slot ${a.new_slot_id ?? ''}`,
      (a) => {
        const from = st.slots.find((s) => s.id === int(a.appointment_id));
        const to = st.slots.find((s) => s.id === int(a.new_slot_id));
        if (!from || from.status !== 'booked') return { error: `Appointment ${a.appointment_id} is not a current booking.` };
        if (!to || to.status !== 'available') return { error: `Slot ${a.new_slot_id} is not available.` };
        Object.assign(to, { status: 'booked', patient_id: from.patient_id, reason: from.reason });
        Object.assign(from, { status: 'available', patient_id: undefined, reason: undefined });
        return { status: 'rescheduled', from_id: from.id, to_id: to.id, new_time: slotView(st, to) };
      },
    ),
    t(
      'cancel_appointment',
      'Cancel an existing booking and free the slot.',
      {
        type: 'object',
        properties: { appointment_id: { type: 'integer', description: 'id of the booking to cancel' } },
        required: ['appointment_id'],
      },
      (a) => `Cancelling appointment ${a.appointment_id ?? ''}`,
      (a) => {
        const s = st.slots.find((x) => x.id === int(a.appointment_id));
        if (!s || s.status !== 'booked') return { error: `Appointment ${a.appointment_id} is not a current booking.` };
        Object.assign(s, { status: 'available', patient_id: undefined, reason: undefined });
        return { status: 'cancelled', appointment_id: s.id };
      },
    ),
    t(
      'get_appointments_for_patient',
      "List a patient's upcoming (booked) appointments by name and/or phone.",
      { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' } } },
      (a) => `Finding appointments for ${str(a.name) || str(a.phone) || 'patient'}`,
      (a) => {
        const ids = new Set(matchPatients(st, str(a.name), str(a.phone)).map((p) => p.id));
        const appointments = st.slots
          .filter((s) => s.status === 'booked' && s.patient_id !== undefined && ids.has(s.patient_id))
          .map((s) => ({ ...slotView(st, s), patient: st.patients.find((p) => p.id === s.patient_id)?.name, reason: s.reason }));
        return { appointments, count: appointments.length };
      },
    ),
  ];
}

export function clinicSystemPrompt(now = new Date()): string {
  const today = now.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return `You are the friendly virtual receptionist for Diffusion Dental (a demo clinic with fictional data).
You help callers check availability and book, reschedule, or cancel appointments.

Guidelines:
- Today's date is ${today}. The clinic is open Monday-Friday; bookable days start tomorrow. Times are clinic local time.
- The clinic's providers go by Molar (general dentistry), Wyre (orthodontics), and Flossmore (hygiene and cleaning).
- Always use the tools to look up real data; never invent slot ids, times, or patient records.
- Before booking, call list_available_slots and offer the caller a real open slot.
- To book you need the caller's name and phone number - ask if you don't have them.
- If the caller asks you to book and already gave everything needed (name, phone, a slot or a clear preference such as "the earliest"), go ahead and book it.
- Confirm the concrete date, time, and provider back to the caller after any change.
- Keep replies short and conversational - they may be read aloud over the phone.`;
}
