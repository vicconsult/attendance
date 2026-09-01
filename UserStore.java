package com.agentforces.attendance;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

final class UserStore {
    private static final Pattern USERNAME = Pattern.compile("^[a-z0-9][a-z0-9_-]{2,31}$");
    private static final Set<String> RESERVED = new HashSet<String>(Arrays.asList(
            "admin", "api", "root", "checkin", "guide", "privacy", "support", "attendance", "agentforces"
    ));

    static final class Registration {
        final String username;
        final String token;
        Registration(String username, String token) { this.username = username; this.token = token; }
    }

    private UserStore() {}

    static String normalize(String raw) {
        if (raw == null) return "";
        return raw.trim().toLowerCase(Locale.ENGLISH);
    }

    static boolean valid(String username) {
        return USERNAME.matcher(username).matches() && !RESERVED.contains(username);
    }

    static boolean available(String username) {
        if (!valid(username)) return false;
        try (Connection c = Database.connection();
             PreparedStatement ps = c.prepareStatement("SELECT 1 FROM attendance_users WHERE username = ? LIMIT 1")) {
            ps.setString(1, username);
            try (ResultSet rs = ps.executeQuery()) { return !rs.next(); }
        } catch (Exception e) {
            throw new IllegalStateException("Unable to check username availability.", e);
        }
    }

    static Registration register(String raw) throws Exception {
        String username = normalize(raw);
        if (!valid(username)) throw new IllegalArgumentException("Username must be 3–32 characters using letters, numbers, _ or -.");
        String token = Crypto.newToken();
        String tokenHash = Crypto.sha256(token);
        try (Connection c = Database.connection();
             PreparedStatement ps = c.prepareStatement("INSERT INTO attendance_users (username, token_hash) VALUES (?, ?)")) {
            ps.setString(1, username);
            ps.setString(2, tokenHash);
            ps.executeUpdate();
            return new Registration(username, token);
        } catch (SQLException e) {
            if (Database.duplicateKey(e)) return null;
            throw e;
        }
    }

    static boolean authenticate(String rawUsername, String token) {
        String username = normalize(rawUsername);
        if (!valid(username) || token == null || token.length() < 20) return false;
        try (Connection c = Database.connection();
             PreparedStatement ps = c.prepareStatement("SELECT token_hash FROM attendance_users WHERE username = ? LIMIT 1")) {
            ps.setString(1, username);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && Crypto.secureEquals(rs.getString(1), Crypto.sha256(token));
            }
        } catch (Exception e) {
            return false;
        }
    }

    static long userId(Connection c, String rawUsername) throws SQLException {
        String username = normalize(rawUsername);
        try (PreparedStatement ps = c.prepareStatement("SELECT id FROM attendance_users WHERE username = ? LIMIT 1")) {
            ps.setString(1, username);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return -1L;
                return rs.getLong(1);
            }
        }
    }
}
