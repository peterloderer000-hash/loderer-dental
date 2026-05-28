import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../styles/theme';
import { useAppTheme } from '../context/ThemeContext';
import { jsDayToDb } from '../utils/timeSlots';

const SK_MONTHS = [
  'január','február','marec','apríl','máj','jún',
  'júl','august','september','október','november','december',
];
const DAY_LABELS = ['Po','Ut','St','Št','Pi','So','Ne'];

interface Props {
  selectedDate:   Date | null;
  onSelectDate:   (date: Date) => void;
  openDbDays:     Set<number>;   // 1=Po…7=Ne; empty = Mon-Fri default
  loading?:       boolean;
  maxMonthsAhead?: number;       // default 12
  warnMonthsAhead?: number;      // default 6, 0 = no warning
}

export const MonthCalendar = React.memo(function MonthCalendar({
  selectedDate, onSelectDate, openDbDays,
  loading = false, maxMonthsAhead = 12, warnMonthsAhead = 6,
}: Props) {
  const { colors, dark } = useAppTheme();

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);

  const maxDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + maxMonthsAhead);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [maxMonthsAhead]);

  const warnDate = useMemo(() => {
    if (!warnMonthsAhead) return null;
    const d = new Date();
    d.setMonth(d.getMonth() + warnMonthsAhead);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [warnMonthsAhead]);

  const [viewYear,  setViewYear]  = useState(() => today.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => today.getMonth());

  // Prvý deň aktuálneho mesiaca pre porovnanie
  const firstOfView    = useMemo(() => new Date(viewYear, viewMonth, 1), [viewYear, viewMonth]);
  const firstOfToday   = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const firstOfMax     = useMemo(() => new Date(maxDate.getFullYear(), maxDate.getMonth(), 1), [maxDate]);

  const canGoPrev = firstOfView > firstOfToday;
  const canGoNext = firstOfView < firstOfMax;

  function prevMonth() {
    if (!canGoPrev) return;
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (!canGoNext) return;
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  // Vygeneruj bunky pre mesiac
  const cells = useMemo((): (Date | null)[] => {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay(); // 0=Ne
    const offset   = firstDow === 0 ? 6 : firstDow - 1;        // Po=0…Ne=6
    const daysInM  = new Date(viewYear, viewMonth + 1, 0).getDate();
    const result: (Date | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= daysInM; d++) result.push(new Date(viewYear, viewMonth, d));
    return result;
  }, [viewYear, viewMonth]);

  // Otvorené dni: ak openDbDays prázdny → Po-Pia
  function isDayOpen(date: Date): boolean {
    if (openDbDays.size > 0) return openDbDays.has(jsDayToDb(date.getDay()));
    const dow = date.getDay(); // 0=Ne,1=Po…6=So
    return dow >= 1 && dow <= 5;
  }

  const isFarAhead = selectedDate && warnDate ? selectedDate > warnDate : false;

  if (loading) {
    return <ActivityIndicator color={COLORS.wal} style={{ marginVertical: 24 }} />;
  }

  return (
    <View>
      {/* Navigácia mesiacov */}
      <View style={[s.nav, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
        <TouchableOpacity
          style={[s.navBtn, !canGoPrev && s.navBtnOff]}
          onPress={prevMonth} disabled={!canGoPrev} activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={canGoPrev ? colors.textPrimary : colors.bg3} />
        </TouchableOpacity>

        <Text style={[s.navTitle, { color: colors.textPrimary }]}>
          {SK_MONTHS[viewMonth]} {viewYear}
        </Text>

        <TouchableOpacity
          style={[s.navBtn, !canGoNext && s.navBtnOff]}
          onPress={nextMonth} disabled={!canGoNext} activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={22} color={canGoNext ? colors.textPrimary : colors.bg3} />
        </TouchableOpacity>
      </View>

      {/* Hlavičky dní */}
      <View style={s.weekRow}>
        {DAY_LABELS.map(d => (
          <Text key={d} style={[s.weekLabel, { color: colors.textSecondary }]}>{d}</Text>
        ))}
      </View>

      {/* Mriežka dní */}
      <View style={s.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e${i}`} style={s.cell} />;

          const dayTime  = day.getTime();
          const isPast   = dayTime < today.getTime();
          const isAfterM = dayTime > maxDate.getTime();
          const isOpen   = isDayOpen(day);
          const disabled = isPast || isAfterM || !isOpen;
          const isSel    = selectedDate?.toDateString() === day.toDateString();
          const isFar    = warnDate ? dayTime > warnDate.getTime() : false;
          const isToday  = dayTime === today.getTime();

          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={[
                s.cell,
                isOpen && !disabled ? [s.cellOpen, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }] : null,
                isSel ? s.cellSel : null,
                isToday && !isSel ? [s.cellToday, { borderColor: COLORS.gold }] : null,
                disabled && !isSel ? s.cellDisabled : null,
              ]}
              onPress={() => !disabled && onSelectDate(day)}
              disabled={disabled}
              activeOpacity={0.75}
            >
              <Text style={[
                s.cellNum,
                { color: disabled ? colors.bg3 : colors.textPrimary },
                isSel    && { color: COLORS.sand },
                isToday && !isSel && { color: COLORS.gold, fontWeight: '700' },
              ]}>
                {day.getDate()}
              </Text>
              {isFar && !disabled && <View style={s.farDot} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legenda */}
      {warnMonthsAhead > 0 && (
        <View style={s.legend}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: COLORS.esp }]} />
            <Text style={[s.legendTxt, { color: colors.textSecondary }]}>Dostupný deň</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: '#B87333' }]} />
            <Text style={[s.legendTxt, { color: colors.textSecondary }]}>Viac ako {warnMonthsAhead} mes.</Text>
          </View>
        </View>
      )}

      {/* Varovanie */}
      {isFarAhead && (
        <View style={[s.warn, { backgroundColor: dark ? '#2D2200' : '#FEF9E7', borderColor: dark ? '#B8730055' : '#F9E79F' }]}>
          <Ionicons name="warning-outline" size={15} color={dark ? '#F0A030' : '#B87333'} />
          <Text style={[s.warnTxt, { color: dark ? '#F0A030' : '#7D4800' }]}>
            Rezervácia viac ako {warnMonthsAhead} mesiacov dopredu je orientačná — termín vopred potvrdíme.
          </Text>
        </View>
      )}
    </View>
  );
});

const s = StyleSheet.create({
  nav:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 4, marginBottom: 10 },
  navBtn:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  navBtnOff:   { opacity: 0.3 },
  navTitle:    { fontSize: 16, fontFamily: 'DMSans_500Medium', textTransform: 'capitalize', flex: 1, textAlign: 'center' },
  weekRow:     { flexDirection: 'row', marginBottom: 4 },
  weekLabel:   { flex: 1, textAlign: 'center', fontSize: 11, fontFamily: 'DMSans_500Medium', paddingVertical: 4 },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  cell:        { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  cellOpen:    { borderRadius: 10, borderWidth: 1.5 },
  cellSel:     { backgroundColor: COLORS.esp, borderColor: COLORS.sand, borderWidth: 2, borderRadius: 10 },
  cellToday:   { borderRadius: 10, borderWidth: 2 },
  cellDisabled:{ opacity: 0.2 },
  cellNum:     { fontSize: 14, fontFamily: 'DMSans_500Medium' },
  farDot:      { width: 4, height: 4, borderRadius: 2, backgroundColor: '#B87333', position: 'absolute', bottom: 3 },
  legend:      { flexDirection: 'row', gap: 16, marginBottom: 8 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendTxt:   { fontSize: 11 },
  warn:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 4 },
  warnTxt:     { flex: 1, fontSize: 12, lineHeight: 18 },
});
