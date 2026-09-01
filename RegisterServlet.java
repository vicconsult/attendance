package com.agentforces.attendance;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

public class RegisterServlet extends HttpServlet {
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String ip = req.getRemoteAddr() == null ? "unknown" : req.getRemoteAddr();
        if (!RateLimiter.allow("register:" + ip, 8, 60L * 60L * 1000L)) {
            Http.json(resp, 429, "{\"ok\":false,\"message\":\"Too many registration attempts. Please try again later.\"}");
            return;
        }
        try {
            UserStore.Registration registration = UserStore.register(req.getParameter("username"));
            if (registration == null) {
                Http.json(resp, 409, "{\"ok\":false,\"message\":\"Username already taken.\"}");
                return;
            }
            Http.json(resp, 201, "{\"ok\":true,\"username\":" + Json.q(registration.username) + ",\"token\":" + Json.q(registration.token) + "}");
        } catch (IllegalArgumentException e) {
            Http.json(resp, 400, "{\"ok\":false,\"message\":" + Json.q(e.getMessage()) + "}");
        } catch (Exception e) {
            getServletContext().log("Unable to register attendance user", e);
            Http.json(resp, 500, "{\"ok\":false,\"message\":\"Unable to create account.\"}");
        }
    }
}
