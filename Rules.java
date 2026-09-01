package com.agentforces.attendance;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

final class Rules {
    static final int START_MINUTES = 5 * 60;
    static final int END_MINUTES = 15 * 60;
    private Rules() {}

    static String cleanOffice(String value) {
        if (value == null) return "";
        value = value.replaceAll("[\\r\\n\\t]+", " ").replaceAll("\\s{2,}", " ").trim();
        return value.length() > 80 ? value.substring(0, 80) : value;
    }

    static ZoneId zone(String raw) {
        if (raw == null || raw.trim().isEmpty()) return ZoneId.of("America/Toronto");
        return ZoneId.of(raw.trim());
    }

    static ZonedDateTime now(ZoneId zone) { return ZonedDateTime.ofInstant(Instant.now(), zone); }

    static boolean weekday(LocalDate date) {
        DayOfWeek d = date.getDayOfWeek();
        return d != DayOfWeek.SATURDAY && d != DayOfWeek.SUNDAY;
    }

    static boolean timeAllowed(LocalTime time) {
        int minutes = time.getHour() * 60 + time.getMinute();
        return minutes >= START_MINUTES && minutes <= END_MINUTES;
    }

    static LocalTime parseTime(String raw) {
        return LocalTime.parse(raw, DateTimeFormatter.ofPattern("HH:mm"));
    }
}
