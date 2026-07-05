import * as Calendar from 'expo-calendar';
import { Alert, Platform } from 'react-native';

const CALENDAR_NAME = 'Loderer Dental';
const CALENDAR_COLOR = '#3A4256';

export interface CalendarEventParams {
  title: string;
  startDate: Date;
  durationMinutes: number;
  location?: string;
  notes?: string;
}

async function getOrCreateCalendarId(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find(c => c.title === CALENDAR_NAME && c.allowsModifications);
  if (existing) return existing.id;

  let source: Calendar.Source;
  if (Platform.OS === 'ios') {
    const def = await Calendar.getDefaultCalendarAsync();
    source = def.source;
  } else {
    source = {
      isLocalAccount: true,
      name: 'Loderer Dental',
      type: Calendar.SourceType.LOCAL,
    };
  }

  return Calendar.createCalendarAsync({
    title: CALENDAR_NAME,
    color: CALENDAR_COLOR,
    entityType: Calendar.EntityTypes.EVENT,
    sourceId: source.id,
    source,
    name: 'lodererDental',
    ownerAccount: 'personal',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

export async function addToCalendar(params: CalendarEventParams): Promise<string | null> {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Prístup zamietnutý',
        'Povolte prístup ku kalendáru v nastaveniach zariadenia.',
        [{ text: 'OK' }],
      );
      return null;
    }

    const calendarId = await getOrCreateCalendarId();
    if (!calendarId) return null;

    const endDate = new Date(params.startDate.getTime() + params.durationMinutes * 60 * 1000);

    const eventId = await Calendar.createEventAsync(calendarId, {
      title: `🦷 ${params.title}`,
      startDate: params.startDate,
      endDate,
      location: params.location ?? 'Loderer Dental',
      notes: params.notes,
      alarms: [
        { relativeOffset: -60 },   // 1 hodina vopred
        { relativeOffset: -1440 }, // 1 deň vopred
      ],
    });

    return eventId ?? null;
  } catch (e) {
    console.warn('calendarSync.addToCalendar:', e);
    return null;
  }
}

export async function removeFromCalendar(eventId: string): Promise<void> {
  try {
    await Calendar.deleteEventAsync(eventId);
  } catch {}
}
