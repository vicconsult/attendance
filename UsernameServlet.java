package com.agentforces.attendance;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

public class UsernameServlet extends HttpServlet {
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String username = UserStore.normalize(req.getParameter("name"));
        boolean valid = UserStore.valid(username);
        if (!valid) {
            Http.json(resp, 200, "{\"valid\":false,\"available\":false,\"username\":" + Json.q(username) + ",\"reason\":\"invalid\"}");
            return;
        }
        try {
            boolean available = UserStore.available(username);
            String reason = available ? "available" : "taken";
            Http.json(resp, 200, "{\"valid\":true,\"available\":" + available + ",\"username\":" + Json.q(username) + ",\"reason\":" + Json.q(reason) + "}");
        } catch (Exception e) {
            getServletContext().log("Unable to check username availability", e);
            Http.json(resp, 503, "{\"valid\":true,\"available\":false,\"username\":" + Json.q(username) + ",\"reason\":\"database_unavailable\",\"message\":\"Database unavailable.\"}");
        }
    }
}
