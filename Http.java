package com.agentforces.attendance;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

final class Http {
    private Http() {}

    static void json(HttpServletResponse resp, int status, String body) throws IOException {
        resp.setStatus(status);
        resp.setCharacterEncoding("UTF-8");
        resp.setContentType("application/json;charset=UTF-8");
        resp.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        resp.setHeader("Pragma", "no-cache");
        resp.getWriter().write(body);
    }

    static String token(HttpServletRequest req) {
        String auth = req.getHeader("Authorization");
        if (auth != null && auth.regionMatches(true, 0, "Bearer ", 0, 7)) return auth.substring(7).trim();
        String header = req.getHeader("X-Attendance-Token");
        if (header != null && !header.trim().isEmpty()) return header.trim();
        String param = req.getParameter("token");
        return param == null ? "" : param.trim();
    }

    static String username(HttpServletRequest req) {
        String value = req.getParameter("u");
        if (value == null) value = req.getParameter("username");
        return UserStore.normalize(value);
    }
}
