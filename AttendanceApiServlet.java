package com.agentforces.attendance;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;

public class AttendanceApiServlet extends HttpServlet {
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String username = Http.username(req);
        if (!authorize(req, resp, username)) return;
        try {
            List<AttendanceRecord> records = AttendanceStore.list(username);
            StringBuilder json = new StringBuilder("{\"ok\":true,\"records\":[");
            for (int i = 0; i < records.size(); i++) {
                if (i > 0) json.append(',');
                json.append(records.get(i).toJson());
            }
            json.append("]}");
            Http.json(resp, 200, json.toString());
        } catch (Exception e) {
            getServletContext().log("Unable to read attendance", e);
            Http.json(resp, 500, "{\"ok\":false,\"message\":\"Unable to load attendance.\"}");
        }
    }

    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String username = Http.username(req);
        if (!authorize(req, resp, username)) return;
        try {
            String dateRaw = req.getParameter("date");
            String timeRaw = req.getParameter("time");
            if (dateRaw == null || timeRaw == null) throw new IllegalArgumentException("Date and time are required.");
            String office = Rules.cleanOffice(req.getParameter("office"));
            String source = Rules.cleanOffice(req.getParameter("source"));
            if (source.isEmpty()) source = "manual-backfill";
            if (office.isEmpty()) throw new IllegalArgumentException("Office name is required.");
            LocalDate date = LocalDate.parse(dateRaw);
            LocalTime time = Rules.parseTime(timeRaw);
            ZoneId zone = Rules.zone(req.getParameter("tz"));
            if (!Rules.weekday(date)) throw new IllegalArgumentException("Only Monday through Friday can be counted.");
            if (!Rules.timeAllowed(time)) throw new IllegalArgumentException("Time must be between 5:00 AM and 3:00 PM.");
            if (date.isAfter(Rules.now(zone).toLocalDate())) throw new IllegalArgumentException("Future dates cannot be added.");

            AttendanceRecord record = new AttendanceRecord();
            record.date = date.toString();
            record.attendanceLocalTime = timeRaw;
            record.officeName = office;
            record.source = source;
            record.attendedAt = Instant.now().toString();
            record.timezone = zone.getId();
            AttendanceStore.upsert(username, record);
            Http.json(resp, 200, "{\"ok\":true,\"record\":" + record.toJson() + "}");
        } catch (IllegalArgumentException e) {
            Http.json(resp, 400, "{\"ok\":false,\"message\":" + Json.q(e.getMessage()) + "}");
        } catch (java.time.DateTimeException e) {
            Http.json(resp, 400, "{\"ok\":false,\"message\":\"Invalid date, time or time zone.\"}");
        } catch (Exception e) {
            getServletContext().log("Unable to save attendance", e);
            Http.json(resp, 500, "{\"ok\":false,\"message\":\"Unable to save attendance.\"}");
        }
    }

    protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String username = Http.username(req);
        if (!authorize(req, resp, username)) return;
        String date = req.getParameter("date");
        if (date == null || !date.matches("^\\d{4}-\\d{2}-\\d{2}$")) {
            Http.json(resp, 400, "{\"ok\":false,\"message\":\"Invalid date.\"}");
            return;
        }
        try {
            boolean deleted = AttendanceStore.delete(username, date);
            Http.json(resp, 200, "{\"ok\":true,\"deleted\":" + deleted + "}");
        } catch (Exception e) {
            getServletContext().log("Unable to delete attendance", e);
            Http.json(resp, 500, "{\"ok\":false,\"message\":\"Unable to remove attendance.\"}");
        }
    }

    private boolean authorize(HttpServletRequest req, HttpServletResponse resp, String username) throws IOException {
        if (UserStore.authenticate(username, Http.token(req))) return true;
        Http.json(resp, 401, "{\"ok\":false,\"message\":\"Invalid username or private token.\"}");
        return false;
    }
}
