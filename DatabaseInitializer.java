package com.agentforces.attendance;

import javax.servlet.ServletContextEvent;
import javax.servlet.ServletContextListener;

public class DatabaseInitializer implements ServletContextListener {
    public void contextInitialized(ServletContextEvent event) {
        try {
            Database.ensureInitialized();
            event.getServletContext().log("Office Attendance Tracker MySQL schema is ready.");
        } catch (Exception e) {
            event.getServletContext().log("Unable to initialize Office Attendance Tracker MySQL schema.", e);
            throw new IllegalStateException("Unable to initialize database using jdbc/MySQLPool", e);
        }
    }

    public void contextDestroyed(ServletContextEvent event) {
        // The JNDI DataSource lifecycle is managed by Tomcat.
    }
}
