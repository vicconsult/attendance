package com.agentforces.attendance;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

public class HealthServlet extends HttpServlet {
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        boolean db = Database.ping();
        Http.json(resp, db ? 200 : 503,
                "{\"ok\":" + db + ",\"database\":" + Json.q(db ? "mysql" : "unavailable") + ",\"build\":\"2026.08.14-server19-mysql\"}");
    }
}
