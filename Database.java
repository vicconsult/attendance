package com.agentforces.attendance;

import javax.naming.Context;
import javax.naming.InitialContext;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

final class Database {
    private static volatile DataSource dataSource;
    private static volatile boolean initialized;
    private static final Object LOCK = new Object();

    private Database() {}

    static Connection connection() throws Exception {
        ensureInitialized();
        return dataSource().getConnection();
    }

    static void ensureInitialized() throws Exception {
        if (initialized) return;
        synchronized (LOCK) {
            if (initialized) return;
            DataSource ds = dataSource();
            try (Connection c = ds.getConnection()) {
                createSchema(c);
                ensureIndexes(c);
            }
            initialized = true;
        }
    }

    static boolean ping() {
        try (Connection c = connection(); PreparedStatement ps = c.prepareStatement("SELECT 1"); ResultSet rs = ps.executeQuery()) {
            return rs.next() && rs.getInt(1) == 1;
        } catch (Exception e) {
            return false;
        }
    }

    private static DataSource dataSource() throws Exception {
        DataSource ds = dataSource;
        if (ds != null) return ds;
        synchronized (LOCK) {
            if (dataSource != null) return dataSource;
            Context init = new InitialContext();
            Object value = init.lookup("java:comp/env/jdbc/MySQLPool");
            if (!(value instanceof DataSource)) throw new IllegalStateException("JNDI resource jdbc/MySQLPool is not a DataSource.");
            dataSource = (DataSource) value;
            return dataSource;
        }
    }

    private static void createSchema(Connection c) throws SQLException {
        try (Statement st = c.createStatement()) {
            st.executeUpdate(
                "CREATE TABLE IF NOT EXISTS attendance_users (" +
                "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT," +
                "username VARCHAR(32) NOT NULL," +
                "token_hash CHAR(64) NOT NULL," +
                "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
                "PRIMARY KEY (id)," +
                "UNIQUE KEY uq_attendance_users_username (username)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            st.executeUpdate(
                "CREATE TABLE IF NOT EXISTS attendance_records (" +
                "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT," +
                "user_id BIGINT UNSIGNED NOT NULL," +
                "attendance_date DATE NOT NULL," +
                "attendance_local_time TIME NOT NULL," +
                "office_name VARCHAR(80) NOT NULL," +
                "source VARCHAR(50) NOT NULL," +
                "attended_at VARCHAR(40) NOT NULL," +
                "timezone VARCHAR(64) NOT NULL," +
                "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
                "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
                "PRIMARY KEY (id)," +
                "UNIQUE KEY uq_attendance_records_user_date (user_id, attendance_date)," +
                "KEY idx_attendance_records_user_office_date (user_id, office_name, attendance_date)," +
                "KEY idx_attendance_records_date (attendance_date)," +
                "CONSTRAINT fk_attendance_records_user FOREIGN KEY (user_id) REFERENCES attendance_users(id) ON DELETE CASCADE" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
        }
    }

    private static void ensureIndexes(Connection c) throws SQLException {
        ensureIndex(c, "attendance_users", "uq_attendance_users_username", true,
                "ALTER TABLE attendance_users ADD UNIQUE INDEX uq_attendance_users_username (username)");
        ensureIndex(c, "attendance_records", "uq_attendance_records_user_date", true,
                "ALTER TABLE attendance_records ADD UNIQUE INDEX uq_attendance_records_user_date (user_id, attendance_date)");
        ensureIndex(c, "attendance_records", "idx_attendance_records_user_office_date", false,
                "ALTER TABLE attendance_records ADD INDEX idx_attendance_records_user_office_date (user_id, office_name, attendance_date)");
        ensureIndex(c, "attendance_records", "idx_attendance_records_date", false,
                "ALTER TABLE attendance_records ADD INDEX idx_attendance_records_date (attendance_date)");
    }

    private static void ensureIndex(Connection c, String table, String index, boolean unique, String ddl) throws SQLException {
        DatabaseMetaData meta = c.getMetaData();
        try (ResultSet rs = meta.getIndexInfo(c.getCatalog(), null, table, unique, false)) {
            while (rs.next()) {
                String name = rs.getString("INDEX_NAME");
                if (name != null && name.equalsIgnoreCase(index)) return;
            }
        }
        try (Statement st = c.createStatement()) { st.executeUpdate(ddl); }
    }

    static boolean duplicateKey(SQLException e) {
        SQLException current = e;
        while (current != null) {
            if (current.getErrorCode() == 1062) return true;
            current = current.getNextException();
        }
        return false;
    }
}
