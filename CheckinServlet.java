package com.agentforces.attendance;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

public class CheckinServlet extends HttpServlet {
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException { handle(req, resp); }
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException { handle(req, resp); }

    private void handle(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String username = Http.username(req);
        String token = Http.token(req);
        if (!UserStore.authenticate(username, token)) {
            Http.json(resp, 401, "{\"ok\":false,\"message\":\"Invalid username or private token.\"}");
            return;
        }
        String office = Rules.cleanOffice(req.getParameter("office"));
        if (office.isEmpty()) office = "Office";
        try {
            ZoneId zone = Rules.zone(req.getParameter("tz"));
            ZonedDateTime now = Rules.now(zone);
            if (!Rules.weekday(now.toLocalDate())) {
                Http.json(resp, 200, "{\"ok\":true,\"counted\":false,\"reason\":\"weekend\",\"message\":\"Weekend attendance is not counted.\"}");
                return;
            }
            if (!Rules.timeAllowed(now.toLocalTime())) {
                Http.json(resp, 200, "{\"ok\":true,\"counted\":false,\"reason\":\"outside_window\",\"message\":\"Attendance counts only from 5:00 AM through 3:00 PM.\"}");
                return;
            }
            AttendanceRecord candidate = new AttendanceRecord();
            candidate.date = now.toLocalDate().toString();
            candidate.attendanceLocalTime = now.format(DateTimeFormatter.ofPattern("HH:mm"));
            candidate.officeName = office;
            candidate.source = "iphone-arrive-automation";
            candidate.attendedAt = now.toInstant().toString();
            candidate.timezone = zone.getId();

            AttendanceRecord existing = AttendanceStore.get(username, candidate.date);
            if (existing != null) {
                Http.json(resp, 200, "{\"ok\":true,\"counted\":true,\"added\":false,\"message\":\"Today was already counted.\",\"record\":" + existing.toJson() + "}");
                return;
            }
            AttendanceRecord saved = AttendanceStore.createIfAbsent(username, candidate);
            boolean added = saved == candidate;
            Http.json(resp, 200, "{\"ok\":true,\"counted\":true,\"added\":" + added + ",\"message\":" + Json.q(added ? office + " attendance recorded." : "Today was already counted.") + ",\"record\":" + saved.toJson() + "}");
        } catch (java.time.DateTimeException e) {
            Http.json(resp, 400, "{\"ok\":false,\"message\":\"Invalid office time zone.\"}");
        } catch (Exception e) {
            getServletContext().log("Unable to record attendance", e);
            Http.json(resp, 500, "{\"ok\":false,\"message\":\"Unable to record attendance.\"}");
        }
    }
}
