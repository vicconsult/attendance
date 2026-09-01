package com.agentforces.attendance;

import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Time;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class AttendanceStore {
    private AttendanceStore() {}

    static AttendanceRecord createIfAbsent(String username, AttendanceRecord record) throws Exception {
        try (Connection c = Database.connection()) {
            long userId = requireUserId(c, username);
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO attendance_records " +
                    "(user_id, attendance_date, attendance_local_time, office_name, source, attended_at, timezone) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?)")) {
                bindRecord(ps, userId, record);
                ps.executeUpdate();
                return record;
            } catch (SQLException e) {
                if (Database.duplicateKey(e)) return get(c, userId, record.date);
                throw e;
            }
        }
    }

    static AttendanceRecord upsert(String username, AttendanceRecord record) throws Exception {
        try (Connection c = Database.connection()) {
            long userId = requireUserId(c, username);
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO attendance_records " +
                    "(user_id, attendance_date, attendance_local_time, office_name, source, attended_at, timezone) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?) " +
                    "ON DUPLICATE KEY UPDATE attendance_local_time=VALUES(attendance_local_time), " +
                    "office_name=VALUES(office_name), source=VALUES(source), attended_at=VALUES(attended_at), timezone=VALUES(timezone)")) {
                bindRecord(ps, userId, record);
                ps.executeUpdate();
                return record;
            }
        }
    }

    static AttendanceRecord get(String username, String date) throws Exception {
        try (Connection c = Database.connection()) {
            long userId = UserStore.userId(c, username);
            return userId < 0 ? null : get(c, userId, date);
        }
    }

    static boolean delete(String username, String date) throws Exception {
        try (Connection c = Database.connection()) {
            long userId = UserStore.userId(c, username);
            if (userId < 0) return false;
            try (PreparedStatement ps = c.prepareStatement(
                    "DELETE FROM attendance_records WHERE user_id = ? AND attendance_date = ?")) {
                ps.setLong(1, userId);
                ps.setDate(2, Date.valueOf(LocalDate.parse(date)));
                return ps.executeUpdate() > 0;
            }
        }
    }

    static List<AttendanceRecord> list(String username) throws Exception {
        try (Connection c = Database.connection()) {
            long userId = UserStore.userId(c, username);
            if (userId < 0) return Collections.emptyList();
            List<AttendanceRecord> out = new ArrayList<AttendanceRecord>();
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT attendance_date, attendance_local_time, office_name, source, attended_at, timezone " +
                    "FROM attendance_records WHERE user_id = ? ORDER BY attendance_date DESC")) {
                ps.setLong(1, userId);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) out.add(read(rs));
                }
            }
            return out;
        }
    }

    private static long requireUserId(Connection c, String username) throws SQLException {
        long id = UserStore.userId(c, username);
        if (id < 0) throw new IllegalArgumentException("Unknown username.");
        return id;
    }

    private static AttendanceRecord get(Connection c, long userId, String date) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT attendance_date, attendance_local_time, office_name, source, attended_at, timezone " +
                "FROM attendance_records WHERE user_id = ? AND attendance_date = ? LIMIT 1")) {
            ps.setLong(1, userId);
            ps.setDate(2, Date.valueOf(LocalDate.parse(date)));
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? read(rs) : null; }
        }
    }

    private static void bindRecord(PreparedStatement ps, long userId, AttendanceRecord r) throws SQLException {
        ps.setLong(1, userId);
        ps.setDate(2, Date.valueOf(LocalDate.parse(r.date)));
        ps.setTime(3, Time.valueOf(normalizeTime(r.attendanceLocalTime)));
        ps.setString(4, safe(r.officeName));
        ps.setString(5, safe(r.source));
        ps.setString(6, safe(r.attendedAt));
        ps.setString(7, safe(r.timezone));
    }

    private static AttendanceRecord read(ResultSet rs) throws SQLException {
        AttendanceRecord r = new AttendanceRecord();
        r.date = rs.getDate("attendance_date").toLocalDate().toString();
        LocalTime time = rs.getTime("attendance_local_time").toLocalTime();
        r.attendanceLocalTime = String.format("%02d:%02d", time.getHour(), time.getMinute());
        r.officeName = rs.getString("office_name");
        r.source = rs.getString("source");
        r.attendedAt = rs.getString("attended_at");
        r.timezone = rs.getString("timezone");
        return r;
    }

    private static LocalTime normalizeTime(String raw) {
        if (raw == null || raw.trim().isEmpty()) return LocalTime.MIDNIGHT;
        return Rules.parseTime(raw.length() >= 5 ? raw.substring(0, 5) : raw);
    }

    private static String safe(String value) { return value == null ? "" : value; }
}
